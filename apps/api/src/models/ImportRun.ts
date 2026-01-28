import mongoose, { Schema, Document } from "mongoose";
import type { Store, ImageMode, TranslationProvider, ImageProvider } from "@repo/shared";

export interface IImportRun extends Document {
  store: Store;
  categoryKey: string;
  categoryUrl: string;
  limit: number;
  translateTo: string;
  imageMode: ImageMode;
  translationProvider: TranslationProvider;
  imageProvider: ImageProvider;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  matched: number;
  inserted: number;
  updated: number;
  errorsCount: number;
  includeDetails: boolean;
  detailErrorsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ImportRunSchema = new Schema<IImportRun>(
  {
    store: {
      type: String,
      enum: ["gmarket", "11st", "oliveyoung"],
      required: true,
    },
    categoryKey: {
      type: String,
      required: true,
    },
    categoryUrl: {
      type: String,
      required: true,
    },
    limit: {
      type: Number,
      required: true,
    },
    translateTo: {
      type: String,
      required: true,
    },
    imageMode: {
      type: String,
      enum: ["none", "search", "generate"],
      required: true,
    },
    translationProvider: {
      type: String,
      enum: ["stub", "google_api_key"],
      required: true,
    },
    imageProvider: {
      type: String,
      enum: ["stub", "custom_search"],
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    finishedAt: {
      type: Date,
    },
    durationMs: {
      type: Number,
    },
    matched: {
      type: Number,
      default: 0,
    },
    inserted: {
      type: Number,
      default: 0,
    },
    updated: {
      type: Number,
      default: 0,
    },
    errorsCount: {
      type: Number,
      default: 0,
    },
    includeDetails: {
      type: Boolean,
      default: false,
    },
    detailErrorsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
ImportRunSchema.index({ startedAt: -1 });

export const ImportRun = mongoose.model<IImportRun>("ImportRun", ImportRunSchema);

