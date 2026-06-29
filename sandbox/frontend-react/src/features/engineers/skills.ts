/**
 * Skill catalogue for engineers and jobs.
 *
 * Source of truth: the InView "Job & Engineer Attributes Bridge" dictionary
 * (Docs/Job and Engineer Attributes Bridge/Believ/Jobs/job_skill_integer_breakdown.csv).
 * Skill codes are 4-digit integers: [brand prefix][action suffix], e.g.
 *   1103 = brand 11 (Alfen) + action 03 (Maintenance & PI)
 *   1003 = brand 10 (General) + action 03 (Maintenance)
 * Engineers may carry codes outside the dictionary; those are preserved and
 * surfaced as raw chips rather than dropped.
 */

export interface SkillCategory {
  /** Numeric VROOM skill code. */
  code: number;
  /** Human-readable label, e.g. "Alfen · Maintenance & PI". */
  label: string;
  /** Brand / category name, e.g. "Alfen". */
  brand: string;
  /** Action label, e.g. "Maintenance & PI". */
  action: string;
}

/** Brand prefixes (first two digits of a skill code). */
const BRANDS: Record<number, string> = {
  10: 'General',
  11: 'Alfen',
  12: 'Etrel',
  13: 'Tritium',
  14: 'Efacec',
  15: 'Wallbox',
  16: 'Kempower',
  17: 'CTEK',
  18: 'Delta',
  19: 'Star Charger',
  20: 'Compleo',
  21: 'Urban Fox',
  22: 'Ingeteam',
  23: 'Autel',
  24: 'Siemens',
  25: 'Zerova',
};

/** Action suffixes (last two digits). */
const ACTIONS: Record<number, string> = {
  1: 'Installation',
  2: 'SW / Config',
  3: 'Maintenance & PI',
  5: 'SW Diagnostics',
  6: 'ATEX Awareness',
};

/**
 * Valid action suffixes per brand prefix, per the dictionary CSV. General
 * carries the broadest competency set; most brands are Install / SW / Maint.
 */
const BRAND_ACTIONS: Record<number, number[]> = {
  10: [1, 2, 3, 5, 6],
  11: [1, 2, 3],
  12: [1, 2, 3],
  13: [1, 3],
  14: [1, 2, 3],
  15: [1, 2, 3],
  16: [1, 2, 3],
  17: [1, 2, 3],
  18: [1, 2, 3],
  19: [1, 2, 3],
  20: [1, 2, 3],
  21: [1, 2, 3],
  22: [1, 2, 3],
  23: [1, 2, 3],
  24: [1, 2, 3],
  25: [1, 2, 3],
};

function buildCatalog(): SkillCategory[] {
  const out: SkillCategory[] = [];
  for (const [prefixStr, actions] of Object.entries(BRAND_ACTIONS)) {
    const prefix = Number(prefixStr);
    const brand = BRANDS[prefix];
    for (const suffix of actions) {
      out.push({
        code: prefix * 100 + suffix,
        brand,
        action: ACTIONS[suffix],
        label: `${brand} · ${ACTIONS[suffix]}`,
      });
    }
  }
  return out;
}

/** The full EV-charging skill catalogue, ordered by code. */
export const SKILL_CATEGORIES: readonly SkillCategory[] = buildCatalog();

/** Catalogue grouped by brand, for grouped pickers. */
export const SKILL_GROUPS: readonly { brand: string; skills: SkillCategory[] }[] = Object.values(BRANDS).map(
  (brand) => ({ brand, skills: SKILL_CATEGORIES.filter((s) => s.brand === brand) }),
);

const LABEL_BY_CODE = new Map(SKILL_CATEGORIES.map((s) => [s.code, s.label]));

/** Display label for a skill code; falls back to the raw code for unmapped values. */
export function skillLabel(code: number): string {
  return LABEL_BY_CODE.get(code) ?? `Skill ${code}`;
}

/** True when a code belongs to the known skill catalogue. */
export function isKnownSkill(code: number): boolean {
  return LABEL_BY_CODE.has(code);
}
