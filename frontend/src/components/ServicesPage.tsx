import { motion } from "motion/react";
import { ChevronRight, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMeta } from "../hooks/useMeta";
import ViewToggle, { useViewMode } from "./ViewToggle";
import { detailedServices, FALLBACK_SERVICE_IMAGE } from "../data/services";

export default function ServicesPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useViewMode("grid");
  useMeta({
    title: "Our Services — Water, Wastewater, HVAC & More",
    description:
      "Explore GreenTech USA's full suite of engineering services — general contracting, environmental engineering, water (WTP) and wastewater (WWTP) treatment, commercial HVAC, laboratory services, and operations & maintenance.",
  });

  const handleContactClick = (serviceTitle: string) => {
    navigate(`/contact?service=${encodeURIComponent(serviceTitle)}`);
  };

  return (
    <div className="bg-white">
      {/* Services Hero */}
      <section className="relative h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden pt-40 md:pt-32">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-slate-950/50 z-10" />
          <img
            src="https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&q=80&w=2000"
            alt="Services Banner"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1454944338482-a69bb95894af?auto=format&fit=crop&q=80&w=2000";
            }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-20 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto"
          >
            <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 tracking-tight leading-[1.1]">
              Staying Ahead of <span className="text-gt-gradient">Schedule</span>
            </h1>
            <p className="text-base md:text-lg font-normal opacity-90 leading-relaxed max-w-3xl mx-auto mb-10">Getting the Job Done Right.</p>
            <button
              onClick={() => navigate("/contact")}
              className="px-8 py-4 rounded-full bg-gt-gradient text-white font-bold text-lg hover:scale-105 transition-transform shadow-xl shadow-primary/20"
            >
              Get Enquiry
            </button>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white relative z-30 -mt-20">
        <div className="container mx-auto px-6">
          <div className="glass max-w-5xl mx-auto rounded-[3.5rem] p-8 md:p-16 shadow-2xl flex flex-wrap justify-around items-center gap-8 border-white/50">
            <div className="text-center group">
              <p className="text-5xl font-display font-bold text-gt-gradient mb-2 group-hover:scale-110 transition-transform">150+</p>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Projects Completed</p>
            </div>
            <div className="w-px h-16 bg-slate-200 hidden md:block" />
            <div className="text-center group">
              <p className="text-5xl font-display font-bold text-gt-gradient mb-2 group-hover:scale-110 transition-transform">150+</p>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Ongoing Projects</p>
            </div>
            <div className="w-px h-16 bg-slate-200 hidden md:block" />
            <div className="text-center group">
              <p className="text-5xl font-display font-bold text-gt-gradient mb-2 group-hover:scale-110 transition-transform">50+</p>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Active Deals</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className={`${viewMode === "grid" ? "" : "max-w-4xl"} mx-auto`}>
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">Services</h2>
            <p className="text-slate-500 text-lg">We have implemented many projects of similar natures across the world</p>
            <div className="flex justify-center mt-6">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </div>
          </div>

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {detailedServices.map((service, i) => (
                <motion.div
                  key={service.id}
                  id={service.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all group border border-slate-100 flex flex-col h-full scroll-mt-32"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                    <img
                      src={service.img}
                      alt={service.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = FALLBACK_SERVICE_IMAGE;
                      }}
                    />
                  </div>
                  <div className="p-8 flex flex-col flex-grow">
                    <h3 className="font-display text-xl font-bold text-slate-900 mb-4 h-14 flex items-center leading-tight">
                      {service.title}
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed mb-8 flex-grow line-clamp-4">
                      {service.desc}
                    </p>
                    <button
                      onClick={() => handleContactClick(service.title)}
                      className="w-full py-4 rounded-full bg-gt-gradient text-white font-bold hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 group/btn"
                    >
                      Contact Now <ChevronRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {detailedServices.map((service, i) => (
                <motion.button
                  type="button"
                  key={service.id}
                  id={service.id}
                  onClick={() => handleContactClick(service.title)}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="group flex items-stretch text-left bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all scroll-mt-32"
                >
                  <div className="relative w-28 sm:w-36 flex-shrink-0 bg-slate-100">
                    <img
                      src={service.img}
                      alt={service.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = FALLBACK_SERVICE_IMAGE;
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-1.5">
                    <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {service.title}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 sm:line-clamp-3">
                      {service.desc}
                    </p>
                    <span className="mt-auto text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                      Contact Now <ChevronRight size={12} />
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center px-4 text-slate-300 group-hover:text-primary transition-colors">
                    <ArrowUpRight size={20} />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
          </div>
        </div>
      </section>
    </div>
  );
}
