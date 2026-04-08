import { Pool } from 'pg';
import { DatabaseService } from './database.js';
import type { HiveComment, VideoMatch } from '../types/hafsql.js';
import { logger } from '../utils/logger.js';

export class HAFSQLService {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseService.getPgPool();
  }

  /**
   * Search for comments containing video embeds on Hive blockchain
   */
  async searchVideoEmbeds(owner: string, permlink: string): Promise<HiveComment[]> {
    try {
      const embedUrl = `https://play.3speak.tv/embed?v=${owner}/${permlink}`;
      const searchPattern = `%${embedUrl}%`;
      
      const query = `
        SELECT
          body->'value'->>'author' as author,
          body->'value'->>'permlink' as permlink,
          body->'value'->>'parent_author' as parent_author,
          body->'value'->>'parent_permlink' as parent_permlink,
          body->'value'->>'body' as body,
          body->'value'->>'title' as title,
          body->'value'->>'json_metadata' as json_metadata
        FROM hive.irreversible_operations_view
        WHERE
          op_type_id = 1
          AND (
            body->'value'->>'body' ILIKE $1
            OR body->'value'->>'json_metadata' ILIKE $1
          )
          AND body->'value'->>'author' = $2
        ORDER BY block_num DESC
        LIMIT 50
      `;

      const result = await this.pool.query(query, [searchPattern, owner]);
      
      logger.info(`Found ${result.rows.length} potential matches for ${owner}/${permlink}`);
      return result.rows as HiveComment[];
    } catch (error) {
      logger.error(`Error searching HAFSQL for ${owner}/${permlink}:`, error);
      throw error;
    }
  }

  /**
   * Get post title from HAFSQL
   */
  async getPostTitle(author: string, permlink: string): Promise<string | null> {
    try {
      const query = `
        SELECT
          body->'value'->>'title' as title
        FROM hive.irreversible_operations_view
        WHERE
          op_type_id = 1
          AND body->'value'->>'author' = $1
          AND body->'value'->>'permlink' = $2
          AND body->'value'->>'parent_author' = ''
        ORDER BY block_num DESC
        LIMIT 1
      `;

      const result = await this.pool.query(query, [author, permlink]);
      
      if (result.rows.length > 0 && result.rows[0].title) {
        return result.rows[0].title;
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting post title for ${author}/${permlink}:`, error);
      return null;
    }
  }

  /**
   * Determine the type of content and extract match information
   */
  async analyzeMatch(
    comment: HiveComment,
    videoOwner: string,
    videoPermlink: string
  ): Promise<VideoMatch | null> {
    try {
      const embedPattern = `play.3speak.tv/embed?v=${videoOwner}/${videoPermlink}`;

      // Check if this comment contains the specific video (body or json_metadata)
      const bodyMatch = comment.body && comment.body.includes(embedPattern);
      const metaMatch = comment.json_metadata && comment.json_metadata.includes(embedPattern);
      if (!bodyMatch && !metaMatch) {
        return null;
      }

      const isPost = comment.parent_author === '';
      const isSnap = !isPost && comment.parent_permlink === 'hive-snap';
      const isWave = !isPost && comment.parent_permlink === 'hive-wave';

      let embedTitle: string;
      let embedUrl: string;

      if (isPost) {
        // It's a post - get the title
        const title = await this.getPostTitle(comment.author, comment.permlink);
        embedTitle = title || 'Untitled Post';
        embedUrl = `@${comment.author}/${comment.permlink}`;
      } else if (isSnap) {
        // It's a snap
        embedTitle = 'Snap';
        embedUrl = `@${comment.author}/${comment.permlink}`;
      } else if (isWave) {
        // It's a wave
        embedTitle = 'Wave';
        embedUrl = `@${comment.author}/${comment.permlink}`;
      } else {
        // It's a regular comment
        embedTitle = 'Comment';
        embedUrl = `@${comment.author}/${comment.permlink}`;
      }

      return {
        owner: videoOwner,
        permlink: videoPermlink,
        embedUrl,
        embedTitle,
        isSnap,
        isWave,
        isPost,
      };
    } catch (error) {
      logger.error('Error analyzing match:', error);
      return null;
    }
  }

  /**
   * Find the first usage of a video on Hive
   */
  async findVideoUsage(owner: string, permlink: string): Promise<VideoMatch | null> {
    try {
      const comments = await this.searchVideoEmbeds(owner, permlink);

      if (comments.length === 0) {
        logger.info(`No matches found for ${owner}/${permlink}`);
        return null;
      }

      // Analyze each comment to find the first valid match
      for (const comment of comments) {
        const match = await this.analyzeMatch(comment, owner, permlink);
        if (match) {
          logger.info(`Found match for ${owner}/${permlink}: ${match.embedUrl}`);
          return match;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error finding video usage for ${owner}/${permlink}:`, error);
      throw error;
    }
  }
}
