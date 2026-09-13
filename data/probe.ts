// Prints what the annotation and transmitter files actually contain for our rules.
// Run before build: `npm run data:probe`
import { join } from 'node:path';
import { readTable, stringColumn, numberColumn } from './feather.js';
import { RAW_DIR, FILES, COLS } from './columns.js';
import { RULES, REQUESTED_TYPES, requestedSatisfiedBy, matchRule } from './subcircuit.js';

const ann = readTable(join(RAW_DIR, FILES.annotations));
const N = ann.numRows;
for (const c of Object.values(COLS.ann)) if (!ann.getChild(c)) throw new Error(`annotations: column ${c} missing`);
const type = stringColumn(ann, COLS.ann.type);
const superclass = stringColumn(ann, COLS.ann.superclass);
const subclass = stringColumn(ann, COLS.ann.subclass);
const somaSide = stringColumn(ann, COLS.ann.somaSide);
const hex1 = numberColumn(ann, COLS.ann.hex1);
const hex2 = numberColumn(ann, COLS.ann.hex2);
const status = stringColumn(ann, COLS.ann.status);

console.log(`annotations rows: ${N}`);
const perRule = new Map<string, Map<string, number>>();
const sideStats = new Map<string, [number, number, number]>();
const hexStats = new Map<string, [number, number]>();
const hexRange = { h1: [Infinity, -Infinity], h2: [Infinity, -Infinity] };
const statusStats = new Map<string, number>();
let selected = 0;
for (let i = 0; i < N; i++) {
  const row = { type: type(i), superclass: superclass(i), subclass: subclass(i) };
  const rule = matchRule(row);
  if (!rule) continue;
  selected++;
  const t = row.type ?? '(untyped)';
  const m = perRule.get(rule.label) ?? new Map<string, number>();
  m.set(t, (m.get(t) ?? 0) + 1);
  perRule.set(rule.label, m);
  const s = somaSide(i);
  const ss = sideStats.get(rule.label) ?? [0, 0, 0];
  ss[s === 'L' ? 0 : s === 'R' ? 1 : 2]++;
  sideStats.set(rule.label, ss);
  const hs = hexStats.get(rule.label) ?? [0, 0];
  const h1 = hex1(i), h2 = hex2(i);
  hs[h1 == null ? 1 : 0]++;
  if (h1 != null && h2 != null) {
    hexRange.h1[0] = Math.min(hexRange.h1[0], h1); hexRange.h1[1] = Math.max(hexRange.h1[1], h1);
    hexRange.h2[0] = Math.min(hexRange.h2[0], h2); hexRange.h2[1] = Math.max(hexRange.h2[1], h2);
  }
  hexStats.set(rule.label, hs);
  const st = `${rule.label} / ${status(i)}`;
  statusStats.set(st, (statusStats.get(st) ?? 0) + 1);
}
console.log(`selected bodies: ${selected}`);
console.log(`hex ranges among selected: hex1 ${hexRange.h1}, hex2 ${hexRange.h2}`);
const found: string[] = [];
let motorCount = 0;
for (const rule of RULES) {
  const m = perRule.get(rule.label) ?? new Map<string, number>();
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (rule.region === 'motor') motorCount = total;
  console.log(`\n[${rule.region}] ${rule.label}: ${total} bodies, sides L/R/other = ${sideStats.get(rule.label)}, hex yes/no = ${hexStats.get(rule.label)}`);
  for (const [t, c] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${t.padEnd(32)} ${c}`);
    if (rule.region !== 'motor') found.push(t);
  }
}
console.log('\nstatus by rule:');
for (const [k, v] of statusStats) console.log(`   ${k.padEnd(48)} ${v}`);
console.log('\nrequested types:');
for (const r of REQUESTED_TYPES) console.log(`   ${r.padEnd(20)} ${requestedSatisfiedBy(r, found, motorCount) ? 'found' : 'MISSING'}`);

// near misses: labels containing our stems that no rule matched
const stems = ['R1', 'L1', 'Mi1', 'T4', 'LC4', 'EPG', 'PEN', 'DNp09', 'DLM', 'DVM', 'wm'];
const near = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const row = { type: type(i), superclass: superclass(i), subclass: subclass(i) };
  if (matchRule(row)) continue;
  const t = row.type;
  if (t && stems.some((s) => t.includes(s))) near.set(t, (near.get(t) ?? 0) + 1);
}
console.log('\nnear misses (unselected labels containing our stems):');
for (const [t, c] of [...near.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`   ${t.padEnd(32)} ${c}`);

// transmitter file
const nt = readTable(join(RAW_DIR, FILES.neurotransmitters));
for (const c of Object.values(COLS.nt)) if (!nt.getChild(c)) throw new Error(`neurotransmitters: column ${c} missing`);
const pred = stringColumn(nt, COLS.nt.predicted);
const ntCounts = new Map<string, number>();
for (let i = 0; i < nt.numRows; i++) { const v = pred(i) ?? 'null'; ntCounts.set(v, (ntCounts.get(v) ?? 0) + 1); }
console.log(`\ntransmitter rows: ${nt.numRows}; predicted_nt values:`);
for (const [k, v] of [...ntCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(20)} ${v}`);
