/**
 * CR 282 (2026-09-23): how the shipment travels. Kept beside the carrier, because a road shipment
 * and an ocean shipment are read and chased differently. The label carries the little symbol for
 * the screen; `plain` is what printed documents use, since the PDF fonts hold no emoji.
 */

export type TransportMode = { key: string; label: string; plain: string };

export const TRANSPORT_MODES: TransportMode[] = [
  { key: "ocean", label: "🚢 Ocean / Sea", plain: "Ocean / Sea" },
  { key: "air", label: "✈️ Air", plain: "Air" },
  { key: "road", label: "🚚 Road / Truck", plain: "Road / Truck" },
  { key: "rail", label: "🚆 Rail", plain: "Rail" },
  { key: "ocean_road", label: "🚢 + 🚚 Multimodal (ocean + road)", plain: "Multimodal (ocean + road)" },
  { key: "air_road", label: "✈️ + 🚚 Multimodal (air + road)", plain: "Multimodal (air + road)" },
  { key: "custom", label: "Custom (specify)", plain: "Custom" },
];

export const TRANSPORT_KEYS = TRANSPORT_MODES.map((m) => m.key);

/** The mode as it reads on screen, with a typed name winning for a custom one. */
export const transportLabel = (mode?: string, other?: string) => {
  if (!mode) return "";
  const m = TRANSPORT_MODES.find((x) => x.key === mode);
  if (mode === "custom") return (other || "").trim() || "Custom";
  return m ? m.label : mode;
};

/** The same, without the symbol, for generated documents. */
export const transportPlain = (mode?: string, other?: string) => {
  if (!mode) return "";
  const m = TRANSPORT_MODES.find((x) => x.key === mode);
  if (mode === "custom") return (other || "").trim() || "Custom";
  return m ? m.plain : mode;
};
