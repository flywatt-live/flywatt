// The named subcircuit: visual input to wing motor pathway.
// One rule per region; a body is selected if its `type` matches the regex or,
// when `where` is given, the predicate on annotation columns holds.
// The list requested by BRIEF.md section 3.2 is kept verbatim in REQUESTED_TYPES so
// meta.json can report which of them exist in the dataset and which do not.

export const REGIONS = ['sensory', 'lamina', 'medulla', 'lobula', 'central', 'descending', 'motor'] as const;
export type Region = (typeof REGIONS)[number];

export interface AnnRow {
  type: string | null;
  superclass: string | null;
  subclass: string | null;
}

export interface Rule {
  region: Region;
  /** Matched against the `type` column. */
  type: RegExp;
  /** Optional predicate on the annotation row, used instead of `type`. */
  where?: (row: AnnRow) => boolean;
  /** Human label used in logs. */
  label: string;
}

export const RULES: Rule[] = [
  { region: 'sensory', label: 'R1-R6 photoreceptors', type: /^R(1-6|1-R6|[1-6])$/ },
  { region: 'lamina', label: 'lamina', type: /^(L1|L2|L3|L5|Am1?|C2|C3)$/ },
  { region: 'medulla', label: 'medulla', type: /^(Mi1|Tm1|Tm2|Tm3|Tm9|T4[a-d]|T5[a-d])$/ },
  { region: 'lobula', label: 'lobula', type: /^(LC4|LC6|LC9|LC11|LPLC1|LPLC2)$/ },
  // the ring plus the GABAergic ellipsoid body ring neurons (ER) that inhibit it; without them
  // the isolated recurrent EPG/PEN loop has no brake and bursts on its own
  { region: 'central', label: 'head direction ring', type: /^(EPG|EPGt|PEN_a\(PEN1\)|PEN_b\(PEN2\)|PEG|Delta7|ER[1-6][A-Za-z0-9_]*)$/ },
  { region: 'descending', label: 'descending', type: /^(DNa01|DNa02|DNp09|DNg13)$/ },
  {
    region: 'motor',
    label: 'wing motor neurons',
    type: /./,
    where: (r) => r.superclass === 'vnc_motor' && r.subclass === 'wm',
  },
];

/** Cell types named in the brief, for the found / missing report. */
export const REQUESTED_TYPES = [
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6',
  'L1', 'L2', 'L3', 'L5', 'Am', 'C2', 'C3',
  'Mi1', 'Tm1', 'Tm2', 'Tm3', 'Tm9', 'T4', 'T5',
  'LC4', 'LC6', 'LC9', 'LC11', 'LPLC1', 'LPLC2',
  'EPG', 'PEN', 'PEG', 'Delta7',
  'DNa01', 'DNa02', 'DNp09', 'DNg13',
  'wing motor neurons',
];

/** Whether a requested name is satisfied by the dataset labels that were found. */
export function requestedSatisfiedBy(requested: string, foundTypes: string[], motorCount: number): boolean {
  if (requested === 'wing motor neurons') return motorCount > 0;
  if (/^R[1-6]$/.test(requested)) return foundTypes.some((t) => /^R(1-6|1-R6)$/.test(t) || t === requested);
  if (requested === 'Am') return foundTypes.some((t) => /^Am1?$/.test(t));
  if (requested === 'T4' || requested === 'T5') return foundTypes.some((t) => t.startsWith(requested));
  if (requested === 'PEN') return foundTypes.some((t) => t.startsWith('PEN'));
  return foundTypes.includes(requested);
}

export function regionIndex(r: Region): number {
  return REGIONS.indexOf(r);
}

export function matchRule(row: AnnRow): Rule | null {
  const t = row.type;
  for (const rule of RULES) {
    if (rule.where) {
      if (rule.where(row)) return rule;
      continue;
    }
    if (t && rule.type.test(t)) return rule;
  }
  return null;
}

/**
 * Transmitter prediction to synaptic sign.
 * Histamine is the photoreceptor transmitter in the fly and is inhibitory on lamina cells
 * (histamine-gated chloride channels), so it maps to -1.
 */
export const NT_SIGN: Record<string, -1 | 0 | 1> = {
  acetylcholine: 1,
  gaba: -1,
  glutamate: -1,
  histamine: -1,
  dopamine: 0,
  octopamine: 0,
  serotonin: 0,
  unknown: 0,
  unclear: 0,
};
