/**
 * Claude (Anthropic) skill classification for the jobs-CSV import. Ports the
 * legacy classifyWithClaude flow from app.js: builds the dispatcher system
 * prompt + a single user message of job rows, POSTs to the `/api/classify`
 * proxy (which adds the server-side Anthropic key and returns the RAW
 * Anthropic Messages response), and parses `content[0].text` into per-job
 * classifications.
 *
 * On any failure (network, proxy error, unparseable reply) the caller falls
 * back to the rule-based legacyClassify so the import always succeeds.
 */

import { apiFetch } from '@/lib/api';
import type { AiJobInput } from './importJobs';

/**
 * Model id sent to the `/api/classify` proxy. This is the exact string the
 * legacy app.js passes and matches the backend's configured CLAUDE_MODEL —
 * treat it as a fixed fact, do not "correct" it.
 */
export const CLAUDE_MODEL = 'claude-sonnet-4-6';

/** Value written to JobList.classifiedBy for the AI path (legacy parity). */
export const CLAUDE_CLASSIFIED_BY = 'claude-sonnet-4.6';

/** Per-job result of AI classification, index-aligned with the input batch. */
export interface AiClassification {
  skills: number[];
  manufacturer: string;
  reasoning: string;
}

/** The shape the model is asked to return, before normalisation. */
interface RawClassification {
  job_index?: number;
  skills?: unknown;
  manufacturer?: unknown;
  reasoning?: unknown;
}

/** Minimal slice of the Anthropic Messages response we read. */
interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

const AI_SYSTEM_PROMPT = `You are an expert field service dispatcher for EV charger maintenance at Yunex Traffic / Believ.

SKILL CODE LOGIC:
Skills are 4-digit integers: [Manufacturer Prefix] + [Action Suffix]

Prefixes:
10=General, 11=Alfen, 12=Etrel, 13=Tritium, 14=Efacec, 15=Wallbox, 16=Kempower, 17=CTEK, 18=Delta, 19=Star Charger, 20=Compleo, 21=Urban Fox, 22=Ingeteam, 23=Autel, 24=Siemens, 25=Zerova

Suffixes:
01 = Installation & Commissioning
02 = SW / Config
03 = Maintenance Fault Finding & PI

JOB TYPES: SPO/SPD=Periodic Inspection, SRO/SRD=Reactive, SLO/SLD=Legislative

RULES:
1. Identify the manufacturer from the site description. If found, use their prefix. If unknown or not listed, use 10 (General).
2. For periodic or legislative inspections (SPO, SPD, SLO, SLD): assign the maintenance fault finding skill for that manufacturer (e.g., Alfen -> [1103], Etrel -> [1203], General -> [1003]).
3. For reactive jobs (SRO, SRD): assign the full fault-finding skill set for the manufacturer, which usually includes SW/Config and Maintenance (e.g., Alfen -> [1102, 1103], Etrel -> [1202, 1203]).
4. If a specific fault is mentioned:
   - "RCD Trip" or "External Damage": No specific skill needed -> []
   - "Comms Fault": SW/Config + Maintenance -> [Prefix+02, Prefix+03]
   - "Power Issue": Install + SW/Config + Maintenance -> [Prefix+01, Prefix+02, Prefix+03]
5. Return ONLY a valid JSON array, without any markdown formatting.

RESPONSE FORMAT:
[{"job_index":0,"skills":[1103],"manufacturer":"Alfen","site_type":"22kWAC","reasoning":"..."},...]`;

/** Coerce an unknown `skills` value into a numeric array (drops non-numbers). */
function toSkills(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => (typeof s === 'number' ? s : Number(s)))
    .filter((n) => Number.isFinite(n));
}

/**
 * Robustly extract a JSON array from the model's text. Handles ```json fences
 * and prose surrounding the array. Returns null if no array can be parsed.
 */
function parseClassificationText(text: string): RawClassification[] | null {
  let raw = text.trim();

  // Strip a leading ```json / ``` fence and a trailing ``` fence.
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\r?\n?/, '').replace(/\r?\n?```$/, '');
    raw = raw.trim();
  }

  const tryParse = (s: string): RawClassification[] | null => {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? (parsed as RawClassification[]) : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct) return direct;

  // Fall back to the first bracketed array embedded in surrounding prose.
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end > start) {
    const sliced = tryParse(raw.slice(start, end + 1));
    if (sliced) return sliced;
  }

  return null;
}

export interface ClassifyResult {
  classifications: AiClassification[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Classify a batch of jobs with Claude via the `/api/classify` proxy.
 *
 * Returns one `AiClassification` per input job, in input order. Throws on any
 * failure (HTTP error, missing text, unparseable JSON) so the caller can fall
 * back to the rule-based classifier and surface a toast.
 */
export async function classifyWithClaude(batch: AiJobInput[]): Promise<ClassifyResult> {
  const jobLines = batch
    .map(
      (j, i) =>
        `[${i}] Site Ref: ${j.site_ref} | Site Desc: "${j.site_description}" | Type: ${j.job_type} | Name: "${j.job_site_name}"`,
    )
    .join('\n');

  const data = await apiFetch<AnthropicResponse>('/classify', {
    method: 'POST',
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: AI_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify these ${batch.length} jobs:\n\n${jobLines}`,
        },
      ],
    }),
  });

  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('No text in Claude response');

  const parsed = parseClassificationText(textBlock.text);
  if (!parsed) throw new Error('Could not parse Claude classification JSON');

  // Reorder by job_index when present (the model is told to echo it); default
  // to positional order. Fill any gaps with the General skill so the result is
  // always index-aligned with the input batch.
  const byIndex = new Map<number, RawClassification>();
  parsed.forEach((c, i) => {
    const idx = typeof c.job_index === 'number' ? c.job_index : i;
    byIndex.set(idx, c);
  });

  const classifications: AiClassification[] = batch.map((_, i) => {
    const c = byIndex.get(i);
    return {
      skills: c ? toSkills(c.skills) : [1003],
      manufacturer: c && typeof c.manufacturer === 'string' ? c.manufacturer : 'Unknown',
      reasoning: c && typeof c.reasoning === 'string' ? c.reasoning : 'No classification returned',
    };
  });

  return { classifications, usage: data.usage };
}
