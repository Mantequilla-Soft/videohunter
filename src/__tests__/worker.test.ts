import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVideo } from './fixtures.js';
import { VideoEmbed } from '../models/VideoEmbed.js';

// Mock external services — HAFSQLService hits PostgreSQL, EnrichmentService is tested separately
const mockFindVideoUsage = vi.hoisted(() => vi.fn());
const mockEnrichBatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../services/hafsql.js', () => ({
  HAFSQLService: class {
    findVideoUsage = mockFindVideoUsage;
  },
}));

vi.mock('../services/enrichment.js', () => ({
  EnrichmentService: class {
    enrichBatch = mockEnrichBatch;
  },
}));

const { WorkerService } = await import('../services/worker.js');

describe('WorkerService', () => {
  let worker: InstanceType<typeof WorkerService>;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new WorkerService();
  });

  describe('getUnprocessedVideos', () => {
    it('returns published videos with no embed_url and no hive_author', async () => {
      await createVideo({ status: 'published' }); // candidate

      await createVideo({ status: 'unlisted' });                        // wrong status
      await createVideo({ status: 'published', embed_url: '@a/p' });   // already has embed_url
      await createVideo({ status: 'published', hive_lookup_done: true }); // permanently abandoned
      await createVideo({ status: 'published', hive_author: 'alice' }); // already enriched

      const results = await worker.getUnprocessedVideos(10);
      expect(results).toHaveLength(1);
    });

    it('respects the limit parameter', async () => {
      await Promise.all([
        createVideo({ status: 'published' }),
        createVideo({ status: 'published' }),
        createVideo({ status: 'published' }),
      ]);

      const results = await worker.getUnprocessedVideos(2);
      expect(results).toHaveLength(2);
    });
  });

  describe('processVideo', () => {
    it('sets embed_url, processed=true, and listed_on_3speak=true when a match is found', async () => {
      const video = await createVideo();
      mockFindVideoUsage.mockResolvedValueOnce({
        embedUrl: '@alice/video-post',
        embedTitle: 'My Video Post',
        isPost: true,
        isSnap: false,
        isWave: false,
        owner: video.owner,
        permlink: video.permlink,
      });

      const doc = await VideoEmbed.findById(video._id);
      await worker.processVideo(doc!);

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.embed_url).toBe('@alice/video-post');
      expect(updated?.embed_title).toBe('My Video Post');
      expect(updated?.processed).toBe(true);
      expect(updated?.listed_on_3speak).toBe(true);
      expect(updated?.processedAt).toBeDefined();
    });

    it('does nothing when no match is found and video is under 4 hours old', async () => {
      const video = await createVideo();
      mockFindVideoUsage.mockResolvedValueOnce(null);

      const doc = await VideoEmbed.findById(video._id);
      await worker.processVideo(doc!);

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.processed).toBeFalsy();
      expect(updated?.hive_lookup_done).toBeFalsy();
      expect(updated?.embed_url).toBeUndefined();
    });

    it('marks hive_lookup_done=true when no match after 4 hours', async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const video = await createVideo({ createdAt: fiveHoursAgo });
      mockFindVideoUsage.mockResolvedValueOnce(null);

      const doc = await VideoEmbed.findById(video._id);
      await worker.processVideo(doc!);

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.hive_lookup_done).toBe(true);
      expect(updated?.processed).toBeFalsy();
    });

    it('does not swallow errors from HAFSQL — lets them propagate', async () => {
      const video = await createVideo();
      mockFindVideoUsage.mockRejectedValueOnce(new Error('HAFSQL connection lost'));

      const doc = await VideoEmbed.findById(video._id);
      await expect(worker.processVideo(doc!)).rejects.toThrow('HAFSQL connection lost');
    });
  });
});
