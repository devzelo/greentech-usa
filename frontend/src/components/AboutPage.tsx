import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { Leaf, Droplets, Settings, Building2, Wind, PlusCircle, X, CheckCircle2 } from "lucide-react";

const aboutCards = [
  {
    icon: Leaf,
    title: "Environmental Engineering",
    shortDesc: "At GreenTech our best product is the smart and creative thinking that we provide to our clients every day.",
    detailedDesc: "GreenTech USA LLC provides comprehensive environmental engineering services. Our team of experts conducts thorough assessments and develops innovative solutions for complex environmental challenges. We focus on sustainability, regulatory compliance, and cost-effective management of natural resources. Our services include environmental site assessments, remediation design, and sustainability consulting tailored to both government and private sector needs.",
    color: "bg-emerald-50 text-emerald-600"
  },
  {
    icon: Droplets,
    title: "Water and Wastewater Treatment",
    shortDesc: "Specialized in the design, construction, operation, and maintenance of treatment plants, ensuring safe and clean water systems.",
    detailedDesc: "Safe and clean water is fundamental to any community. We specialize in the complete lifecycle of water and wastewater treatment facilities. From initial feasibility studies and design to construction management and long-term operation. We implement advanced filtration, purification, and reclamation technologies to ensure that water resources are managed responsibly and meet or exceed all quality standards.",
    color: "bg-blue-50 text-blue-600"
  },
  {
    icon: Settings,
    title: "Operation & Maintenance (O&M)",
    shortDesc: "Delivering reliable and efficient operational support for water and wastewater infrastructure.",
    detailedDesc: "Reliability is the cornerstone of our O&M services. We provide on-site management, preventive maintenance, and emergency response for critical infrastructure. Our proactive approach minimizes downtime, optimizes performance, and extends the lifespan of expensive equipment. We leverage data-driven maintenance strategies and highly trained personnel to ensure that facilities run at peak efficiency around the clock.",
    color: "bg-slate-50 text-slate-600"
  },
  {
    icon: Building2,
    title: "General Contractor Services",
    shortDesc: "Efficiently managing and executing construction projects, ensuring they are delivered on time and within budget constraints.",
    detailedDesc: "As a premier general contractor, we take full responsibility for the execution of construction projects. We manage complex supply chains, coordinate multiple sub-contractors, and maintain rigorous safety and quality standards on-site. Our project management team focused on transparency, scheduling precision, and budget control to deliver infrastructure that stands the test of time.",
    color: "bg-cyan-50 text-cyan-600"
  },
  {
    icon: Wind,
    title: "Commercial HVAC Services",
    shortDesc: "Implementing advanced HVAC solutions that promote energy efficiency and sustainable operations in building environments.",
    detailedDesc: "Modern commercial spaces require intelligent climate control. Our HVAC services encompass design, installation, and maintenance of high-efficiency heating, ventilation, and air conditioning systems. We specialize in large-scale chillers, rooftop units, and integrated building automation systems that reduce energy consumption while maintaining optimal indoor air quality and comfort.",
    color: "bg-sky-50 text-sky-600"
  },
  {
    icon: PlusCircle,
    title: "Additional Services offer by GT",
    shortDesc: "Offering a comprehensive suite of services including equipment supply, system upgrades, and commissioning.",
    detailedDesc: "Beyond our core areas, GreenTech USA offers specialized engineering and procurement services. This includes sourcing high-spec industrial equipment, performing complex system upgrades without disrupting operations, and managing the critical commissioning phase of new projects. We are a one-stop-shop for infrastructure needs, providing technical advisory and specialized hardware solutions globally.",
    color: "bg-teal-50 text-teal-600"
  }
];

import { useMeta as useDocMeta } from "../hooks/useMeta";

export default function AboutPage() {
  useDocMeta({
    title: "About Us — Premier Environmental Engineering Firm",
    description:
      "Established 2009, GreenTech USA LLC is a premier general contractor and environmental engineering firm based in Virginia. Learn about our vision, mission, history, and global engineering leadership.",
  });
  const [selectedCard, setSelectedCard] = useState<typeof aboutCards[0] | null>(null);

  return (
    <div className="bg-white">
      {/* About Hero */}
      <section className="relative h-[70vh] min-h-[500px] flex items-center justify-center overflow-hidden pt-40 md:pt-32">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-slate-950/60 z-10" />
          <img
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=2000"
            alt="About Banner"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&q=80&w=2000";
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
              About <span className="text-gt-gradient">Us</span>
            </h1>
            <p className="text-base md:text-lg font-normal opacity-90 leading-relaxed max-w-3xl mx-auto">
Established in 2009, GreenTech USA LLC is a premier general contractor and
environmental engineering firm based in Virginia, USA. We specialize in the
design, construction, and maintenance of water and wastewater treatment
facilities, comprehensive environmental assessments, and advanced
commercial HVAC systems. Our commitment to innovation, excellence, and
sustainability has positioned us as a key provider to the US government and
other clients across Africa and the Middle East, with expanding reach into global
markets.            </p>
          </motion.div>
        </div>
      </section>

      {/* About Cards Grid */}
      <section className="py-24 bg-slate-50 relative z-30 -mt-20 rounded-t-[4rem]">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {aboutCards.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setSelectedCard(card)}
                className="bg-white rounded-[2rem] p-8 md:p-10 shadow-sm border border-slate-100 hover:shadow-2xl hover:scale-[1.02] transition-all cursor-pointer group flex items-start gap-8"
              >
                <div className={`w-20 h-20 rounded-2xl ${card.color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                  <card.icon size={40} />
                </div>
                <div className="flex-grow">
                  <h3 className="font-display text-2xl font-bold text-slate-900 mb-4 group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-slate-500 leading-relaxed line-clamp-3">
                    {card.shortDesc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Modal Overlay */}
      <AnimatePresence>
        {selectedCard && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCard(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl relative"
              >
                <button 
                  onClick={() => setSelectedCard(null)}
                  className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 transition-colors z-10"
                >
                  <X size={24} className="text-slate-500" />
                </button>

                <div className={`h-40 ${selectedCard.color} flex items-center justify-center relative overflow-hidden`}>
                   <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent" />
                   <selectedCard.icon size={64} className="relative z-10" />
                </div>

                <div className="p-10 md:p-12">
                   <h3 className="font-display text-3xl font-bold text-slate-900 mb-6">
                     {selectedCard.title}
                   </h3>
                   <div className="space-y-6">
                     <p className="text-slate-600 text-lg leading-relaxed">
                       {selectedCard.detailedDesc}
                     </p>
                     <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 text-slate-500 font-medium">
                          <CheckCircle2 className="text-primary" size={20} /> Professional Excellence
                        </div>
                        <div className="flex items-center gap-3 text-slate-500 font-medium">
                          <CheckCircle2 className="text-primary" size={20} /> Sustainability Focused
                        </div>
                        <div className="flex items-center gap-3 text-slate-500 font-medium">
                          <CheckCircle2 className="text-primary" size={20} /> Global Experience
                        </div>
                        <div className="flex items-center gap-3 text-slate-500 font-medium">
                          <CheckCircle2 className="text-primary" size={20} /> Innovation Driven
                        </div>
                     </div>
                   </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
