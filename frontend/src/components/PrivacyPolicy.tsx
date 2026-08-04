import { motion } from "motion/react";
import { useMeta } from "../hooks/useMeta";

export default function PrivacyPolicy() {
  useMeta({
    title: "Privacy Policy",
    description:
      "GreenTech USA's privacy policy — how we collect, use, and safeguard your information when you visit our site or engage with our services.",
  });
  return (
    <div className="bg-white pb-24">
      {/* Hero Section */}
      <section className="relative h-[40vh] min-h-[300px] flex items-center justify-center overflow-hidden pt-24 md:pt-32">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-slate-950/60 z-10" />
          <img
            src="https://images.unsplash.com/photo-1507679799987-c7128094880c?auto=format&fit=crop&q=80&w=2000"
            alt="Privacy Policy"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&q=80&w=2000";
            }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-20 text-center text-white">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
          >
            Privacy <span className="text-gt-gradient">Policy</span>
          </motion.h1>
          <p className="text-base md:text-lg font-normal opacity-90 leading-relaxed max-w-3xl mx-auto">
            Your privacy is important to us. This policy outlines how we handle your personal information.
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-20">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="prose prose-slate prose-lg max-w-none">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">Introduction</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              At GreenTech USA LLC, we are committed to protecting the privacy and security of our clients and website visitors. This Privacy Policy explains how we collect, use, and safeguard your personal data when you interact with our services and website.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">Information Collection</h2>
            <p className="text-slate-600 mb-4 leading-relaxed">
              We may collect personal information such as:
            </p>
            <ul className="list-disc pl-6 text-slate-600 mb-8 space-y-2">
              <li>Name and contact details (email, phone number, address)</li>
              <li>Company information</li>
              <li>Details regarding your project inquiries</li>
              <li>Technical data like IP addresses and browsing behavior via cookies</li>
            </ul>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">Use of Information</h2>
            <p className="text-slate-600 mb-4 leading-relaxed">
              The information we collect is used to:
            </p>
            <ul className="list-disc pl-6 text-slate-600 mb-8 space-y-2">
              <li>Provide and improve our services</li>
              <li>Respond to inquiries and project requests</li>
              <li>Maintain business records and comply with legal obligations</li>
              <li>Analyze website performance and user experience</li>
            </ul>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">Data Security</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              We implement industry-standard security measures to protect your information from unauthorized access, loss, or disclosure. However, no method of transmission over the internet or electronic storage is 100% secure.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">Third-Party Disclosure</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              We do not sell or trade your personal information to third parties. We may share information with trusted partners who assist us in operating our business or providing services to you, provided they agree to keep this information confidential.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at info@gt-usa.com.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
