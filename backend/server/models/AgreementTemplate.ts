import mongoose, { Schema, Document } from "mongoose";

// A reusable starting point for an agreement: default section wording per agreement type and
// context. Four built-ins are seeded at startup (Employment / Subcontractor Service / Vendor
// Supply / Partner Agreement); everything is editable on the agreement itself.
export interface IAgreementTemplate extends Document {
  name: string;
  agreementType: string;                        // Employment | Service | Supply | Partnership | …
  contextType: "user" | "project" | "general";
  entityType: "" | "partner" | "subcontractor" | "vendor"; // project context only
  sections: {
    scope: string;
    terms: string;
    paymentConditions: string;
    deliveryConditions: string;
    ndaText: string;
  };
  builtin: boolean;
}

const AgreementTemplateSchema = new Schema<IAgreementTemplate>(
  {
    name: { type: String, default: "" },
    agreementType: { type: String, default: "Custom" },
    contextType: { type: String, enum: ["user", "project", "general"], default: "project" },
    entityType: { type: String, enum: ["", "partner", "subcontractor", "vendor"], default: "" },
    sections: {
      scope: { type: String, default: "" },
      terms: { type: String, default: "" },
      paymentConditions: { type: String, default: "" },
      deliveryConditions: { type: String, default: "" },
      ndaText: { type: String, default: "" },
    },
    builtin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IAgreementTemplate>("AgreementTemplate", AgreementTemplateSchema);
