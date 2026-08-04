import { motion } from "motion/react";
import { Phone, MessageSquare, Mail } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import ContactForm from "./ContactForm";
import { useMeta } from "../hooks/useMeta";
import { getServiceImage, FALLBACK_SERVICE_IMAGE } from "../data/services";

export default function ContactPage() {
  const [searchParams] = useSearchParams();
  const service = searchParams.get("service");
  useMeta({
    title: service ? `Contact Us About ${service}` : "Contact Us",
    description: service
      ? `Get in touch with GreenTech USA about ${service}. Call, WhatsApp, or email our team for a quote or technical consultation.`
      : "Get in touch with GreenTech USA. Call, WhatsApp, or email our team for a project quote, technical consultation, or partnership inquiry. Headquartered in Chantilly, Virginia.",
  });
  const heroImage = getServiceImage(service);
  const displayTitle = service || "Contact Us";
  const displayDescription = service
    ? `Inquiry regarding our ${service} solutions. We provide primary oversight and expertise to ensure project success from start to finish.`
    : "Have a question or want to work with us? Send us a message and our team will get back to you shortly.";

  const contactInfo = [
    { icon: Phone, label: "Call us at", value: "+1-125-258-3525", href: "tel:+11252583525" },
    { icon: MessageSquare, label: "WhatsApp Contact", value: "+1-125-258-3525", href: "https://wa.me/11252583525" },
    { icon: Mail, label: "You can email us here", value: "info@gt-usa.com", href: "mailto:info@gt-usa.com" },
  ];

  return (
    <div className="bg-white pb-24">
      {/* Contact Hero */}
      <section className="relative h-[60vh] min-h-[450px] flex items-center justify-center overflow-hidden pt-24 md:pt-32">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-slate-950/60 z-10" />
          <img
            key={heroImage}
            src={heroImage}
            alt={service ? `${service} — GreenTech USA` : "Get in touch"}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_SERVICE_IMAGE;
            }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-20">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-5xl md:text-7xl font-bold text-white text-center tracking-tight leading-[1.1] mb-6"
          >
            {displayTitle}
          </motion.h1>

          <p className="text-base md:text-lg font-normal opacity-90 leading-relaxed max-w-3xl mx-auto text-center text-white">
            {displayDescription}
          </p>
        </div>
      </section>

      {/* Info Bar */}
      <div className="container mx-auto px-6 -mt-10 relative z-30">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 flex flex-col md:flex-row justify-around items-center gap-8">
          {contactInfo.map((info, i) => {
            const Icon = info.icon;
            const isExternal = info.href.startsWith("http");
            return (
              <a
                key={i}
                href={info.href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="flex flex-col md:flex-row items-center gap-3 text-center md:text-left group"
              >
                <Icon size={18} className="text-primary group-hover:scale-110 transition-transform" />
                <span className="text-slate-900 font-bold text-sm">{info.label}:</span>
                <span className="text-primary font-bold text-sm group-hover:underline">{info.value}</span>
              </a>
            );
          })}
        </div>
      </div>

      <ContactForm initialService={service || ""} />
    </div>
  );
}
