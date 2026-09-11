import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ExternalLink, Eye, FolderUp, History, Loader2, MessageSquare, Paperclip, Plus, RotateCcw, Search, Send, Settings2, Trash2, Upload, X, XCircle } from "lucide-react";
import {
  addExpense, updateExpense, deleteExpense, uploadExpenseAttachment, deleteExpenseAttachment, addExpenseComment,
  attachmentUrl, fetchBoardMembers, getAuthUser, invoicePaid,
  type ApiExpense, type ApiExpenseItem, type ApiInvoice, type BoardMember,
} from "../../lib/api";
import type { FiveNumbers } from "../../lib/projectFinance";
import { fmtMoney } from "../../lib/projectFinance";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import DocumentViewer from "./DocumentViewer";
import { Fig } from "./FiguresPrivacy";

/**
 * CR-P (153)-(160) — the project's Expense Log.
 *
 * Every expense shows here with who added it. An expense is added in a pop-up (like Add Submittal)
 * with several items (description, quantity, unit, unit price) and a grand total, the date, a remark
 * and the receipts. Each row has Manage: the same pop-up, plus approve / reject (a rejection needs a
 * reason), resend by the author, and a conversation with @mentions. GreenTech staff record past
 * expenses in bulk (already approved) and are the only ones who delete. The log also lists what we
 * still owe on invoices received (payables), read-only, with where they come from. Filter by status
 * and sort by any column.
 */

const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const NON_REVENUE = ["Draft", "Cancelled", "Canceled", "Rejected"];
const expTotal = (e: ApiExpense) => (num(e.qty) || 1) * num(e.amount);
const invTotal = (inv: ApiInvoice) => (inv.lineItems?.length ? inv.lineItems.reduce((s, it) => s + num(it.qty) * num(it.unitPrice), 0) : num(inv.amount));

const BADGE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-600",
  pending: "bg-amber-50 text-amber-600",
  payable: "bg-amber-50 text-amber-700",
};

type Status = "all" | "pending" | "approved" | "rejected";
type SortKey = "no" | "description" | "date" | "total" | "status" | "addedBy";
type Entry =
  | { kind: "expense"; id: string; no: number; description: string; date: string; total: number; status: string; addedBy: string; e: ApiExpense }
  | { kind: "payable"; id: string; no: number; description: string; date: string; total: number; status: string; addedBy: string; inv: ApiInvoice };

