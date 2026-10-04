import mongoose from "mongoose";
import ProcurementPO from "../models/ProcurementPO";
import Agreement from "../models/Agreement";

/**
 * CR 328 (GT Comments 3, page 1: "... subject to user permissions and record status"). Once a signed
 * PO (or one the vendor has confirmed) or a signed agreement is linked, the work package is bound to
 * it: its company and links stay as they are until that document is unlinked first. Shared by the
 * work package routes and the RFQ routes (CR 335, which can link an RFQ to a package).
 */
const PO_BOUND = ["Confirmed", "InvoiceReceived", "Paid"];
export const poLock = (po: { poNo?: string; status?: string; signatureUrl?: string } | null | undefined) =>
  po && (po.signatureUrl || PO_BOUND.includes(String(po.status))) ? { kind: "po" as const, no: po.poNo || "the PO", label: po.signatureUrl ? "signed" : "confirmed by the vendor" } : null;
export const agrLock = (a: { agreementNo?: string; name?: string; status?: string } | null | undefined) =>
  a && a.status === "Signed" ? { kind: "agreement" as const, no: a.agreementNo || a.name || "the agreement", label: "signed" } : null;
export type Lock = NonNullable<ReturnType<typeof poLock> | ReturnType<typeof agrLock>>;

export async function locksOf(projectId: string, doc: { _id?: unknown; poId?: string; agreementId?: string }): Promise<Lock[]> {
  // CR 347 - only the package's own PO / agreement binds it (not a Procurement record linked before).
  const own = doc._id ? { ownerPackageId: String(doc._id) } : {};
  const [po, agr] = await Promise.all([
    doc.poId && mongoose.isValidObjectId(doc.poId) ? ProcurementPO.findOne({ _id: doc.poId, projectId, ...own }).select("poNo status signatureUrl").lean() : null,
    doc.agreementId && mongoose.isValidObjectId(doc.agreementId) ? Agreement.findOne({ _id: doc.agreementId, ...own }).select("agreementNo name status").lean() : null,
  ]);
  return [poLock(po), agrLock(agr)].filter((x): x is Lock => !!x);
}
