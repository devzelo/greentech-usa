import { motion } from "motion/react";
import { CheckCircle2, History, Target, Users2 } from "lucide-react";

export default function About() {
  return (
    <section id="about-us" className="py-24 bg-slate-50 relative overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:w-1/2"
          >
            <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-sm mb-6 uppercase tracking-wider">
              About GreenTech USA
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-8 leading-tight">
              A Premier Global Contractor & <span className="text-secondary">Engineering</span> Firm
            </h2>
            
            <div className="space-y-6 text-slate-600 text-lg leading-relaxed">
              <p>
                Established in 2009, GreenTech USA LLC is a premier general contractor and environmental engineering firm based in Virginia, USA. We specialize in the design, construction, and maintenance of water and wastewater treatment facilities.
              </p>
              <p>
                Our commitment to innovation, excellence, and sustainability has positioned us as a key provider to the US government and other clients across Africa and the Middle East, with expanding reach into global markets.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-12">
              {[
                { icon: History, title: "15+ Years", desc: "Of proven excellence" },
                { icon: Target, title: "Precision", desc: "Technical accuracy" },
                { icon: Users2, title: "Global Team", desc: "Expert engineers" },
                { icon: CheckCircle2, title: "Certified", desc: "US Gov standards" }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm border border-slate-100">
                    <item.icon size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{item.title}</h4>
                    <p className="text-sm text-slate-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="lg:w-1/2 relative"
          >
            <div className="relative z-10 rounded-2xl overflow-hidden shadow-2xl">
              <img
                src="/about-greentech-usa.png"
                alt="About GreenTech USA"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Decorative elements */}
            <div className="absolute -top-10 -right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl z-0" />
            <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-secondary/10 rounded-full blur-3xl z-0" />

            <div className="absolute -bottom-6 -right-6 bg-white p-5 rounded-2xl z-20 shadow-xl max-w-[260px] hidden sm:block border border-slate-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-gt-gradient flex items-center justify-center text-white flex-shrink-0">
                  <CheckCircle2 size={18} />
                </div>
                <h5 className="font-bold text-slate-900 text-sm">Sustainability First</h5>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Our ultimate goal is to contribute to global environmental responsibility.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
