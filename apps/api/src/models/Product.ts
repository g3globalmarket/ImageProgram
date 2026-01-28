import mongoose, { Schema, Document } from "mongoose";
import type { Store, ProductStatus, LockableProductField } from "@repo/shared";

export interface IProduct extends Document {
  store: Store;
  categoryKey: string;
  sourceUrl: string;
  title: string;
  price: number;
  currency: string;
  imagesOriginal: string[];
  imagesProcessed: string[];
  descriptionOriginal: string;
  descriptionTranslated: string;
  langOriginal: string;
  langTranslated: string;
  status: ProductStatus;
  notes?: string;
  lockedFields: LockableProductField[];
  brandEn?: string;
  modelEn?: string;
  titleMn?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
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
    sourceUrl: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
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
      required: true,
    },
    descriptionTranslated: {
      type: String,
      default: "",
    },
    langOriginal: {
      type: String,
      default: "ko",
    },
    langTranslated: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["imported", "translated", "images_updated", "ready", "error"],
      default: "imported",
    },
    notes: {
      type: String,
    },
    lockedFields: {
      type: [String],
      default: [],
    },
    brandEn: {
      type: String,
    },
    modelEn: {
      type: String,
    },
    titleMn: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Add unique compound index for deduplication
ProductSchema.index({ store: 1, sourceUrl: 1 }, { unique: true });

export const Product = mongoose.model<IProduct>("Product", ProductSchema);

