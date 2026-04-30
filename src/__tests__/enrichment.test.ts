import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVideo } from './fixtures.js';
import { VideoEmbed } from '../models/VideoEmbed.js';

// Mock Hive RPC calls — these hit live nodes, not suitable for unit tests
const mockGetContent = vi.hoisted(() => vi.fn());
const mockExtractTags = vi.hoisted(() => vi.fn());

vi.mock('../utils/hive.js', () => ({
  getContent: mockGetContent,
  extractTags: mockExtractTags,
}));

const { EnrichmentService } = await import('../services/enrichment.js');

describe('EnrichmentService', () => {
  const service = new EnrichmentService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseEmbedUrl', () => {
    it('parses @author/permlink correctly', () => {
      expect(service.parseEmbedUrl('@alice/my-post')).toEqual({ author: 'alice', permlink: 'my-post' });
    });

    it('handles permlinks with hyphens and numbers', () => {
      expect(service.parseEmbedUrl('@bob/re-alice-my-post-20240101t120000')).toEqual({
        author: 'bob',
        permlink: 're-alice-my-post-20240101t120000',
      });
    });

    it('returns null when @ prefix is missing', () => {
      expect(service.parseEmbedUrl('alice/my-post')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(service.parseEmbedUrl('')).toBeNull();
    });

    it('returns null for a plain string with no slash', () => {
      expect(service.parseEmbedUrl('@alice')).toBeNull();
    });
  });

  describe('getUnenrichedVideos', () => {
    it('returns processed videos with an embed_url and no hive_author', async () => {
      await createVideo({ processed: true, embed_url: '@alice/post1' }); // candidate

      await createVideo({ processed: false });                                              // not processed yet
      await createVideo({ processed: true, embed_url: '@bob/post1', hive_author: 'bob' }); // already enriched
      await createVideo({ processed: true, embed_url: '@x/p', enrichment_error: 'post_not_found' }); // has error
      await createVideo({ processed: true, embed_url: '@y/p', short: true });               // is a short

      const results = await service.getUnenrichedVideos(10);
      expect(results).toHaveLength(1);
      expect(results[0]?.embed_url).toBe('@alice/post1');
    });

    it('respects the limit parameter', async () => {
      await Promise.all([
        createVideo({ processed: true, embed_url: '@a/p1' }),
        createVideo({ processed: true, embed_url: '@b/p2' }),
        createVideo({ processed: true, embed_url: '@c/p3' }),
      ]);

      const results = await service.getUnenrichedVideos(2);
      expect(results).toHaveLength(2);
    });
  });

  describe('enrichVideo', () => {
    it('sets all Hive metadata and listed_on_3speak=true on success', async () => {
      const video = await createVideo({ processed: true, embed_url: '@alice/great-video' });
      const doc = await VideoEmbed.findById(video._id);

      mockGetContent.mockResolvedValueOnce({
        author: 'alice',
        permlink: 'great-video',
        title: 'Great Video Title',
        body: 'Post body content',
        json_metadata: '{}',
        parent_author: '',
        parent_permlink: '',
        id: 42,
      });
      mockExtractTags.mockReturnValueOnce(['hive', 'Video', 'threespeak']);

      await service.enrichVideo(doc!);

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.hive_author).toBe('alice');
      expect(updated?.hive_permlink).toBe('great-video');
      expect(updated?.hive_title).toBe('Great Video Title');
      expect(updated?.hive_body).toBe('Post body content');
      expect(updated?.hive_tags).toEqual(['hive', 'Video', 'threespeak']);
      expect(updated?.hive_tags_lower).toEqual(['hive', 'video', 'threespeak']);
      expect(updated?.listed_on_3speak).toBe(true);
      expect(updated?.enrichedAt).toBeDefined();
      expect(updated?.enrichment_error).toBeNull();
    });

    it('sets enrichment_error=invalid_embed_url when embed_url cannot be parsed', async () => {
      const video = await createVideo({ processed: true, embed_url: 'not-a-valid-url' });
      const doc = await VideoEmbed.findById(video._id);

      await service.enrichVideo(doc!);

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.enrichment_error).toBe('invalid_embed_url');
      expect(updated?.hive_author).toBeNull();
      expect(updated?.listed_on_3speak).toBeFalsy();
    });

    it('sets enrichment_error=post_not_found when Hive RPC returns null', async () => {
      const video = await createVideo({ processed: true, embed_url: '@alice/missing-post' });
      const doc = await VideoEmbed.findById(video._id);

      mockGetContent.mockResolvedValueOnce(null);

      await service.enrichVideo(doc!);

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.enrichment_error).toBe('post_not_found');
      expect(updated?.hive_author).toBeNull();
    });

    it('uses embed_title as fallback when Hive post has no title', async () => {
      const video = await createVideo({ processed: true, embed_url: '@alice/p', embed_title: 'Fallback Title' });
      const doc = await VideoEmbed.findById(video._id);

      mockGetContent.mockResolvedValueOnce({
        author: 'alice', permlink: 'p', title: '', body: 'body',
        json_metadata: '{}', parent_author: '', parent_permlink: '', id: 1,
      });
      mockExtractTags.mockReturnValueOnce([]);

      await service.enrichVideo(doc!);

      const updated = await VideoEmbed.findById(video._id);
      expect(updated?.hive_title).toBe('Fallback Title');
    });
  });
});
