export interface HiveComment {
  author: string;
  permlink: string;
  parent_author: string;
  parent_permlink: string;
  body: string | null;
  title?: string;
  json_metadata?: string;
}

export interface VideoMatch {
  owner: string;
  permlink: string;
  embedUrl: string;
  embedTitle: string;
  isSnap: boolean;
  isWave: boolean;
  isPost: boolean;
}
