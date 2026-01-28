import mongoose, { Schema, Document } from "mongoose";

export interface ITranslationCacheEntry extends Document {
  key: string;
  from: string;
  to: string;
  value: string;
  hits: number;
  lastHitAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TranslationCacheEntrySchema = new Schema<ITranslationCacheEntry>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    value: {
      type: String,
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
TranslationCacheEntrySchema.index({ from: 1, to: 1 });

export const TranslationCacheEntry = mongoose.model<ITranslationCacheEntry>(
  "TranslationCacheEntry",
  TranslationCacheEntrySchema
);