export default function ExpenseLog({ projectId, rows, setRows, received, onRefreshReceived, onOpenReceived, canEdit, canApprove, canSeeFigures, five }: {
  projectId: string;
  rows: ApiExpense[];
  setRows: (fn: (prev: ApiExpense[]) => ApiExpense[]) => void;
  received: ApiInvoice[];
  onRefreshReceived: () => void;
  onOpenReceived: () => void;
  canEdit: boolean;
  canApprove: boolean;
  canSeeFigures: boolean;
  five: FiveNumbers;
}) {
  const { confirm, dialogs } = useDialogs();
  const me = getAuthUser();
  const isStaff = me?.role !== "subcontractor";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "no", dir: 1 });
  const [editor, setEditor] = useState<{ id: string | null; historic: boolean } | null>(null);
  const [viewFile, setViewFile] = useState<{ name: string; url: string; fileType: string } | null>(null);

  // The payables come from Invoice Received, which can change on its own tab.
  useEffect(() => { onRefreshReceived(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const replace = (u: ApiExpense) => setRows((p) => (p.some((x) => x._id === u._id) ? p.map((x) => (x._id === u._id ? u : x)) : [...p, u]));

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = rows.map((e, i) => ({
      kind: "expense", id: e._id, no: i + 1, description: e.description || "", date: e.date || "", total: expTotal(e),
      status: e.approval || "pending", addedBy: e.addedByName || "", e,
    }));
    // CR-P (160) — invoices received that are not fully paid: money we owe, shown as pending.
    received.forEach((inv) => {
      if (inv.isTemplate || NON_REVENUE.includes(inv.status || "")) return;
      const left = Math.max(0, invTotal(inv) - invoicePaid(inv));
      if (left <= 0) return;
      list.push({ kind: "payable", id: `inv-${inv._id}`, no: rows.length + list.length + 1, description: `${inv.party || "Invoice"}${inv.description ? `: ${inv.description}` : ""}`, date: inv.date || "", total: left, status: "pending", addedBy: inv.addedByName || "", inv });
    });
    return list;
  }, [rows, received]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = entries.filter((x) => (status === "all" || x.status === status) && (!q || [x.description, x.addedBy, x.kind === "expense" ? x.e.remarks : x.inv.number].some((v) => String(v || "").toLowerCase().includes(q))));
    const val = (x: Entry): string | number => (sort.key === "no" ? x.no : sort.key === "total" ? x.total : String(x[sort.key] || "").toLowerCase());
    return [...filtered].sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
  }, [entries, search, status, sort]);

  const counts = useMemo(() => ({
    all: entries.length,
    pending: entries.filter((x) => x.status === "pending").length,
    approved: entries.filter((x) => x.status === "approved").length,
    rejected: entries.filter((x) => x.status === "rejected").length,
  }), [entries]);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const head = (key: SortKey | null, label: string, cls = "") => (
    <th className={`text-left px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap ${cls}`}>
      {key ? (
        <button onClick={() => sortBy(key)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {label}{sort.key === key ? (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} className="opacity-40" />}
        </button>
      ) : label}
    </th>
  );

  // Payables and invoice payments are changed where they come from (CR-P 160).
  const explainSource = async (title: string, message: string) => {
    if (await confirm({ title, message, confirmLabel: "Open Invoice Received", cancelLabel: "Close", danger: false })) onOpenReceived();
  };
  const openEntry = (x: Entry) => {
    if (x.kind === "payable") {
      void explainSource(x.inv.poId ? "From Procurement" : "From Invoice Received",
        `This is invoice ${x.inv.number || ""} from ${x.inv.party || "a vendor"}${x.inv.poId ? " (a purchase order in Procurement)" : ""}, not yet fully paid. It counts as a payable here. To change it or record the payment, open it in Invoice Received.`);
      return;
    }
    setEditor({ id: x.e._id, historic: !!x.e.historic });
  };
  const removeRow = async (e: ApiExpense) => {
    if (!(await confirm({ title: "Delete expense?", message: `Delete "${e.description || "this expense"}" and its receipts? Expenses are records: delete only a mistake.`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteExpense(projectId, e._id); setRows((p) => p.filter((r) => r._id !== e._id)); toast("Expense deleted.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  const editing = editor?.id ? rows.find((r) => r._id === editor.id) || null : null;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">Expense Log</h3>
          <p className="text-xs text-slate-400 mt-1">{rows.length} expense{rows.length === 1 ? "" : "s"}{entries.length > rows.length ? ` · ${entries.length - rows.length} payable${entries.length - rows.length === 1 ? "" : "s"} from invoices received` : ""}. Click Manage to see an expense in full, approve it or reply.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expenses…" className="bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 w-44" />
          </div>
          {canEdit && isStaff && (
            <button onClick={() => setEditor({ id: null, historic: true })} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50" title="Record expenses that are already done and paid, in one entry">
              <History size={13} /> Record past expenses
            </button>
          )}
          {canEdit && (
            <button onClick={() => setEditor({ id: null, historic: false })} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary">
              <Plus size={13} /> Add Expense
            </button>
          )}
        </div>
      </div>

      {/* CR-P-15 — approved / pending expense totals (only for those who may see the figures). */}
      {canSeeFigures && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
            <span className="text-lg font-display font-bold text-emerald-600 leading-none"><Fig>{fmtMoney(five.approvedExpenses)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Approved Expenses</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-amber-50 border border-amber-100">
            <span className="text-lg font-display font-bold text-amber-600 leading-none"><Fig>{fmtMoney(five.pendingExpenses)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pending Expenses</span>
            <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white border border-amber-100 text-amber-600">Payables</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-lg font-display font-bold text-slate-700 leading-none"><Fig>{fmtMoney(five.approvedExpenses + five.pendingExpenses)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Expenses</span>
          </span>
        </div>
      )}

      {/* CR-P (159) — show one status at a time. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {(["all", "pending", "approved", "rejected"] as Status[]).map((k) => (
          <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-colors ${status === k ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 hover:text-slate-900"}`}>
            {k === "all" ? "All" : k} <span className="opacity-60">({counts[k]})</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-100">
              {head("no", "#")}
              {head("description", "Description")}
              {head("date", "Date")}
              {head("total", "Total")}
              {head(null, "Receipts")}
              {head("addedBy", "Added by")}
              {head("status", "Status")}
              {head(null, "")}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400 italic">{entries.length ? "Nothing matches." : "No expenses yet."}</td></tr>}
            {shown.map((x) => {
              const e = x.kind === "expense" ? x.e : null;
              const fromInvoice = !!e?.invoiceId;
              const files = e?.attachments || [];
              return (
                <tr key={x.id} className={`hover:bg-slate-50/40 align-top ${x.kind === "payable" ? "bg-amber-50/20" : ""}`}>
                  <td className="px-3 py-2.5 text-slate-400 font-bold text-[11px]">{x.kind === "expense" ? x.no : "—"}</td>
                  <td className="px-3 py-2.5 min-w-[220px]">
                    <button onClick={() => openEntry(x)} className="text-left font-bold text-slate-800 hover:text-primary">{x.description || <span className="text-slate-300 italic">No description</span>}</button>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {e && (e.items?.length || 0) > 1 && <span className="text-[10px] text-slate-400">{e.items!.length} items</span>}
                      {e?.historic && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-wide">Past expenses</span>}
                      {fromInvoice && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-[9px] font-bold text-indigo-600 uppercase tracking-wide">From Invoice Received</span>}
                      {x.kind === "payable" && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-[9px] font-bold text-indigo-600 uppercase tracking-wide">{x.inv.poId ? "From Procurement" : "From Invoice Received"} · {x.inv.number || "invoice"}</span>}
                      {e && (e.comments?.length || 0) > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400"><MessageSquare size={10} /> {e.comments!.length}</span>}
                      {e?.remarks && <span className="text-[10px] text-slate-400 truncate max-w-[220px]" title={e.remarks}>{e.remarks}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{x.date || "—"}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{x.total ? money(x.total) : "—"}</td>
                  <td className="px-3 py-2.5">
                    {files.length ? (
                      <button onClick={() => (files.length === 1 ? setViewFile({ name: files[0].name, url: attachmentUrl(files[0].filePath), fileType: files[0].fileType }) : openEntry(x))} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20"><Paperclip size={11} /> {files.length}</button>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">{x.addedBy || "—"}{e && (e.addedByRole === "subcontractor" || e.addedByRole === "guest") ? " (subcontractor)" : ""}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${BADGE[x.kind === "payable" ? "payable" : x.status] || BADGE.pending}`} title={e?.approval === "rejected" && e.rejectReason ? `Reason: ${e.rejectReason}` : undefined}>
                      {x.kind === "payable" ? "Payable" : x.status}
                    </span>
                    {e?.approval === "rejected" && e.rejectReason && <p className="text-[10px] text-red-500 mt-1 max-w-[180px] truncate" title={e.rejectReason}>{e.rejectReason}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {x.kind === "payable" ? (
                        <button onClick={() => openEntry(x)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:text-primary"><ExternalLink size={11} /> Open</button>
                      ) : (
                        <button onClick={() => openEntry(x)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Settings2 size={12} /> Manage</button>
                      )}
                      {e && isStaff && canEdit && !fromInvoice && <button onClick={() => removeRow(e)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editor && (
        <ExpenseEditor
          projectId={projectId}
          expense={editing}
          historic={editor.historic}
          canEdit={canEdit}
          canApprove={canApprove && isStaff}
          isStaff={isStaff}
          myId={me?.id || ""}
          confirm={confirm}
          onSaved={(u) => { replace(u); setEditor((ed) => (ed ? { ...ed, id: u._id } : ed)); }}
          onOpenReceived={onOpenReceived}
          onClose={() => setEditor(null)}
        />
      )}
      {viewFile && <DocumentViewer doc={viewFile} onClose={() => setViewFile(null)} />}
      {dialogs}
    </div>
  );
}

type Row = ApiExpenseItem & { key: string };
const blankItem = (): Row => ({ key: Math.random().toString(36).slice(2), description: "", qty: "1", unit: "", unitPrice: "" });
const FOLDER_INPUT = { webkitdirectory: "", directory: "" } as Record<string, string>;

// CR-P (154)-(158) — add / manage one expense: the items, the receipts, the approval and the talk.
function ExpenseEditor({ projectId, expense, historic, canEdit, canApprove, isStaff, myId, confirm, onSaved, onOpenReceived, onClose }: {
  projectId: string;
  expense: ApiExpense | null;
  historic: boolean;
  canEdit: boolean;
  canApprove: boolean;
  isStaff: boolean;
  myId: string;
  confirm: ReturnType<typeof useDialogs>["confirm"];
  onSaved: (e: ApiExpense) => void;
  onOpenReceived: () => void;
  onClose: () => void;
}) {
  const fromInvoice = !!expense?.invoiceId;
  const mine = !!expense && String(expense.addedById || "") === myId;
  const editable = canEdit && !fromInvoice && (!expense || isStaff || mine);
  const initItems = (): Row[] => {
    if (expense?.items?.length) return expense.items.map((i) => ({ ...i, key: Math.random().toString(36).slice(2) }));
    if (expense) return [{ key: "x", description: expense.description || "", qty: expense.qty || "1", unit: "", unitPrice: expense.amount || "" }];
    if (historic) return [{ key: "h", description: "Total of past expenses", qty: "1", unit: "", unitPrice: "" }];
    return [blankItem()];
  };
  const [description, setDescription] = useState(expense?.description || (historic ? "Past expenses, January to August" : ""));
  const [date, setDate] = useState(expense?.date || new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState(expense?.remarks || "");
  const [items, setItems] = useState<Row[]>(initItems);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [viewFile, setViewFile] = useState<{ name: string; url: string; fileType: string } | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // The same expense can be reopened after saving (attachments need a saved expense).
  const lastId = useRef(expense?._id || "");
  useEffect(() => {
    if (expense && expense._id !== lastId.current) {
      lastId.current = expense._id;
    }
  }, [expense]);

  const total = items.reduce((s, i) => s + (num(i.qty) || 0) * num(i.unitPrice), 0);
  const setItem = (key: string, patch: Partial<Row>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const payload = () => ({
    description: description.trim(),
    date,
    remarks,
    qty: "1",
    amount: total.toFixed(2),
    items: items.filter((i) => i.description.trim() || num(i.unitPrice)).map(({ key: _k, ...i }) => { void _k; return i; }),
  });
  const dirty = !expense || JSON.stringify(payload()) !== JSON.stringify({
    description: expense.description || "", date: expense.date || "", remarks: expense.remarks || "", qty: "1", amount: expTotal(expense).toFixed(2),
    items: (expense.items?.length ? expense.items : [{ description: expense.description || "", qty: expense.qty || "1", unit: "", unitPrice: expense.amount || "" }]).filter((i) => i.description.trim() || num(i.unitPrice)).map((i) => ({ description: i.description, qty: i.qty, unit: i.unit, unitPrice: i.unitPrice })),
  });

  const save = async (close: boolean) => {
    if (!editable) { onClose(); return; }
    const p = payload();
    if (!p.description && !p.items.length) { toast("Describe the expense or add an item.", "error"); return; }
    setSaving(true);
    try {
      const u = expense ? await updateExpense(projectId, expense._id, p) : await addExpense(projectId, { ...p, historic });
      onSaved(u);
      toast(expense ? "Expense saved." : historic ? "Past expenses recorded as approved. Attach the receipts below." : "Expense added. Attach the receipt below.", "success");
      if (close) onClose();
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setSaving(false); }
  };
  const requestClose = async () => {
    if (editable && dirty && (expense || total || description.trim())) {
      if (await confirm({ title: "Save your changes?", message: "This expense has changes that are not saved yet.", confirmLabel: "Save and close", cancelLabel: "Discard", danger: false })) { await save(true); return; }
    }
    onClose();
  };

  const upload = async (files: File[]) => {
    if (!expense || !files.length) return;
    setUploading({ done: 0, total: files.length });
    let latest: ApiExpense | null = null;
    for (let i = 0; i < files.length; i++) {
      try { latest = await uploadExpenseAttachment(projectId, expense._id, files[i]); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);
    if (latest) onSaved(latest);
  };
  const removeFile = async (aid: string, name: string) => {
    if (!expense) return;
    if (!(await confirm({ title: "Delete receipt?", message: `Delete "${name}"? It is removed for good.`, confirmLabel: "Delete", danger: true }))) return;
    try { onSaved(await deleteExpenseAttachment(projectId, expense._id, aid)); } catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  const setApproval = async (approval: "approved" | "rejected" | "pending", why = "") => {
    if (!expense) return;
    try { onSaved(await updateExpense(projectId, expense._id, { approval, ...(why ? { rejectReason: why } : {}) })); setRejecting(false); setReason(""); toast(approval === "approved" ? "Expense approved." : approval === "rejected" ? "Expense rejected. The person who added it is told why." : "Set back to pending.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };
  const resend = async () => {
    if (!expense) return;
    try { onSaved(await updateExpense(projectId, expense._id, { resend: true })); toast("Sent again for approval.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not resend.", "error"); }
  };

  const status = expense?.approval || "pending";
  const inp = "w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-70";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{expense ? `Expense · ${expense.description || "No description"}` : historic ? "Record past expenses" : "Add expense"}</p>
            <p className="text-[11px] text-slate-400">
              {expense ? <>Added by {expense.addedByName || "someone"}{expense.historic ? " · past expenses" : ""}</> : historic ? "Expenses already done and paid, in one entry (e.g. January to August). Saved as approved." : "Add every item bought; the total is worked out for you."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {expense && <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${BADGE[status]}`}>{status}</span>}
            <button onClick={requestClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100" title="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {fromInvoice && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2">
              <p className="text-xs text-indigo-700">This expense is a payment recorded on an invoice received. Change it there.</p>
              <button onClick={() => { onClose(); onOpenReceived(); }} className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline"><ExternalLink size={11} /> Open Invoice Received</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description
              <input className={`${inp} mt-1`} disabled={!editable} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Office supplies for the site office" />
            </label>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date
              <input type="date" className={`${inp} mt-1`} disabled={!editable} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          {/* The items */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Items</p>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="text-left px-2 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2">Description</th>
                    <th className="text-left px-2 py-2 w-16">Qty</th>
                    <th className="text-left px-2 py-2 w-20">Unit</th>
                    <th className="text-left px-2 py-2 w-28">Unit price</th>
                    <th className="text-right px-2 py-2 w-28">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, i) => (
                    <tr key={it.key}>
                      <td className="px-2 py-1.5 text-slate-400 font-bold">{i + 1}</td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.description} onChange={(e) => setItem(it.key, { description: e.target.value })} placeholder="e.g. Monitor" /></td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.qty} onChange={(e) => setItem(it.key, { qty: e.target.value })} inputMode="decimal" /></td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.unit} onChange={(e) => setItem(it.key, { unit: e.target.value })} placeholder="pcs" /></td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.unitPrice} onChange={(e) => setItem(it.key, { unitPrice: e.target.value })} placeholder="0.00" inputMode="decimal" /></td>
                      <td className="px-2 py-1.5 text-right font-bold text-slate-700 whitespace-nowrap">{money((num(it.qty) || 0) * num(it.unitPrice))}</td>
                      <td className="px-1 py-1">{editable && items.length > 1 && <button onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="p-1 rounded text-slate-300 hover:text-red-500" title="Remove item"><X size={13} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="px-2 py-2">
                      {editable && <button onClick={() => setItems((l) => [...l, blankItem()])} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add item</button>}
                    </td>
                    <td className="px-2 py-2 text-right text-sm font-display font-bold text-slate-900 whitespace-nowrap">{money(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Grand total of all items.</p>
          </div>

          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remark
            <input className={`${inp} mt-1`} disabled={!editable} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Anything finance should know" />
          </label>

          {/* Receipts */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Paperclip size={12} /> Receipts {expense?.attachments?.length ? `(${expense.attachments.length})` : ""}</p>
              {expense && editable && (
                uploading ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Loader2 size={12} className="animate-spin" /> Uploading {uploading.done} of {uploading.total}…</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary cursor-pointer"><Upload size={12} /> Upload<input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []) as File[]; e.target.value = ""; void upload(f); }} /></label>
                    <button onClick={() => folderRef.current?.click()} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50" title="Upload a folder of receipts"><FolderUp size={12} /> Folder</button>
                    <input ref={folderRef} type="file" multiple className="hidden" {...FOLDER_INPUT} onChange={(e) => { const f = (Array.from(e.target.files || []) as File[]).filter((x) => !/^\./.test(x.name)); e.target.value = ""; void upload(f); }} />
                  </div>
                )
              )}
            </div>
            {!expense ? (
              <p className="text-[11px] text-slate-400 italic">Save the expense first, then attach the receipt{historic ? "s (a whole folder works)" : ""}.</p>
            ) : (expense.attachments || []).length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No receipt attached.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {expense.attachments.map((a) => (
                  <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-bold text-slate-600">
                    <button onClick={() => setViewFile({ name: a.name, url: attachmentUrl(a.filePath), fileType: a.fileType })} className="inline-flex items-center gap-1 hover:text-primary max-w-[14rem] truncate" title={a.name}><Eye size={11} /> {a.name}</button>
                    {editable && <button onClick={() => removeFile(a._id, a.name)} className="p-0.5 rounded text-slate-300 hover:text-red-500"><X size={11} /></button>}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* CR-P (156) — approval, inside Manage. */}
          {expense && !fromInvoice && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Approval</p>
              {status === "rejected" && expense.rejectReason && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700"><b>Rejected:</b> {expense.rejectReason}</p>
                </div>
              )}
              {canApprove ? (
                rejecting ? (
                  <div className="space-y-2">
                    <textarea autoFocus rows={2} className={`${inp} resize-y`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it rejected? e.g. The receipt is not attached. Please add it and send it again." />
                    <div className="flex items-center gap-2">
                      <button onClick={() => { if (!reason.trim()) { toast("Say why the expense is rejected.", "error"); return; } void setApproval("rejected", reason.trim()); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700"><XCircle size={13} /> Reject with this reason</button>
                      <button onClick={() => { setRejecting(false); setReason(""); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {status !== "approved" && <button onClick={() => setApproval("approved")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"><Check size={13} /> Approve</button>}
                    {status !== "rejected" && <button onClick={() => setRejecting(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50"><XCircle size={13} /> Reject</button>}
                    {status !== "pending" && <button onClick={() => setApproval("pending")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white"><RotateCcw size={12} /> Back to pending</button>}
                  </div>
                )
              ) : status === "rejected" && mine ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-slate-500">Fix what is asked (e.g. attach the receipt), then send it again.</p>
                  <button onClick={resend} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90"><Send size={12} /> Resend for approval</button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">{status === "approved" ? "Approved by GreenTech." : status === "pending" ? "Waiting for GreenTech to approve it." : "Rejected."}</p>
              )}
            </div>
          )}

          {/* CR-P (157) — the conversation on this expense. */}
          {expense && <ExpenseComments projectId={projectId} expense={expense} onSaved={onSaved} canComment={canEdit || mine} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-3xl">
          <p className={`text-[11px] font-bold ${editable && dirty ? "text-amber-600" : "text-slate-400"}`}>{!editable ? "View only" : dirty ? "Unsaved changes" : "All changes saved"}</p>
          <div className="flex items-center gap-2">
            {editable ? (
              <>
                <button onClick={() => save(false)} disabled={saving || !dirty} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-40">Save</button>
                <button onClick={() => save(true)} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50">{saving && <Loader2 size={12} className="animate-spin" />} Save and close</button>
              </>
            ) : (
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">Close</button>
            )}
          </div>
        </div>
      </div>
      {viewFile && <DocumentViewer doc={viewFile} onClose={() => setViewFile(null)} />}
    </div>
  );
}

function ExpenseComments({ projectId, expense, onSaved, canComment }: { projectId: string; expense: ApiExpense; onSaved: (e: ApiExpense) => void; canComment: boolean }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [picked, setPicked] = useState<BoardMember[]>([]);
  const [menu, setMenu] = useState<string | null>(null);   // the @query being typed
  const ref = useRef<HTMLTextAreaElement>(null);
  const myId = getAuthUser()?.id || "";
  useEffect(() => { fetchBoardMembers(projectId).then((m) => setMembers(m.filter((x) => x.userId && x.userId !== myId))).catch(() => setMembers([])); }, [projectId, myId]);
  const matches = menu === null ? [] : members.filter((m) => !menu || m.name.toLowerCase().includes(menu.toLowerCase())).slice(0, 8);

  const onInput = (v: string) => { setText(v); const m = /@([^\s@]*)$/.exec(v); setMenu(m && members.length ? m[1] : null); };
  const pick = (m: BoardMember) => {
    setPicked((p) => (p.some((x) => x.userId === m.userId) ? p : [...p, m]));
    setText((t) => t.replace(/@([^\s@]*)$/, `@${m.name} `));
    setMenu(null);
    setTimeout(() => ref.current?.focus(), 0);
  };
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      onSaved(await addExpenseComment(projectId, expense._id, { text: body, mentions: picked.filter((m) => body.includes(`@${m.name}`)).map((m) => m.userId) }));
      setText(""); setPicked([]);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not post.", "error"); }
    finally { setSending(false); }
  };

  const comments = expense.comments || [];
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2"><MessageSquare size={12} /> Conversation {comments.length ? `(${comments.length})` : ""}</p>
      <div className="space-y-2 mb-2">
        {comments.length === 0 ? <p className="text-[11px] text-slate-400 italic">No messages yet. Ask a question or answer one here.</p> : comments.map((c, i) => (
          <div key={i} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[11px]"><span className="font-bold text-slate-700">{c.authorName || "Someone"}</span> <span className="text-slate-400">{c.at ? new Date(c.at).toLocaleString() : ""}</span></p>
            <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">{c.text}</p>
          </div>
        ))}
      </div>
      {canComment && (
        <div>
          <textarea ref={ref} rows={2} value={text} onChange={(e) => onInput(e.target.value)} placeholder="Write a message… type @ to tag someone" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 resize-y" />
          {matches.length > 0 && (
            <div className="mt-1 rounded-xl border border-slate-100 shadow-lg bg-white p-1 max-h-44 overflow-y-auto">
              {matches.map((m) => <button key={m.key} onClick={() => pick(m)} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50">@{m.name}</button>)}
            </div>
          )}
          <div className="flex justify-end mt-1.5">
            <button onClick={send} disabled={sending || !text.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold disabled:opacity-40">{sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Post</button>
          </div>
        </div>
      )}
    </div>
  );
}
