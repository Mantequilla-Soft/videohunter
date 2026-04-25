import { VideoEmbed } from '../models/VideoEmbed.js';
import type { IVideoEmbed } from '../models/VideoEmbed.js';
import { HAFSQLService } from './hafsql.js';
import { EnrichmentService } from './enrichment.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export class WorkerService {
  private hafsqlService: HAFSQLService;
  private enrichmentService: EnrichmentService;
  private isProcessing: boolean = false;

  constructor() {
    this.hafsqlService = new HAFSQLService();
    this.enrichmentService = new EnrichmentService();
  }

  /**
   * Get unprocessed video embeds from MongoDB
   */
  async getUnprocessedVideos(limit: number): Promise<IVideoEmbed[]> {
    try {
      logger.info(`Querying for unprocessed videos with limit: ${limit}`);
      
      const videos = await VideoEmbed.find({
        status: 'published',
        hive_lookup_done: { $ne: true }, // Not yet permanently given up
        $or: [
          { embed_url: { $exists: false } },
          { embed_url: null },
          { embed_url: '' },
        ],
        hive_author: null, // Not yet enriched via direct API either
      })
        .limit(limit)
        .sort({ createdAt: -1 }); // Process newest first to keep up with new content

      logger.info(`Query returned ${videos.length} videos`);
      return videos;
    } catch (error) {
      logger.error('Error fetching unprocessed videos:', error);
      throw error;
    }
  }

  /**
   * Process a single video embed
   */
  async processVideo(video: IVideoEmbed): Promise<void> {
    try {
      logger.info(`Processing video: ${video.owner}/${video.permlink}`);

      // Search for the video usage on Hive
      const match = await this.hafsqlService.findVideoUsage(video.owner, video.permlink);

      if (match) {
        // Update the video embed with the found information
        video.embed_url = match.embedUrl;
        video.embed_title = match.embedTitle;
        video.processed = true;
        video.processedAt = new Date();
        video.listed_on_3speak = true;

        await video.save();

        logger.info(
          `Successfully updated ${video.owner}/${video.permlink} with embed_url: ${match.embedUrl}`
        );
      } else {
        // Only mark as permanently processed if the video is older than 4 hours
        // This gives users time to create their Hive post with the embed
        const ageMs = Date.now() - new Date(video.createdAt).getTime();
        const fourHours = 4 * 60 * 60 * 1000;

        if (ageMs >= fourHours) {
          logger.info(`No match found for ${video.owner}/${video.permlink} after 4h, giving up`);
          video.hive_lookup_done = true;
          await video.save();
        } else {
          const remainingMin = Math.round((fourHours - ageMs) / 60000);
          logger.info(`No match found for ${video.owner}/${video.permlink}, will retry (${remainingMin}min remaining)`);
        }
      }
    } catch (error) {
      logger.error(`Error processing video ${video.owner}/${video.permlink}:`, error);
      // Don't mark as processed if there was an error
      throw error;
    }
  }

  /**
   * Process a batch of videos
   */
  async processBatch(): Promise<void> {
    if (this.isProcessing) {
      logger.info('Already processing a batch, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      const videos = await this.getUnprocessedVideos(config.worker.batchSize);

      if (videos.length === 0) {
        logger.info('No unprocessed videos found');
      } else {
        logger.info(`Processing batch of ${videos.length} videos`);

        // Process videos sequentially to avoid overwhelming HAFSQL
        for (const video of videos) {
          try {
            await this.processVideo(video);
          } catch (error) {
            logger.error(`Failed to process video ${video.owner}/${video.permlink}:`, error);
            // Continue with next video even if one fails
          }
        }

        logger.info(`Batch processing completed`);
      }

      // Second pass: enrich processed videos with Hive metadata (runs regardless)
      await this.enrichmentService.enrichBatch();
    } catch (error) {
      logger.error('Error in batch processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start the worker loop
   */
  start(): void {
    logger.info(
      `Starting worker with interval: ${config.worker.intervalMs}ms (${
        config.worker.intervalMs / 1000 / 60
      } minutes)`
    );

    // Process immediately on start
    this.processBatch();

    // Then process at intervals
    setInterval(() => {
      this.processBatch();
    }, config.worker.intervalMs);
  }
}
