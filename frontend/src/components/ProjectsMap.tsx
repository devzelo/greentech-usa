import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import ProjectShowcaseModal from "./ProjectShowcaseModal";
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

// Country outlines (Natural Earth 1:50m), loaded on demand so they stay out of the main bundle.
// The client asked for the green to follow the basemap's borders exactly: the 1:110m set was too
// coarse for that (straight-cut coasts and borders), 1:50m sits on the basemap's lines at the
// zoom levels the home page uses.
// Zoomed in past the world view, the 1:10m set replaces it (fetched only then), so the green keeps
// following the basemap's borders up close.
async function loadCountryShapes(detail: "50m" | "10m" = "50m"): Promise<CountryShapes> {
  const [{ feature }, atlas] = await Promise.all([
    import("topojson-client"),
    detail === "10m" ? import("world-atlas/countries-10m.json") : import("world-atlas/countries-50m.json"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = (atlas as any).default ?? atlas;
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({ ...f, properties: { name: f.properties.name, iso: isoForCountryName(f.properties.name) } })),
  };
}

// Tell the page once the visitor zooms in close enough to need the detailed outlines.
// Hands the Leaflet map back to the page (to close a pop-up when the modal opens).
function MapHandle({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

function ZoomWatch({ onDetail }: { onDetail: () => void }) {
  const map = useMap();
  useEffect(() => {
    const check = () => { if (map.getZoom() >= 5) onDetail(); };
    map.on("zoomend", check);
    check();
    return () => { map.off("zoomend", check); };
  }, [map, onDetail]);
  return null;
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
  // CR 261 - a pin opens the same project modal as the cards: photos, client, location, documents.
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const mapRef = useRef<L.Map | null>(null);
  const openProject = useCallback((id: string) => {
    mapRef.current?.closePopup();   // the pin's card would otherwise sit behind the modal
    setShowcaseId(id);
  }, []);
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
  const [detail, setDetail] = useState<"50m" | "10m">("50m");
  const wantDetail = useCallback(() => setDetail("10m"), []);
  const [shapesDetail, setShapesDetail] = useState("");
  useEffect(() => {
    loadCountryShapes(detail).then((s) => { setShapes(s); setShapesDetail(detail); }).catch(() => { if (detail === "50m") setShapes(null); });
  }, [detail]);
  const activeShapes = useMemo<CountryShapes | null>(() => {
    if (!shapes) return null;
    const active = new Set(groups.map((g) => g.iso));
    return { type: "FeatureCollection", features: shapes.features.filter((f) => active.has(f.properties.iso)) };
  }, [shapes, groups]);
  // GeoJSON data is fixed once mounted, so the key changes when the detailed set arrives.
  const shapesKey = `${shapesDetail}:${activeShapes?.features.map((f) => f.properties.iso).sort().join(",") || ""}`;

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

        <div className="isolate rounded-[2rem] overflow-hidden border border-slate-200 shadow-lg" style={{ height: 480, background: "#eef2f6" }}>
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
                smoothFactor={0.5}
                style={() => ({ color: "#059669", weight: 0.8, opacity: 0.7, fillColor: "#10B981", fillOpacity: 0.3, lineJoin: "round" })}
              />
            )}
            <FitToPins points={points} />
            <ZoomWatch onDetail={wantDetail} />
            <MapHandle onReady={(m) => { mapRef.current = m; }} />
            {groups.map((g) => (
              <Marker
                key={g.iso}
                position={g.coords}
                icon={pinIcon(g.projects.length)}
                // Hover opens the card on a desktop. Click and tap open it too, rather than
                // toggling it shut again, so it works the same on a phone, where there is no hover.
                eventHandlers={{
                  mouseover: (e) => e.target.openPopup(),
                  click: (e) => e.target.openPopup(),
                }}
              >
                <Popup maxWidth={320} minWidth={260}>
                  {/* Include the flag font so the country emoji renders on Windows (Leaflet forces
                      its own font, which falls back to the ISO letters otherwise). */}
                  <div style={{ width: 272, maxWidth: "100%", overflow: "hidden", fontFamily: "'Twemoji Country Flags', 'Inter', ui-sans-serif, system-ui, sans-serif" }}>
                    <p style={{ fontWeight: 700, fontSize: 12, margin: "0 0 6px", color: "#0f172a" }}>
                      <span style={{ fontFamily: "'Twemoji Country Flags', sans-serif" }}>{flagForCountry(g.projects[0].location)}</span> {g.projects.length} project{g.projects.length === 1 ? "" : "s"}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4 }}>
                      {g.projects.slice(0, 6).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => openProject(p.id)}
                            title={`Open ${p.name}`}
                            style={{
                              display: "flex", gap: 8, alignItems: "center", width: "100%", maxWidth: "100%", overflow: "hidden", textAlign: "left",
                              padding: 4, border: "1px solid transparent", borderRadius: 10, background: "transparent", cursor: "pointer",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                          >
                            {p.image && !brokenImages.has(p.id) ? (
                              <img
                                src={p.image}
                                alt=""
                                loading="lazy"
                                // A cover whose file has gone missing falls back to the placeholder.
                                onError={() => setBrokenImages((b) => new Set(b).add(p.id))}
                                style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 8, flexShrink: 0, background: "#e2e8f0" }}
                              />
                            ) : (
                              <span style={{ width: 54, height: 40, borderRadius: 8, background: "#e2e8f0", flexShrink: 0, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 10, fontWeight: 700 }}>
                                GT
                              </span>
                            )}
                            <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", fontSize: 12, lineHeight: 1.35 }}>
                              <span style={{ display: "block", maxWidth: "100%", fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                              <span style={{ display: "block", maxWidth: "100%", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {[p.category, p.location].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {g.projects.length > 6 && <li style={{ fontSize: 11, color: "#94a3b8", padding: "2px 4px" }}>+ {g.projects.length - 6} more…</li>}
                    </ul>
                    <p style={{ margin: "6px 0 0", fontSize: 10, color: "#94a3b8" }}>Click a project for its photos and details.</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          )}
        </div>
      </div>
      {/* CR 261 - the same showcase the project cards open: slideable photos, client, dates, docs. */}
      {showcaseId && <ProjectShowcaseModal projectId={showcaseId} onClose={() => setShowcaseId(null)} />}
    </section>
  );
}
