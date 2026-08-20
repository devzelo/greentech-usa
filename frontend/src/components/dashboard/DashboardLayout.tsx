import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, type MouseEvent as ReactMouseEvent } from "react";
import {
  LayoutDashboard,
  Briefcase,
  FolderSearch,
  FileEdit,
  FileText,
  User,
  Users,
  LogOut,
  Menu,
  ChevronRight,
  ChevronLeft,
  Handshake,
  Bell,
  Building2,
  Trash2
} from "lucide-react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import gtFavicon from "@/assets/gt-favicon.png";
import { clearAuthToken, getAuthUser, fetchReminders } from "../../lib/api";
import { toast } from "../../lib/toast";
import { isAppDirty, clearAppDirty, subscribeDirty } from "../../lib/dirtyState";
import { useDialogs } from "../../lib/useDialogs";
import GlobalSearch from "./GlobalSearch";
import GlobalEscClose from "./GlobalEscClose";
import Toaster from "./Toaster";
import NotificationBell from "./NotificationBell";
import NewRecordMenu from "./NewRecordMenu";
import PoweredByProjnell from "../PoweredByProjnell";

const allSidebarLinks = [
  { name: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  // All Projects sits above My Projects; it is admin-only (see filtering below).
  { name: "All Projects", icon: FolderSearch, path: "/dashboard/all-projects" },
  { name: "My Projects", icon: Briefcase, path: "/dashboard/my-projects" },
  { name: "Drafts", icon: FileEdit, path: "/dashboard/drafts" },
  { name: "Documents", icon: FileText, path: "/dashboard/documents" },
  { name: "Directory", icon: Building2, path: "/dashboard/directory" },
  { name: "General Agreements", icon: Handshake, path: "/dashboard/agreements" },
];

// Guests only see the projects they're assigned to and the document library.
const GUEST_LINKS = new Set(["My Projects", "Documents"]);

const secondaryLinks = [
  { name: "Reminders", icon: Bell, path: "/dashboard/reminders" },
  { name: "Archive & Bin", icon: Trash2, path: "/dashboard/recycle-bin" },
  { name: "Profile", icon: User, path: "/dashboard/profile" },
];

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Overdue reminder count for the sidebar badge — refreshed on navigation and every 2 minutes.
  const [overdueReminders, setOverdueReminders] = useState(0);
  useEffect(() => {
    let alive = true;
    const check = () => fetchReminders()
      .then((rs) => { if (alive) setOverdueReminders(rs.filter((r) => (r.status === "Pending" || r.status === "InProgress") && new Date(r.dueAt).getTime() < Date.now()).length); })
      .catch(() => {});
    check();
    const t = setInterval(check, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, [location.pathname]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const { confirm, dialogs } = useDialogs();
  // CR-P-12 — warn before in-app navigation (sidebar / logo) when a builder has unsaved work.
  // beforeunload covers refresh / browser-back / close; this covers clicks inside the app.
  const guardedGo = async (e: ReactMouseEvent, to: string) => {
    if (isMobile) setIsSidebarOpen(false);
    if (!isAppDirty()) return;                 // no unsaved work — let the <Link> navigate normally
    e.preventDefault();
    const ok = await confirm({
      title: "Leave without saving?",
      message: "You have unsaved changes on this page. If you leave now they'll be lost — save (or save as draft) first to keep them.",
      confirmLabel: "Leave", cancelLabel: "Stay", danger: true,
    });
    if (!ok) return;
    clearAppDirty();
    navigate(to);
  };

  // CR-P-12 — guard the browser BACK button too. beforeunload can't catch in-app (SPA) back
  // navigation, so while there are unsaved changes we keep a history "sentinel" and, when Back is
  // pressed, ask first — staying put on Cancel, going back for real on confirm.
  useEffect(() => {
    let armed = false;
    const arm = () => {
      if (isAppDirty() && !armed) { window.history.pushState(null, "", window.location.href); armed = true; }
      else if (!isAppDirty()) armed = false;
    };
    const unsub = subscribeDirty(arm);
    arm();
    const onPop = async () => {
      if (!isAppDirty()) return;            // nothing unsaved — allow the back normally
      const ok = await confirm({
        title: "Leave without saving?",
        message: "You have unsaved changes on this page. If you leave now they'll be lost — save (or save as draft) first to keep them.",
        confirmLabel: "Leave", cancelLabel: "Stay", danger: true,
      });
      if (ok) { clearAppDirty(); window.history.back(); }        // go back for real
      else { window.history.pushState(null, "", window.location.href); armed = true; }  // re-arm, stay put
    };
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("popstate", onPop); unsub(); };
  }, [confirm]);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const handleLogout = () => {
    clearAuthToken();
    toast("Logged out successfully.", "info");
    navigate("/login");
  };

  const me = getAuthUser();
  const isGuest = me?.role === "subcontractor";
  const isAdmin = me?.role === "admin";
  // Admins get a "Users" management link appended to the main nav.
  const baseLinks = isAdmin
    ? [...allSidebarLinks, { name: "Users", icon: Users, path: "/dashboard/users" }]
    : allSidebarLinks;
  // All Projects is admin-only; everyone else works from My Projects.
  const roleLinks = isAdmin ? baseLinks : baseLinks.filter((l) => l.name !== "All Projects");
  const sidebarLinks = isGuest ? roleLinks.filter((l) => GUEST_LINKS.has(l.name)) : roleLinks;
  // Guests don't get the Archive & Bin (staff-only).
  const secondaryNav = isGuest ? secondaryLinks.filter((l) => l.name !== "Archive & Bin") : secondaryLinks;
  const userInitial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  // Breadcrumb: "Overview" is the root (→ /dashboard). On the overview page itself it shows just
  // once; on any other page it reads "Overview › <Page>", both crumbs clickable.
  const isOverview = location.pathname === "/dashboard";
  const activeNav = [...sidebarLinks, ...secondaryLinks].find(link => link.path === location.pathname);
  const seg = location.pathname.replace(/^\/dashboard\/?/, "").split("/")[0];
  const activeLink = activeNav?.name || (seg ? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ") : "Overview");

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <GlobalEscClose />
      <Toaster />
      {dialogs}

      {/* Logout confirm modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-5">
                <LogOut size={26} />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mb-2">Log out?</h3>
              <p className="text-sm text-slate-500 mb-8">
                You&apos;ll be returned to the sign-in screen. Any unsaved work in open tabs will be lost.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors"
                >
                  Log out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: isSidebarOpen ? 244 : isMobile ? 0 : 72,
          x: isMobile && !isSidebarOpen ? -244 : 0
        }}
        className={`fixed lg:relative flex-shrink-0 z-[110] h-screen bg-white border-r border-slate-200 flex flex-col overflow-hidden shadow-xl lg:shadow-none`}
      >
        {/* Sidebar Header — dark band behind the logo, matching the public top nav.
            Clicking the logo goes to Overview; the arrow collapses/expands the panel. */}
        <div className={`h-20 flex items-center bg-slate-900 ${isSidebarOpen ? "px-5 justify-between" : "justify-center px-2"}`}>
          {isSidebarOpen ? (
            <>
              <Link to="/dashboard" onClick={(e) => guardedGo(e, "/dashboard")} className="min-w-0 flex-shrink" aria-label="Go to Overview">
                <img
                  src="/gt-logo-horizontal.png"
                  alt="GreenTech USA"
                  className="h-7 w-auto max-w-full object-contain"
                />
              </Link>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <ChevronLeft size={20} />
              </button>
            </>
          ) : (
            <Link to="/dashboard" onClick={(e) => guardedGo(e, "/dashboard")} className="flex-shrink-0" aria-label="Go to Overview">
              <img
                src={gtFavicon}
                alt="GreenTech USA"
                className="h-8 w-8 object-contain"
              />
            </Link>
          )}
        </div>

        {/* Sidebar Nav */}
        <div className={`flex-grow overflow-y-auto overflow-x-hidden py-5 space-y-6 ${isSidebarOpen ? "px-3" : "px-2"}`}>
          <div className="space-y-0.5">
            {sidebarLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                onClick={(e) => guardedGo(e, link.path)}
                title={!isSidebarOpen ? link.name : undefined}
                className={`flex items-center gap-3 rounded-lg transition-all group ${isSidebarOpen ? "px-3 py-2.5" : "justify-center px-0 py-2.5"} ${
                  location.pathname === link.path
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <link.icon size={20} className={location.pathname === link.path ? "text-primary" : "group-hover:text-primary transition-colors"} />
                {isSidebarOpen && <span className="font-bold text-[13px] tracking-wide">{link.name}</span>}
              </Link>
            ))}
          </div>

          <div>
             {isSidebarOpen && <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Account</p>}
             <div className="space-y-0.5">
                {secondaryNav.map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    onClick={(e) => guardedGo(e, link.path)}
                    title={!isSidebarOpen ? link.name : undefined}
                    className={`flex items-center gap-3 rounded-lg transition-all group ${isSidebarOpen ? "px-3 py-2.5" : "justify-center px-0 py-2.5"} ${
                      location.pathname === link.path
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span className="relative">
                      <link.icon size={20} className={location.pathname === link.path ? "text-primary" : "group-hover:text-primary transition-colors"} />
                      {/* Red overdue badge on the Reminders link — visible from anywhere. */}
                      {link.name === "Reminders" && overdueReminders > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">{overdueReminders > 9 ? "9+" : overdueReminders}</span>
                      )}
                    </span>
                    {isSidebarOpen && <span className="font-bold text-[13px] tracking-wide flex-grow">{link.name}</span>}
                    {isSidebarOpen && link.name === "Reminders" && overdueReminders > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{overdueReminders > 99 ? "99+" : overdueReminders}</span>
                    )}
                  </Link>
                ))}
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  title={!isSidebarOpen ? "Logout" : undefined}
                  className={`w-full flex items-center gap-3 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all group ${isSidebarOpen ? "px-3 py-2.5" : "justify-center px-0 py-2.5"}`}
                >
                  <LogOut size={20} className="group-hover:text-red-600 transition-colors" />
                  {isSidebarOpen && <span className="font-bold text-[13px] tracking-wide">Logout</span>}
                </button>
             </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        {isSidebarOpen && me && (
          <Link
            to="/dashboard/profile"
            onClick={(e) => guardedGo(e, "/dashboard/profile")}
            className="p-4 bg-slate-50 mt-auto block hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gt-gradient p-0.5 shadow-md flex-shrink-0">
                {me.avatarUrl ? (
                  <img src={me.avatarUrl} className="w-full h-full rounded-full border-2 border-white object-cover" alt="Avatar" />
                ) : (
                  <div className="w-full h-full rounded-full border-2 border-white bg-white flex items-center justify-center text-sm font-bold text-primary">
                    {userInitial}
                  </div>
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-900 truncate">{me.name}</p>
                <p className="text-[10px] text-slate-500 font-medium truncate uppercase tracking-tighter">
                  {me.empId || me.email}
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* Powered by Projnell — attribution at the very bottom of the panel (expanded only). */}
        {isSidebarOpen && (
          <div className={`px-4 py-3 border-t border-slate-100 flex justify-center ${me ? "" : "mt-auto"}`}>
            <PoweredByProjnell tone="light" card={false} size="sm" />
          </div>
        )}
      </motion.aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 sm:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 lg:px-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Only shown to REOPEN a collapsed panel (or open it on mobile); when the panel is
                open the toggle lives inside the sidebar next to the logo. */}
            {(!isSidebarOpen || isMobile) && (
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <Menu size={20} />
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2 text-sm">
                {isOverview ? (
                  <Link to="/dashboard" onClick={(e) => guardedGo(e, "/dashboard")} className="text-slate-900 font-bold tracking-tight hover:text-primary transition-colors">Overview</Link>
                ) : (
                  <>
                    <Link to="/dashboard" onClick={(e) => guardedGo(e, "/dashboard")} className="text-slate-400 font-medium hover:text-primary transition-colors">Overview</Link>
                    <ChevronRight size={14} className="text-slate-300" />
                    <Link to={location.pathname} className="text-slate-900 font-bold tracking-tight hover:text-primary transition-colors">{activeLink}</Link>
                  </>
                )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <GlobalSearch />

            <NotificationBell />

            {!isGuest && <NewRecordMenu />}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-10">
           <Outlet />
        </div>
      </main>
    </div>
  );
}
