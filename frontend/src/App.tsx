/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import About from "./components/About";
import Services from "./components/Services";
import Projects from "./components/Projects";
import ProjectsMap from "./components/ProjectsMap";
import Partners from "./components/Partners";
import Community from "./components/Community";
import CompanyResources from "./components/CompanyResources";
import { useMeta } from "./hooks/useMeta";
import Footer from "./components/Footer";
import ServicesPage from "./components/ServicesPage";
import ProjectsPage from "./components/ProjectsPage";
import AboutPage from "./components/AboutPage";
import PrivacyPolicy from "./components/PrivacyPolicy";
import TermsAndConditions from "./components/TermsAndConditions";
import ContactPage from "./components/ContactPage";
import LoginPage from "./components/LoginPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DashboardOverview from "./components/dashboard/DashboardOverview";
import NewProjectForm from "./components/dashboard/NewProjectForm";
import ProjectList from "./components/dashboard/ProjectList";
import Documents from "./components/dashboard/Documents";
import Profile from "./components/dashboard/Profile";
import ProjectWorkspace from "./components/dashboard/ProjectWorkspace";
import UserManagement from "./components/dashboard/UserManagement";
import Reminders from "./components/dashboard/Reminders";
import RecycleBin from "./components/dashboard/RecycleBin";
import GeneralAgreements from "./components/dashboard/GeneralAgreements";
import Directory from "./components/dashboard/Directory";
import CompanyRegister from "./components/CompanyRegister";
import { motion, useScroll, useSpring } from "motion/react";
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { getAuthUser, getAuthToken, refreshFileToken } from "./lib/api";
import ErrorBoundary from "./components/ErrorBoundary";

// Guests may only reach My Projects, a project they're assigned to, Documents, and Profile.
function NonGuest({ children }: { children: ReactNode }) {
  const me = getAuthUser();
  if (me?.role === "subcontractor") return <Navigate to="/dashboard/my-projects" replace />;
  return <>{children}</>;
}

// Admin-only routes (user management). Everyone else is bounced to the dashboard.
function AdminOnly({ children }: { children: ReactNode }) {
  const me = getAuthUser();
  if (me?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const element = document.getElementById(hash.replace("#", ""));
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return null;
}

function HomePage() {
  useMeta({
    title: "Environmental Engineering & General Contracting",
    description:
      "GreenTech USA LLC — Virginia-based US-Government contractor delivering water, wastewater, HVAC, and renewable-energy infrastructure across the US, Africa, and the Middle East since 2009.",
  });
  return (
    <>
      <Hero />
      <About />
      <Services />
      <Projects />
      <ProjectsMap />
      <Partners />
      <CompanyResources />
      <Community />
    </>
  );
}

function Layout() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="relative min-h-screen">
      <ScrollToTop />
      {/* Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gt-gradient z-[60] origin-left"
        style={{ scaleX }}
      />

      <Navbar />

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/about-us" element={<AboutPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
          <Route path="/contact" element={<ContactPage />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

export default function App() {
  // Keep the /uploads access token fresh for logged-in sessions (24h expiry).
  useEffect(() => {
    if (getAuthToken()) void refreshFileToken();
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <ErrorBoundary>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Public vendor self-registration (CR-P-06d) — no login */}
        <Route path="/company/register/:token" element={<CompanyRegister />} />

        {/* Dashboard Routes */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<NonGuest><DashboardOverview /></NonGuest>} />
          <Route path="my-projects" element={<ProjectList mode="my" />} />
          <Route path="all-projects" element={<AdminOnly><ProjectList mode="all" /></AdminOnly>} />
          <Route path="drafts" element={<NonGuest><ProjectList mode="drafts" /></NonGuest>} />
          <Route path="projects/:id" element={<ProjectWorkspace />} />
          <Route path="new-project" element={<NonGuest><NewProjectForm /></NonGuest>} />
          <Route path="documents" element={<Documents />} />
          <Route path="directory" element={<NonGuest><Directory /></NonGuest>} />
          <Route path="users" element={<AdminOnly><UserManagement /></AdminOnly>} />
          <Route path="reminders" element={<Reminders />} />
          <Route path="recycle-bin" element={<NonGuest><RecycleBin /></NonGuest>} />
          <Route path="agreements" element={<NonGuest><GeneralAgreements /></NonGuest>} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Public Site Routes */}
        <Route path="*" element={<Layout />} />
      </Routes>
      </ErrorBoundary>
    </Router>
  );
}
