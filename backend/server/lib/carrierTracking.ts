import type { ShipmentStatus } from "../models/Shipment";

/**
 * CR 219 (client, 2026-09-14): "about 80% of shipments use one carrier - check whether it has an
 * API to pull the route, current location and ETA daily. Fallback: enter manually."
 *
 * What we found: container lines (Maersk, MSC, CMA CGM...) publish no free tracking API, and
 * scraping their pages daily is both fragile and against their terms. What every line does support
 * is a tracking aggregator, so this module is one small adapter layer:
 *
 *   - with an aggregator key in the environment, the daily sweep pulls route, location and ETA by
 *     itself (the providers below each have a free tier for low volumes);
 *   - with no key, nothing here runs and the manual path stands: the "Track live" deep link to the
 *     carrier's own page, "Log an update" for the weekly location, and a nudge when it goes stale.
 *
 * Adding the carrier's own API later is one more entry in TRACKING_PROVIDERS; nothing else changes.
 */

export interface TrackingEvent {
  date: string;        // yyyy-mm-dd of the event
  location: string;
  description: string;
  status: string;      // the carrier's own wording, kept as it came
}
export interface TrackingResult {
  currentLocation: string;
  etaDate: string;                 // yyyy-mm-dd, "" when the carrier gives none
  status: ShipmentStatus | "";     // mapped to our statuses, "" when unclear
  events: TrackingEvent[];         // newest first
  provider: string;
}

type Provider = {
  key: string;                                   // the env var holding the API key
  label: string;
  track: (apiKey: string, trackingNo: string, carrier: string) => Promise<TrackingResult>;
};

const iso = (v: unknown): string => {
  const d = new Date(String(v || ""));
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const text = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

// The carrier's wording mapped to our status. Only ever used to move a shipment FORWARD.
const STATUS_WORDS: Array<[RegExp, ShipmentStatus]> = [
  [/deliver|pod|received by/i, "Delivered"],
  [/warehouse|available for pick|ready for collect|depot/i, "Warehouse"],
  [/customs|clearance|held|inspection/i, "Clearance"],
  [/transit|vessel|departed|arrived|sail|flight|out for delivery|loaded|discharg/i, "Transit"],
  [/manufactur|fabricat|production/i, "Fabrication"],
  [/info received|pending|label|booking|awaiting/i, "Preparing"],
];
export const STATUS_RANK: ShipmentStatus[] = ["Preparing", "Fabrication", "Transit", "Clearance", "Warehouse", "Delivered"];
export function mapStatus(...words: string[]): ShipmentStatus | "" {
  const hay = words.filter(Boolean).join(" ");
  for (const [re, s] of STATUS_WORDS) if (re.test(hay)) return s;
  return "";
}
/** A tracking update may push a shipment along, never drag it back (as the Master Log cascade does). */
export function mergeStatus(current: ShipmentStatus, incoming: ShipmentStatus | ""): ShipmentStatus {
  if (!incoming) return current;
  return STATUS_RANK.indexOf(incoming) > STATUS_RANK.indexOf(current) ? incoming : current;
}

async function getJson(url: string, init: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: { message?: string } })?.error?.message || `HTTP ${r.status}`);
    return body;
  } finally { clearTimeout(timer); }
}

const newestFirst = (a: TrackingEvent, b: TrackingEvent) => (b.date || "").localeCompare(a.date || "");

// Ship24: sea, air and parcel, carrier detected from the number itself.
const ship24: Provider = {
  key: "SHIP24_API_KEY",
  label: "Ship24",
  async track(apiKey, trackingNo) {
    const body = await getJson("https://api.ship24.com/public/v1/trackers/track", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: trackingNo }),
    }) as { data?: { trackings?: Array<{ events?: Array<Record<string, unknown>>; shipment?: { delivery?: { estimatedDeliveryDate?: string } } }> } };
    const t = body?.data?.trackings?.[0];
    const events: TrackingEvent[] = (t?.events || []).map((e) => ({
      date: iso(e.occurrenceDatetime || e.datetime),
      location: text(e.location, 160),
      description: text(e.status || e.statusMilestone),
      status: text(e.statusMilestone || e.statusCategory, 60),
    })).filter((e) => e.date || e.location || e.description).sort(newestFirst);
    return {
      currentLocation: events[0]?.location || "",
      etaDate: iso(t?.shipment?.delivery?.estimatedDeliveryDate),
      status: mapStatus(events[0]?.status || "", events[0]?.description || ""),
      events: events.slice(0, 40),
      provider: "Ship24",
    };
  },
};

