import mongoose, { Schema, Document } from "mongoose";

export interface IStagedProduct extends Document {
  store: string;
  categoryKey: string;
  topCategory?: string;
  subCategory?: string | null;
  sourceUrl: string;
  externalId?: string;
  titleKo: string; // Original Korean title
  titleMn?: string; // Translated Mongolian title
  price: number;
  currency: string;
  imagesOriginal: string[];
  imagesProcessed: string[];
  descriptionOriginal?: string;
  descriptionTranslated?: string;
  status: "staged" | "published";
  importRunId: string;
  createdAt: Date;
  updatedAt: Date;
}

const StagedProductSchema = new Schema<IStagedProduct>(
  {
    store: {
      type: String,
      required: true,
      index: true,
    },
    categoryKey: {
      type: String,
      required: true,
    },
    topCategory: {
      type: String,
    },
    subCategory: {
      type: String,
      default: null,
    },
    sourceUrl: {
      type: String,
      required: true,
      index: true,
    },
    externalId: {
      type: String,
    },
    titleKo: {
      type: String,
      required: true,
    },
    titleMn: {
      type: String,
    },
    price: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "KRW",
    },
    imagesOriginal: {
      type: [String],
      default: [],
    },
    imagesProcessed: {
      type: [String],
      default: [],
    },
    descriptionOriginal: {
      type: String,
      default: "",
    },
    descriptionTranslated: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["staged", "published"],
      default: "staged",
      index: true,
    },
    importRunId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for upsert (store + sourceUrl)
StagedProductSchema.index({ store: 1, sourceUrl: 1 }, { unique: true });

// Index for filtering
StagedProductSchema.index({ status: 1, store: 1 });

export const StagedProduct = mongoose.model<IStagedProduct>("StagedProduct", StagedProductSchema);

