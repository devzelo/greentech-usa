import { motion } from "motion/react";
import { Quote, Calendar, MapPin } from "lucide-react";

const testimonials = [
  {
    name: "Amelia Joseph",
    role: "Chief Manager",
    content: "My vision came alive effortlessly. Their blend of casual and professional approach made the process a breeze. Creativity flowed, and the results were beyond my expectations.",
    img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150"
  },
  {
    name: "Jacob Joshua",
    role: "Director of Operations",
    content: "I found the digital expertise I needed. Their creative-professional balance exceeded expectations. Friendly interactions, exceptional outcomes. It's got to be GreenTech!",
    img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150"
  }
];

const announcements = [
  {
    title: "Overseas Small Business Conference",
    date: "Nov 14-15, 2023",
    location: "Bangkok, Thailand",
    desc: "GreenTech USA proudly joined the M/RDMA Office Overseas Small Business Conference in Bangkok, hosted to connect U.S. government agencies with qualified small business partners working across Asia-Pacific. Our delegation participated in panel discussions on sustainable water infrastructure, met with USAID procurement officers, and showcased our recent treatment-plant deliveries across the region. The event also served as a forum to advance our mission-aligned programs and explore new partnership opportunities with regional contractors, NGOs, and government stakeholders working on long-term environmental resilience.",
    img: "/announcements/overseas-small-business-conference.jpg",
  },
  {
    title: "17th Annual ISOA Summit",
    date: "Nov 7-9, 2023",
    location: "Tysons Corner, VA",
    desc: "Our executive team attended the 17th Annual International Stability Operations Association (ISOA) Summit under the theme \"Leveraging the Private Sector to Meet Challenges Ahead.\" The three-day event brought together government leaders, defense contractors, and humanitarian operators to discuss the role of private firms in delivering critical infrastructure in fragile and conflict-affected regions. GreenTech USA contributed to roundtable sessions on water security, post-conflict reconstruction, and operations & maintenance frameworks, reinforcing our commitment to safe, sustainable, and accountable engineering work in challenging environments.",
    img: "/announcements/isoa-summit.jpg",
  },
];

export default function Community() {
  return (
    <section className="py-24 bg-white relative overflow-hidden">
      <div className="container mx-auto px-6">
        
        {/* Testimonials */}
        <div className="mb-32">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
            <div className="max-w-2xl">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-6"> What Our Clients <span className="text-primary">Say</span></h2>
              <p className="text-lg text-slate-500">
                Building relationships on transparency and delivering results 
                that matter to the global community.
              </p>
            </div>
            <div className="flex gap-4">
               {/* Controls if needed */}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className={`p-10 rounded-[2.5rem] relative ${i === 0 ? 'bg-primary text-white' : 'bg-slate-50 text-slate-900'}`}
              >
                <Quote size={48} className={`absolute top-10 right-10 opacity-10 ${i === 0 ? 'text-white' : 'text-primary'}`} />
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20">
                    <img src={t.img} alt={t.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">{t.name}</h4>
                    <p className={`text-sm ${i === 0 ? 'text-white/70' : 'text-slate-500'}`}>{t.role}</p>
                  </div>
                </div>
                <p className={`text-lg leading-relaxed ${i === 0 ? 'text-white/90' : 'text-slate-600'}`}>"{t.content}"</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Announcements */}
        <div>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-6">Latest <span className="text-secondary">Announcements</span></h2>
            <p className="text-lg text-slate-500">Stay updated with our global presence and upcoming events.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {announcements.map((news, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="group"
              >
                <div className="aspect-video rounded-[2.5rem] overflow-hidden mb-8 shadow-lg relative bg-slate-900">
                  <img
                    src={news.img}
                    alt={news.title}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-widest">
                    <Calendar size={14} className="text-primary" />
                    {news.date}
                  </div>
                  <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-widest">
                    <MapPin size={14} className="text-primary" />
                    {news.location}
                  </div>
                </div>
                <h3 className="text-2xl font-display font-bold text-slate-900 mb-4">
                  {news.title}
                </h3>
                <p className="text-slate-600 text-base md:text-lg leading-relaxed">
                  {news.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
