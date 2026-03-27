/**
 * Test script for Hive enrichment.
 * Connects to MongoDB, finds unenriched candidates, and does a dry-run
 * enrichment on one document (read-only — does NOT write to DB).
 *
 * Usage:
 *   node dist/test-enrichment.js                     # auto-pick first unenriched candidate
 *   node dist/test-enrichment.js the-lead plqklro2   # target a specific video by owner/permlink
 */
import { DatabaseService } from './services/database.js';
import { VideoEmbed } from './models/VideoEmbed.js';
import { EnrichmentService } from './services/enrichment.js';
import { getContent, extractTags } from './utils/hive.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    await DatabaseService.connectMongoDB();

    const enrichmentService = new EnrichmentService();
    const targetOwner = process.argv[2];
    const targetPermlink = process.argv[3];

    let video;

    if (targetOwner && targetPermlink) {
      // Look up a specific video
      logger.info(`--- Looking up specific video: ${targetOwner}/${targetPermlink} ---`);
      video = await VideoEmbed.findOne({ owner: targetOwner, permlink: targetPermlink });
      if (!video) {
        logger.error(`Video not found: ${targetOwner}/${targetPermlink}`);
        await DatabaseService.disconnectAll();
        return;
      }
    } else {
      // Find candidates via enrichment query
      logger.info('--- Querying for unenriched videos ---');
      const videos = await enrichmentService.getUnenrichedVideos(5);
      logger.info(`Found ${videos.length} unenriched videos`);

      if (videos.length === 0) {
        logger.info('No candidates found. Nothing to test.');
        await DatabaseService.disconnectAll();
        return;
      }
      video = videos[0]!;
    }

    logger.info(`\n--- Testing with: ${video.owner}/${video.permlink} ---`);
    logger.info(`  embed_url: ${video.embed_url}`);
    logger.info(`  embed_title: ${video.embed_title}`);
    logger.info(`  hive_author: ${video.hive_author}`);
    logger.info(`  listed_on_3speak: ${video.listed_on_3speak}`);

    const parsed = enrichmentService.parseEmbedUrl(video.embed_url!);
    if (!parsed) {
      logger.error(`  Failed to parse embed_url: ${video.embed_url}`);
      await DatabaseService.disconnectAll();
      return;
    }
    logger.info(`  Parsed → author: ${parsed.author}, permlink: ${parsed.permlink}`);

    // Step 3: Fetch from Hive RPC
    logger.info(`\n--- Fetching Hive post @${parsed.author}/${parsed.permlink} ---`);
    const post = await getContent(parsed.author, parsed.permlink);

    if (!post) {
      logger.warn('  Post not found on Hive');
      await DatabaseService.disconnectAll();
      return;
    }

    const tags = extractTags(post);
    const tagsLower = tags.map(t => t.toLowerCase());

    logger.info(`  title: ${post.title}`);
    logger.info(`  body length: ${post.body.length} chars`);
    logger.info(`  tags: [${tags.join(', ')}]`);
    logger.info(`  tags_lower: [${tagsLower.join(', ')}]`);

    logger.info('\n--- Enrichment would write: ---');
    logger.info(`  hive_author: ${parsed.author}`);
    logger.info(`  hive_permlink: ${parsed.permlink}`);
    logger.info(`  hive_title: ${post.title || video.embed_title || ''}`);
    logger.info(`  hive_body: (${post.body.length} chars)`);
    logger.info(`  hive_tags: [${tags.join(', ')}]`);
    logger.info(`  hive_tags_lower: [${tagsLower.join(', ')}]`);
    logger.info(`  listed_on_3speak: true`);

    logger.info('\n--- DRY RUN COMPLETE (no writes made) ---');

    await DatabaseService.disconnectAll();
  } catch (error) {
    logger.error('Test failed:', error);
    await DatabaseService.disconnectAll();
    process.exit(1);
  }
}

main();
