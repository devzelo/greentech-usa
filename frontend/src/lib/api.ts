// Thin fetch wrapper. In dev, requests are relative and go through Vite's /api proxy → localhost:4000.
// In production (split hosting), set VITE_API_URL to the backend's origin (e.g. https://api.example.com)
// so the browser calls the backend directly; /api and /uploads are prefixed with it. Leave it unset
// to keep same-origin/relative behaviour.
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || "").replace(/\/+$/, "");

// ── Auth helpers ─────────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
  return localStorage.getItem('gt_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('gt_token', token);
  // Grab a fresh file token in the background so document links work immediately.
  void refreshFileToken();
}

export function clearAuthToken() {
  localStorage.removeItem('gt_token');
  localStorage.removeItem('gt_user');
  localStorage.removeItem('gt_file_token');
}

// ── File access tokens ───────────────────────────────────────────────────────
// /uploads documents are no longer public — <img>/<a download> requests carry a
// short-lived token as a query param (they can't send Authorization headers).

export function getFileToken(): string | null {
  return localStorage.getItem('gt_file_token');
}

export async function refreshFileToken(): Promise<void> {
  try {
    const { token } = await request<{ token: string }>('/files/token');
    localStorage.setItem('gt_file_token', token);
  } catch {
    /* uploads links fall back to tokenless URLs (public files still work) */
  }
}

/** Append the current file token to an /uploads URL so the browser can open it directly. */
export function withFileToken(url: string): string {
  if (!url.startsWith('/uploads')) return url;
  const token = getFileToken();
  const withTok = token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
  // Prefix the backend origin in production (split hosting) so files load cross-origin.
  return `${API_BASE}${withTok}`;
}

/** Mint a signed single-file link (7-day expiry) safe to share outside the app. */
// CR-P-11 — email a stored document to someone outside the org (real send via the server mailer).
export async function emailDocument(body: { path: string; to: string; docName: string; note?: string }): Promise<{ ok: boolean }> {
  return request('/files/email', { method: 'POST', body: JSON.stringify(body) });
}
export async function createShareLink(fileUrl: string): Promise<string> {
  const { url } = await request<{ url: string }>('/files/share-link', {
    method: 'POST',
    body: JSON.stringify({ path: fileUrl }),
  });
  return url;
}

export function getAuthUser(): { id: string; name: string; email: string; role: string; empId?: string; phone?: string; avatarUrl?: string } | null {
  const raw = localStorage.getItem('gt_user');
  return raw ? JSON.parse(raw) : null;
}

export function setAuthUser(user: object) {
  localStorage.setItem('gt_user', JSON.stringify(user));
}

export type ProjectStatus = "Ongoing" | "Pending" | "Completed" | "Draft" | "Planning"
  | "Proposal" | "BidSubmitted" | "Active" | "Warranty" | "Closed" | "Lost" | "OnHold";

export interface GalleryItem {
  type: "image" | "video";
  source: "upload" | "link";
  url: string;
  caption?: string;
}

export interface ApiUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  empId?: string;
  phone?: string;
  avatarUrl?: string;
  signatureUrl?: string;
  jobTitle?: string;
  backupEnabled?: boolean;
  backupDay?: number;
  lastBackupSent?: string;
}
export interface ApiSignatory { id: string; name: string; email: string; phone: string; jobTitle: string; signatureUrl: string }

export interface BackupPreviewProject {
  id: string;
  name: string;
  status: string;
  location: string;
  role: "owner" | "assigned";
  downloadUrl: string;
}

export interface BackupPreview {
  projects: BackupPreviewProject[];
  emailConfigured: boolean;
}

export interface ApiProject {
  id: string;
  name: string;
  status: ProjectStatus;
  owner: string;
  ownerId?: string | null;
  image?: string;
  published: boolean;
  financialProposalLocked?: boolean;
  progress: number;
  location: string;
  // Structured project site address; `location` is kept as a short "City, Country" mirror.
  siteAddress?: { line1: string; city: string; state: string; postalCode: string; country: string };
  category: string;
  contractNo: string;
  contractYear: string;
  contractFile?: { name: string; filePath: string; fileType: string; size: string } | null;
  description: string;
  reportNotes?: string; // rich-text HTML narrative for the project report PDF
  archived?: boolean;
  fiscal: string;
  compliance: string;
  value: string; // contract value / project worth (free-form)
  disciplines: string[];
  startDate: string;
  endDate: string;
  projectNature: { selected: string[]; custom: string[] };
  clientInfo: {
    name: string; reference: string; contactName: string;
    email: string; phone: string; country: string; address: string; notes: string;
  };
  jointVenture?: {
    enabled: boolean; partnerName: string; partnerAddress: string;
    contactName: string; email: string; phone: string; lead: string; logo: string; notes: string;
    stamps?: Array<{ name: string; url: string }>;
    signatures?: Array<{ name: string; url: string }>;
  };
  timeline: { phases: Array<{ name: string; start: string; end: string }> };
  assignedEmployees: string[];
  subcontractors: Array<{ name: string; scope: string; subId: string; contact?: string; email?: string; phone?: string; notes?: string; invoiceAmount?: string; userId?: string; acceptedOfferId?: string; customTabs?: Array<{ tabId: string; label: string; parentId: string; notes: string }> }>;
  customTabs: Array<{
    tabId: string;
    label: string;
    notes: string;
    color?: string;
    parentId?: string;
    fields?: Array<{ fieldId: string; label: string; type: string; options?: string[]; value?: string }>;
  }>;
  partnerTabs?: Array<{ tabId: string; label: string; notes: string; fields?: Array<{ fieldId: string; label: string; type: string; options?: string[]; value?: string }> }>;
  tabAccess?: Record<string, { employees: boolean }>;
  guests?: Array<{ userId: string; tabPermissions: Record<string, GuestTabPermission> }>;
  gallery?: GalleryItem[];
  showClientName?: boolean;
  proposals?: {
    technical?: { submissionDate?: string; status?: string };
    financial?: { submissionDate?: string; status?: string };
  };
  proposalContent?: ProposalContent;
}

// ── Proposal Builder ─────────────────────────────────────────────────────────
export interface ProposalEmployee { id: string; name: string; role: string; resumeName?: string; empId?: string; userId?: string }
export interface ProposalSimilarProject { id: string; name: string; client: string; value: string; year: string; summary: string }
export interface ProposalTimelinePhase { phase: string; start: string; end: string }
export interface ProposalSection { id: string; heading: string; body: string; attachments?: Array<{ name: string; url: string }> } // body is HTML; CR-B-18 per-section files

// Section engine: an ordered list controlling which blocks appear, their order,
// visibility, heading, and (reserved) per-section letterhead.
export type ProposalLetterhead = "gt" | "jv" | "custom" | "none";
export type ProposalSectionLetterhead = ProposalLetterhead | "inherit"; // "inherit" = use the proposal default
export type ProposalSectionKind = "description" | "personnel" | "pastPerformance" | "timeline" | "custom" | "blank";
export interface ProposalSectionMeta {
  id: string;
  kind: ProposalSectionKind;
  refId?: string;   // custom sections → ProposalSection.id
  title: string;    // heading shown in the document / TOC
  hidden: boolean;
  letterhead?: ProposalSectionLetterhead; // per-section letterhead override
  divider?: boolean;                      // render a divider title page before this section
  pageBreakBefore?: boolean;              // force this section to start on a new page
  status?: string;                        // CR-B-15 — per-section status (colour-coded)
  locked?: boolean;                       // CR-B-17 — locked sections aren't reordered/edited
  notes?: string;                         // CR-B-17 — internal notes (not printed)
  assignedTo?: string;                    // CR-B-19a — colleague tagged to review this section
  history?: Array<{ at: string; by: string; text: string }>; // CR-B-17 — per-section change log
}

export interface TechnicalProposalContent {
  coverTitle: string;
  coverSubtitle: string;
  refNo: string;
  date: string;
  description: string; // HTML
  employees: ProposalEmployee[];
  similarProjects: ProposalSimilarProject[];
  timeline: ProposalTimelinePhase[];
  sections: ProposalSection[];
  layout?: ProposalSectionMeta[]; // section order / visibility / titles
}
export interface FinancialLineItem { id: string; itemNo: string; description: string; qty: string; unit: string; rate: string; amount: string }

// Fully customizable pricing tables (add/remove rows & columns, rename columns, multiple tables).
export type FinancialColumnKind = "text" | "number" | "amount";
export interface FinancialColumn { id: string; label: string; kind: FinancialColumnKind }
export interface FinancialRow { id: string; cells: Record<string, string> } // keyed by column id
export interface FinancialTable { id: string; title: string; columns: FinancialColumn[]; rows: FinancialRow[] }

export interface FinancialProposalContent {
  currency: string;
  notes: string; // HTML
  lineItems?: FinancialLineItem[]; // legacy single-table data (migrated into `tables`)
  tables?: FinancialTable[];
}

export function defaultFinancialColumns(): FinancialColumn[] {
  return [
    { id: "c-item", label: "Item", kind: "text" },
    { id: "c-desc", label: "Description", kind: "text" },
    { id: "c-qty", label: "Qty", kind: "number" },
    { id: "c-unit", label: "Unit", kind: "text" },
    { id: "c-rate", label: "Rate", kind: "number" },
    { id: "c-amount", label: "Amount", kind: "amount" },
  ];
}

