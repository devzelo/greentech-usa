import { motion } from "motion/react";

const partners = [
  { name: "Client 1", logo: "/client-logos/Rectangle 646.png" },
  { name: "Client 2", logo: "/client-logos/Rectangle 647.png" },
  { name: "Client 3", logo: "/client-logos/Rectangle 648.png" },
  { name: "Client 4", logo: "/client-logos/Rectangle 649.png" },
  { name: "Client 5", logo: "/client-logos/Rectangle 650.png" },
  { name: "Client 6", logo: "/client-logos/Rectangle 651.png" },
  { name: "Client 7", logo: "/client-logos/Rectangle 652.png" },
  { name: "Client 8", logo: "/client-logos/Rectangle 653.png" },
];

export default function Partners() {
  return (
    <section className="py-24 bg-white border-y border-slate-100 overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl font-bold text-slate-900 mb-4 tracking-tight">Trust of Global <span className="text-primary">Entities</span></h2>
          <p className="text-slate-500">Explore what our valued partners are sharing & Discover insights from our trusted vendors.</p>
        </div>

        <div className="grid grid-cols-4 md:grid-cols-8 items-center justify-items-center gap-2 md:gap-3">
          {partners.map((partner, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="h-24 md:h-28 w-full flex items-center justify-center"
            >
              <img 
                src={partner.logo} 
                alt={partner.name}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                   (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${partner.name}&background=f0f0f0&color=666&size=128&bold=true`;
                }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