// TrackingMore: the same idea, its own key and free tier.
const trackingMore: Provider = {
  key: "TRACKINGMORE_API_KEY",
  label: "TrackingMore",
  async track(apiKey, trackingNo, carrier) {
    const q = new URLSearchParams({ tracking_numbers: trackingNo });
    if (carrier) q.set("courier_code", carrier.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    const body = await getJson(`https://api.trackingmore.com/v4/trackings/get?${q.toString()}`, {
      headers: { "Tracking-Api-Key": apiKey, "Content-Type": "application/json" },
    }) as { data?: Array<{ origin_info?: { trackinfo?: Array<Record<string, unknown>> }; scheduled_delivery_date?: string; delivery_status?: string }> };
    const t = body?.data?.[0];
    const events: TrackingEvent[] = (t?.origin_info?.trackinfo || []).map((e) => ({
      date: iso(e.checkpoint_date || e.Date),
      location: text(e.location || e.checkpoint_delivery_substatus, 160),
      description: text(e.tracking_detail || e.StatusDescription),
      status: text(e.checkpoint_delivery_status || t?.delivery_status, 60),
    })).filter((e) => e.date || e.location || e.description).sort(newestFirst);
    return {
      currentLocation: events[0]?.location || "",
      etaDate: iso(t?.scheduled_delivery_date),
      status: mapStatus(t?.delivery_status || "", events[0]?.description || ""),
      events: events.slice(0, 40),
      provider: "TrackingMore",
    };
  },
};

// AfterShip: needs the carrier as its "slug", so the carrier field has to be filled in.
const afterShip: Provider = {
  key: "AFTERSHIP_API_KEY",
  label: "AfterShip",
  async track(apiKey, trackingNo, carrier) {
    const slug = (carrier || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) throw new Error("AfterShip needs the carrier name on the shipment.");
    const body = await getJson(`https://api.aftership.com/v4/trackings/${encodeURIComponent(slug)}/${encodeURIComponent(trackingNo)}`, {
      headers: { "aftership-api-key": apiKey, "Content-Type": "application/json" },
    }) as { data?: { tracking?: { checkpoints?: Array<Record<string, unknown>>; expected_delivery?: string; tag?: string } } };
    const t = body?.data?.tracking;
    const events: TrackingEvent[] = (t?.checkpoints || []).map((c) => ({
      date: iso(c.checkpoint_time || c.created_at),
      location: text([c.city, c.state, c.country_name].filter(Boolean).join(", ") || c.location, 160),
      description: text(c.message),
      status: text(c.tag || c.subtag_message, 60),
    })).filter((e) => e.date || e.location || e.description).sort(newestFirst);
    return {
      currentLocation: events[0]?.location || "",
      etaDate: iso(t?.expected_delivery),
      status: mapStatus(t?.tag || "", events[0]?.description || ""),
      events: events.slice(0, 40),
      provider: "AfterShip",
    };
  },
};

const TRACKING_PROVIDERS: Provider[] = [ship24, trackingMore, afterShip];

/** Which provider is set up, if any. The shipment screen asks this to decide what to offer. */
export function trackingProvider(): { enabled: boolean; provider: string; keyName: string } {
  const wanted = String(process.env.TRACKING_PROVIDER || "").trim().toLowerCase();
  const list = wanted ? TRACKING_PROVIDERS.filter((p) => p.label.toLowerCase() === wanted) : TRACKING_PROVIDERS;
  const p = list.find((x) => !!String(process.env[x.key] || "").trim());
  return p ? { enabled: true, provider: p.label, keyName: p.key } : { enabled: false, provider: "", keyName: "" };
}

/** Ask the provider where a shipment is. Throws with a readable message; never returns half a result. */
export async function fetchTracking(trackingNo: string, carrier: string): Promise<TrackingResult> {
  const { enabled, provider } = trackingProvider();
  if (!enabled) throw new Error("Automatic tracking is not set up on this server.");
  if (!String(trackingNo || "").trim()) throw new Error("This shipment has no tracking / container number.");
  const p = TRACKING_PROVIDERS.find((x) => x.label === provider)!;
  const apiKey = String(process.env[p.key] || "").trim();
  const r = await p.track(apiKey, String(trackingNo).trim(), String(carrier || "").trim());
  if (!r.events.length && !r.currentLocation && !r.etaDate) throw new Error(`${p.label} has nothing for that number yet.`);
  return r;
}
