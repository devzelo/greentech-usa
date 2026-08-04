import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Briefcase,
  FolderSearch,
  PlusCircle,
  FileEdit,
  FileText,
  User,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Handshake,
  Bell
} from "lucide-react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import gtFavicon from "@/assets/gt-favicon.png";
import { clearAuthToken, getAuthUser, fetchReminders } from "../../lib/api";
import { toast } from "../../lib/toast";
import GlobalSearch from "./GlobalSearch";
import GlobalEscClose from "./GlobalEscClose";
import Toaster from "./Toaster";
import NotificationBell from "./NotificationBell";
import NewRecordMenu from "./NewRecordMenu";

const allSidebarLinks = [
  { name: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  { name: "My Projects", icon: Briefcase, path: "/dashboard/my-projects" },
  { name: "All Projects", icon: FolderSearch, path: "/dashboard/all-projects" },
  { name: "Drafts", icon: FileEdit, path: "/dashboard/drafts" },
  { name: "New Project", icon: PlusCircle, path: "/dashboard/new-project" },
  { name: "Documents", icon: FileText, path: "/dashboard/documents" },
  { name: "General Agreements", icon: Handshake, path: "/dashboard/agreements" },
];

// Guests only see the projects they're assigned to and the document library.
const GUEST_LINKS = new Set(["My Projects", "Documents"]);

const secondaryLinks = [
  { name: "Reminders", icon: Bell, path: "/dashboard/reminders" },
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
  const sidebarLinks = isGuest ? baseLinks.filter((l) => GUEST_LINKS.has(l.name)) : baseLinks;
  const userInitial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  const activeLink = [...sidebarLinks, ...secondaryLinks].find(link => link.path === location.pathname)?.name || "Dashboard";

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <GlobalEscClose />
      <Toaster />

      {/* Logout confirm modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutConfirm(false)}
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
          width: isSidebarOpen ? 280 : isMobile ? 0 : 80,
          x: isMobile && !isSidebarOpen ? -280 : 0
        }}
        className={`fixed lg:relative flex-shrink-0 z-[110] h-screen bg-white border-r border-slate-200 flex flex-col overflow-hidden shadow-xl lg:shadow-none`}
      >
        {/* Sidebar Header — dark band behind the logo, matching the public top nav */}
        <div className={`h-20 flex items-center bg-slate-900 ${isSidebarOpen ? "px-6" : "justify-center px-2"}`}>
          {isSidebarOpen ? (
            <img
              src="/gt-logo-horizontal.png"
              alt="GreenTech USA"
              className="h-9 w-auto object-contain flex-shrink-0"
            />
          ) : (
            <img
              src={gtFavicon}
              alt="GreenTech USA"
              className="h-10 w-10 object-contain flex-shrink-0"
            />
          )}
        </div>

        {/* Sidebar Nav */}
        <div className="flex-grow overflow-y-auto py-6 px-4 space-y-8">
          <div className="space-y-1">
            {sidebarLinks.map((link) => (
              <Link 
                key={link.name} 
                to={link.path}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all group ${
                  location.pathname === link.path 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <link.icon size={22} className={location.pathname === link.path ? "text-primary" : "group-hover:text-primary transition-colors"} />
                {isSidebarOpen && <span className="font-bold text-sm tracking-wide">{link.name}</span>}
              </Link>
            ))}
          </div>

          <div>
             {isSidebarOpen && <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Account</p>}
             <div className="space-y-1">
                {secondaryLinks.map((link) => (
                  <Link 
                    key={link.name} 
                    to={link.path}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all group ${
                      location.pathname === link.path 
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" 
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span className="relative">
                      <link.icon size={22} className={location.pathname === link.path ? "text-primary" : "group-hover:text-primary transition-colors"} />
                      {/* Red overdue badge on the Reminders link — visible from anywhere. */}
                      {link.name === "Reminders" && overdueReminders > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">{overdueReminders > 9 ? "9+" : overdueReminders}</span>
                      )}
                    </span>
                    {isSidebarOpen && <span className="font-bold text-sm tracking-wide flex-grow">{link.name}</span>}
                    {isSidebarOpen && link.name === "Reminders" && overdueReminders > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{overdueReminders > 99 ? "99+" : overdueReminders}</span>
                    )}
                  </Link>
                ))}
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all group"
                >
                  <LogOut size={22} className="group-hover:text-red-600 transition-colors" />
                  {isSidebarOpen && <span className="font-bold text-sm tracking-wide">Logout</span>}
                </button>
             </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        {isSidebarOpen && me && (
          <Link
            to="/dashboard/profile"
            className="p-6 bg-slate-50 mt-auto block hover:bg-slate-100 transition-colors"
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
      </motion.aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="text-slate-400 font-medium">Dashboard</span>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="text-slate-900 font-bold tracking-tight">{activeLink}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <GlobalSearch />

            <NotificationBell />

            {!isGuest && <NewRecordMenu />}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto overflow-x-hidden p-6 lg:p-10">
           <Outlet />
        </div>
      </main>
    </div>
  );
}
