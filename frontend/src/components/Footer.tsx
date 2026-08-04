import { Facebook, Twitter, Linkedin, MapPin, Phone, Mail, ArrowUp } from "lucide-react";
import { Link } from "react-router-dom";
import PoweredByProjnell from "./PoweredByProjnell";

export default function Footer() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="bg-slate-950 text-slate-400 pt-24 pb-12 overflow-hidden relative">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16 mb-20">
          
          {/* Brand & Socials */}
          <div className="lg:col-span-1">
            <Link to="/" className="flex items-center mb-8">
              <img
                src="/gt-usa-logo-new.png"
                alt="GreenTech USA"
                className="h-14 w-auto object-contain"
              />
            </Link>
            <p className="mb-8 leading-relaxed text-sm">
              Established in 2009, GreenTech USA LLC is a premier general contractor and environmental engineering firm based in Virginia, USA.
            </p>
            <div className="flex gap-4">
              {[
                { Icon: Facebook, href: "https://www.facebook.com/people/GreenTech-USA/61553248979264/", label: "Facebook" },
                { Icon: Twitter, href: "https://x.com/UsaGreente79444", label: "X (Twitter)" },
                { Icon: Linkedin, href: "https://www.linkedin.com/in/greentech-usa-29636729a", label: "LinkedIn" },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-10 h-10 rounded-full border border-slate-800 flex items-center justify-center hover:bg-gt-gradient hover:text-white hover:border-transparent transition-all"
                >
                  <Icon size={18} />
                </a>
              ))}
            </div>
          </div>

          {/* Vision */}
          <div>
            <h4 className="text-white font-bold text-sm mb-8 uppercase tracking-widest">Vision</h4>
            <p className="text-sm leading-relaxed mb-4">
              Our vision at GreenTech is not only to provide cutting-edge solutions but to offer unwavering support to the US government and areas that are often marked by conflict and instability. We are committed to making a positive impact by addressing critical infrastructure needs in challenging zones.
            </p>
          </div>

          {/* Mission */}
          <div>
            <h4 className="text-white font-bold text-sm mb-8 uppercase tracking-widest">Mission</h4>
            <p className="text-sm leading-relaxed">
              We are trusted partner to the US government, offering comprehensive water and wastewater solutions that prioritize efficiency, sustainability, and innovation. We are dedicated to designing, constructing, and maintaining state-of-the-art treatment facilities that adhere to the highest standards of quality and environmental responsibility.
            </p>
          </div>

          {/* Our Services */}
          <div>
            <h4 className="text-white font-bold text-sm mb-8 uppercase tracking-widest">Our Services</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/services#gen-con" className="hover:text-primary transition-colors">General Contractor</Link></li>
              <li><Link to="/services#env-eng" className="hover:text-primary transition-colors">Environmental Engineering</Link></li>
              <li><Link to="/services#wtp" className="hover:text-primary transition-colors">Water Treatment Plant (WTP)</Link></li>
              <li><Link to="/services#wwtp" className="hover:text-primary transition-colors">Wastewater Treatment Plant (WWTP)</Link></li>
              <li><Link to="/services#om" className="hover:text-primary transition-colors">Operation & Maintenance (O&M)</Link></li>
              <li><Link to="/services#hvac" className="hover:text-primary transition-colors">Commercial HVAC Services</Link></li>
            </ul>

          </div>
        </div>

        {/* Contact Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-12 border-t border-slate-900 mb-12">
          <a
            href="https://www.google.com/maps/search/?api=1&query=Chantilly,+Virginia,+USA"
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-4 items-center group hover:text-white transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary group-hover:bg-gt-gradient group-hover:text-white transition-all">
              <MapPin size={24} />
            </div>
            <div>
              <p className="text-white font-bold text-xs uppercase tracking-widest mb-1">Address</p>
              <p className="text-sm">Chantilly, Virginia, USA</p>
            </div>
          </a>
          <a
            href="tel:+17035550123"
            className="flex gap-4 items-center group hover:text-white transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary group-hover:bg-gt-gradient group-hover:text-white transition-all">
              <Phone size={24} />
            </div>
            <div>
              <p className="text-white font-bold text-xs uppercase tracking-widest mb-1">Contact</p>
              <p className="text-sm">+1 (703) 555-0123</p>
            </div>
          </a>
          <a
            href="mailto:info@gt-usa.com"
            className="flex gap-4 items-center group hover:text-white transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary group-hover:bg-gt-gradient group-hover:text-white transition-all">
              <Mail size={24} />
            </div>
            <div>
              <p className="text-white font-bold text-xs uppercase tracking-widest mb-1">Email</p>
              <p className="text-sm">info@gt-usa.com</p>
            </div>
          </a>
        </div>

        <div className="pt-12 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-6 relative">
          {/* Left: Powered by Projnell */}
          <PoweredByProjnell tone="dark" />

          {/* Center: copyright */}
          <p className="text-sm text-center">
            © {new Date().getFullYear()} GreenTech USA LLC. All rights reserved. | FYR1QQ8L3SM7 | CAGE: 8ZJ10
          </p>

          {/* Right: legal links */}
          <div className="flex gap-8 text-sm">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms-and-conditions" className="hover:text-white transition-colors">Terms & Conditions</Link>
          </div>

          {/* Scroll to Top button bottom right */}
          <button
            onClick={scrollToTop}
            className="md:absolute md:right-0 md:-top-6 w-14 h-14 rounded-full bg-gt-gradient text-white flex items-center justify-center shadow-2xl hover:scale-110 hover:-translate-y-1 transition-all cursor-pointer z-20 group"
            title="Scroll to Top"
          >
            <ArrowUp size={24} className="group-hover:translate-y-[-2px] transition-transform" />
          </button>
        </div>
      </div>
    </footer>
  );
}
