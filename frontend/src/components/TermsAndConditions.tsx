import { motion } from "motion/react";
import { useMeta } from "../hooks/useMeta";

export default function TermsAndConditions() {
  useMeta({
    title: "Terms & Conditions",
    description:
      "Terms and conditions governing the use of GreenTech USA's website and services. Please review these terms carefully before engaging with our content or contacting us.",
  });
  return (
    <div className="bg-white pb-24">
      {/* Hero Section */}
      <section className="relative h-[40vh] min-h-[300px] flex items-center justify-center overflow-hidden pt-24 md:pt-32">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-slate-950/60 z-10" />
          <img
            src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&q=80&w=2000"
            alt="Terms and Conditions"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=2000";
            }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-20 text-center text-white">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
          >
            Terms & <span className="text-gt-gradient">Conditions</span>
          </motion.h1>
          <p className="text-base md:text-lg font-normal opacity-90 leading-relaxed max-w-3xl mx-auto">
            Please read these terms carefully before using our services.
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-20">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="prose prose-slate prose-lg max-w-none">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">1. Acceptance of Terms</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              By accessing our website or utilizing the services of GreenTech USA LLC, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use our services.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">2. Intellectual Property</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              All content on this website, including text, graphics, logos, and images, is the property of GreenTech USA LLC and is protected by copyright and other intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">3. Use of Services</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              Our services are provided for professional use in accordance with the contracts and agreements signed between GreenTech USA LLC and its clients. Any misuse of our services or website for illegal or unauthorized purposes is strictly prohibited.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">4. Limitation of Liability</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              GreenTech USA LLC shall not be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use our services or website, even if we have been advised of the possibility of such damages.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">5. Governing Law</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              These terms shall be governed by and construed in accordance with the laws of the Commonwealth of Virginia, USA, without regard to its conflict of law provisions.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">6. Changes to Terms</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              We reserve the right to modify these Terms and Conditions at any time. Changes will be effective immediately upon posting on our website. Your continued use of our services constitutes acceptance of the modified terms.
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mb-6">Contact Us</h2>
            <p className="text-slate-600 leading-relaxed font-medium">
              GreenTech USA LLC<br />
              Chantilly, VA<br />
              Email: info@gt-usa.com
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
