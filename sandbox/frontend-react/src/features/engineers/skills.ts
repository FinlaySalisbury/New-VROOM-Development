/**
 * Skill catalogue for engineers.
 *
 * The six canonical skill categories defined in CLAUDE.md, mapped to the
 * numeric VROOM skill codes the solver enforces as hard constraints. Engineers
 * may also carry legacy/AI-assigned codes that don't map to a category (e.g.
 * manufacturer codes like 1103); those are preserved and surfaced as raw chips
 * rather than being silently dropped.
 */

export interface SkillCategory {
  /** Numeric VROOM skill code. */
  code: number;
  /** Human-readable category label. */
  label: string;
}

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  { code: 1, label: 'Traffic Light Repair' },
  { code: 2, label: 'CCTV Maintenance' },
  { code: 3, label: 'Fibre Splicing' },
  { code: 4, label: 'High Voltage' },
  { code: 5, label: 'Sign Installation' },
  { code: 6, label: 'Road Marking' },
] as const;

const LABEL_BY_CODE = new Map(SKILL_CATEGORIES.map((s) => [s.code, s.label]));

/** Display label for a skill code; falls back to the raw code for unmapped values. */
export function skillLabel(code: number): string {
  return LABEL_BY_CODE.get(code) ?? `Skill ${code}`;
}

/** True when a code belongs to one of the six canonical categories. */
export function isKnownSkill(code: number): boolean {
  return LABEL_BY_CODE.has(code);
}
