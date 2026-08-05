import { motion } from "motion/react";
import { 
  Bell, 
  Lock, 
  Globe, 
  Smartphone, 
  Eye, 
  Trash2, 
  ShieldAlert,
  ChevronRight,
  Database
} from "lucide-react";

export default function Settings() {
  const sections = [
    { 
      title: "Security & Access", 
      icon: Lock, 
      items: [
        { label: "Two-Factor Authentication", desc: "Add an extra layer of security to your account", type: "toggle", value: true },
        { label: "Login Passcode", desc: "Require a PIN when opening the app on mobile", type: "toggle", value: false },
        { label: "Change Password", desc: "Last changed 3 months ago", type: "link" }
      ]
    },
    { 
      title: "Notifications", 
      icon: Bell, 
      items: [
        { label: "Project Updates", desc: "Push & email alerts for milestone completions", type: "toggle", value: true },
        { label: "Document Comments", desc: "Notify when someone tags you in an asset", type: "toggle", value: true },
        { label: "Marketing Site Status", desc: "Daily digest of portfolio traffic", type: "toggle", value: false }
      ]
    },
    { 
      title: "Privacy & Data", 
      icon: Database, 
      items: [
        { label: "Publish Defaults", desc: "Always set new projects to internal by default", type: "toggle", value: true },
        { label: "Data Portability", desc: "Download a copy of your project history", type: "action", action: "Download JSON" },
        { label: "Deactivate Account", desc: "Temporarily disable access to this portal", type: "danger" }
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-10">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-2">Portal Settings</h1>
        <p className="text-slate-500 font-medium">Configure your workspace preferences and security clearances.</p>
      </div>

      <div className="space-y-8">
        {sections.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm"
          >
            <div className="px-10 py-6 bg-slate-50/50 border-b border-slate-50 flex items-center gap-4">
               <div className="p-2.5 bg-white rounded-xl shadow-sm text-primary">
                 <section.icon size={20} />
               </div>
               <h2 className="text-lg font-display font-bold text-slate-900">{section.title}</h2>
            </div>
            
            <div className="divide-y divide-slate-50">
              {section.items.map((item) => (
                <div key={item.label} className="px-10 py-8 flex items-center justify-between hover:bg-slate-50/30 transition-colors">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-400 font-medium">{item.desc}</p>
                  </div>
                  
                  <div>
                    {item.type === "toggle" && (
                      <button 
                        className={`w-12 h-7 rounded-full relative transition-all ${item.value ? "bg-primary shadow-lg shadow-primary/20" : "bg-slate-200"}`}
                      >
                         <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${item.value ? "left-6" : "left-1"}`} />
                      </button>
                    )}
                    {item.type === "link" && (
                      <ChevronRight className="text-slate-300" size={20} />
                    )}
                    {item.type === "action" && (
                       <button className="text-xs font-bold text-primary px-4 py-2 bg-primary/5 rounded-xl hover:bg-primary/10 transition-colors">
                         {item.action}
                       </button>
                    )}
                    {item.type === "danger" && (
                       <button className="text-xs font-bold text-red-500 px-4 py-2 border border-red-100 rounded-xl hover:bg-red-50 transition-colors flex items-center gap-2">
                         <ShieldAlert size={14} /> Proceed
                       </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 flex justify-between items-center px-4">
         <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest leading-none">
           Environment: Production • Version 2.0.4 - Alpha
         </p>
         <button className="text-xs font-bold text-slate-400 hover:text-slate-900 underline transition-colors">
           Reset all preferences to default
         </button>
      </div>
    </div>
  );
}
