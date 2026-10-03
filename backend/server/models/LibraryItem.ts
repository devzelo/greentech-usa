import mongoose, { Schema, Document } from "mongoose";

/**
 * CR 337 - GreenTech's item library: materials, equipment and services requested before, kept once
 * for the whole company and added to any project's RFQ ("Add from Library" in the client's Create
 * RFQ example). What an item is, not what it costs: prices come from the vendors' quotes.
 */
export interface ILibraryItem extends Document {
  description: string;
  spec: string;
  unit: string;
  category: string;
  vendorNote: string;
  usedCount: number;
  createdById: string;
  createdByName: string;
}

const LibraryItemSchema = new Schema<ILibraryItem>(
  {
    description: { type: String, required: true },
    spec: { type: String, default: "" },
    unit: { type: String, default: "" },
    category: { type: String, default: "" },
    vendorNote: { type: String, default: "" },
    usedCount: { type: Number, default: 0 },
    createdById: { type: String, default: "" },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true },
);
LibraryItemSchema.index({ description: 1, spec: 1 });

export default mongoose.model<ILibraryItem>("LibraryItem", LibraryItemSchema);
