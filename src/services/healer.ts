import { VideoEmbed } from '../models/VideoEmbed.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export class HealerService {
  /**
   * Fix documents that are fully enriched but missing the listed_on_3speak flag.
   * Happens when a previous version of enrichVideo ran without setting the flag,
   * leaving hive_author set but listed_on_3speak=false. These are invisible to the
   * normal pipeline (enrichment query filters for hive_author: null).
   */
  private async healMissingFlag(): Promise<void> {
    const result = await VideoEmbed.updateMany(
      {
        status: 'published',
        hive_author: { $exists: true, $ne: null },
        listed_on_3speak: { $ne: true },
      },
      { $set: { listed_on_3speak: true } }
    );

    if (result.modifiedCount > 0) {
      logger.info(`[healer] Fixed ${result.modifiedCount} enriched video(s) missing listed_on_3speak flag`);
    } else {
      logger.info('[healer] No missing flags to repair');
    }
  }

  /**
   * Re-queue videos stuck with enrichment_error='post_not_found'.
   * Hive RPC propagation can lag behind HAFSQL by minutes. Clearing the error
   * after 1 hour lets enrichment retry and fetch the metadata that was temporarily
   * unavailable.
   */
  private async healStuckEnrichments(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await VideoEmbed.updateMany(
      {
        enrichment_error: 'post_not_found',
        enrichedAt: { $lt: oneHourAgo },
      },
      { $set: { enrichment_error: null } }
    );

    if (result.modifiedCount > 0) {
      logger.info(`[healer] Re-queued ${result.modifiedCount} post_not_found video(s) for enrichment retry`);
    }
  }

  async runCycle(): Promise<void> {
    logger.info('[healer] Starting heal cycle');
    try {
      await this.healMissingFlag();
      await this.healStuckEnrichments();
    } catch (error) {
      logger.error('[healer] Error during heal cycle:', error);
    }
    logger.info('[healer] Heal cycle complete');
  }

  start(): void {
    const minutes = config.healer.intervalMs / 1000 / 60;
    logger.info(`[healer] Starting with interval: ${config.healer.intervalMs}ms (${minutes} minutes)`);

    this.runCycle();

    setInterval(() => {
      this.runCycle();
    }, config.healer.intervalMs);
  }
}
