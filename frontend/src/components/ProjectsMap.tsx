import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import { fetchPublicProjects, ApiPublicProject } from "../lib/api";
import { isoForLocation, flagForCountry } from "../lib/countryFlag";
import { COUNTRY_COORDS } from "../lib/countryCoords";

// Homepage "where we work" map — pins every published project by its country (centroid), grouped
// so a country with several projects shows one pin whose popup lists them. Self-contained: OSM/CARTO
// tiles, no API key; branded SVG pins (no external marker images).

type Group = { iso: string; coords: [number, number]; projects: ApiPublicProject[] };

const pinIcon = (count: number) =>
  L.divIcon({
    className: "gt-pin",
    html: `
      <div style="position:relative;width:34px;height:44px;filter:drop-shadow(0 3px 3px rgba(2,6,23,.28))">
        <svg width="34" height="44" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 8.6 12 20 12 20s12-11.4 12-20C24 5.4 18.6 0 12 0z" fill="#10B981" stroke="#ffffff" stroke-width="1.6"/>
          <circle cx="12" cy="12" r="4.6" fill="#ffffff"/>
        </svg>
        ${count > 1 ? `<span style="position:absolute;top:-4px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9999px;background:#0f172a;color:#fff;font:700 10px/18px system-ui,sans-serif;text-align:center;border:2px solid #fff">${count}</span>` : ""}
      </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -40],
  });

// Frame the map to the pins once they load.
function FitToPins({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.setView(points[0], 4); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 5 });
  }, [map, points]);
  return null;
}

export default function ProjectsMap() {
  const [projects, setProjects] = useState<ApiPublicProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicProjects().then(setProjects).catch(() => setProjects([])).finally(() => setLoading(false));
  }, []);

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const p of projects) {
      const iso = isoForLocation(p.location);
      const coords = iso ? COUNTRY_COORDS[iso] : undefined;
      if (!coords) continue;
      const g = m.get(iso) || { iso, coords, projects: [] };
      g.projects.push(p);
      m.set(iso, g);
    }
    return Array.from(m.values());
  }, [projects]);

  const points = useMemo(() => groups.map((g) => g.coords), [groups]);
  const countries = groups.length;
  const pinned = groups.reduce((s, g) => s + g.projects.length, 0);

  // Nothing to place yet — don't render an empty map.
  if (!loading && countries === 0) return null;

  return (
    <section id="map" className="py-24 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 text-primary mb-4">
            <MapPin size={18} /><span className="text-xs font-bold uppercase tracking-widest">Where We Work</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-5">Our Global <span className="text-secondary">Footprint</span></h2>
          <p className="text-lg text-slate-500">
            {pinned} project{pinned === 1 ? "" : "s"} across {countries} countr{countries === 1 ? "y" : "ies"}, delivering
            water, wastewater and energy infrastructure worldwide.
          </p>
        </div>

        <div className="rounded-[2rem] overflow-hidden border border-slate-200 shadow-lg">
          <MapContainer
            center={[20, 10]}
            zoom={2}
            scrollWheelZoom={false}
            worldCopyJump
            style={{ height: "480px", width: "100%", background: "#eef2f6" }}
          >
            {/* CARTO Positron — muted, professional; free with attribution. */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains={["a", "b", "c", "d"]}
            />
            <FitToPins points={points} />
            {groups.map((g) => (
              <Marker key={g.iso} position={g.coords} icon={pinIcon(g.projects.length)}>
                <Popup>
                  {/* Include the flag font so the country emoji renders on Windows (Leaflet forces
                      its own font, which falls back to the ISO letters otherwise). */}
                  <div style={{ minWidth: 180, fontFamily: "'Twemoji Country Flags', 'Inter', ui-sans-serif, system-ui, sans-serif" }}>
                    <p style={{ fontWeight: 700, fontSize: 12, margin: "0 0 6px", color: "#0f172a" }}>
                      <span style={{ fontFamily: "'Twemoji Country Flags', sans-serif" }}>{flagForCountry(g.projects[0].location)}</span> {g.projects.length} project{g.projects.length === 1 ? "" : "s"}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                      {g.projects.slice(0, 6).map((p) => (
                        <li key={p.id} style={{ fontSize: 12, lineHeight: 1.3 }}>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>{p.name}</span>
                          <br />
                          <span style={{ color: "#64748b" }}>{[p.category, p.location].filter(Boolean).join(" · ")}</span>
                        </li>
                      ))}
                      {g.projects.length > 6 && <li style={{ fontSize: 11, color: "#94a3b8" }}>+ {g.projects.length - 6} more…</li>}
                    </ul>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </section>
  );
}
