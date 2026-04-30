import { VideoEmbed } from '../models/VideoEmbed.js';

let seq = 0;

export async function createVideo(overrides: Record<string, unknown> = {}) {
  const n = ++seq;
  return VideoEmbed.create({
    owner: `user${n}`,
    permlink: `video-${n}`,
    frontend_app: 'threespeak',
    status: 'published',
    input_cid: `QmInput${n}`,
    manifest_cid: `QmManifest${n}`,
    short: false,
    size: 1000,
    encodingProgress: 100,
    originalFilename: 'video.mp4',
    views: 0,
    ...overrides,
  });
}
