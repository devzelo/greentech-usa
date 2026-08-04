import { motion } from "motion/react";
import { useState } from "react";
import { Upload, Send } from "lucide-react";

interface ContactFormProps {
  initialService?: string;
}

export default function ContactForm({ initialService = "" }: ContactFormProps) {
  const [subject, setSubject] = useState(initialService);

  const services = [
    "General Contractor",
    "Environmental Engineering",
    "Water Treatment Plant (WTP)",
    "Wastewater Treatment Plant (WWTP)",
    "Operation & Maintenance (O&M)",
    "Commercial HVAC Services",
    "Laboratory Services",
    "Prevention Maintenance"
  ];

  return (
    <section id="contact-form" className="py-24 bg-white">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-slate-900 mb-4">Quick Inquiry</h2>
          <p className="text-slate-500 text-lg">Have a question or want to work with us? Send us a message!</p>
        </div>

        <div className="bg-slate-50 rounded-[3rem] p-8 md:p-12 shadow-sm border border-slate-100">
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Name</label>
                <input 
                  type="text" 
                  placeholder="Your full name"
                  className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Email <span className="text-red-500">*</span></label>
                <input 
                  type="email" 
                  required
                  placeholder="your@email.com"
                  className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Phone Number</label>
                <input 
                  type="tel" 
                  placeholder="+1 (000) 000-0000"
                  className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Subject</label>
                <select 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none appearance-none"
                >
                  <option value="">Select a service</option>
                  {services.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Add attachment</label>
              <div className="w-full px-6 py-10 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-primary hover:text-primary transition-all cursor-pointer">
                <Upload size={32} />
                <span className="text-sm font-medium">Click or drag to upload files</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Your Message <span className="text-red-500">*</span></label>
              <textarea 
                required
                rows={5}
                placeholder="How can we help you?"
                className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none resize-none"
              ></textarea>
            </div>

            <button 
              type="submit"
              className="w-full py-5 rounded-2xl bg-gt-gradient text-white font-bold text-lg hover:shadow-xl hover:shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Send size={20} />
              Send Message
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
