import { View, Image } from "@react-pdf/renderer";

/**
 * 2026-10-08 - "adding a stamp should work like adding a signature: very close to the signature, not
 * far from it." The signature with the company stamp pressed over its end, as on a hand-stamped
 * page, in every document (agreements, requests, the EOI, the cover letter). The row is only as wide
 * as the signature, so the stamp always lands on it, whatever the width of the block around it.
 * `sig` and `stamp` are ready-to-load image sources.
 */
export default function SignatureStamp({ sig, stamp, sigH = 40, sigMaxW = 170, stampSize = 54 }: {
  sig?: string;
  stamp?: string;
  sigH?: number;
  sigMaxW?: number;
  stampSize?: number;
}) {
  if (!sig && !stamp) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minHeight: Math.max(sig ? sigH : 0, stamp ? stampSize : 0) }}>
      {!!sig && <Image src={sig} style={{ height: sigH, maxWidth: sigMaxW, objectFit: "contain" }} />}
      {/* Over the last third of the signature. */}
      {!!stamp && <Image src={stamp} style={{ width: stampSize, height: stampSize, objectFit: "contain", marginLeft: sig ? -Math.round(stampSize * 0.4) : 0 }} />}
    </View>
  );
}
