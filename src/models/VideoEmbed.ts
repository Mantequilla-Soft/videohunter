import mongoose, { Schema, Document } from 'mongoose';

export interface IVideoEmbed extends Document {
  owner: string;
  permlink: string;
  frontend_app: string;
  status: string;
  input_cid: string;
  manifest_cid: string;
  thumbnail_url: string | null;
  short: boolean;
  duration: number | null;
  size: number;
  encodingProgress: number;
  originalFilename: string;
  views: number;
  embed_url?: string;
  embed_title?: string;
  processed?: boolean;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VideoEmbedSchema: Schema = new Schema(
  {
    owner: { type: String, required: true, index: true },
    permlink: { type: String, required: true, index: true },
    frontend_app: { type: String, required: true },
    status: { type: String, required: true },
    input_cid: { type: String, required: true },
    manifest_cid: { type: String, required: true },
    thumbnail_url: { type: String },
    short: { type: Boolean, default: false },
    duration: { type: Number, default: null },
    size: { type: Number, required: true },
    encodingProgress: { type: Number, default: 0 },
    originalFilename: { type: String, required: true },
    views: { type: Number, default: 0 },
    embed_url: { type: String },
    embed_title: { type: String },
    processed: { type: Boolean, default: false, index: true },
    processedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying
VideoEmbedSchema.index({ owner: 1, permlink: 1 });
VideoEmbedSchema.index({ processed: 1, createdAt: 1 });

export const VideoEmbed = mongoose.model<IVideoEmbed>('VideoEmbed', VideoEmbedSchema, 'embed-video');
