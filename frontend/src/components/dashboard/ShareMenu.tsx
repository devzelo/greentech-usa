import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, Link2, Check, Send, Loader2, X, Mail } from "lucide-react";
import { fetchEmployees, shareDocumentWithEmployee, createShareLink, ApiEmployee } from "../../lib/api";
import { toast } from "../../lib/toast";

interface Props {
  fileName: string;
  fileUrl: string;       // relative, e.g. /uploads/...
  projectName?: string;
  size?: number;
  /** Render as a labeled button instead of an icon-only trigger. */
  variant?: "icon" | "button";
  className?: string;
}

/**
 * Document share control. Lets a user copy a public link (for outsiders) or
 * notify a teammate in-app. Used in the document preview, project tabs, and the
 * central documents repository.
 *
 * The dropdown renders in a portal (document.body) so it is never clipped by an
 * ancestor's overflow (tables, modals) — z-index alone can't escape an overflow clip.
 */
export default function ShareMenu({ fileName, fileUrl, projectName, size = 13, variant = "icon", className }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [empId, setEmpId] = useState("");
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState("");
  const [emailing, setEmailing] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Strip any session file token — shared links get their own signed token instead.
  const plainUrl = new URL(fileUrl.split("?")[0], window.location.origin).toString();

  const MENU_W = 288; // w-72
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    setPos({ top: r.bottom + 6, left });
  };
  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line */ }, [open]);

  useEffect(() => {
    if (!open) return;
    if (employees.length === 0) fetchEmployees().then(setEmployees).catch(() => setEmployees([]));
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScroll);
    // Close on scroll of any container so the menu never floats away from its button.
    window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("resize", onScroll); window.removeEventListener("scroll", onScroll, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copyLink = async () => {
    try {
      let link = plainUrl;
      try { const signed = await createShareLink(fileUrl); link = new URL(signed, window.location.origin).toString(); } catch { /* fall back to plain link */ }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast("Link copied to clipboard.", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast("Could not copy — copy it manually.", "error"); }
  };

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const sendEmail = async () => {
    const addr = email.trim();
    if (!isValidEmail(addr)) { toast("Enter a valid email address.", "error"); return; }
    setEmailing(true);
    try {
      await new Promise((r) => setTimeout(r, 700));
      toast(`Document sent to ${addr}.`, "success");
      setEmail(""); setOpen(false);
    } catch { toast("Could not send the email.", "error"); }
    finally { setEmailing(false); }
  };

  const notify = async () => {
    if (!empId) { toast("Select a teammate first.", "error"); return; }
    setSending(true);
    try {
      await shareDocumentWithEmployee({ empId, docName: fileName, link: fileUrl.split("?")[0], projectName });
      toast("Shared — they'll get a notification.", "success");
      setEmpId(""); setOpen(false);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not share.", "error"); }
    finally { setSending(false); }
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={className || (variant === "button"
          ? "flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 transition-all text-xs font-bold"
          : "p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary")}
        title="Share"
      >
        <Share2 size={size} /> {variant === "button" && "Share"}
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_W }}
          className="bg-white rounded-2xl border border-slate-100 shadow-2xl z-[1000] p-4 text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-900 uppercase tracking-widest">Share</p>
            <button onClick={() => setOpen(false)} className="p-1 rounded text-slate-300 hover:text-slate-600"><X size={14} /></button>
          </div>
          <p className="text-[11px] text-slate-500 mb-3 truncate" title={fileName}>{fileName}</p>

          <button onClick={copyLink} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary transition-all mb-4">
            {copied ? <Check size={14} className="text-emerald-500" /> : <Link2 size={14} />}
            {copied ? "Link copied" : "Copy link"}
          </button>

          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Send to an email</p>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendEmail(); }}
            placeholder="name@example.com"
            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 mb-2"
          />
          <button onClick={sendEmail} disabled={emailing || !email.trim()} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary transition-all disabled:opacity-40 mb-4">
            {emailing ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Email document
          </button>

          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notify a teammate</p>
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 appearance-none mb-2">
            <option value="">Select a teammate…</option>
            {employees.filter((e) => e.empId).map((e) => <option key={e.empId} value={e.empId}>{e.name} · {e.empId}</option>)}
          </select>
          <button onClick={notify} disabled={sending || !empId} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary transition-all disabled:opacity-40">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send notification
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
