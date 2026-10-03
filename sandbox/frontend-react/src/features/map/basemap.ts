/**
 * Basemap tile source resolution.
 *
 * The dispatch map previously hard-coded CARTO's Positron CDN as a keyless
 * basemap. CARTO has since begun gating unauthenticated requests: the CDN
 * still answers HTTP 200 with a valid PNG, but the image is a placeholder
 * reading "API KEY REQUIRED". Because the response is a successful image,
 * Leaflet raises no tile error and nothing appears in the console — the map
 * simply became unreadable.
 *
 * The source is therefore resolved at runtime rather than hard-coded:
 *   - If VITE_BASEMAP_URL is set, that provider is used verbatim. This is the
 *     intended production path — point it at a licensed, domain-restricted key.
 *   - Otherwise Esri's keyless light-grey canvas is used, so a missing config
 *     still yields a readable map.
 *
 * Esri's World_Light_Gray_Base is the default because it is keyless, renders a
 * minimal monochrome surface consistent with the Yunex design language, and
 * lets the coloured route overlays carry the visual weight. Its tiles stop at
 * zoom 16 (deeper requests return a "Map data not yet available" placeholder),
 * so maxNativeZoom pins the fetch at 16 and Leaflet upscales beyond that —
 * blurry at street level, but continuous rather than blank.
 *
 * Example VITE_BASEMAP_URL values (confirm the exact template against the
 * provider's current docs — these are illustrative, not verified):
 *   TomTom  https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?tileSize=256&key=KEY
 *   Mapbox  https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=TOKEN
 *   CARTO   https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?api_key=KEY
 *
 * Any key placed in VITE_BASEMAP_URL is compiled into the browser bundle and
 * is therefore public. It must be a dedicated, referrer-restricted tile key —
 * never the backend's TOMTOM_API_KEY or HERE_API_KEY, which are paid routing
 * credentials scoped to server-side use.
 */

export interface Basemap {
  url: string;
  attribution: string;
  maxZoom: number;
  /** Deepest zoom the provider actually serves; beyond this Leaflet upscales. */
  maxNativeZoom?: number;
  /** Set when the provider's URL template uses the {s} subdomain token. */
  subdomains?: string[];
}

/** Deepest zoom the dispatch map allows the user to reach. */
const MAX_ZOOM = 19;

const ESRI_LIGHT_GRAY: Basemap = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors',
  maxZoom: MAX_ZOOM,
  maxNativeZoom: 16,
};

/**
 * Resolve the basemap to render. Falls back to the keyless Esri canvas when no
 * provider is configured.
 */
export function resolveBasemap(): Basemap {
  const url = import.meta.env.VITE_BASEMAP_URL?.trim();
  if (!url) return ESRI_LIGHT_GRAY;

  const attribution = import.meta.env.VITE_BASEMAP_ATTRIBUTION?.trim();
  return {
    url,
    attribution: attribution || '',
    maxZoom: MAX_ZOOM,
    subdomains: url.includes('{s}') ? ['a', 'b', 'c', 'd'] : undefined,
  };
}
