import { describe, it, expect } from 'vitest';
import { HealerService } from '../services/healer.js';
import { VideoEmbed } from '../models/VideoEmbed.js';
import { createVideo } from './fixtures.js';

const healer = new HealerService();

describe('HealerService', () => {
  describe('healMissingFlag (enriched but listed_on_3speak=false)', () => {
    it('sets listed_on_3speak=true for a fully enriched video missing the flag', async () => {
      const video = await createVideo({
        processed: true,
        embed_url: '@alice/my-post',
        hive_author: 'alice',
        hive_permlink: 'my-post',
        enrichedAt: new Date(),
      });

      await healer.runCycle();

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.listed_on_3speak).toBe(true);
    });

    it('fixes multiple stale documents in a single cycle', async () => {
      const videos = await Promise.all([
        createVideo({ hive_author: 'alice', embed_url: '@alice/p1', processed: true, enrichedAt: new Date() }),
        createVideo({ hive_author: 'bob', embed_url: '@bob/p1', processed: true, enrichedAt: new Date() }),
        createVideo({ hive_author: 'charlie', embed_url: '@charlie/p1', processed: true, enrichedAt: new Date() }),
      ]);

      await healer.runCycle();

      for (const video of videos) {
        const updated = await VideoEmbed.findById(video._id);
        expect(updated?.listed_on_3speak).toBe(true);
      }
    });

    it('does not touch unenriched videos (hive_author is null)', async () => {
      const video = await createVideo();

      await healer.runCycle();

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.listed_on_3speak).toBeFalsy();
    });

    it('does not touch videos that are already correctly flagged', async () => {
      const video = await createVideo({
        hive_author: 'alice',
        embed_url: '@alice/p1',
        processed: true,
        listed_on_3speak: true,
        enrichedAt: new Date(),
      });
      const before = video.updatedAt;

      await healer.runCycle();

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.updatedAt).toEqual(before);
    });
  });

  describe('healStuckEnrichments (post_not_found retry)', () => {
    it('clears enrichment_error for post_not_found older than 1 hour', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const video = await createVideo({
        processed: true,
        embed_url: '@alice/my-post',
        enrichment_error: 'post_not_found',
        enrichedAt: twoHoursAgo,
      });

      await healer.runCycle();

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.enrichment_error).toBeNull();
    });

    it('does NOT clear post_not_found that is less than 1 hour old', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const video = await createVideo({
        processed: true,
        embed_url: '@alice/my-post',
        enrichment_error: 'post_not_found',
        enrichedAt: thirtyMinutesAgo,
      });

      await healer.runCycle();

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.enrichment_error).toBe('post_not_found');
    });

    it('does NOT clear invalid_embed_url errors regardless of age', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const video = await createVideo({
        processed: true,
        embed_url: 'bad-url',
        enrichment_error: 'invalid_embed_url',
        enrichedAt: twoHoursAgo,
      });

      await healer.runCycle();

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.enrichment_error).toBe('invalid_embed_url');
    });
  });
});
