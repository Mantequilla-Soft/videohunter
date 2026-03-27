import { config } from '../config/index.js';
import { logger } from './logger.js';

export interface HivePost {
  author: string;
  permlink: string;
  title: string;
  body: string;
  json_metadata: string;
  parent_author: string;
  parent_permlink: string;
  id: number;
}

/**
 * Make a JSON-RPC 2.0 call to a Hive node with automatic failover
 */
async function hiveRpcCall(method: string, params: unknown[]): Promise<unknown> {
  const nodes = config.hive.rpcNodes;

  for (const node of nodes) {
    try {
      const response = await fetch(node, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: 1,
        }),
      });

      if (!response.ok) {
        logger.warn(`Hive RPC node ${node} returned HTTP ${response.status}`);
        continue;
      }

      const data = await response.json() as { result?: unknown; error?: { message: string } };

      if (data.error) {
        logger.warn(`Hive RPC error from ${node}: ${data.error.message}`);
        continue;
      }

      return data.result;
    } catch (error) {
      logger.warn(`Hive RPC node ${node} failed:`, error);
      continue;
    }
  }

  throw new Error(`All Hive RPC nodes failed for ${method}`);
}

/**
 * Fetch a Hive post by author and permlink.
 * Returns null if the post does not exist.
 */
export async function getContent(author: string, permlink: string): Promise<HivePost | null> {
  const result = await hiveRpcCall('condenser_api.get_content', [author, permlink]) as HivePost;

  // Hive returns an object with id=0 and empty author when the post doesn't exist
  if (!result || result.id === 0 || !result.author) {
    return null;
  }

  return result;
}

/**
 * Extract tags from a Hive post's json_metadata
 */
export function extractTags(post: HivePost): string[] {
  try {
    const metadata = JSON.parse(post.json_metadata);
    const tags = metadata?.tags;

    if (!Array.isArray(tags)) {
      return [];
    }

    // Coerce non-string values to string (matches tagSync.js behavior)
    return tags.map((tag: unknown) => String(tag));
  } catch {
    return [];
  }
}
