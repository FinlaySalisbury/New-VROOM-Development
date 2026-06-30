/**
 * Job-import pipeline ported from the legacy importAndSaveJobList +
 * legacyClassify. Links jobs CSV rows to sites CSV rows by Site Ref, parses
 * the time windows, derives priority/urgency, and applies the rule-based
 * (string-match) skill classification.
 *
 * The AI (Claude) classification path is intentionally NOT ported here — it is
 * stubbed behind a disabled control in the view. See JobsView.tsx.
 */

import type { Job, JobList, Site } from '@/types';
import type { ParsedCsv } from './csv';

const DEFAULT_SERVICE_TIME_S = 1800; // 30 minutes

/** Manufacturer -> maintenance/PI skill code (legacy PI_SKILLS). */
const PI_SKILLS: Record<string, number> = {
  Alfen: 1103,
  Etrel: 1203,
  Tritium: 1303,
  Efacec: 1403,
  Wallbox: 1503,
};

const GENERAL_SKILL = 1003;

/** Rule-based skill classification — manufacturer string match (legacyClassify). */
export function legacyClassify(siteDesc: string | undefined): number[] {
  const upper = (siteDesc || '').toUpperCase();
  for (const [mfg, code] of Object.entries(PI_SKILLS)) {
    if (upper.includes(mfg.toUpperCase())) return [code];
  }
  return [GENERAL_SKILL];
}

interface LinkedSite {
  lat: number;
  lon: number;
  desc: string;
  town: string;
}

function findKey(keys: string[], ...candidates: string[]): string | undefined {
  return keys.find((k) => {
    const norm = k.trim().toLowerCase();
    return candidates.some((c) => norm === c || k.includes(c));
  });
}

