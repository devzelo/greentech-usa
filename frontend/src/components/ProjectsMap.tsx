import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import type { FeatureCollection, Geometry } from "geojson";
import { fetchPublicProjects, ApiPublicProject } from "../lib/api";
import { isoForLocation, isoForCountryName, flagForCountry } from "../lib/countryFlag";
import { COUNTRY_COORDS } from "../lib/countryCoords";

// Homepage "where we work" map — pins every published project by its country (centroid), grouped
// so a country with several projects shows one pin whose popup lists them. Self-contained: OSM/CARTO
// tiles, no API key; branded SVG pins (no external marker images).

type Group = { iso: string; coords: [number, number]; projects: ApiPublicProject[] };

// CR-P-52 — small, clean pins for a professional default view.
const pinIcon = (count: number) =>
  L.divIcon({
    className: "gt-pin",
    html: `
      <div style="position:relative;width:22px;height:28px;filter:drop-shadow(0 2px 2px rgba(2,6,23,.25))">
        <svg width="22" height="28" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 8.6 12 20 12 20s12-11.4 12-20C24 5.4 18.6 0 12 0z" fill="#10B981" stroke="#ffffff" stroke-width="1.8"/>
          <circle cx="12" cy="12" r="4.4" fill="#ffffff"/>
        </svg>
        ${count > 1 ? `<span style="position:absolute;top:-5px;right:-6px;min-width:15px;height:15px;padding:0 3px;border-radius:9999px;background:#0f172a;color:#fff;font:700 9px/15px system-ui,sans-serif;text-align:center;border:1.5px solid #fff">${count}</span>` : ""}
      </div>`,
    iconSize: [22, 28],
    iconAnchor: [11, 28],
    popupAnchor: [0, -26],
  });

type CountryShapes = FeatureCollection<Geometry, { name: string; iso: string }>;

// Country outlines (Natural Earth 1:110m), loaded on demand so they stay out of the main bundle.
// Countries too small for this scale (Singapore, Bahrain...) simply keep their pin.
async function loadCountryShapes(): Promise<CountryShapes> {
  const [{ feature }, atlas] = await Promise.all([
    import("topojson-client"),
    import("world-atlas/countries-110m.json"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = (atlas as any).default ?? atlas;
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({ ...f, properties: { name: f.properties.name, iso: isoForCountryName(f.properties.name) } })),
  };
}

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
  // Mount the Leaflet map only after the first client commit — avoids react-leaflet's
  // "Map container is already initialized" error under React 19 StrictMode's double-mount.
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => { setMapReady(true); }, []);

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

  // CR 178: shade every country that has a published project.
  const [shapes, setShapes] = useState<CountryShapes | null>(null);
  useEffect(() => { loadCountryShapes().then(setShapes).catch(() => setShapes(null)); }, []);
  const activeShapes = useMemo<CountryShapes | null>(() => {
    if (!shapes) return null;
    const active = new Set(groups.map((g) => g.iso));
    return { type: "FeatureCollection", features: shapes.features.filter((f) => active.has(f.properties.iso)) };
  }, [shapes, groups]);
  const shapesKey = activeShapes?.features.map((f) => f.properties.iso).sort().join(",") || "";

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

        <div className="rounded-[2rem] overflow-hidden border border-slate-200 shadow-lg" style={{ height: 480, background: "#eef2f6" }}>
          {mapReady && (
          <MapContainer
            center={[20, 10]}
            zoom={2}
            scrollWheelZoom={true}
            worldCopyJump
            style={{ height: "480px", width: "100%", background: "#eef2f6" }}
          >
            {/* Esri Light Gray Canvas — muted, professional; free with attribution and NO API key.
                (CARTO's keyless basemaps were retired and now demand an API key.) */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
              maxNativeZoom={16}
              maxZoom={19}
            />
            {activeShapes && activeShapes.features.length > 0 && (
              <GeoJSON
                key={shapesKey}
                data={activeShapes}
                interactive={false}
                style={() => ({ color: "#059669", weight: 1.2, fillColor: "#10B981", fillOpacity: 0.35 })}
              />
            )}
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
          )}
        </div>
      </div>
    </section>
  );
}
