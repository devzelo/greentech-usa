import { motion } from "motion/react";
import { Download, FileText, ArrowRight } from "lucide-react";

const RESOURCES = [
  {
    title: "Company Factsheet",
    desc: "A one-page snapshot of who we are, what we do, and the impact we deliver. Perfect for quick stakeholder briefings.",
    href: "/downloads/greentech-factsheet.pdf",
    file: "greentech-factsheet.pdf",
  },
  {
    title: "Company Profile",
    desc: "Our full multi-page profile — about, vision, mission, core capabilities, and how to engage us on your next program.",
    href: "/downloads/greentech-profile.pdf",
    file: "greentech-profile.pdf",
  },
];

export default function CompanyResources() {
  return (
    <section id="resources" className="py-24 bg-white relative overflow-hidden scroll-mt-32">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-sm mb-6 uppercase tracking-wider">
            Company Resources
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Download our latest <span className="text-secondary">documents</span>
          </h2>
          <p className="text-lg text-slate-500">
            Everything you need to evaluate GreenTech USA — quickly and on paper.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {RESOURCES.map((r, i) => (
            <motion.a
              key={r.file}
              href={r.href}
              download={r.file}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:border-primary/20 transition-all flex flex-col gap-5"
            >
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-2xl bg-gt-gradient text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText size={26} />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PDF</span>
              </div>
              <div>
                <h3 className="font-display text-2xl font-bold text-slate-900 mb-3 group-hover:text-primary transition-colors">
                  {r.title}
                </h3>
                <p className="text-slate-500 leading-relaxed">{r.desc}</p>
              </div>
              <div className="mt-auto pt-5 border-t border-slate-100 flex items-center justify-between">
                <span className="flex items-center gap-2 text-primary font-bold text-sm group-hover:gap-3 transition-all">
                  Download PDF <ArrowRight size={16} />
                </span>
                <span className="w-10 h-10 rounded-full bg-slate-50 group-hover:bg-gt-gradient group-hover:text-white text-slate-400 flex items-center justify-center transition-all">
                  <Download size={16} />
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
