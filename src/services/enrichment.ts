import { VideoEmbed } from '../models/VideoEmbed.js';
import type { IVideoEmbed } from '../models/VideoEmbed.js';
import { getContent, extractTags } from '../utils/hive.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export class EnrichmentService {
  /**
   * Parse embed_url to extract Hive author and permlink.
   * Expected format: @author/permlink
   */
  parseEmbedUrl(embedUrl: string): { author: string; permlink: string } | null {
    const match = embedUrl.match(/^@([^/]+)\/(.+)$/);
    if (!match) {
      return null;
    }
    return { author: match[1]!, permlink: match[2]! };
  }

  /**
   * Get videos that have been processed (embed_url set) but not yet enriched with Hive metadata.
   */
  async getUnenrichedVideos(limit: number): Promise<IVideoEmbed[]> {
    try {
      const videos = await VideoEmbed.find({
        short: false,
        processed: true,
        embed_url: { $exists: true, $nin: [null, ''] },
        hive_author: null,
        enrichment_error: null,
      })
        .limit(limit)
        .sort({ createdAt: -1 });

      return videos;
    } catch (error) {
      logger.error('Error fetching unenriched videos:', error);
      throw error;
    }
  }

  /**
   * Enrich a single video with Hive post metadata.
   */
  async enrichVideo(video: IVideoEmbed): Promise<void> {
    const parsed = this.parseEmbedUrl(video.embed_url!);
    if (!parsed) {
      logger.warn(`Invalid embed_url format for ${video.owner}/${video.permlink}: ${video.embed_url}`);
      video.enrichment_error = 'invalid_embed_url';
      video.enrichedAt = new Date();
      await video.save();
      return;
    }

    logger.info(`Enriching ${video.owner}/${video.permlink} from Hive post @${parsed.author}/${parsed.permlink}`);

    const post = await getContent(parsed.author, parsed.permlink);

    if (!post) {
      logger.warn(`Hive post not found: @${parsed.author}/${parsed.permlink}`);
      video.enrichment_error = 'post_not_found';
      video.enrichedAt = new Date();
      await video.save();
      return;
    }

    const tags = extractTags(post);
    const tagsLower = tags.map(tag => tag.toLowerCase());

    video.hive_author = parsed.author;
    video.hive_permlink = parsed.permlink;
    video.hive_title = post.title || video.embed_title || '';
    video.hive_body = post.body;
    video.hive_tags = tags;
    video.hive_tags_lower = tagsLower;
    video.listed_on_3speak = true;
    video.enrichedAt = new Date();

    await video.save();

    logger.info(`Enriched ${video.owner}/${video.permlink} — listed_on_3speak: true, tags: [${tags.join(', ')}]`);
  }

  /**
   * Process a batch of unenriched videos.
   */
  async enrichBatch(): Promise<void> {
    try {
      const videos = await this.getUnenrichedVideos(config.hive.enrichmentBatchSize);

      if (videos.length === 0) {
        logger.info('No unenriched videos found');
        return;
      }

      logger.info(`Enriching batch of ${videos.length} videos`);

      for (const video of videos) {
        try {
          await this.enrichVideo(video);
        } catch (error) {
          logger.error(`Failed to enrich video ${video.owner}/${video.permlink}:`, error);
        }
      }

      logger.info('Enrichment batch completed');
    } catch (error) {
      logger.error('Error in enrichment batch:', error);
    }
  }
}
