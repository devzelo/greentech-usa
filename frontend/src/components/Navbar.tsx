import { motion } from "motion/react";
import { Menu, X, LogIn } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { name: "Home", path: "/" },
  { name: "Services", path: "/services" },
  { name: "Projects", path: "/projects" },
  { name: "About Us", path: "/about-us" },
  { name: "Contact Us", path: "/contact" },
  { name: "Downloads", path: "/#resources" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 pt-4">
      <div className="container mx-auto px-6">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full rounded-full px-6 py-3 flex items-center justify-between shadow-lg bg-slate-900/95 backdrop-blur-md border border-white/10"
      >
        <Link to="/" className="flex items-center shrink-0">
          <img
            src="/gt-logo-horizontal.png"
            alt="GreenTech USA"
            className="h-9 md:h-10 w-auto object-contain"
          />
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const isDownloads = item.name === "Downloads";
            const isActive =
              !isDownloads &&
              (item.path === location.pathname ||
                (item.path === "/" && location.pathname === "/"));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`font-medium transition-colors text-sm relative ${
                  isActive ? "text-primary" : "text-slate-200 hover:text-primary"
                }`}
              >
                {item.name}
                {isActive && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <Link 
            to="/login"
            className="hidden sm:flex items-center gap-2 px-5 py-2 rounded-full bg-gt-gradient text-white text-sm font-semibold hover:shadow-lg hover:shadow-primary/20 transition-all"
          >
            <LogIn size={16} />
            <span>Login</span>
          </Link>
          <button
            className="md:hidden p-2 text-slate-200"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X /> : <Menu />}
          </button>
        </div>
      </motion.div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-20 left-6 right-6 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl md:hidden"
        >
          <div className="flex flex-col gap-4">
             {NAV_ITEMS.map((item) => {
              const isDownloads = item.name === "Downloads";
              const isActive =
                !isDownloads &&
                (item.path === location.pathname ||
                  (item.path === "/" && location.pathname === "/"));
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`text-lg font-medium ${
                    isActive ? "text-primary" : "text-slate-200"
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </Link>
              );
            })}
            <Link 
              to="/login"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gt-gradient text-white font-semibold"
            >
              <LogIn size={18} />
              <span>Login</span>
            </Link>
          </div>
        </motion.div>
      )}
    </nav>
  );
}
