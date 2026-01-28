import mongoose, { Schema, Document } from "mongoose";

export interface IImageCacheEntry extends Document {
  key: string;
  cx: string;
  query: string;
  urls: string[];
  hits: number;
  lastHitAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ImageCacheEntrySchema = new Schema<IImageCacheEntry>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cx: {
      type: String,
      required: true,
    },
    query: {
      type: String,
      required: true,
    },
    urls: {
      type: [String],
      required: true,
    },
    hits: {
      type: Number,
      default: 0,
    },
    lastHitAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups
ImageCacheEntrySchema.index({ cx: 1, query: 1 });

export const ImageCacheEntry = mongoose.model<IImageCacheEntry>(
  "ImageCacheEntry",
  ImageCacheEntrySchema
);

