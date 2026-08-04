import { motion } from "motion/react";
import { 
  Leaf, 
  Droplets, 
  Settings, 
  Building2, 
  Wind, 
  PlusCircle,
  ArrowUpRight
} from "lucide-react";

import { useNavigate } from "react-router-dom";

const coreServices = [
  { icon: Leaf, title: "Environmental Engineering", desc: "Expert assessments and smart creative thinking for sustainable solutions.", path: "/services" },
  { icon: Droplets, title: "Water & Wastewater", desc: "Design, construction, and maintenance of clean water systems.", path: "/services" },
  { icon: Settings, title: "O&M Services", desc: "Reliable and efficient operational support for critical infrastructure.", path: "/services" },
  { icon: Building2, title: "General Contracting", desc: "Managing and executing complex projects within budget and time.", path: "/services" },
  { icon: Wind, title: "Commercial HVAC", desc: "Energy efficient heating, ventilation, and cooling solutions.", path: "/services" },
  { icon: PlusCircle, title: "Additional Services", desc: "Comprehensive suite including system upgrades and commissioning.", path: "/services" }
];

const featuredServices = [
  { 
    title: "Environmental Protection", 
    desc: "Implementing advanced strategies for regional environmental preservation and regulatory compliance.",
    category: "Strategic"
  },
  { 
    title: "Treatment Plant - India", 
    desc: "Massive scale water treatment facility delivering clean water to millions in urban environments.",
    category: "Infrastructure"
  },
  { 
    title: "Eco-Industrial Systems", 
    desc: "Circular economy engineering for industrial zones to minimize waste and maximize resource utility.",
    category: "Sustainability"
  },
  { 
    title: "HVAC Optimization", 
    desc: "Next-generation climate control systems for high-performance government and commercial buildings.",
    category: "Energy"
  }
];

export default function Services() {
  const navigate = useNavigate();

  return (
    <section id="services" className="py-24 bg-white relative">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-6"> Our Core <span className="text-primary">Capabilities</span></h2>
          <p className="text-lg text-slate-500">
            Our smart and creative thinking that we provide to our clients every day, 
            ensuring high-performance results across global markets.
          </p>
        </div>

        {/* Icon Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-24">
          {coreServices.map((service, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-8 rounded-3xl border border-slate-100 hover:border-primary/20 hover:bg-slate-50 transition-all group"
            >
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-primary mb-6 group-hover:bg-gt-gradient group-hover:text-white transition-all">
                <service.icon size={32} />
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900 mb-4">{service.title}</h3>
              <p className="text-slate-500 leading-relaxed mb-6">
                {service.desc}
              </p>
              <button 
                onClick={() => navigate(service.path || "/services")}
                className="flex items-center gap-2 text-primary font-bold group-hover:gap-3 transition-all"
              >
                Explore Service <ArrowUpRight size={18} />
              </button>
            </motion.div>
          ))}
        </div>

        {/* Featured Section Banner */}
        <div className="bg-slate-900 rounded-[3rem] p-8 md:p-16 relative overflow-hidden">
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block px-4 py-1.5 rounded-full bg-primary/20 text-primary font-bold text-xs uppercase mb-6">
                Market Leadership
              </div>
              <h3 className="text-3xl md:text-5xl font-display font-bold text-white mb-6 leading-tight">
                Developing robust strategies for <span className="text-gt-gradient">Growth</span>
              </h3>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                Take the next step in your infrastructure journey. Our expert guidance 
                helps you navigate complex environmental challenges.
              </p>
              <button 
                onClick={() => navigate("/contact")}
                className="px-8 py-4 bg-gt-gradient text-white font-bold rounded-full hover:scale-105 transition-transform"
              >
                Request Inquiry
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {featuredServices.map((feat, i) => (
                <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl">
                  <span className="text-[10px] uppercase tracking-widest text-primary font-bold">{feat.category}</span>
                  <h4 className="text-white font-bold my-2">{feat.title}</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