/** Resolve a financial content to its tables, migrating legacy lineItems into a default table. */
export function resolveFinancialTables(f: FinancialProposalContent): FinancialTable[] {
  if (f.tables && f.tables.length) return f.tables;
  const n = (s: string) => parseFloat(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
  const rows: FinancialRow[] = (f.lineItems || []).map((it, i) => {
    const amt = it.amount || (n(it.qty) * n(it.rate) ? String(n(it.qty) * n(it.rate)) : "");
    return { id: it.id || `r-${i}`, cells: { "c-item": it.itemNo, "c-desc": it.description, "c-qty": it.qty, "c-unit": it.unit, "c-rate": it.rate, "c-amount": amt } };
  });
  return [{ id: "t-default", title: "Pricing", columns: defaultFinancialColumns(), rows }];
}
// Shared cover page + cover letter (used by both the technical & financial documents).
export interface ProposalCoverImage { id: string; url: string }
export interface ProposalCover {
  proposalTitle: string;
  projectName: string;
  solicitationNo: string;
  taskOrderNo: string;
  contractNo: string;
  clientName: string;
  dueDate: string;
  submissionDate: string;
  submittedTo: string;
  attentionTo: string;
  submittedBy: string;
  logoMode: "single" | "dual"; // dual = Joint Venture (two logos)
  jvLogoUrl: string;           // second logo for JV submissions
  images: ProposalCoverImage[]; // 3–4 cover images (from the project gallery or uploaded)
}
export interface ProposalSignatory { id: string; name: string; title: string; signatureUrl: string }
export interface ProposalCoverLetter {
  enabled: boolean;
  body: string; // HTML
  useEmailSignature: boolean;
  signatories: ProposalSignatory[];
}

export interface ProposalRequirement { id: string; label: string; done: boolean }

// Customizable closing / back-cover page (brochure-style).
export interface ProposalBackCover {
  enabled: boolean;
  tagline: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  social: string;
  marketing: string; // HTML
  images: ProposalCoverImage[];
}

export interface ProposalContent {
  cover?: ProposalCover;           // Technical proposal cover page (legacy key; also the shared base)
  coverFinancial?: ProposalCover;  // Financial proposal cover page (defaults from `cover`)
  coverLetter?: ProposalCoverLetter;
  backCover?: ProposalBackCover;
  letterhead?: ProposalLetterhead;     // proposal-wide letterhead (GT / JV / custom / none)
  customLetterheadUrl?: string;        // header image when letterhead === "custom"
  requirements?: ProposalRequirement[]; // internal compliance checklist
  technical?: TechnicalProposalContent;
  financial?: FinancialProposalContent;
}

// ── Resource library (reusable proposal content blocks) ───────────────────────
export const RESOURCE_CATEGORIES = [
  "Methodology", "Company Description", "Safety Plan", "Quality Plan",
  "Equipment List", "Organizational Chart", "Standard Text", "Reference Letter", "Other",
];
export interface ApiResourceBlock {
  _id: string;
  title: string;
  category: string;
  body: string;
  createdById?: string | null;
  createdByName?: string;
}
export async function fetchResourceBlocks(params?: { q?: string; category?: string }): Promise<ApiResourceBlock[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.category) qs.set("category", params.category);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/resource-blocks${suffix}`);
}
export async function createResourceBlock(body: { title: string; category: string; body: string }): Promise<ApiResourceBlock> {
  return request(`/resource-blocks`, { method: "POST", body: JSON.stringify(body) });
}
export async function updateResourceBlock(id: string, body: Partial<{ title: string; category: string; body: string }>): Promise<ApiResourceBlock> {
  return request(`/resource-blocks/${id}`, { method: "PUT", body: JSON.stringify(body) });
}
export async function deleteResourceBlock(id: string): Promise<{ message: string }> {
  return request(`/resource-blocks/${id}`, { method: "DELETE" });
}

// ── Proposal revisions (version history + archive) ────────────────────────────
export interface ApiProposalRevision {
  _id: string;
  projectId: string;
  label: string;
  note: string;
  archived: boolean;
  content: ProposalContent;
  createdByName?: string;
  createdAt?: string;
}
export async function fetchProposalRevisions(projectId: string): Promise<ApiProposalRevision[]> {
  return request(`/projects/${projectId}/proposal-revisions`);
}
export async function createProposalRevision(projectId: string, body: { label: string; note?: string; content: ProposalContent; archived?: boolean }): Promise<ApiProposalRevision> {
  return request(`/projects/${projectId}/proposal-revisions`, { method: "POST", body: JSON.stringify(body) });
}
export async function deleteProposalRevision(projectId: string, rid: string): Promise<{ message: string }> {
  return request(`/projects/${projectId}/proposal-revisions/${rid}`, { method: "DELETE" });
}

// ── Proposal templates (reusable, company-wide) ───────────────────────────────
export interface ProposalTemplateContent {
  // Built-in scaffolds carry { letterhead, sectionTitles }; user templates carry a full snapshot.
  letterhead?: ProposalLetterhead;
  sectionTitles?: string[];
  cover?: ProposalCover;
  coverLetter?: ProposalCoverLetter;
  customLetterheadUrl?: string;
  technical?: TechnicalProposalContent;
  financial?: FinancialProposalContent;
}
export interface ApiProposalTemplate {
  _id: string;
  name: string;
  description: string;
  builtin: boolean;
  createdById?: string | null;
  createdByName?: string;
  content: ProposalTemplateContent;
}

export async function fetchProposalTemplates(): Promise<ApiProposalTemplate[]> {
  return request('/proposal-templates');
}
export async function saveProposalTemplate(body: { name: string; description?: string; content: ProposalTemplateContent }): Promise<ApiProposalTemplate> {
  return request('/proposal-templates', { method: 'POST', body: JSON.stringify(body) });
}
export async function deleteProposalTemplate(id: string): Promise<{ message: string }> {
  return request(`/proposal-templates/${id}`, { method: 'DELETE' });
}

/** Upload an image used by a proposal (cover image or signature). Owner/assigned-employee only. Returns its URL. */
export async function uploadProposalAsset(projectId: string, file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/proposal-assets`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

/**
 * Upload an image for insertion into a rich-text editor and return an **absolute** URL.
 * Rich-text bodies store `<img src="…">` verbatim, so the src must resolve to the backend even
 * when the frontend is hosted on a different origin (split Vercel + Render). In dev, API_BASE is
 * empty so it stays relative and works through the Vite proxy.
 */
export async function uploadInlineImage(projectId: string, file: File): Promise<string> {
  const { url } = await uploadProposalAsset(projectId, file);
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url;
  return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

// Built-in technical sections (data lives in dedicated fields; layout controls order/visibility).
export const PROPOSAL_BUILTINS: { kind: ProposalSectionKind; title: string }[] = [
  { kind: "description", title: "Technical Description" },
  { kind: "personnel", title: "Key Personnel" },
  { kind: "pastPerformance", title: "Similar Projects / Past Performance" },
  { kind: "timeline", title: "Project Timeline" },
];

// Standard sections offered in the "Add section" menu (each becomes a custom rich-text section).
export const PROPOSAL_STANDARD_SECTIONS: string[] = [
  "Standard Forms", "Table of Contents", "Executive Summary", "Technical Approach / Methodology",
  "Staffing Plan", "Organizational Chart", "Resumes", "Past Performance",
  "Company Registration Documents", "Certifications", "Reference Letters", "Equipment List",
  "Schedule", "Quality Control Plan", "Health and Safety Plan", "Appendix",
];

/** Reconcile a stored layout with the current section data (adds missing, drops orphans). */
export function resolveProposalLayout(t: TechnicalProposalContent): ProposalSectionMeta[] {
  const existing = t.layout || [];
  const out: ProposalSectionMeta[] = [];
  const seenBuiltins = new Set<string>();
  const seenCustom = new Set<string>();
  for (const m of existing) {
    if (m.kind === "custom") {
      if (m.refId && t.sections.some((s) => s.id === m.refId) && !seenCustom.has(m.refId)) {
        seenCustom.add(m.refId);
        out.push(m);
      }
    } else if (m.kind === "blank") {
      out.push(m); // blank pages are standalone — keep every one, allow duplicates
    } else if (!seenBuiltins.has(m.kind)) {
      seenBuiltins.add(m.kind);
      out.push(m);
    }
  }
  for (const b of PROPOSAL_BUILTINS) {
    if (!seenBuiltins.has(b.kind)) out.push({ id: `b-${b.kind}`, kind: b.kind, title: b.title, hidden: false });
  }
  for (const s of t.sections) {
    if (!seenCustom.has(s.id)) out.push({ id: `m-${s.id}`, kind: "custom", refId: s.id, title: s.heading || "Section", hidden: false });
  }
  return out;
}

export type GuestTabPermission = "view" | "edit";

export interface ApiGuest {
  userId: string;
  name: string;
  email: string;
  tabPermissions: Record<string, GuestTabPermission>;
  expiresAt?: string | null;
}

export interface ApiTemplate {
  _id: string;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  tabs: Array<{
    label: string;
    color?: string;
    notes?: string;
    fields?: Array<{ label: string; type: string; options?: string[] }>;
    children?: Array<{
      label: string;
      color?: string;
      notes?: string;
      fields?: Array<{ label: string; type: string; options?: string[] }>;
    }>;
  }>;
}

export interface ApiEmployee {
  id?: string;        // the User account _id (stable key; empId may be blank)
  empId: string;      // assignment id — only users with one are assignable to projects
  name: string;
  role?: string;      // account role (admin | employee)
}

// Map Mongoose doc (projectId field) → frontend shape (id field)
function normalise(raw: Record<string, unknown>): ApiProject {
  return { ...raw, id: raw.projectId } as ApiProject;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  if (res.status === 401) {
    clearAuthToken();
    // Bounce to login if we're inside the dashboard
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
      window.location.href = '/login';
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  return request<{ token: string; user: { id: string; name: string; email: string; role: string; empId?: string; phone?: string; avatarUrl?: string } }>(
    '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }
  );
}

export async function forgotPassword(email: string) {
  return request<{ message: string }>('/auth/forgot-password', {
    method: 'POST', body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  return request<{ message: string }>('/auth/reset-password', {
    method: 'POST', body: JSON.stringify({ token, password }),
  });
}

export async function fetchMe(): Promise<ApiUser> {
  return request<ApiUser>('/auth/me');
}

export async function updateMe(body: Partial<ApiUser>): Promise<ApiUser> {
  return request<ApiUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(body) });
}

export async function fetchBackupPreview(): Promise<BackupPreview> {
  return request<BackupPreview>('/auth/me/backup-preview');
}

export async function sendBackupNow(): Promise<{ sent: boolean; reason?: string; projectCount: number }> {
  return request<{ sent: boolean; reason?: string; projectCount: number }>('/auth/me/backup-now', { method: 'POST' });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return request<{ message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ── Admin: user management ────────────────────────────────────────────────────
export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  empId?: string;
  phone?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>('/users');
}

export async function createUser(body: {
  name: string; email: string; password: string; role: string; empId?: string; phone?: string;
}): Promise<AdminUser> {
  return request<AdminUser>('/users', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateUser(id: string, body: Partial<{
  name: string; email: string; role: string; empId: string; phone: string;
}>): Promise<AdminUser> {
  return request<AdminUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function adminResetPassword(id: string, password: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/users/${id}/reset-password`, {
    method: 'POST', body: JSON.stringify({ password }),
  });
}

export async function deleteUser(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/users/${id}`, { method: 'DELETE' });
}

// Download the proposal as a Word (.docx) document (built server-side).
export async function downloadProposalDocx(projectId: string, kind: 'technical' | 'financial'): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/proposal-docx?kind=${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dispo = res.headers.get('Content-Disposition') || '';
  const match = dispo.match(/filename="?([^";]+)"?/i);
  a.download = match?.[1] || `${kind}_proposal.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Download a per-project zip export. Triggers a save dialog in the browser.
export async function downloadProjectExport(projectId: string, suggestedName?: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Try the filename the server suggested via Content-Disposition; fall back to provided name
  const dispo = res.headers.get('Content-Disposition') || '';
  const match = dispo.match(/filename="?([^";]+)"?/i);
  a.download = match?.[1] || suggestedName || `${projectId}-export.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function uploadAvatar(file: File): Promise<ApiUser> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch('/api/auth/avatar', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Upload the current user's signature image (used on PO documents).
export async function uploadSignature(file: File): Promise<ApiUser> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch('/api/auth/signature', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText); }
  return res.json();
}
// Staff who have a signature on file — the pool the PO signature picker chooses from.
export async function fetchSignatories(): Promise<ApiSignatory[]> { return request('/auth/signatories'); }

// ── Projects ────────────────────────────────────────────────────────────────

export async function fetchProjects(scope: 'mine' | 'all' | 'drafts' | 'archived' = 'all'): Promise<ApiProject[]> {
  const data = await request<Record<string, unknown>[]>(`/projects?scope=${scope}`);
  return data.map(normalise);
}
/** Archive or restore a project (archived projects are hidden from the normal lists). */
export async function setProjectArchived(id: string, archived: boolean): Promise<ApiProject> {
  return updateProject(id, { archived } as Partial<ApiProject>);
}

export async function fetchProject(id: string): Promise<ApiProject> {
  const data = await request<Record<string, unknown>>(`/projects/${id}`);
  return normalise(data);
}

export async function createProject(body: Partial<ApiProject>): Promise<ApiProject> {
  const data = await request<Record<string, unknown>>('/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return normalise(data);
}

export async function updateProject(id: string, body: Partial<ApiProject>): Promise<ApiProject> {
  const data = await request<Record<string, unknown>>(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return normalise(data);
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/projects/${id}`, { method: 'DELETE' });
}

// ── Guests (project owner only) ──────────────────────────────────────────────

export async function fetchGuests(projectId: string): Promise<ApiGuest[]> {
  return request<ApiGuest[]>(`/projects/${projectId}/guests`);
}

/** Distinct guests across all projects the current owner manages (for reuse). */
export async function fetchGuestDirectory(): Promise<{ userId: string; name: string; email: string }[]> {
  return request(`/projects/guests-directory`);
}

export async function createGuest(projectId: string, body: {
  name: string;
  email: string;
  password: string;
  tabPermissions: Record<string, GuestTabPermission>;
  alsoAssignProjectIds?: string[];
  expiresAt?: string | null;
}): Promise<ApiGuest & { assignedTo: string[] }> {
  return request(`/projects/${projectId}/guests`, { method: 'POST', body: JSON.stringify(body) });
}

export async function updateGuest(projectId: string, userId: string, body: {
  tabPermissions?: Record<string, GuestTabPermission>;
  name?: string;
  password?: string;
  expiresAt?: string | null;
}): Promise<{ message: string }> {
  return request(`/projects/${projectId}/guests/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function removeGuest(projectId: string, userId: string): Promise<{ message: string }> {
  return request(`/projects/${projectId}/guests/${userId}`, { method: 'DELETE' });
}

// The signed contract document on the project identity (one per project; re-upload replaces).
// The JV partner (or staff) edits the partner profile on a project — same jointVenture record the
// Partners tab shows, so the two stay in sync. Returns the updated jointVenture block.
export interface PartnerProfileInput {
  partnerName?: string; partnerAddress?: string; contactName?: string; email?: string; phone?: string;
  logo?: string; notes?: string;
  stamps?: Array<{ name: string; url: string }>;
  signatures?: Array<{ name: string; url: string }>;
}
export async function updatePartnerProfile(projectId: string, body: PartnerProfileInput): Promise<NonNullable<ApiProject["jointVenture"]>> {
  return request(`/projects/${projectId}/partner-profile`, { method: "PATCH", body: JSON.stringify(body) });
}
// A partner uploads a logo / stamp / signature image on a project they partner on.
export async function uploadPartnerAsset(projectId: string, file: File): Promise<{ url: string }> {
  const fd = new FormData(); fd.append("file", file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/partner-profile/asset`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}

export async function uploadProjectContract(id: string, file: File): Promise<ApiProject> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${id}/contract`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return normalise(await res.json() as Record<string, unknown>);
}
export async function deleteProjectContract(id: string): Promise<ApiProject> {
  const data = await request<Record<string, unknown>>(`/projects/${id}/contract`, { method: 'DELETE' });
  return normalise(data);
}

export async function uploadProjectImage(id: string, file: File): Promise<ApiProject> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${id}/image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const data = await res.json() as Record<string, unknown>;
  return normalise(data);
}

// ── Employees ────────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<ApiEmployee[]> {
  return request<ApiEmployee[]>('/employees');
}

// ── Expenses ────────────────────────────────────────────────────────────────

export interface ExpenseAttachment { _id: string; name: string; filePath: string; fileType: string; size: string }
export type ApprovalStatus = "pending" | "approved" | "rejected";
export interface ApiExpense {
  _id: string;
  description: string;
  date: string;
  qty: string;
  amount: string; // unit price
  remarks: string;
  subId: string;
  approval: ApprovalStatus;
  attachments: ExpenseAttachment[];
  addedById: string | null;
  addedByName: string;
  addedByEmail: string;
  addedByRole: string;
}
type ExpenseInput = { description: string; date: string; qty: string; amount: string; remarks: string };

export async function fetchExpenses(projectId: string) {
  return request<ApiExpense[]>(`/projects/${projectId}/expenses`);
}

/** The caller's own logged expenses across all their projects (subcontractor profile). */
export interface MyExpense extends ApiExpense { projectId: string; projectName: string }
export async function fetchMyExpenses(): Promise<MyExpense[]> {
  return request(`/projects/my-expenses`);
}

/** Per-project income (sent invoices) & expenses (qty x unit price) for report PDFs. */
export interface ProjectFinancials { income: number; expenses: number }
export async function fetchProjectFinancials(ids: string[]): Promise<Record<string, ProjectFinancials>> {
  if (!ids.length) return {};
  return request(`/projects/financials?ids=${encodeURIComponent(ids.join(","))}`);
}

export async function addExpense(projectId: string, body: ExpenseInput) {
  return request<ApiExpense>(`/projects/${projectId}/expenses`, { method: 'POST', body: JSON.stringify(body) });
}

export async function updateExpense(projectId: string, eid: string, body: Partial<ExpenseInput> & { approval?: ApprovalStatus }) {
  return request<ApiExpense>(`/projects/${projectId}/expenses/${eid}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteExpense(projectId: string, eid: string) {
  return request(`/projects/${projectId}/expenses/${eid}`, { method: 'DELETE' });
}

export async function uploadExpenseAttachment(projectId: string, eid: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/expenses/${eid}/attachments`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json() as Promise<ApiExpense>;
}

export async function deleteExpenseAttachment(projectId: string, eid: string, aid: string) {
  return request<ApiExpense>(`/projects/${projectId}/expenses/${eid}/attachments/${aid}`, { method: 'DELETE' });
}

/** Resolve an expense/attachment stored path to a token-guarded viewable URL. */
export function attachmentUrl(filePath: string): string {
  const norm = (filePath || "").replace(/\\/g, '/');
  const rel = norm.startsWith('uploads/') ? norm.slice('uploads/'.length) : norm;
  return withFileToken(`/uploads/${rel}`);
}

// ── Saved document versions (frozen PDF/Excel copies with history) ────────────
export type SavedDocKind = "proposal" | "boq" | "rfq" | "po" | "resume";
export interface ApiSavedDocument {
  _id: string;
  kind: SavedDocKind;
  projectId: string;
  refId: string;
  version: number;
  title: string;
  note: string;
  status: "draft" | "final";
  fileName: string;
  filePath: string;
  fileType: string;
  size: string;
  createdByName: string;
  createdAt: string;
}
interface SaveMeta { kind: SavedDocKind; refId?: string; title?: string; note?: string; status?: "draft" | "final" }

async function postMultipart<T = ApiSavedDocument>(url: string, fd: FormData): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(url, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json() as Promise<T>;
}

export async function fetchSavedDocuments(projectId: string, kind: SavedDocKind, refId = '') {
  return request<ApiSavedDocument[]>(`/projects/${projectId}/saved-documents?kind=${encodeURIComponent(kind)}&refId=${encodeURIComponent(refId)}`);
}

export async function saveDocumentVersion(projectId: string, meta: SaveMeta, file: Blob, fileName: string) {
  const fd = new FormData();
  // Text fields MUST be appended before the file so multer's storage callback can read `kind`.
  fd.append('kind', meta.kind);
  fd.append('refId', meta.refId || '');
  if (meta.title) fd.append('title', meta.title);
  if (meta.note) fd.append('note', meta.note);
  if (meta.status) fd.append('status', meta.status);
  fd.append('file', file, fileName);
  return postMultipart(`/api/projects/${projectId}/saved-documents`, fd);
}

export async function updateSavedDocument(projectId: string, docId: string, body: { title?: string; note?: string; status?: 'draft' | 'final' }) {
  return request<ApiSavedDocument>(`/projects/${projectId}/saved-documents/${docId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteSavedDocument(projectId: string, docId: string) {
  return request(`/projects/${projectId}/saved-documents/${docId}`, { method: 'DELETE' });
}

// Resume saved versions are scoped to the logged-in user, not a project.
export async function fetchSavedResumes() {
  return request<ApiSavedDocument[]>(`/resume/saved-versions`);
}

export async function saveResumeVersion(meta: { title?: string; status?: 'draft' | 'final' }, file: Blob, fileName: string) {
  const fd = new FormData();
  if (meta.title) fd.append('title', meta.title);
  if (meta.status) fd.append('status', meta.status);
  fd.append('file', file, fileName);
  return postMultipart(`/api/resume/saved-versions`, fd);
}

export async function updateSavedResume(docId: string, body: { title?: string; status?: 'draft' | 'final' }) {
  return request<ApiSavedDocument>(`/resume/saved-versions/${docId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteSavedResume(docId: string) {
  return request(`/resume/saved-versions/${docId}`, { method: 'DELETE' });
}

// ── Subcontractor invoices (Subcontractors → Invoices tab) ───────────────────
export interface ApiSubInvoice {
  _id: string;
  projectId: string;
  subId: string;
  description: string;
  amount: string;
  remarks: string;
  date: string;
  approval: ApprovalStatus;
  attachments: ExpenseAttachment[];
  addedByName: string;
}
type SubInvoiceInput = { subId: string; description?: string; amount?: string; remarks?: string; date?: string; approval?: ApprovalStatus };
export async function fetchSubInvoices(projectId: string, subId?: string) {
  const qs = subId ? `?subId=${encodeURIComponent(subId)}` : "";
  return request<ApiSubInvoice[]>(`/projects/${projectId}/sub-invoices${qs}`);
}
export async function addSubInvoice(projectId: string, body: SubInvoiceInput) {
  return request<ApiSubInvoice>(`/projects/${projectId}/sub-invoices`, { method: 'POST', body: JSON.stringify(body) });
}
export async function updateSubInvoice(projectId: string, iid: string, body: Partial<SubInvoiceInput>) {
  return request<ApiSubInvoice>(`/projects/${projectId}/sub-invoices/${iid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function deleteSubInvoice(projectId: string, iid: string) {
  return request(`/projects/${projectId}/sub-invoices/${iid}`, { method: 'DELETE' });
}
export async function uploadSubInvoiceAttachment(projectId: string, iid: string, file: File) {
  const fd = new FormData(); fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/sub-invoices/${iid}/attachments`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json() as Promise<ApiSubInvoice>;
}
export async function deleteSubInvoiceAttachment(projectId: string, iid: string, aid: string) {
  return request<ApiSubInvoice>(`/projects/${projectId}/sub-invoices/${iid}/attachments/${aid}`, { method: 'DELETE' });
}

// ── Purchase Orders ──────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(projectId: string) {
  return request<{ _id: string; poNumber: string; vendor: string; amount: string; date: string; status: string }[]>(
    `/projects/${projectId}/purchase-orders`
  );
}

export async function addPurchaseOrder(projectId: string, body: { poNumber: string; vendor: string; amount: string; date: string; status: string }) {
  return request(`/projects/${projectId}/purchase-orders`, { method: 'POST', body: JSON.stringify(body) });
}

export async function updatePurchaseOrder(projectId: string, pid: string, body: Partial<{ poNumber: string; vendor: string; amount: string; date: string; status: string }>) {
  return request(`/projects/${projectId}/purchase-orders/${pid}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deletePurchaseOrder(projectId: string, pid: string) {
  return request(`/projects/${projectId}/purchase-orders/${pid}`, { method: 'DELETE' });
}

// ── Invoices ────────────────────────────────────────────────────────────────

export interface ApiInvoiceFile { _id: string; name: string; filePath: string; fileType: string; size: string }
export interface ApiInvoicePayment {
  _id: string; amount: string; date: string; method: string; reference: string; notes: string;
  attachments: ApiInvoiceFile[]; expenseId: string; addedByName: string;
}
export interface InvoiceLineItem { description: string; qty: string; unitPrice: string; date?: string; remarks?: string }
export interface InvoiceBank { name: string; accountName: string; accountNumber: string; iban: string; swift: string; routing: string }
export interface ApiInvoice {
  _id: string; projectId: string; type: 'sent' | 'received';
  number: string; party: string; amount: string; date: string; status: string; description: string;
  poId: string; subId: string;
  // Invoice builder (CR-I-03/04/07).
  receiverKind?: string; companyId?: string; lineItems?: InvoiceLineItem[]; bank?: InvoiceBank;
  terms?: string; sections?: Array<{ title: string; body: string }>; rfqId?: string; isTemplate?: boolean;
  signerName?: string; signerTitle?: string; signatureUrl?: string; contractTotal?: string;
  attachments: ApiInvoiceFile[]; payments: ApiInvoicePayment[]; addedByName: string;
}
// Paid / remaining are DERIVED from the payment rows — partial payments are first-class.
export const invoicePaid = (inv: Pick<ApiInvoice, 'payments'>) =>
  (inv.payments || []).reduce((s, p) => s + (parseFloat(String(p.amount ?? '').replace(/[^0-9.-]/g, '')) || 0), 0);
export const invoiceRemaining = (inv: Pick<ApiInvoice, 'amount' | 'payments'>) =>
  Math.max(0, (parseFloat(String(inv.amount ?? '').replace(/[^0-9.-]/g, '')) || 0) - invoicePaid(inv));

export async function fetchInvoices(projectId: string, type?: 'sent' | 'received'): Promise<ApiInvoice[]> {
  const qs = type ? `?type=${type}` : '';
  return request<ApiInvoice[]>(`/projects/${projectId}/invoices${qs}`);
}

export type InvoiceInput = Partial<Pick<ApiInvoice, 'type' | 'number' | 'party' | 'amount' | 'date' | 'status' | 'description' | 'poId' | 'subId' | 'receiverKind' | 'companyId' | 'lineItems' | 'bank' | 'terms' | 'sections' | 'rfqId' | 'isTemplate' | 'signerName' | 'signerTitle' | 'signatureUrl' | 'contractTotal'>>;
export async function addInvoice(projectId: string, body: InvoiceInput): Promise<ApiInvoice> {
  return request(`/projects/${projectId}/invoices`, { method: 'POST', body: JSON.stringify(body) });
}

export async function updateInvoice(projectId: string, iid: string, body: InvoiceInput): Promise<ApiInvoice> {
  return request(`/projects/${projectId}/invoices/${iid}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteInvoice(projectId: string, iid: string) {
  return request(`/projects/${projectId}/invoices/${iid}`, { method: 'DELETE' });
}

// Raise a received invoice from a Procurement PO's vendor invoice (idempotent per PO).
export async function invoiceFromPO(projectId: string, poId: string): Promise<ApiInvoice> {
  return request(`/projects/${projectId}/invoices/from-po/${poId}`, { method: 'POST' });
}
// Record a payment. On a received invoice this also posts a linked Expense automatically.
export async function addInvoicePayment(projectId: string, iid: string, body: { amount: string; date?: string; method?: string; reference?: string; notes?: string }): Promise<ApiInvoice> {
  return request(`/projects/${projectId}/invoices/${iid}/payments`, { method: 'POST', body: JSON.stringify(body) });
}
export async function deleteInvoicePayment(projectId: string, iid: string, pid: string): Promise<ApiInvoice> {
  return request(`/projects/${projectId}/invoices/${iid}/payments/${pid}`, { method: 'DELETE' });
}
async function invoiceUpload(path: string, file: File): Promise<ApiInvoice> {
  const fd = new FormData(); fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
/** The receipt / proof for a payment — mirrored onto the linked expense. */
export async function uploadPaymentReceipt(projectId: string, iid: string, pid: string, file: File): Promise<ApiInvoice> {
  return invoiceUpload(`/projects/${projectId}/invoices/${iid}/payments/${pid}/files`, file);
}
/** The invoice document itself. */
export async function uploadInvoiceFile(projectId: string, iid: string, file: File): Promise<ApiInvoice> {
  return invoiceUpload(`/projects/${projectId}/invoices/${iid}/files`, file);
}
export async function deleteInvoiceFile(projectId: string, iid: string, fid: string): Promise<ApiInvoice> {
  return request(`/projects/${projectId}/invoices/${iid}/files/${fid}`, { method: 'DELETE' });
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function fetchTemplates(): Promise<ApiTemplate[]> {
  return request<ApiTemplate[]>('/templates');
}

export async function createTemplate(body: {
  name: string;
  description?: string;
  tabs: Array<{
    label: string;
    color?: string;
    notes?: string;
    fields?: Array<{ label: string; type: string; options?: string[] }>;
    children?: Array<{
      label: string;
      color?: string;
      notes?: string;
      fields?: Array<{ label: string; type: string; options?: string[] }>;
    }>;
  }>;
}): Promise<ApiTemplate> {
  return request<ApiTemplate>('/templates', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateTemplate(id: string, body: {
  name?: string;
  description?: string;
  tabs?: Array<{
    label: string;
    color?: string;
    notes?: string;
    fields?: Array<{ label: string; type: string; options?: string[] }>;
    children?: Array<{
      label: string;
      color?: string;
      notes?: string;
      fields?: Array<{ label: string; type: string; options?: string[] }>;
    }>;
  }>;
}): Promise<ApiTemplate> {
  return request<ApiTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteTemplate(id: string): Promise<void> {
  await request(`/templates/${id}`, { method: 'DELETE' });
}

// ── Documents ────────────────────────────────────────────────────────────────

export interface ApiDocument {
  _id: string;
  projectId: string;
  section: string;
  name: string;
  fileType: string;
  size: string;
  filePath: string;
  description?: string;
  public?: boolean;
  archived?: boolean;
  uploadedAt: string;
}

/** Owner-only: toggle whether a document appears on the public showcase. */
export async function setDocumentPublic(projectId: string, did: string, isPublic: boolean): Promise<ApiDocument> {
  return request<ApiDocument>(`/projects/${projectId}/documents/${did}/public`, {
    method: 'PATCH',
    body: JSON.stringify({ public: isPublic }),
  });
}

// Update a document's per-file description (J3).
export async function updateDocumentDescription(projectId: string, did: string, description: string): Promise<ApiDocument> {
  return request<ApiDocument>(`/projects/${projectId}/documents/${did}`, {
    method: 'PATCH',
    body: JSON.stringify({ description }),
  });
}

// CR-P-10 — archive / restore a file.
export async function setDocumentArchived(projectId: string, did: string, archived: boolean): Promise<ApiDocument> {
  return request<ApiDocument>(`/projects/${projectId}/documents/${did}`, { method: 'PATCH', body: JSON.stringify({ archived }) });
}
export async function fetchDocuments(projectId: string, section?: string, archived = false): Promise<ApiDocument[]> {
  const q = new URLSearchParams();
  if (section) q.set("section", section);
  if (archived) q.set("archived", "true");
  const qs = q.toString();
  return request<ApiDocument[]>(`/projects/${projectId}/documents${qs ? `?${qs}` : ""}`);
}

export interface ApiGlobalDocument extends ApiDocument {
  projectName: string;
}

export async function fetchAllDocuments(): Promise<ApiGlobalDocument[]> {
  return request<ApiGlobalDocument[]>('/documents');
}

// Folder descriptions in the Documents module. Folders are virtual (project / tab / section-group),
// keyed by (projectId, folderKey) where folderKey is "project" | "tab:<id>" | "group:<key>".
export interface ApiFolderNote { projectId: string; folderKey: string; description: string }
export async function fetchFolderNotes(): Promise<ApiFolderNote[]> {
  return request<ApiFolderNote[]>('/documents/folder-notes');
}
export async function setFolderNote(projectId: string, folderKey: string, description: string): Promise<ApiFolderNote> {
  return request<ApiFolderNote>('/documents/folder-notes', { method: 'PUT', body: JSON.stringify({ projectId, folderKey, description }) });
}

// `replace` supersedes any existing document with the SAME name in the same section — used by
// the generated RFQ / PO / submittal documents so regenerating one updates its copy in the
// Documents module instead of adding another identically-named row.
export async function uploadDocument(projectId: string, file: File, section: string, replace = false): Promise<ApiDocument> {
  const fd = new FormData();
  fd.append('section', section); // append BEFORE file so multer's destination cb has it
  if (replace) fd.append('replace', 'true');
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function deleteDocument(projectId: string, did: string): Promise<void> {
  await request(`/projects/${projectId}/documents/${did}`, { method: 'DELETE' });
}

// Build a downloadable URL for a stored document
export function documentUrl(doc: ApiDocument): string {
  // filePath is "uploads/<projectId>/<section>/<file>" — served at /uploads behind a token check
  const norm = doc.filePath.replace(/\\/g, '/');
  const rel = norm.startsWith('uploads/') ? norm.slice('uploads/'.length) : norm;
  return withFileToken(`/uploads/${rel}`);
}

// ── Public projects (used by the marketing site) ─────────────────────────────

export interface ApiPublicProject {
  id: string;
  name: string;
  status: string;
  location: string;
  category: string;
  description: string;
  owner: string;
  image?: string;
  startDate: string;
  endDate: string;
  fiscal: string;
  disciplines: string[];
  progress: number;
}

export async function fetchPublicProjects(): Promise<ApiPublicProject[]> {
  // Public endpoint — no auth header
  const res = await fetch('/api/public/projects');
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export interface ApiPublicProjectDetail {
  id: string;
  name: string;
  status: string;
  location: string;
  category: string;
  description: string;
  owner: string;
  startDate: string;
  endDate: string;
  progress: number;
  clientName: string;
  gallery: GalleryItem[];
  documents: { name: string; fileType: string; url: string }[];
}

export async function fetchPublicProject(id: string): Promise<ApiPublicProjectDetail> {
  const res = await fetch(`${API_BASE}/api/public/projects/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

/** Owner-only: upload an image/video file for the public gallery. Returns its URL + type. */
export async function uploadGalleryFile(projectId: string, file: File): Promise<{ url: string; type: "image" | "video" }> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/gallery`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Procurement Rows ─────────────────────────────────────────────────────────

export interface ApiProcurementRow {
  _id: string;
  projectId: string;
  itemNo: string;
  description: string;
  submittal: string;
  status: string;
  recommendedBrand: string;
  qty: string;
  unit: string;
  total: string;
  currency: string;
  orderDate: string;
  payment: string;
  paidBy: string;
  remarks: string;
  attachments: ExpenseAttachment[];
  addedById: string | null;
  addedByName: string;
  addedByRole: string;
}

export async function fetchProcurementRows(projectId: string): Promise<ApiProcurementRow[]> {
  return request<ApiProcurementRow[]>(`/projects/${projectId}/procurement-rows`);
}

export async function uploadProcurementAttachment(projectId: string, rid: string, file: File): Promise<ApiProcurementRow> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/procurement-rows/${rid}/attachments`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}

export async function deleteProcurementAttachment(projectId: string, rid: string, aid: string): Promise<ApiProcurementRow> {
  return request<ApiProcurementRow>(`/projects/${projectId}/procurement-rows/${rid}/attachments/${aid}`, { method: 'DELETE' });
}

export async function createProcurementRow(projectId: string, body: Partial<ApiProcurementRow> = {}): Promise<ApiProcurementRow> {
  return request<ApiProcurementRow>(`/projects/${projectId}/procurement-rows`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateProcurementRow(projectId: string, rid: string, body: Partial<ApiProcurementRow>): Promise<ApiProcurementRow> {
  return request<ApiProcurementRow>(`/projects/${projectId}/procurement-rows/${rid}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteProcurementRow(projectId: string, rid: string): Promise<void> {
  await request(`/projects/${projectId}/procurement-rows/${rid}`, { method: 'DELETE' });
}

// ── Procurement module (item-centric: BOQ → Submittals → RFQ → PO → Master Log) ──
export type ProcurementStatus =
  | "BOQ" | "RFQ_Sent" | "Quoted" | "PO_Sent" | "Invoiced"
  | "Ordered" | "Fabrication" | "Transit" | "OnSite" | "Complete" | "Cancelled";

export interface ApiProcurementSection { _id: string; projectId: string; name: string; order: number; assignedTo?: string }
export interface ApiProcurementItem {
  _id: string;
  projectId: string;
  sectionId: string;
  itemNo: string;
  description: string;
  manufacturer: string;
  modelNo: string;
  qty: string;
  unit: string;
  spec: string;
  needOnSiteDate: string;
  leadTimeDays: string;
  status: ProcurementStatus;
  draft?: boolean;          // CR-P-12 — saved-but-incomplete item
  locked?: boolean;
  remarks?: string;
  attachments?: Array<{ _id: string; name: string; filePath: string; fileType: string; size: string; kind: string }>;
  vendorName?: string;
  revNo: number;
  cancelledAt: string | null;
  cancelledBy: string;
  cancellationReason: string;
  addedById: string;
  addedByName: string;
  addedByRole: string;
}
export interface ApiProcurementEvent {
  _id: string; projectId: string; entityType: string; entityId: string;
  action: string; fromValue: string; toValue: string; actorName: string; createdAt: string;
}
export type ProcurementItemInput = Partial<Omit<ApiProcurementItem, "_id" | "projectId" | "addedById" | "addedByName" | "addedByRole" | "cancelledAt" | "cancelledBy" | "cancellationReason">>;

const procBase = (projectId: string) => `/projects/${projectId}/procurement`;

export async function fetchProcurementSections(projectId: string): Promise<ApiProcurementSection[]> {
  return request(`${procBase(projectId)}/sections`);
}
export async function addProcurementSection(projectId: string, name: string): Promise<ApiProcurementSection> {
  return request(`${procBase(projectId)}/sections`, { method: 'POST', body: JSON.stringify({ name }) });
}
export async function updateProcurementSection(projectId: string, sid: string, body: { name?: string; order?: number; assignedTo?: string }): Promise<ApiProcurementSection> {
  return request(`${procBase(projectId)}/sections/${sid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function deleteProcurementSection(projectId: string, sid: string): Promise<void> {
  await request(`${procBase(projectId)}/sections/${sid}`, { method: 'DELETE' });
}

export async function fetchProcurementItems(projectId: string, sectionId?: string): Promise<ApiProcurementItem[]> {
  const qs = sectionId ? `?sectionId=${encodeURIComponent(sectionId)}` : "";
  return request(`${procBase(projectId)}/items${qs}`);
}
export async function addProcurementItem(projectId: string, body: ProcurementItemInput): Promise<ApiProcurementItem> {
  return request(`${procBase(projectId)}/items`, { method: 'POST', body: JSON.stringify(body) });
}
export async function bulkAddProcurementItems(projectId: string, items: ProcurementItemInput[]): Promise<ApiProcurementItem[]> {
  return request(`${procBase(projectId)}/items/bulk`, { method: 'POST', body: JSON.stringify({ items }) });
}
// CR-P-12 — per-item reference files.
export async function uploadProcurementItemFile(projectId: string, iid: string, file: File, kind = "other"): Promise<ApiProcurementItem> {
  const fd = new FormData(); fd.append("file", file); fd.append("kind", kind);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${procBase(projectId)}/items/${iid}/files`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteProcurementItemFile(projectId: string, iid: string, aid: string): Promise<ApiProcurementItem> {
  return request(`${procBase(projectId)}/items/${iid}/files/${aid}`, { method: "DELETE" });
}
export async function updateProcurementItem(projectId: string, iid: string, body: ProcurementItemInput): Promise<ApiProcurementItem> {
  return request(`${procBase(projectId)}/items/${iid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
// I1 — frozen snapshots of an item's previous states (inline revision history).
export interface ApiProcurementItemRevision {
  _id: string; projectId: string; itemId: string; revNo: number;
  description: string; manufacturer: string; modelNo: string; qty: string; unit: string; spec: string;
  needOnSiteDate: string; leadTimeDays: string; status: string; changedFields: string[]; note?: string; actorName: string; createdAt: string;
}
export async function fetchProcurementItemRevisions(projectId: string, iid: string): Promise<ApiProcurementItemRevision[]> {
  return request(`${procBase(projectId)}/items/${iid}/revisions`);
}
export async function cancelProcurementItem(projectId: string, iid: string, reason: string): Promise<ApiProcurementItem> {
  return request(`${procBase(projectId)}/items/${iid}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}
export async function restoreProcurementItem(projectId: string, iid: string, reason: string): Promise<ApiProcurementItem> {
  return request(`${procBase(projectId)}/items/${iid}/restore`, { method: 'POST', body: JSON.stringify({ reason }) });
}
export async function deleteProcurementItem(projectId: string, iid: string): Promise<void> {
  await request(`${procBase(projectId)}/items/${iid}`, { method: 'DELETE' });
}
export async function fetchProcurementEvents(projectId: string, entityId?: string): Promise<ApiProcurementEvent[]> {
  const qs = entityId ? `?entityId=${encodeURIComponent(entityId)}` : "";
  return request(`${procBase(projectId)}/events${qs}`);
}

// ── Submittals (one package per product; immutable revision stack; combined PDF) ──
export type SubmittalDisposition = "Pending" | "Approved" | "ApprovedAsNoted" | "ReviseResubmit" | "Rejected" | "Superseded";
export type SubmittalComponent = "cover" | "spec" | "catalog" | "drawing" | "photo" | "clientLetter" | "other";
export interface ApiSubmittalAttachment { _id: string; name: string; filePath: string; fileType: string; size: string; component: SubmittalComponent; decision?: string }
export interface ApiSubmittalRevision {
  _id: string; submittalId: string; projectId: string; revisionNo: number;
  optionLabel: string; disposition: SubmittalDisposition; workflowStatus?: string; notes: string; sentToClientAt: string; respondedAt: string;
  clientName?: string; submittedBy?: string; receivedBy?: string; assignedTo?: string;
  attachments: ApiSubmittalAttachment[]; isCurrent: boolean; createdByName: string;
}
export interface ApiSubmittal {
  _id: string; projectId: string; itemId: string; title: string; productName: string;
  manufacturer: string; modelNo: string; specSection: string; status: string; currentRevisionNo: number;
  archived?: boolean; addedByName: string; revisions: ApiSubmittalRevision[];
}
const subBase = (projectId: string) => `/projects/${projectId}/submittals`;

export async function fetchSubmittals(projectId: string, archived = false): Promise<ApiSubmittal[]> {
  return request(`${subBase(projectId)}${archived ? "?archived=true" : ""}`);
}
export async function setSubmittalArchived(projectId: string, sid: string, archived: boolean): Promise<ApiSubmittal> {
  return request(`${subBase(projectId)}/${sid}`, { method: "PATCH", body: JSON.stringify({ archived }) });
}
export async function createSubmittal(projectId: string, body: { itemId?: string; title?: string; productName?: string; manufacturer?: string; modelNo?: string; specSection?: string }): Promise<ApiSubmittal> {
  return request(subBase(projectId), { method: 'POST', body: JSON.stringify(body) });
}
export async function updateSubmittal(projectId: string, sid: string, body: Partial<{ itemId: string; title: string; productName: string; manufacturer: string; modelNo: string; specSection: string; status: string }>): Promise<ApiSubmittal> {
  return request(`${subBase(projectId)}/${sid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function deleteSubmittal(projectId: string, sid: string): Promise<void> {
  await request(`${subBase(projectId)}/${sid}`, { method: 'DELETE' });
}
export async function addSubmittalRevision(projectId: string, sid: string, duplicate = false): Promise<ApiSubmittalRevision> {
  return request(`${subBase(projectId)}/${sid}/revisions`, { method: 'POST', body: JSON.stringify({ duplicate }) });
}
export async function updateSubmittalRevision(projectId: string, sid: string, rid: string, body: Partial<{ disposition: SubmittalDisposition; workflowStatus: string; notes: string; sentToClientAt: string; respondedAt: string; optionLabel: string; clientName: string; submittedBy: string; receivedBy: string; assignedTo: string }>): Promise<ApiSubmittalRevision> {
  return request(`${subBase(projectId)}/${sid}/revisions/${rid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function uploadSubmittalAttachment(projectId: string, sid: string, rid: string, file: File, component: SubmittalComponent, decision = ''): Promise<ApiSubmittalRevision> {
  const fd = new FormData(); fd.append('file', file); fd.append('component', component); if (decision) fd.append('decision', decision);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${subBase(projectId)}/${sid}/revisions/${rid}/attachments`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteSubmittalAttachment(projectId: string, sid: string, rid: string, aid: string): Promise<ApiSubmittalRevision> {
  return request(`${subBase(projectId)}/${sid}/revisions/${rid}/attachments/${aid}`, { method: 'DELETE' });
}
// Add an attachment by copying an existing project document (from the Documents module).
export async function addSubmittalAttachmentFromDocument(projectId: string, sid: string, rid: string, documentId: string, component: SubmittalComponent, decision = ''): Promise<ApiSubmittalRevision> {
  return request(`${subBase(projectId)}/${sid}/revisions/${rid}/attachments/from-document`, { method: 'POST', body: JSON.stringify({ documentId, component, decision }) });
}

// ── Vendors + RFQ / bid-leveling ─────────────────────────────────────────────
export interface ApiVendor { _id: string; projectId: string; name: string; country: string; city: string; contactName: string; email: string; phone: string }
export interface RfqLineFile { _id?: string; name: string; filePath: string; fileType: string; size: string }
export interface RfqLineItem { _id?: string; itemId: string; description: string; qty: string; unit: string; spec: string; cancelled?: boolean; manufacturer?: string; modelNo?: string; needOnSiteDate?: string; includeSubmittal?: boolean; attachments?: RfqLineFile[] }
export interface QuoteLine { itemId: string; unitPrice: string }
export type QuoteStatus = "Received" | "NotSelected" | "Awarded";
export interface ApiVendorQuote {
  _id: string; projectId: string; rfqId: string; vendorId: string;
  lineItems: QuoteLine[]; totalOverride?: string; shipping: string; tax: string; leadTimeDays: string;
  inclusions: string; exclusions: string; notes: string; status: QuoteStatus;
  attachments: ExpenseAttachment[];
}
export type RfqStatus = "Draft" | "Sent" | "Quoting" | "Awarded";
export interface RfqRecipient { companyId: string; name: string; category: string }
export interface ApiRfq {
  _id: string; projectId: string; rfqNo: string; title: string;
  lineItems: RfqLineItem[]; includesShipping: boolean; includesTax: boolean; notes: string;
  shipToLocation: string; deliveryMethod: string;
  status?: RfqStatus; sentAt?: string; createdAt?: string;
  recipients?: RfqRecipient[];
  uploadedDocument?: RfqLineFile | null;
  addedByName: string; quotes: ApiVendorQuote[];
  archived?: boolean; assignedTo?: string;
}

export async function fetchVendors(projectId: string): Promise<ApiVendor[]> { return request(`/projects/${projectId}/vendors`); }
export async function addVendor(projectId: string, body: Partial<ApiVendor>): Promise<ApiVendor> { return request(`/projects/${projectId}/vendors`, { method: 'POST', body: JSON.stringify(body) }); }
export async function updateVendor(projectId: string, vid: string, body: Partial<ApiVendor>): Promise<ApiVendor> { return request(`/projects/${projectId}/vendors/${vid}`, { method: 'PATCH', body: JSON.stringify(body) }); }
export async function deleteVendor(projectId: string, vid: string): Promise<void> { await request(`/projects/${projectId}/vendors/${vid}`, { method: 'DELETE' }); }

const rfqBase = (projectId: string) => `/projects/${projectId}/rfqs`;
export async function fetchRfqs(projectId: string, archived = false): Promise<ApiRfq[]> { return request(`${rfqBase(projectId)}${archived ? '?archived=true' : ''}`); }
export async function createRfq(projectId: string, body: { title?: string; lineItems: RfqLineItem[]; includesShipping?: boolean; includesTax?: boolean; notes?: string; shipToLocation?: string; deliveryMethod?: string }): Promise<ApiRfq> {
  return request(rfqBase(projectId), { method: 'POST', body: JSON.stringify(body) });
}
export async function updateRfq(projectId: string, rid: string, body: Partial<{ title: string; notes: string; includesShipping: boolean; includesTax: boolean; shipToLocation: string; deliveryMethod: string; status: RfqStatus; lineItems: RfqLineItem[]; recipients: RfqRecipient[]; archived: boolean; assignedTo: string }>): Promise<ApiRfq> {
  return request(`${rfqBase(projectId)}/${rid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
/** CR-PR-07 — archive or restore an RFQ (archived RFQs are hidden from the normal list). */
export async function setRfqArchived(projectId: string, rid: string, archived: boolean): Promise<ApiRfq> {
  return request(`${rfqBase(projectId)}/${rid}`, { method: 'PATCH', body: JSON.stringify({ archived }) });
}
export async function deleteRfq(projectId: string, rid: string): Promise<void> { await request(`${rfqBase(projectId)}/${rid}`, { method: 'DELETE' }); }
// STEP 1 — send the request to vendors (marks Sent, advances the BOQ items to RFQ_Sent).
export async function sendRfq(projectId: string, rid: string, sentAt?: string): Promise<ApiRfq> {
  return request(`${rfqBase(projectId)}/${rid}/send`, { method: 'POST', body: JSON.stringify({ sentAt }) });
}
export async function addVendorQuote(projectId: string, rid: string, vendorId: string): Promise<ApiVendorQuote> {
  return request(`${rfqBase(projectId)}/${rid}/quotes`, { method: 'POST', body: JSON.stringify({ vendorId }) });
}
export async function updateVendorQuote(projectId: string, rid: string, qid: string, body: Partial<Omit<ApiVendorQuote, "_id" | "projectId" | "rfqId">>): Promise<ApiVendorQuote> {
  return request(`${rfqBase(projectId)}/${rid}/quotes/${qid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function deleteVendorQuote(projectId: string, rid: string, qid: string): Promise<void> { await request(`${rfqBase(projectId)}/${rid}/quotes/${qid}`, { method: 'DELETE' }); }
export async function awardVendorQuote(projectId: string, rid: string, qid: string): Promise<ApiVendorQuote> {
  return request(`${rfqBase(projectId)}/${rid}/quotes/${qid}/award`, { method: 'POST' });
}
// STEP 2 — upload / remove a vendor's returned quotation document.
export async function uploadVendorQuoteAttachment(projectId: string, rid: string, qid: string, file: File): Promise<ApiVendorQuote> {
  const fd = new FormData(); fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${rfqBase(projectId)}/${rid}/quotes/${qid}/attachments`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteVendorQuoteAttachment(projectId: string, rid: string, qid: string, aid: string): Promise<ApiVendorQuote> {
  return request(`${rfqBase(projectId)}/${rid}/quotes/${qid}/attachments/${aid}`, { method: 'DELETE' });
}
// CR-PR-03 — per-item RFQ documents (specs / data sheet / drawings for the vendor).
export async function uploadRfqLineFile(projectId: string, rid: string, lid: string, file: File): Promise<ApiRfq> {
  const fd = new FormData(); fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${rfqBase(projectId)}/${rid}/line-items/${lid}/attachments`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteRfqLineFile(projectId: string, rid: string, lid: string, aid: string): Promise<ApiRfq> {
  return request(`${rfqBase(projectId)}/${rid}/line-items/${lid}/attachments/${aid}`, { method: 'DELETE' });
}
// CR-PR-02 — upload / remove an already-made RFQ document.
export async function uploadRfqDocument(projectId: string, rid: string, file: File): Promise<ApiRfq> {
  const fd = new FormData(); fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${rfqBase(projectId)}/${rid}/document`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteRfqDocument(projectId: string, rid: string): Promise<ApiRfq> {
  return request(`${rfqBase(projectId)}/${rid}/document`, { method: 'DELETE' });
}

// ── Shipments (documents per delivery) ───────────────────────────────────────
export type ShipmentStatus = "Preparing" | "Fabrication" | "Transit" | "Clearance" | "Warehouse" | "Delivered";
export interface ApiShipmentFile { _id: string; name: string; filePath: string; fileType: string; size: string }
export interface ApiShipmentRow { _id: string; docType: string; remarks?: string; files: ApiShipmentFile[] }
export interface ApiShipment {
  _id: string; projectId: string; name: string; order: number;
  description?: string; fromLocation?: string; toLocation?: string;
  status?: ShipmentStatus; deadline?: string; poIds?: string[];
  costFreight?: string; costCustoms?: string; costDemurrage?: string; costOther?: string;
  // Tracking header + container details + goods/agency (CR-PR-08/09).
  trackingNo?: string; carrier?: string; currentLocation?: string; etaDate?: string; trackingUrl?: string;
  containerType?: string; containerSize?: string; openBed?: boolean;
  goods?: Array<{ description: string; qty: string; unit: string }>;
  agencyName?: string; agencyContact?: string; agencyPhone?: string; agencyEmail?: string;
  rows: ApiShipmentRow[];
}
export type ShipmentInput = Partial<Pick<ApiShipment,
  "name" | "description" | "fromLocation" | "toLocation" | "status" | "deadline" | "poIds" |
  "costFreight" | "costCustoms" | "costDemurrage" | "costOther" |
  "trackingNo" | "carrier" | "currentLocation" | "etaDate" | "trackingUrl" | "containerType" | "containerSize" | "openBed" |
  "goods" | "agencyName" | "agencyContact" | "agencyPhone" | "agencyEmail">>;
const shipBase = (projectId: string) => `/projects/${projectId}/shipments`;
export async function fetchShipments(projectId: string): Promise<ApiShipment[]> { return request(shipBase(projectId)); }
export async function createShipment(projectId: string, body: ShipmentInput = {}): Promise<ApiShipment> { return request(shipBase(projectId), { method: 'POST', body: JSON.stringify(body) }); }
export async function updateShipment(projectId: string, sid: string, body: ShipmentInput): Promise<ApiShipment> { return request(`${shipBase(projectId)}/${sid}`, { method: 'PATCH', body: JSON.stringify(body) }); }
export async function renameShipment(projectId: string, sid: string, name: string): Promise<ApiShipment> { return updateShipment(projectId, sid, { name }); }
export async function deleteShipment(projectId: string, sid: string): Promise<void> { await request(`${shipBase(projectId)}/${sid}`, { method: 'DELETE' }); }
export async function addShipmentRow(projectId: string, sid: string, docType: string): Promise<ApiShipment> { return request(`${shipBase(projectId)}/${sid}/rows`, { method: 'POST', body: JSON.stringify({ docType }) }); }
export async function updateShipmentRow(projectId: string, sid: string, rid: string, body: { docType?: string; remarks?: string }): Promise<ApiShipment> { return request(`${shipBase(projectId)}/${sid}/rows/${rid}`, { method: 'PATCH', body: JSON.stringify(body) }); }
export async function renameShipmentRow(projectId: string, sid: string, rid: string, docType: string): Promise<ApiShipment> { return updateShipmentRow(projectId, sid, rid, { docType }); }
export async function deleteShipmentRow(projectId: string, sid: string, rid: string): Promise<ApiShipment> { return request(`${shipBase(projectId)}/${sid}/rows/${rid}`, { method: 'DELETE' }); }
export async function uploadShipmentFile(projectId: string, sid: string, rid: string, file: File): Promise<ApiShipment> {
  const fd = new FormData(); fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${shipBase(projectId)}/${sid}/rows/${rid}/files`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteShipmentFile(projectId: string, sid: string, rid: string, fid: string): Promise<ApiShipment> {
  return request(`${shipBase(projectId)}/${sid}/rows/${rid}/files/${fid}`, { method: 'DELETE' });
}

// ── Subcontractor agreements (named; bundle agreement + offer + other docs) ───
export type SubAgreementDocKind = "agreement" | "offer" | "other";
export interface ApiSubAgreementDoc { _id: string; kind: SubAgreementDocKind; name: string; filePath: string; fileType: string; size: string }
export interface ApiSubAgreement { _id: string; projectId: string; subId: string; name: string; description: string; documents: ApiSubAgreementDoc[]; createdAt?: string }
const subAgrBase = (projectId: string) => `/projects/${projectId}/sub-agreements`;
export async function fetchSubAgreements(projectId: string, subId?: string): Promise<ApiSubAgreement[]> {
  return request(`${subAgrBase(projectId)}${subId ? `?subId=${encodeURIComponent(subId)}` : ""}`);
}
export async function createSubAgreement(projectId: string, subId: string, name: string, description: string): Promise<ApiSubAgreement> {
  return request(subAgrBase(projectId), { method: "POST", body: JSON.stringify({ subId, name, description }) });
}
export async function updateSubAgreement(projectId: string, aid: string, body: Partial<{ name: string; description: string }>): Promise<ApiSubAgreement> {
  return request(`${subAgrBase(projectId)}/${aid}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function deleteSubAgreement(projectId: string, aid: string): Promise<void> { await request(`${subAgrBase(projectId)}/${aid}`, { method: "DELETE" }); }
export async function uploadSubAgreementFile(projectId: string, aid: string, file: File, kind: SubAgreementDocKind): Promise<ApiSubAgreement> {
  const fd = new FormData(); fd.append("file", file); fd.append("kind", kind);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${subAgrBase(projectId)}/${aid}/files`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteSubAgreementFile(projectId: string, aid: string, fid: string): Promise<ApiSubAgreement> {
  return request(`${subAgrBase(projectId)}/${aid}/files/${fid}`, { method: "DELETE" });
}

// ── Reminders (personal; can point at any record via `link`) ─────────────────
export type ReminderStatus = "Pending" | "InProgress" | "Completed" | "Cancelled";
export interface ApiReminder {
  _id: string; userId: string; title: string; notes: string;
  dueAt: string; status: ReminderStatus; link: string; contextLabel: string;
  projectId: string; projectName: string;
  emailEnabled: boolean; notifiedAt: string | null; completedAt: string | null;
  createdAt?: string;
}
export type ReminderInput = Partial<Pick<ApiReminder, "title" | "notes" | "dueAt" | "link" | "contextLabel" | "projectId" | "projectName" | "emailEnabled" | "status">>;
export async function fetchReminders(status?: ReminderStatus): Promise<ApiReminder[]> {
  return request(`/reminders${status ? `?status=${status}` : ""}`);
}
export async function createReminder(body: ReminderInput & { userId?: string }): Promise<ApiReminder> {
  return request(`/reminders`, { method: "POST", body: JSON.stringify(body) });
}
export async function updateReminder(rid: string, body: ReminderInput): Promise<ApiReminder> {
  return request(`/reminders/${rid}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function deleteReminder(rid: string): Promise<void> {
  await request(`/reminders/${rid}`, { method: "DELETE" });
}

// ── Project requests (Contract Admin / Client Communications) ────────────────
export type RequestCategory = "contract-admin" | "client-comms";
export type ProjectRequestStatus = "Draft" | "Sent" | "Responded" | "Closed" | "Cancelled";
export interface ApiRequestFile { _id: string; name: string; filePath: string; fileType: string; size: string }
export interface ApiRequestResponse { _id: string; note: string; respondedAt: string; files: ApiRequestFile[]; addedByName: string }
export interface ApiProjectRequest {
  _id: string; projectId: string; category: RequestCategory;
  type: string; typeCode: string; customTitle: string; number: string; seq: number;
  title: string; date: string; description: string; status: ProjectRequestStatus;
  signerName?: string; signerTitle?: string; signatureUrl?: string; stampUrl?: string;
  contextLines?: Array<{ label: string; value: string }>;
  sections?: RequestSection[];
  archived?: boolean;
  attachments: ApiRequestFile[]; responses: ApiRequestResponse[];
  addedById: string; addedByName: string; createdAt?: string;
}
// A custom named section with per-section status / lock / notes (client CR-B-15/17/19).
export type RequestSectionStatus = "" | "NotStarted" | "InProgress" | "WaitingInfo" | "UnderReview" | "Complete" | "NeedsRevision";
export type RequestSectionFile = { _id?: string; name: string; filePath: string; fileType: string; size: string };
export type RequestSection = { title: string; body: string; status?: RequestSectionStatus; locked?: boolean; notes?: string; hidden?: boolean; assignedTo?: string; viewLock?: boolean; attachments?: RequestSectionFile[]; history?: Array<{ at: string; by: string; text: string }> };
export async function uploadRequestSectionFile(projectId: string, rid: string, idx: number, file: File): Promise<ApiProjectRequest> {
  const fd = new FormData(); fd.append("file", file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${reqBase(projectId)}/${rid}/sections/${idx}/files`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteRequestSectionFile(projectId: string, rid: string, idx: number, aid: string): Promise<ApiProjectRequest> {
  return request(`${reqBase(projectId)}/${rid}/sections/${idx}/files/${aid}`, { method: "DELETE" });
}
// The Contract-Administration request catalogue (must mirror the backend REQUEST_TYPES list).
export const REQUEST_TYPES: string[] = [
  "Request for Information (RFI)", "Request for Clarification (RFC)", "Technical Clarification",
  "Request for Approval (RFA)", "Request for Equitable Adjustment (REA)", "Change Order Proposal (COP)",
  "Change Order Request (COR)", "Modification Proposal", "Request for Extension of Time (EOT)",
  "Notice of Delay", "Notice of Changed Conditions", "Notice of Potential Claim", "Notice of Claim",
  "Formal Claim", "Value Engineering Proposal (VECP)", "Design Deviation Request",
  "Design Exception Request", "Substitution Request", "Material Substitution Request",
  "Request for Site Instruction", "Request for Site Access", "Request for Acceptance", "Custom Request",
];
const reqBase = (projectId: string) => `/projects/${projectId}/requests`;
export async function fetchProjectRequests(projectId: string, category?: RequestCategory, archived = false): Promise<ApiProjectRequest[]> {
  const parts: string[] = [];
  if (category) parts.push(`category=${category}`);
  if (archived) parts.push("archived=true");
  return request(`${reqBase(projectId)}${parts.length ? `?${parts.join("&")}` : ""}`);
}
export async function createProjectRequest(projectId: string, body: { category: RequestCategory; type: string; customTitle?: string; title: string; date?: string; description?: string; signerName?: string; signerTitle?: string; signatureUrl?: string; stampUrl?: string; contextLines?: Array<{ label: string; value: string }>; sections?: RequestSection[] }): Promise<ApiProjectRequest> {
  return request(reqBase(projectId), { method: "POST", body: JSON.stringify(body) });
}
export async function updateProjectRequest(projectId: string, rid: string, body: Partial<Pick<ApiProjectRequest, "title" | "date" | "description" | "customTitle" | "status" | "signerName" | "signerTitle" | "signatureUrl" | "stampUrl" | "contextLines" | "sections" | "archived">>): Promise<ApiProjectRequest> {
  return request(`${reqBase(projectId)}/${rid}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function deleteProjectRequest(projectId: string, rid: string): Promise<void> { await request(`${reqBase(projectId)}/${rid}`, { method: "DELETE" }); }
export async function addRequestResponse(projectId: string, rid: string, body: { note: string; respondedAt?: string }): Promise<ApiProjectRequest> {
  return request(`${reqBase(projectId)}/${rid}/responses`, { method: "POST", body: JSON.stringify(body) });
}
export async function deleteRequestResponse(projectId: string, rid: string, respId: string): Promise<ApiProjectRequest> {
  return request(`${reqBase(projectId)}/${rid}/responses/${respId}`, { method: "DELETE" });
}
async function reqUpload(path: string, file: File): Promise<ApiProjectRequest> {
  const fd = new FormData(); fd.append("file", file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${path}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function uploadRequestFile(projectId: string, rid: string, file: File): Promise<ApiProjectRequest> { return reqUpload(`${reqBase(projectId)}/${rid}/files`, file); }
export async function deleteRequestFile(projectId: string, rid: string, fid: string): Promise<ApiProjectRequest> { return request(`${reqBase(projectId)}/${rid}/files/${fid}`, { method: "DELETE" }); }
export async function uploadResponseFile(projectId: string, rid: string, respId: string, file: File): Promise<ApiProjectRequest> { return reqUpload(`${reqBase(projectId)}/${rid}/responses/${respId}/files`, file); }

// ── Technical Docs (Drawings submittals + Other technical documents) ─────────
export type TechDocKind = "drawing" | "other";
export type TechDocStatus = "Pending" | "Approved" | "ApprovedAsNoted" | "Rejected";
export const SUBMITTAL_STAGES: string[] = [
  "Pre-Bid Submittal", "10% Submittal", "20% Submittal", "30% Submittal", "40% Submittal",
  "50% Submittal", "60% Submittal", "70% Submittal", "80% Submittal", "90% Submittal", "100% Submittal",
];
export const DRAWING_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "drawingsPdf", label: "Drawings (PDF)" }, { key: "drawingsDwg", label: "Drawings (DWG)" },
  { key: "specifications", label: "Specifications" }, { key: "reports", label: "Reports" }, { key: "other", label: "Other Docs" },
];
export interface ApiTechDocFile { _id: string; category: string; folder?: string; name: string; filePath: string; fileType: string; size: string; remarks: string }
export interface ApiTechDocClientFile { _id: string; name: string; filePath: string; fileType: string; size: string }
export interface ApiTechnicalDoc {
  _id: string; projectId: string; kind: TechDocKind; groupId: string; order: number;
  submittalStage: string; revNo: number; status: TechDocStatus;
  description: string; remarks: string;
  files: ApiTechDocFile[]; folders?: Array<{ category: string; name: string }>;
  clientComments: string; clientFiles: ApiTechDocClientFile[]; createdAt?: string;
}
// filePath is "uploads/<projectId>/technical-docs/<file>" — served behind a token check.
export function techDocFileUrl(f: { filePath: string }): string {
  const norm = (f.filePath || "").replace(/\\/g, "/");
  const rel = norm.startsWith("uploads/") ? norm.slice("uploads/".length) : norm;
  return withFileToken(`/uploads/${rel}`);
}
const techBase = (projectId: string) => `/projects/${projectId}/technical-docs`;
export async function fetchTechnicalDocs(projectId: string, kind?: TechDocKind): Promise<ApiTechnicalDoc[]> {
  return request(`${techBase(projectId)}${kind ? `?kind=${kind}` : ""}`);
}
export async function createTechnicalDoc(projectId: string, body: { kind: TechDocKind; submittalStage?: string; revNo?: number; description?: string; remarks?: string }): Promise<ApiTechnicalDoc> {
  return request(techBase(projectId), { method: "POST", body: JSON.stringify(body) });
}
export async function updateTechnicalDoc(projectId: string, did: string, body: Partial<Pick<ApiTechnicalDoc, "submittalStage" | "revNo" | "status" | "description" | "remarks" | "clientComments">>): Promise<ApiTechnicalDoc> {
  return request(`${techBase(projectId)}/${did}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function reviseTechnicalDoc(projectId: string, did: string, submittalStage?: string): Promise<ApiTechnicalDoc> {
  return request(`${techBase(projectId)}/${did}/revise`, { method: "POST", body: JSON.stringify({ submittalStage }) });
}
export async function deleteTechnicalDoc(projectId: string, did: string): Promise<void> { await request(`${techBase(projectId)}/${did}`, { method: "DELETE" }); }
export async function uploadTechnicalDocFile(projectId: string, did: string, file: File, category: string, remarks = "", folder = ""): Promise<ApiTechnicalDoc> {
  const fd = new FormData(); fd.append("file", file); if (remarks) fd.append("remarks", remarks);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${techBase(projectId)}/${did}/files?category=${encodeURIComponent(category)}&folder=${encodeURIComponent(folder)}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function createTechDocFolder(projectId: string, did: string, category: string, name: string): Promise<ApiTechnicalDoc> {
  return request(`${techBase(projectId)}/${did}/folders`, { method: "POST", body: JSON.stringify({ category, name }) });
}
export async function deleteTechDocFolder(projectId: string, did: string, category: string, name: string): Promise<ApiTechnicalDoc> {
  return request(`${techBase(projectId)}/${did}/folders?category=${encodeURIComponent(category)}&name=${encodeURIComponent(name)}`, { method: "DELETE" });
}
export async function updateTechnicalDocFile(projectId: string, did: string, fid: string, remarks: string): Promise<ApiTechnicalDoc> {
  return request(`${techBase(projectId)}/${did}/files/${fid}`, { method: "PATCH", body: JSON.stringify({ remarks }) });
}
export async function deleteTechnicalDocFile(projectId: string, did: string, fid: string): Promise<ApiTechnicalDoc> {
  return request(`${techBase(projectId)}/${did}/files/${fid}`, { method: "DELETE" });
}
export async function uploadTechnicalDocClientFile(projectId: string, did: string, file: File): Promise<ApiTechnicalDoc> {
  const fd = new FormData(); fd.append("file", file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${techBase(projectId)}/${did}/client-files`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deleteTechnicalDocClientFile(projectId: string, did: string, fid: string): Promise<ApiTechnicalDoc> {
  return request(`${techBase(projectId)}/${did}/client-files/${fid}`, { method: "DELETE" });
}
// Streams the folder-by-folder ZIP and triggers a browser download.
export async function exportTechnicalDocsZip(projectId: string, did?: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${techBase(projectId)}/export${did ? `?did=${did}` : ""}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `Submittal_${projectId}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Generic structured tables (Amendments & Addenda, etc.) ───────────────────
export interface ApiTableFile { _id: string; name: string; filePath: string; fileType: string; size: string; remarks?: string; folder?: string }
export interface ApiTableRow { _id: string; projectId: string; tableKey: string; order: number; revNo: number; data: Record<string, string>; files: ApiTableFile[]; folders?: string[]; createdAt?: string }
const tblBase = (projectId: string) => `/projects/${projectId}/tables`;
export async function fetchTableRows(projectId: string, table: string): Promise<ApiTableRow[]> {
  return request(`${tblBase(projectId)}?table=${encodeURIComponent(table)}`);
}
export async function createTableRow(projectId: string, table: string, data: Record<string, string> = {}, revNo = 0): Promise<ApiTableRow> {
  return request(tblBase(projectId), { method: "POST", body: JSON.stringify({ tableKey: table, data, revNo }) });
}
export async function updateTableRow(projectId: string, rid: string, body: { data?: Record<string, string>; revNo?: number; order?: number }): Promise<ApiTableRow> {
  return request(`${tblBase(projectId)}/${rid}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function deleteTableRow(projectId: string, rid: string): Promise<void> { await request(`${tblBase(projectId)}/${rid}`, { method: "DELETE" }); }
export async function uploadTableRowFile(projectId: string, rid: string, file: File, folder = ""): Promise<ApiTableRow> {
  const fd = new FormData(); fd.append("file", file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${tblBase(projectId)}/${rid}/files?folder=${encodeURIComponent(folder)}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function createTableFolder(projectId: string, rid: string, name: string): Promise<ApiTableRow> {
  return request(`${tblBase(projectId)}/${rid}/folders`, { method: "POST", body: JSON.stringify({ name }) });
}
export async function deleteTableFolder(projectId: string, rid: string, name: string): Promise<ApiTableRow> {
  return request(`${tblBase(projectId)}/${rid}/folders?name=${encodeURIComponent(name)}`, { method: "DELETE" });
}
export async function updateTableRowFile(projectId: string, rid: string, fid: string, remarks: string): Promise<ApiTableRow> {
  return request(`${tblBase(projectId)}/${rid}/files/${fid}`, { method: "PATCH", body: JSON.stringify({ remarks }) });
}
export async function deleteTableRowFile(projectId: string, rid: string, fid: string): Promise<ApiTableRow> {
  return request(`${tblBase(projectId)}/${rid}/files/${fid}`, { method: "DELETE" });
}
export function tableRowFileUrl(f: { filePath: string }): string {
  const norm = (f.filePath || "").replace(/\\/g, "/");
  const rel = norm.startsWith("uploads/") ? norm.slice("uploads/".length) : norm;
  return withFileToken(`/uploads/${rel}`);
}

// ── Agreements (one shared engine, two ownership contexts) ───────────────────
export type AgreementStatus = "Draft" | "Sent" | "Viewed" | "PendingSignature" | "Signed" | "Rejected" | "Expired" | "Cancelled";
export type AgreementEntityType = "partner" | "subcontractor" | "vendor";
export interface ApiAgreementParty { name: string; contactName: string; address: string; email: string; phone: string; logoUrl: string }
export interface ApiAgreementFile { _id: string; name: string; filePath: string; fileType: string; size: string; kind: string }
export interface ApiAgreementSections { scope: string; terms: string; paymentConditions: string; deliveryConditions: string; ndaEnabled: boolean; ndaMode?: "text" | "file"; ndaText: string; ndaFile?: { name: string; url: string } | null }
export interface ApiAgreement {
  _id: string;
  ownerContextType: "user" | "project" | "general";
  ownerUserId: string; ownerProjectId: string; ownerEntityType: "" | AgreementEntityType; ownerEntityId: string;
  name: string; agreementType: string; templateId: string;
  effectiveDate: string; startDate: string; endDate: string;
  status: AgreementStatus;
  letterhead?: "gt" | "jv"; jvLogoUrl?: string;
  documentMode?: "built" | "uploaded";
  uploadedDocument?: { name: string; filePath: string; fileType: string; size: string } | null;
  archived?: boolean;
  extraSections?: Array<{ title: string; body: string; status?: string; locked?: boolean; hidden?: boolean; notes?: string; assignedTo?: string; attachments?: Array<{ _id?: string; name: string; filePath: string; fileType: string; size: string }> ; history?: Array<{ at: string; by: string; text: string }> }>;
  partySnapshot: { party1: ApiAgreementParty; party2: ApiAgreementParty; contextLines: Array<{ label: string; value: string }> };
  sections: ApiAgreementSections;
  signatures: {
    company: { signerName: string; signerTitle: string; signerEmail: string; signerPhone: string; signatureUrl: string; stampUrl: string; signedAt: string };
    recipient: { signerName: string; signatureUrl: string; stampUrl: string; signedAt: string; method: "" | "account" | "upload" };
  };
  signedDocument: { name: string; filePath: string; fileType: string; size: string } | null;
  attachments: ApiAgreementFile[];
  activity: Array<{ at: string; actorName: string; action: string; note: string }>;
  sentAt: string; addedById: string; addedByName: string; createdAt?: string;
}
export interface ApiAgreementTemplate {
  _id: string; name: string; agreementType: string; contextType: "user" | "project" | "general";
  entityType: "" | AgreementEntityType;
  sections: { scope: string; terms: string; paymentConditions: string; deliveryConditions: string; ndaText: string };
  builtin: boolean;
}
// The context an AgreementsPanel operates in — decides the API base and ownership fields.
export type AgreementCtx =
  | { kind: "user"; userId: string }
  | { kind: "project"; projectId: string; entityType: AgreementEntityType; entityId: string }
  | { kind: "general" };
const agrBase = (ctx: AgreementCtx) =>
  ctx.kind === "user" ? `/users/${ctx.userId}/agreements`
  : ctx.kind === "general" ? `/general-agreements`
  : `/projects/${ctx.projectId}/agreements`;

export async function fetchAgreements(ctx: AgreementCtx, archived = false): Promise<ApiAgreement[]> {
  const parts: string[] = [];
  if (ctx.kind === "project") parts.push(`entityType=${encodeURIComponent(ctx.entityType)}`, `entityId=${encodeURIComponent(ctx.entityId)}`);
  if (archived) parts.push("archived=true");
  return request(`${agrBase(ctx)}${parts.length ? `?${parts.join("&")}` : ""}`);
}
/** Archive or restore an agreement (hidden from the normal list). */
export async function setAgreementArchived(ctx: AgreementCtx, aid: string, archived: boolean): Promise<ApiAgreement> {
  return request(`${agrBase(ctx)}/${aid}`, { method: "PATCH", body: JSON.stringify({ archived }) });
}
export interface AgreementInput {
  name?: string; agreementType?: string; templateId?: string;
  effectiveDate?: string; startDate?: string; endDate?: string;
  letterhead?: "gt" | "jv"; jvLogoUrl?: string;
  documentMode?: "built" | "uploaded";
  partySnapshot?: Partial<ApiAgreement["partySnapshot"]>;
  sections?: Partial<ApiAgreementSections>;
  extraSections?: Array<{ title: string; body: string; status?: string; locked?: boolean; hidden?: boolean; notes?: string; assignedTo?: string; attachments?: Array<{ _id?: string; name: string; filePath: string; fileType: string; size: string }> ; history?: Array<{ at: string; by: string; text: string }> }>;
  companySignature?: Partial<ApiAgreement["signatures"]["company"]>;
  status?: "PendingSignature";
}
export async function createAgreement(ctx: AgreementCtx, body: AgreementInput): Promise<ApiAgreement> {
  const extra = ctx.kind === "project" ? { ownerEntityType: ctx.entityType, ownerEntityId: ctx.entityId } : {};
  return request(agrBase(ctx), { method: "POST", body: JSON.stringify({ ...body, ...extra }) });
}
export async function updateAgreement(ctx: AgreementCtx, aid: string, body: AgreementInput): Promise<ApiAgreement> {
  return request(`${agrBase(ctx)}/${aid}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function deleteAgreement(ctx: AgreementCtx, aid: string): Promise<void> {
  await request(`${agrBase(ctx)}/${aid}`, { method: "DELETE" });
}
export async function sendAgreement(ctx: AgreementCtx, aid: string): Promise<ApiAgreement> {
  return request(`${agrBase(ctx)}/${aid}/send`, { method: "POST" });
}
export async function signAgreement(ctx: AgreementCtx, aid: string, body: { signerName?: string; signatureUrl?: string }): Promise<ApiAgreement> {
  return request(`${agrBase(ctx)}/${aid}/sign`, { method: "POST", body: JSON.stringify(body) });
}
export async function rejectAgreement(ctx: AgreementCtx, aid: string, note = ""): Promise<ApiAgreement> {
  return request(`${agrBase(ctx)}/${aid}/reject`, { method: "POST", body: JSON.stringify({ note }) });
}
export async function cancelAgreement(ctx: AgreementCtx, aid: string, note = ""): Promise<ApiAgreement> {
  return request(`${agrBase(ctx)}/${aid}/cancel`, { method: "POST", body: JSON.stringify({ note }) });
}
async function agrMultipart(path: string, fd: FormData): Promise<ApiAgreement> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${path}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
// Freeze the final built PDF as the immutable signed snapshot.
export async function freezeAgreementPdf(ctx: AgreementCtx, aid: string, file: File): Promise<ApiAgreement> {
  const fd = new FormData(); fd.append("file", file);
  return agrMultipart(`${agrBase(ctx)}/${aid}/freeze`, fd);
}
// Upload an already-made agreement file — it becomes the document (documentMode "uploaded").
export async function uploadAgreementDocument(ctx: AgreementCtx, aid: string, file: File): Promise<ApiAgreement> {
  const fd = new FormData(); fd.append("file", file);
  return agrMultipart(`${agrBase(ctx)}/${aid}/document`, fd);
}
// CR-B-18 — attach / remove a pre-made file on a specific agreement section.
export async function uploadAgreementSectionFile(ctx: AgreementCtx, aid: string, idx: number, file: File): Promise<ApiAgreement> {
  const fd = new FormData(); fd.append("file", file);
  return agrMultipart(`${agrBase(ctx)}/${aid}/sections/${idx}/files`, fd);
}
export async function deleteAgreementSectionFile(ctx: AgreementCtx, aid: string, idx: number, fid: string): Promise<ApiAgreement> {
  return request(`${agrBase(ctx)}/${aid}/sections/${idx}/files/${fid}`, { method: "DELETE" });
}
// Staff uploads the counter-signed copy received outside the platform (vendor flow).
export async function uploadSignedAgreement(ctx: AgreementCtx, aid: string, file: File, signerName = ""): Promise<ApiAgreement> {
  const fd = new FormData(); if (signerName) fd.append("signerName", signerName); fd.append("file", file);
  return agrMultipart(`${agrBase(ctx)}/${aid}/sign-upload`, fd);
}
export async function fetchAgreementTemplates(contextType?: "user" | "project"): Promise<ApiAgreementTemplate[]> {
  return request(`/agreement-templates${contextType ? `?contextType=${contextType}` : ""}`);
}

// ── Purchase Orders (from awarded quotes; invoice link → auto-Expense) ────────
export interface POLine { itemId: string; description: string; qty: string; unit: string; unitPrice: string; cancelled?: boolean }
export interface ApiProcurementPO {
  _id: string; projectId: string; poNo: string; rfqId: string; quoteId: string; vendorId: string; vendorName: string;
  lineItems: POLine[]; shipping: string; tax: string; total: string; terms: string; termsMode?: "constant" | "file"; notes?: string; shipTo: string; deliveryMethod?: string;
  status: "Sent" | "Confirmed" | "InvoiceReceived" | "Paid"; archived?: boolean;
  invoiceNo: string; invoiceAmount: string; invoiceDate: string; invoiceMatch: "" | "Matched" | "Discrepancy";
  expenseId: string; attachments: Array<ExpenseAttachment & { kind: string }>; addedByName: string;
  // Signatures & stamps
  signerName?: string; signerEmail?: string; signerPhone?: string; signerTitle?: string; signatureUrl?: string; stampUrl?: string;
  partnerSignerName?: string; partnerSignerEmail?: string; partnerSignerPhone?: string; partnerSignatureUrl?: string; partnerStampUrl?: string;
  assignedTo?: string;
}
export type PoPatch = Partial<Pick<ApiProcurementPO,
  "terms" | "termsMode" | "notes" | "shipTo" | "deliveryMethod" | "status" | "invoiceNo" | "invoiceAmount" | "invoiceDate" |
  "signerName" | "signerEmail" | "signerPhone" | "signerTitle" | "signatureUrl" | "stampUrl" |
  "partnerSignerName" | "partnerSignerEmail" | "partnerSignerPhone" | "partnerSignatureUrl" | "partnerStampUrl" | "assignedTo">>;
const poBase = (projectId: string) => `/projects/${projectId}/procurement-pos`;
export async function fetchProcurementPOs(projectId: string, archived = false): Promise<ApiProcurementPO[]> { return request(`${poBase(projectId)}${archived ? "?archived=true" : ""}`); }
export async function setProcurementPOArchived(projectId: string, pid: string, archived: boolean): Promise<ApiProcurementPO> {
  return request(`${poBase(projectId)}/${pid}`, { method: "PATCH", body: JSON.stringify({ archived }) });
}
export async function createProcurementPO(projectId: string, rfqId: string, quoteId: string): Promise<ApiProcurementPO> {
  return request(poBase(projectId), { method: 'POST', body: JSON.stringify({ rfqId, quoteId }) });
}
// §H — create a PO directly from selected BOQ items (fill vendor/prices in the PO tab).
export async function createPOFromItems(projectId: string, itemIds: string[]): Promise<ApiProcurementPO> {
  return request(`${poBase(projectId)}/from-items`, { method: 'POST', body: JSON.stringify({ itemIds }) });
}
// CR-PR-06 — a manual PO not tied to a BOQ/RFQ/approved quote (starts empty).
export async function createManualPO(projectId: string, vendorName = ""): Promise<ApiProcurementPO> {
  return request(`${poBase(projectId)}/manual`, { method: 'POST', body: JSON.stringify({ vendorName }) });
}
export async function updateProcurementPO(projectId: string, pid: string, body: PoPatch): Promise<ApiProcurementPO> {
  return request(`${poBase(projectId)}/${pid}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function deleteProcurementPO(projectId: string, pid: string): Promise<void> { await request(`${poBase(projectId)}/${pid}`, { method: 'DELETE' }); }
// Upload the partner's signature (target "signature") or stamp (target "stamp") — JV only.
export async function uploadPOPartyImage(projectId: string, pid: string, file: File, target: "signature" | "stamp"): Promise<ApiProcurementPO> {
  const fd = new FormData(); fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${poBase(projectId)}/${pid}/party-image?target=${target}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
// Attach an existing uploads file (e.g. an approved submittal document) onto the PO.
export async function attachPOFile(projectId: string, pid: string, file: { filePath: string; name: string; fileType?: string; size?: string; kind?: string }): Promise<ApiProcurementPO> {
  return request(`${poBase(projectId)}/${pid}/attach-file`, { method: 'POST', body: JSON.stringify(file) });
}
export async function uploadPOAttachment(projectId: string, pid: string, file: File, kind: string): Promise<ApiProcurementPO> {
  const fd = new FormData(); fd.append('file', file); fd.append('kind', kind);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api${poBase(projectId)}/${pid}/attachments`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}
export async function deletePOAttachment(projectId: string, pid: string, aid: string): Promise<ApiProcurementPO> {
  return request(`${poBase(projectId)}/${pid}/attachments/${aid}`, { method: 'DELETE' });
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface ApiNotification {
  _id: string;
  type: "assignment" | "share" | "general";
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(): Promise<{ items: ApiNotification[]; unread: number }> {
  return request(`/notifications`);
}

// ── Announcements (public hero banner; admin-managed) ────────────────────────
export interface ApiAnnouncement {
  _id: string; title: string; message: string; emoji: string; date: string; endDate?: string;
  kind: "holiday" | "news" | "event"; active: boolean; addedByName: string; createdAt?: string;
}
// ── Companies / Contact Directory (client CR-P-06) ──────────────────────────
export type CompanyCategory = "vendor" | "subcontractor" | "client" | "manufacturer" | "consultant" | "partner" | "supplier" | "other";
export const COMPANY_CATEGORIES: { v: CompanyCategory; label: string }[] = [
  { v: "vendor", label: "Vendor" }, { v: "subcontractor", label: "Subcontractor" }, { v: "client", label: "Client" },
  { v: "manufacturer", label: "Manufacturer" }, { v: "consultant", label: "Consultant" }, { v: "partner", label: "Partner" },
  { v: "supplier", label: "Supplier" }, { v: "other", label: "Other" },
];
export interface ApiCompany {
  _id: string;
  name: string;
  category: CompanyCategory;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  contactPersons: Array<{ name: string; role: string; email: string; phone: string }>;
  banking: { bankName: string; accountName: string; accountNumber: string; iban: string; swift: string; routing: string };
  tax: { taxId: string; registrationNo: string };
  notes: string;
  archived?: boolean;
  createdByName?: string;
  createdAt?: string;
  registerToken?: string;
  pendingUpdate?: { data: string; submittedAt: string; submittedBy?: string } | null;
}
export type CompanyInput = Partial<Omit<ApiCompany, "_id" | "createdByName" | "createdAt" | "registerToken" | "pendingUpdate">>;
export interface PublicCompany { name: string; category: string; logoUrl: string; address: string; phone: string; email: string; website: string; contactPersons: ApiCompany["contactPersons"]; banking: ApiCompany["banking"]; tax: ApiCompany["tax"] }
export async function fetchCompanies(category?: CompanyCategory, archived = false): Promise<ApiCompany[]> {
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (archived) q.set("archived", "true");
  const qs = q.toString();
  return request(`/companies${qs ? `?${qs}` : ""}`);
}
export async function fetchCompany(id: string): Promise<ApiCompany> { return request(`/companies/${id}`); }
export async function createCompany(body: CompanyInput): Promise<ApiCompany> {
  return request(`/companies`, { method: "POST", body: JSON.stringify(body) });
}
export async function updateCompany(id: string, body: CompanyInput): Promise<ApiCompany> {
  return request(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function deleteCompany(id: string): Promise<void> {
  await request(`/companies/${id}`, { method: "DELETE" });
}
// CR-P-06d — vendor self-registration.
export async function generateCompanyRegisterLink(id: string): Promise<{ token: string }> {
  return request(`/companies/${id}/register-link`, { method: "POST" });
}
export async function resolveCompanyPending(id: string, action: "approve" | "discard"): Promise<ApiCompany> {
  return request(`/companies/${id}/pending/${action}`, { method: "POST" });
}
export interface CompanyLinks {
  invoices: Array<{ _id: string; number: string; type: string; party: string; amount: string; date: string; status: string; projectId: string }>;
  rfqs: Array<{ _id: string; rfqNo: string; title: string; status: string; projectId: string; sentAt: string }>;
  pos: Array<{ _id: string; poNo: string; vendorName: string; total: string; status: string; projectId: string }>;
  shipments?: Array<{ _id: string; name: string; status: string; etaDate: string; agencyName: string; projectId: string }>;
  quotes?: Array<{ _id: string; rfqId: string; total: string; status: string; accepted?: boolean; projectId: string }>;
  agreements?: Array<{ _id: string; name: string; status: string; projectId: string }>;
  submittals?: Array<{ _id: string; productName: string; manufacturer: string; status: string; projectId: string }>;
  projects?: Array<{ _id: string; projectId: string; name: string; status: string }>;
}
export async function fetchCompanyLinks(id: string): Promise<CompanyLinks> { return request(`/companies/${id}/links`); }
// CR-P-06c — backfill the Directory from real project data (clients, partners, subcontractors,
// vendors, manufacturers). Idempotent; returns how many profiles were created.
export async function syncCompaniesFromProjects(): Promise<{ added: number; byCategory: Record<string, number> }> {
  return request(`/companies/sync-from-projects`, { method: "POST" });
}
export async function fetchPublicCompany(token: string): Promise<PublicCompany> {
  return request(`/public/companies/${token}`);
}
export async function submitPublicCompany(token: string, body: Partial<PublicCompany>): Promise<{ ok: boolean }> {
  return request(`/public/companies/${token}`, { method: "PATCH", body: JSON.stringify(body) });
}

// Live presence (CR-B-16) — who else is viewing/editing a record.
export interface PresenceUser { userId: string; name: string; section?: string }
export async function presenceBeat(resource: string, section?: string | null): Promise<{ users: PresenceUser[] }> {
  return request(`/presence/${encodeURIComponent(resource)}`, {
    method: "POST",
    body: section != null ? JSON.stringify({ section }) : undefined,
  });
}
export async function presenceLeave(resource: string): Promise<void> {
  try { await request(`/presence/${encodeURIComponent(resource)}`, { method: "DELETE" }); } catch { /* best-effort */ }
}

export async function fetchAnnouncements(): Promise<ApiAnnouncement[]> { return request(`/announcements`); }
export async function fetchAllAnnouncements(): Promise<ApiAnnouncement[]> { return request(`/announcements/all`); }
export async function createAnnouncement(body: Partial<ApiAnnouncement>): Promise<ApiAnnouncement> {
  return request(`/announcements`, { method: 'POST', body: JSON.stringify(body) });
}
export async function updateAnnouncement(id: string, body: Partial<ApiAnnouncement>): Promise<ApiAnnouncement> {
  return request(`/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function deleteAnnouncement(id: string): Promise<void> { await request(`/announcements/${id}`, { method: 'DELETE' }); }
export async function seedHolidayAnnouncements(): Promise<{ added: number; year: number }> {
  return request(`/announcements/seed-holidays`, { method: 'POST' });
}

export async function markNotificationRead(id: string): Promise<void> {
  await request(`/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request(`/notifications/read-all`, { method: 'POST' });
}

export async function shareDocumentWithEmployee(body: {
  empId: string;
  docName: string;
  link: string;
  projectName?: string;
}): Promise<{ message: string }> {
  return request(`/notifications/share`, { method: 'POST', body: JSON.stringify(body) });
}

// ── Resume builder ───────────────────────────────────────────────────────────

export interface ResumeExperience { company: string; role: string; start: string; end: string; description: string }
export interface ResumeProject { name: string; role: string; start: string; end: string; description: string; projectId?: string; employer?: string; client?: string; solicitationNo?: string; contractNo?: string; cost?: string }
export interface ResumeEducation { school: string; degree: string; field: string; start: string; end: string }
export interface ResumeCertification { name: string; issuer: string; year: string }
export interface ResumeLanguage { name: string; level: string }
export interface ResumeCustomSection { heading: string; body: string }

export interface ApiResume {
  title: string;
  summary: string;
  citizenship?: string;
  assignmentOnProject?: string; // GT template: "Assignment on this project"
  yearsOfExperience?: string;   // GT template: "Years of experience"
  remark?: string;              // GT template: "Remark" (e.g. SME areas, clearances)
  showPhoto?: boolean;          // include the photo on the PDF (default true)
  contact: { email: string; phone: string; location: string };
  photoUrl?: string;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  skills: string[];
  certifications: ResumeCertification[];
  languages: ResumeLanguage[];
  customSections: ResumeCustomSection[];
}

/** A company project the employee is assigned to — offered for auto-fill. */
export interface ResumeSystemProject {
  id: string;
  name: string;
  category: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface TeamResume {
  resume: ApiResume;
  user: { name: string; email: string; phone: string; avatarUrl?: string };
}

export async function fetchMyResume(): Promise<{ resume: ApiResume; systemProjects: ResumeSystemProject[] }> {
  return request(`/resume/me`);
}

export async function saveMyResume(resume: ApiResume): Promise<ApiResume> {
  return request(`/resume/me`, { method: 'PUT', body: JSON.stringify(resume) });
}

/** Another employee's resume (admin / self / owner of a project they're assigned to). Null if none exists. */
export async function fetchResumeByEmp(empId: string): Promise<TeamResume | null> {
  try {
    return await request(`/resume/by-emp/${encodeURIComponent(empId)}`);
  } catch {
    return null; // no account, no resume yet, or no access — proposal simply skips them
  }
}

/** Another staff member's resume by account id — works even when they have no empId. Null if none. */
export async function fetchResumeByUser(userId: string): Promise<TeamResume | null> {
  try {
    return await request(`/resume/by-user/${encodeURIComponent(userId)}`);
  } catch {
    return null;
  }
}

// ── Subcontractor resumes (employer-built, GreenTech format, reusable library) ──
export interface ApiSubResume extends ApiResume {
  _id: string;
  personName: string;
  subcontractorName: string;
  updatedAt?: string;
}

export type SubResumeInput = Partial<Omit<ApiSubResume, "_id" | "updatedAt">>;

export async function fetchSubResumes(params?: { subName?: string; q?: string }): Promise<ApiSubResume[]> {
  const qs = new URLSearchParams();
  if (params?.subName) qs.set("subName", params.subName);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/resume/sub${suffix}`);
}

export async function createSubResume(body: SubResumeInput): Promise<ApiSubResume> {
  return request(`/resume/sub`, { method: "POST", body: JSON.stringify(body) });
}

export async function updateSubResume(id: string, body: SubResumeInput): Promise<ApiSubResume> {
  return request(`/resume/sub/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteSubResume(id: string): Promise<{ message: string }> {
  return request(`/resume/sub/${id}`, { method: "DELETE" });
}

// ── RFP / Spec library ────────────────────────────────────────────────────────
export const RFP_TYPES = ["RFP", "RFQ", "SOW", "Specification", "Other"];
export const RFP_STANDARD_SECTIONS = ["Introduction", "Scope of Work", "Technical Requirements", "Submission Requirements", "Evaluation Criteria", "Attachments"];
export interface RfpSection { id: string; title: string; notes: string; bookmarked: boolean }
export interface RfpRequirement { id: string; text: string; done: boolean }
export interface ApiRfpDocument {
  _id: string;
  title: string;
  docType: string;
  fileName: string;
  filePath: string;
  fileType: string;
  size: string;
  sections: RfpSection[];
  requirements: RfpRequirement[];
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}
export async function fetchRfpDocuments(params?: { q?: string; type?: string }): Promise<ApiRfpDocument[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.type) qs.set("type", params.type);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/rfp-documents${suffix}`);
}
export async function createRfpDocument(title: string, docType: string, file?: File | null): Promise<ApiRfpDocument> {
  const fd = new FormData();
  fd.append("title", title);
  fd.append("docType", docType);
  if (file) fd.append("file", file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/rfp-documents`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText); }
  return res.json();
}
export async function updateRfpDocument(id: string, body: Partial<{ title: string; docType: string; sections: RfpSection[]; requirements: RfpRequirement[] }>): Promise<ApiRfpDocument> {
  return request(`/rfp-documents/${id}`, { method: "PUT", body: JSON.stringify(body) });
}
export async function deleteRfpDocument(id: string): Promise<{ message: string }> {
  return request(`/rfp-documents/${id}`, { method: "DELETE" });
}
export function rfpFileUrl(doc: ApiRfpDocument): string {
  const norm = doc.filePath.replace(/\\/g, "/");
  const rel = norm.startsWith("uploads/") ? norm.slice("uploads/".length) : norm;
  return withFileToken(`/uploads/${rel}`);
}

// ── Company & Classified documents ───────────────────────────────────────────

export interface CompanyTab {
  _id: string;
  tabId: string;
  label: string;
  parentId: string;
  order: number;
  system: boolean;
}

export interface CompanyFile {
  _id: string;
  kind: "company" | "classified" | "profile";
  tabId: string;
  companyId?: string;   // profile files (CR-P-07)
  docType?: string;     // catalogue | certification | document | other
  name: string;
  fileType: string;
  size: string;
  filePath: string;
  url: string;
  description: string;
  uploadedByName: string;
  createdAt: string;
}

// CR-P-07 — per-company profile documents (catalogues / certifications / company docs).
export async function fetchCompanyProfileFiles(companyId: string): Promise<CompanyFile[]> {
  return request(`/companies/${companyId}/files`);
}
export async function uploadCompanyProfileFile(companyId: string, file: File, docType: string): Promise<CompanyFile> {
  const fd = new FormData();
  fd.append("docType", docType);
  fd.append("file", file);
  return postMultipart<CompanyFile>(`/api/companies/${companyId}/files`, fd);
}
export async function deleteCompanyProfileFile(companyId: string, fid: string): Promise<void> {
  await request(`/companies/${companyId}/files/${fid}`, { method: "DELETE" });
}
// CR-P-07 — upload a company logo image; returns a public URL to store in the company's logoUrl.
export async function uploadCompanyLogo(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return postMultipart<{ url: string }>(`/api/companies/logo`, fd);
}

export async function fetchCompanyTabs(kind: "company" | "classified" = "company"): Promise<CompanyTab[]> {
  return request(`/company/tabs?kind=${kind}`);
}

export async function createCompanyTab(label: string, parentId = "", kind: "company" | "classified" = "company"): Promise<CompanyTab> {
  return request(`/company/tabs`, { method: 'POST', body: JSON.stringify({ label, parentId, kind }) });
}

export async function renameCompanyTab(tabId: string, label: string): Promise<CompanyTab> {
  return request(`/company/tabs/${encodeURIComponent(tabId)}`, { method: 'PATCH', body: JSON.stringify({ label }) });
}

export async function deleteCompanyTab(tabId: string): Promise<void> {
  await request(`/company/tabs/${encodeURIComponent(tabId)}`, { method: 'DELETE' });
}

export async function fetchCompanyFiles(opts: { kind: "company" | "classified"; tab?: string }): Promise<CompanyFile[]> {
  const qs = new URLSearchParams({ kind: opts.kind });
  if (opts.tab) qs.set('tab', opts.tab);
  return request(`/company/files?${qs.toString()}`);
}
// Company stamps (the classified Stamps tab) — readable by any staff to stamp a PO.
export async function fetchStamps(): Promise<CompanyFile[]> { return request('/company/stamps'); }
export async function fetchNdaFiles(): Promise<CompanyFile[]> { return request('/company/nda-files'); }

export async function uploadCompanyFile(file: File, opts: { kind: "company" | "classified"; tabId?: string }): Promise<CompanyFile> {
  const fd = new FormData();
  fd.append('kind', opts.kind);
  if (opts.tabId) fd.append('tabId', opts.tabId);
  fd.append('file', file);
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/company/files`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function deleteCompanyFile(id: string): Promise<void> {
  await request(`/company/files/${id}`, { method: 'DELETE' });
}

/** Resolve a company/classified file to a viewable URL (seeded `url`, else token-guarded upload). */
export function companyFileUrl(f: CompanyFile): string {
  if (f.url) return f.url;
  const norm = (f.filePath || "").replace(/\\/g, '/');
  const rel = norm.startsWith('uploads/') ? norm.slice('uploads/'.length) : norm;
  return withFileToken(`/uploads/${rel}`);
}
