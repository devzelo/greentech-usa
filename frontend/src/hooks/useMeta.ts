import { useEffect } from "react";

const SITE_NAME = "GreenTech USA";
const DEFAULT_DESCRIPTION =
  "GreenTech USA LLC — premier general contractor and environmental engineering firm specializing in water treatment, wastewater, HVAC, and renewable-energy infrastructure for the US Government and global clients.";

function setMeta(name: string, content: string, isProperty = false) {
  if (typeof document === "undefined") return;
  const attr = isProperty ? "property" : "name";
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(url: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

/**
 * Update the document title + description (and OG / Twitter equivalents)
 * for the current page. Title is appended with the site name automatically
 * unless `noSuffix` is set.
 */
export function useMeta(opts: {
  title: string;
  description?: string;
  noSuffix?: boolean;
}) {
  const { title, description = DEFAULT_DESCRIPTION, noSuffix = false } = opts;
  useEffect(() => {
    const fullTitle = noSuffix ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;
    setMeta("description", description);
    setMeta("og:title", fullTitle, true);
    setMeta("og:description", description, true);
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", description);

    // Canonical for SPA — keep in sync with current URL
    if (typeof window !== "undefined") {
      setCanonical(window.location.origin + window.location.pathname);
    }
  }, [title, description, noSuffix]);
}