/** Parse a "DD/MM/YYYY HH:MM[:SS]" (or YYYY-first) string to a unix timestamp. */
function parseDate(dStr: string | undefined): number | null {
  if (!dStr) return null;
  const parts = dStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const dParts = parts[0].split(/[/\-]/);
  if (dParts.length < 3) return null;
  let dd: string;
  let mm: string;
  let yyyy: string;
  if (dParts[0].length === 4) {
    [yyyy, mm, dd] = dParts;
  } else {
    [dd, mm, yyyy] = dParts;
  }
  let tStr = parts[1].trim();
  if (tStr.split(':').length === 2) tStr += ':00';
  const isoStr = `${yyyy.length === 2 ? '20' + yyyy : yyyy}-${mm.padStart(
    2,
    '0',
  )}-${dd.padStart(2, '0')}T${tStr}Z`;
  const ms = Date.parse(isoStr);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * Per-job classification input, parallel to `ImportResult.jobs` (same order /
 * index). Mirrors the legacy `aiBatch` rows fed to classifyWithClaude.
 */
export interface AiJobInput {
  site_ref: string;
  site_description: string;
  job_type: string;
  job_site_name: string;
}

export interface ImportResult {
  jobs: Job[];
  sites: Site[];
  /** Classification inputs, index-aligned with `jobs` (for the AI path). */
  aiBatch: AiJobInput[];
  unmatchedRefs: string[];
  noSiteRef: number;
  dateFails: number;
  headers: string[];
}

/**
 * Link parsed jobs + sites CSVs into VROOM jobs with rule-based skills, plus the
 * Site rows for persistence. Mirrors the legacy linking + classification.
 */
export function buildImport(jobsCsv: ParsedCsv, sitesCsv: ParsedCsv): ImportResult {
  // Build a case-insensitive sites lookup keyed by normalised Site Ref.
  const sitesDict: Record<string, LinkedSite> = {};
  const siteRows: Site[] = [];

  sitesCsv.rows.forEach((row) => {
    const keys = Object.keys(row);
    const refKey = findKey(keys, 'site ref');
    const latKey = findKey(keys, 'latitude');
    const lonKey = findKey(keys, 'longitude');
    const descKey = findKey(keys, 'description');
    const townKey = findKey(keys, 'town');
    const refVal = refKey ? row[refKey] : null;
    if (!refVal) return;
    const normRef = refVal.trim().toUpperCase();
    if (sitesDict[normRef]) return;
    const lat = latKey ? parseFloat(row[latKey]) : NaN;
    const lon = lonKey ? parseFloat(row[lonKey]) : NaN;
    const desc = descKey && row[descKey] ? row[descKey] : '';
    const town = townKey && row[townKey] ? row[townKey] : '';
    sitesDict[normRef] = { lat, lon, desc, town };
    siteRows.push({ id: normRef, ref: normRef, town, lat, lon, description: desc });
  });

  const jobs: Job[] = [];
  const aiBatch: AiJobInput[] = [];
  const unmatchedRefs: string[] = [];
  let jobIdCounter = 1000;
  const nowMs = Date.now();
  let noSiteRef = 0;
  let dateFails = 0;
  let headers: string[] = [];

  jobsCsv.rows.forEach((row, idx) => {
    const keys = Object.keys(row);
    if (idx === 0) headers = keys;
    const refKey = findKey(keys, 'site ref');
    const typeKey = findKey(keys, 'type');
    const startKey = findKey(keys, 'start window', 'start');
    const endKey = findKey(keys, 'end window', 'end');
    const siteNameKey = findKey(keys, 'site');

    const siteRefRaw = refKey ? row[refKey] : null;
    if (!siteRefRaw) {
      noSiteRef++;
      return;
    }
    const siteRef = siteRefRaw.trim();
    const normRef = siteRef.toUpperCase();
    const site = sitesDict[normRef];
    if (!site || Number.isNaN(site.lat) || Number.isNaN(site.lon)) {
      unmatchedRefs.push(siteRef);
      return;
    }

    const jobType = typeKey && row[typeKey] ? row[typeKey].trim() : 'PI';
    const twStart = parseDate(startKey ? row[startKey] : undefined);
    const twEnd = parseDate(endKey ? row[endKey] : undefined);
    if (!twStart || !twEnd) {
      dateFails++;
      return;
    }

    const daysUntilEnd = (twEnd * 1000 - nowMs) / (1000 * 60 * 60 * 24);
    const priority =
      daysUntilEnd <= 2 ? 100 : daysUntilEnd <= 7 ? 80 : daysUntilEnd <= 14 ? 60 : 40;
    const urgency: Job['urgency_level'] =
      priority >= 80 ? 'critical' : priority >= 60 ? 'high' : 'medium';

    const siteName = siteNameKey && row[siteNameKey] ? row[siteNameKey].trim() : '';

    jobs.push({
      id: jobIdCounter++,
      description: `${siteRef} - ${jobType} [${site.town}]`,
      location: [site.lon, site.lat],
      skills: legacyClassify(site.desc),
      service: DEFAULT_SERVICE_TIME_S,
      time_windows: [[twStart, twEnd]],
      priority,
      urgency_level: urgency,
    });

    aiBatch.push({
      site_ref: siteRef,
      site_description: site.desc,
      job_type: jobType,
      job_site_name: siteName,
    });
  });

  return { jobs, sites: siteRows, aiBatch, unmatchedRefs, noSiteRef, dateFails, headers };
}

/**
 * Build a persistable JobList from imported jobs. `classifiedBy` is 'legacy'
 * for the rule-based path and the Claude model id ('claude-sonnet-4.6') for the
 * AI path — the list-card UI shows "AI classified" when it includes 'claude'.
 */
export function makeJobList(
  name: string,
  notes: string,
  jobs: Job[],
  classifiedBy: string = 'legacy',
): JobList {
  return {
    id: `jl_${Date.now()}`,
    name,
    notes,
    jobCount: jobs.length,
    jobs,
    createdAt: new Date().toISOString(),
    classifiedBy,
  };
}
