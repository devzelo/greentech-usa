import type { ApiProjectRequest } from "./api";
import type { ProjectPdfInfo } from "./pdfProjectHeader";

// A contract-admin request (RFI / RFC / change order / notice …) as a PDF to send out. Drawn in the
// brand kit's design by components/pdf/RequestPDF.tsx (the same letterhead as the agreements and
// proposals; CR-P (146)); it replaced the plain pdf-lib form that lived here. Loaded on demand so
// the PDF renderer is fetched only when a document is built.
export async function buildRequestPdf(reqDoc: ApiProjectRequest, projectInfo?: ProjectPdfInfo, clientName?: string): Promise<Blob> {
  const { buildBrandRequestPdf } = await import("../components/pdf/RequestPDF");
  return buildBrandRequestPdf(reqDoc, projectInfo, clientName);
}
