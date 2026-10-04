import mongoose from "mongoose";
import WorkPackage from "../models/WorkPackage";

/**
 * CR 345 - an RFQ or PO made for a work package belongs to that package: it is created, kept and
 * opened in the Work Packages tab, and the Procurement tab's lists leave it out. `ownerPackageId`
 * on the record says which package owns it ("" for Procurement's own records).
 *
 * The list filter for a request:
 * - ?package=<id>: that package's records, plus the RFQ / PO it was linked to before (CR 328).
 * - ?all=1: every record (finance views that reach a PO from an invoice, expenses, shipments).
 * - neither: Procurement's own records only.
 */
export async function ownerFilter(projectId: string, query: Record<string, unknown>, linkField: "rfqId" | "poId", role = ""): Promise<Record<string, unknown>> {
  // Work packages are GreenTech's internal list (CR 328): an outside login sees only Procurement's records.
  const outside = role === "subcontractor";
  if (String(query.all || "") === "1" && !outside) return {};
  const pkgId = outside ? "" : String(query.package || "");
  if (pkgId) {
    const pkg = mongoose.isValidObjectId(pkgId) ? await WorkPackage.findOne({ _id: pkgId, projectId }).select(linkField).lean() : null;
    if (!pkg) return { _id: null };
    const linked = String((pkg as unknown as Record<string, unknown>)[linkField] || "");
    return { $or: [{ ownerPackageId: pkgId }, ...(mongoose.isValidObjectId(linked) ? [{ _id: linked }] : [])] };
  }
  return { ownerPackageId: { $in: ["", null] } };
}

/** The package an owner id names, in this project (null when it is not one, or the caller is an outside login). */
export async function ownerPackage(projectId: string, id: unknown, role = "") {
  if (role === "subcontractor") return null;
  const s = String(id || "");
  return mongoose.isValidObjectId(s) ? WorkPackage.findOne({ _id: s, projectId }) : null;
}

/** The package's main RFQ / PO is the first one made for it (later ones are listed in its view too). */
export async function linkIfEmpty(projectId: string, pkgId: string, field: "rfqId" | "poId", recordId: string) {
  if (!pkgId) return;
  await WorkPackage.updateOne({ _id: pkgId, projectId, [field]: { $in: ["", null] } }, { $set: { [field]: recordId } });
}
