import { motion } from "motion/react";
import { ArrowRight, Waves, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import heroBackground from "@/assets/Environmental Engineering Facility.png";
import AnnouncementsPanel from "./AnnouncementsPanel";

export default function Hero() {
  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-32 md:pt-40">
      {/* Background with parallax-like feel */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-slate-950/40 z-10" />
        <img
          src={heroBackground}
          alt="Environmental Engineering Facility"
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-white to-transparent z-20" />
      </div>

      {/* Admin-managed announcements — a sticky bottom-right badge, home page only */}
      <AnnouncementsPanel />

      <div className="container mx-auto px-6 relative z-30 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md text-white text-sm font-medium mb-8"
          >
            <ShieldCheck size={16} className="text-secondary" />
            <span>Trusted Global Infrastructure Partner</span>
          </motion.div>
          
          <h1 className="font-display text-5xl md:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
            Advanced <span className="text-gt-gradient">Environmental</span> Engineering
          </h1>
          
          <p className="text-lg md:text-xl text-slate-100 mb-10 max-w-2xl mx-auto leading-relaxed opacity-90">
            Expertise in assessments, impact studies, and pollution control 
            to meet the world's most stringent environmental standards.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/services" className="w-full sm:w-auto px-8 py-4 rounded-full bg-gt-gradient text-white font-bold text-lg hover:scale-105 transition-transform shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group">
              Explore Our Solutions
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/projects" className="w-full sm:w-auto px-8 py-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold text-lg hover:bg-white/20 transition-all flex items-center justify-center gap-2">
              <Waves size={20} />
              Our Projects
            </Link>
          </div>
        </motion.div>

        {/* Stats / Features subtle overlay */}
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 max-w-5xl mx-auto"
        >
          {[
            { label: "Founded", value: "2009" },
            { label: "Global Presence", value: "Africa & ME" },
            { label: "Specialty", value: "HVAC & Water" },
            { label: "Compliance", value: "US Standards" }
          ].map((stat, i) => (
            <div key={i} className="glass p-6 rounded-3xl text-left border-white/10 group hover:border-primary/50 transition-colors">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-1">{stat.label}</p>
              <p className="text-xl font-display font-bold text-slate-800">{stat.value}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
