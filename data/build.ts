// Builds the subcircuit binaries from the MaleCNS v1.0 flat connectome.
//   npm run data:build
// Reads data/raw/*.feather, writes data/out/*.bin (uncompressed, for Node scripts),
// public/data/<name>.<hash>.bin.gz and public/data/meta.json. Everything logged here is
// also recorded in meta.json so the site can state it.
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readTable, streamBatches, stringColumn, numberColumn, int64Column, int64At } from './feather.js';
import { RAW_DIR, FILES, COLS, BASE_URL } from './columns.js';
import { REGIONS, RULES, REQUESTED_TYPES, requestedSatisfiedBy, matchRule, regionIndex, NT_SIGN } from './subcircuit.js';
import { encodeNeurons, encodeConnectome, PX_NONE } from '../src/sim/format.js';
import type { Meta, TypeMeta } from '../src/sim/meta.js';

const OUT_DIR = 'data/out';
const PUB_DIR = 'public/data';
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PUB_DIR, { recursive: true });

/** Edges with fewer synapses than this are not loaded. Recorded in meta.thresholds. */
const BASE_MIN_WEIGHT = 2;
/** Hard budget for the browser: CSR entries. */
const MAX_EDGES = 8_000_000;
/** Hard budget for the gzipped connectome file. */
const MAX_GZ_BYTES = 30 * 1024 * 1024;
/** Photoreceptor grid per eye: hex column coordinates of the optic lobe fit in 40 x 40. */
const GRID: [number, number] = [40, 40];

const log: string[] = [];
function say(s: string) {
  console.log(s);
  log.push(s);
}

// ---------------------------------------------------------------- 1. annotations
const t0 = Date.now();
const ann = readTable(join(RAW_DIR, FILES.annotations));
for (const c of Object.values(COLS.ann)) if (!ann.getChild(c)) throw new Error(`annotations: column ${c} missing`);
const A = ann.numRows;
const aBody = numberColumn(ann, COLS.ann.bodyId);
const aType = stringColumn(ann, COLS.ann.type);
const aSuper = stringColumn(ann, COLS.ann.superclass);
const aSub = stringColumn(ann, COLS.ann.subclass);
const aSide = stringColumn(ann, COLS.ann.somaSide);
const aHex1 = numberColumn(ann, COLS.ann.hex1);
const aHex2 = numberColumn(ann, COLS.ann.hex2);

interface Sel {
  bodyId: number;
  typeName: string;
  region: number;
  side: number; // 0 L, 1 R, 2 other/unknown
  hex1: number; // -1 when absent
  hex2: number;
  sign: number;
  nt: string;
}
const sel: Sel[] = [];
let typedBodies = 0;
for (let i = 0; i < A; i++) {
  const type = aType(i);
  if (type) typedBodies++;
  const row = { type, superclass: aSuper(i), subclass: aSub(i) };
  const rule = matchRule(row);
  if (!rule) continue;
  const bodyId = aBody(i)!;
  if (!Number.isSafeInteger(bodyId)) throw new Error(`bodyId ${bodyId} not a safe integer`);
  const s = aSide(i);
  const typeName = type ?? (rule.region === 'motor' ? 'wing MN (untyped)' : '(untyped)');
  sel.push({
    bodyId,
    typeName,
    region: regionIndex(rule.region),
    side: s === 'L' ? 0 : s === 'R' ? 1 : 2,
    hex1: aHex1(i) ?? -1,
    hex2: aHex2(i) ?? -1,
    sign: 0,
    nt: 'unknown',
  });
}
say(`annotations: ${A} bodies, ${typedBodies} typed; selected ${sel.length} in ${Date.now() - t0} ms`);

// ---------------------------------------------------------------- 2. transmitter predictions
const nt = readTable(join(RAW_DIR, FILES.neurotransmitters));
for (const c of Object.values(COLS.nt)) if (!nt.getChild(c)) throw new Error(`neurotransmitters: column ${c} missing`);
const selByBody = new Map<number, Sel>();
for (const s of sel) selByBody.set(s.bodyId, s);
{
  const nBody = numberColumn(nt, COLS.nt.body);
  const nPred = stringColumn(nt, COLS.nt.predicted);
  const nCell = stringColumn(nt, COLS.nt.celltypePredicted);
  let perBody = 0, perType = 0;
  for (let i = 0; i < nt.numRows; i++) {
    const s = selByBody.get(nBody(i)!);
    if (!s) continue;
    const p = nPred(i);
    const c = nCell(i);
    if (p && p !== 'unclear') { s.nt = p; perBody++; }
    else if (c && c !== 'unclear') { s.nt = c; perType++; }
  }
  say(`transmitters: ${perBody} bodies from predicted_nt, ${perType} from celltype_predicted_nt, ${sel.length - perBody - perType} unknown`);
}
const ntSeen = new Map<string, number>();
for (const s of sel) {
  const key = s.nt.toLowerCase();
  ntSeen.set(key, (ntSeen.get(key) ?? 0) + 1);
  if (!(key in NT_SIGN)) say(`WARNING transmitter label "${s.nt}" not in NT_SIGN, treated as 0`);
  s.sign = NT_SIGN[key] ?? 0;
}
say(`transmitter labels among selected: ${[...ntSeen.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
const ntUnknown = sel.filter((s) => s.sign === 0).length;

// ---------------------------------------------------------------- 3. types and ordering
// neurons are ordered by (region, type, side, bodyId) so regions and types are contiguous
const typeKey = (region: number, name: string) => region + '|' + name;
const typeNames = [...new Set(sel.map((s) => typeKey(s.region, s.typeName)))]
  .map((k) => ({ region: Number(k.slice(0, k.indexOf('|'))), name: k.slice(k.indexOf('|') + 1) }))
  .sort((a, b) => a.region - b.region || a.name.localeCompare(b.name, 'en', { numeric: true }));
const typeIndex = new Map<string, number>();
typeNames.forEach((t, i) => typeIndex.set(typeKey(t.region, t.name), i));
const typeOf = (s: Sel) => typeIndex.get(typeKey(s.region, s.typeName))!;
sel.sort((a, b) => a.region - b.region || typeOf(a) - typeOf(b) || a.side - b.side || a.bodyId - b.bodyId);
const N = sel.length;
const indexOfBody = new Map<number, number>();
sel.forEach((s, i) => indexOfBody.set(s.bodyId, i));

// ---------------------------------------------------------------- 4. stream the weights file
const tw = Date.now();
let cap = 1 << 22;
let ePre = new Uint32Array(cap), ePost = new Uint32Array(cap), eW = new Uint32Array(cap);
let E = 0;
let totalEdges = 0, totalSyn = 0;
let batches = 0;
{
  let checked = false;
  for await (const batch of streamBatches(join(RAW_DIR, FILES.weights))) {
    const pre = int64Column(batch, COLS.w.pre), post = int64Column(batch, COLS.w.post), w = int64Column(batch, COLS.w.weight);
    const L = batch.numRows;
    if (!checked) {
      // sanity: the split-word read must agree with the bigint read on the first rows
      const v = batch.getChild(COLS.w.pre)!;
      for (let i = 0; i < Math.min(L, 8); i++) if (Number(v.get(i)) !== int64At(pre, i)) throw new Error('int64 read mismatch');
      checked = true;
    }
    for (let i = 0; i < L; i++) {
      const wt = int64At(w, i);
      totalEdges++;
      totalSyn += wt;
      const a = indexOfBody.get(int64At(pre, i));
      if (a === undefined) continue;
      const b = indexOfBody.get(int64At(post, i));
      if (b === undefined) continue;
      if (E === cap) {
        cap *= 2;
        const p2 = new Uint32Array(cap); p2.set(ePre); ePre = p2;
        const q2 = new Uint32Array(cap); q2.set(ePost); ePost = q2;
        const w2 = new Uint32Array(cap); w2.set(eW); eW = w2;
      }
      ePre[E] = a; ePost[E] = b; eW[E] = wt; E++;
    }
    if (++batches % 200 === 0) console.log(`  ${(totalEdges / 1e6).toFixed(1)} M rows scanned, ${E} kept`);
  }
}
say(`weights: ${totalEdges} edges / ${totalSyn} synapses in the full dataset; ${E} edges inside the subcircuit (${Date.now() - tw} ms)`);

// ---------------------------------------------------------------- 5. thresholds and budget
const R = REGIONS.length;
const pairMin = new Int32Array(R * R).fill(BASE_MIN_WEIGHT);
const overrides: [string, string, number][] = [];
let droppedEdges = 0, droppedSyn = 0, droppedUnknown = 0;
const keep = new Uint8Array(E);
function applyThresholds(): number {
  let kept = 0;
  droppedEdges = 0; droppedSyn = 0; droppedUnknown = 0;
  for (let e = 0; e < E; e++) {
    const p = sel[ePre[e]];
    if (p.sign === 0) { keep[e] = 0; droppedUnknown++; continue; }
    const q = sel[ePost[e]];
    if (eW[e] < pairMin[p.region * R + q.region]) { keep[e] = 0; droppedEdges++; droppedSyn += eW[e]; continue; }
    keep[e] = 1; kept++;
  }
  return kept;
}
let M = applyThresholds();
say(`thresholds: base min weight ${BASE_MIN_WEIGHT}: ${M} edges kept, ${droppedEdges} below threshold, ${droppedUnknown} with unknown presynaptic sign`);
function estimateGz(): number {
  // cheap proxy: compressed size scales with M; measured properly after encoding
  return M * 3.2;
}
while (M > MAX_EDGES || estimateGz() > MAX_GZ_BYTES) {
  const pairCount = new Uint32Array(R * R);
  for (let e = 0; e < E; e++) if (keep[e]) pairCount[sel[ePre[e]].region * R + sel[ePost[e]].region]++;
  let best = 0;
  for (let i = 1; i < R * R; i++) if (pairCount[i] > pairCount[best]) best = i;
  pairMin[best]++;
  const pr = REGIONS[Math.floor(best / R)], po = REGIONS[best % R];
  const before = M;
  M = applyThresholds();
  overrides.push([pr, po, pairMin[best]]);
  say(`budget: ${pr} -> ${po} min weight raised to ${pairMin[best]}, edges ${before} -> ${M}`);
}

// ---------------------------------------------------------------- 6. photoreceptor positions
// R1-R6 bodies carry no hex column and no soma side in this dataset; each is placed at the
// hex column of its strongest lamina target that has one, and takes that target's side.
const px = new Uint8Array(N).fill(PX_NONE);
const py = new Uint8Array(N).fill(PX_NONE);
const sideOut = new Uint8Array(N);
sel.forEach((s, i) => (sideOut[i] = s.side));
const laminaIdx = regionIndex('lamina');
const sensoryIdx = regionIndex('sensory');
let fromHex = 0, fromHash = 0, nPhoto = 0;
{
  const bestW = new Uint32Array(N);
  const bestT = new Int32Array(N).fill(-1);
  for (let e = 0; e < E; e++) {
    const a = ePre[e];
    if (sel[a].region !== sensoryIdx) continue;
    const b = ePost[e];
    const q = sel[b];
    if (q.region !== laminaIdx || q.hex1 < 0) continue;
    if (eW[e] > bestW[a]) { bestW[a] = eW[e]; bestT[a] = b; }
  }
  const fnv = (x: number) => { let h = 0x811c9dc5; for (let k = 0; k < 4; k++) { h ^= (x >>> (k * 8)) & 255; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  for (let i = 0; i < N; i++) {
    const s = sel[i];
    if (s.region !== sensoryIdx) continue;
    nPhoto++;
    let h1: number, h2: number;
    if (s.hex1 >= 0) { h1 = s.hex1; h2 = s.hex2; fromHex++; }
    else if (bestT[i] >= 0) { const q = sel[bestT[i]]; h1 = q.hex1; h2 = q.hex2; if (s.side === 2) sideOut[i] = q.side; fromHex++; }
    else { const h = fnv(s.bodyId); h1 = 1 + (h % (GRID[0] - 1)); h2 = 1 + ((h >>> 8) % (GRID[1] - 1)); if (s.side === 2) sideOut[i] = (h >>> 16) & 1; fromHash++; }
    if (h1 < 0 || h1 >= GRID[0] || h2 < 0 || h2 >= GRID[1]) throw new Error(`hex out of grid: ${h1},${h2}`);
    px[i] = h1; py[i] = h2;
  }
}
say(`photoreceptors: ${nPhoto}, ${fromHex} placed from hex columns (own or lamina target), ${fromHash} by hash`);

// ---------------------------------------------------------------- 7. CSR
const indptr = new Uint32Array(N + 1);
for (let e = 0; e < E; e++) if (keep[e]) indptr[ePre[e] + 1]++;
for (let i = 0; i < N; i++) indptr[i + 1] += indptr[i];
const indices = new Uint32Array(M);
const weights = new Int16Array(M);
{
  const fill = indptr.slice(0, N);
  for (let e = 0; e < E; e++) {
    if (!keep[e]) continue;
    const a = ePre[e];
    const k = fill[a]++;
    indices[k] = ePost[e];
    weights[k] = Math.max(-32767, Math.min(32767, sel[a].sign * eW[e]));
  }
  // sort each row by target index (cache friendly, compresses better)
  for (let i = 0; i < N; i++) {
    const s = indptr[i], t = indptr[i + 1];
    if (t - s < 2) continue;
    const order = Array.from({ length: t - s }, (_, k) => s + k).sort((x, y) => indices[x] - indices[y]);
    const ii = order.map((k) => indices[k]), ww = order.map((k) => weights[k]);
    indices.set(ii, s); weights.set(ww, s);
  }
}
let synLoaded = 0;
for (let k = 0; k < M; k++) synLoaded += Math.abs(weights[k]);

// ---------------------------------------------------------------- 8. encode, gzip, write
const neuronsBuf = encodeNeurons({
  n: N,
  nTypes: typeNames.length,
  bodyId: Float64Array.from(sel, (s) => s.bodyId),
  typeIdx: Uint16Array.from(sel, (s) => typeOf(s)),
  region: Uint8Array.from(sel, (s) => s.region),
  sign: Int8Array.from(sel, (s) => s.sign),
  side: sideOut,
  px,
  py,
});
const connBuf = encodeConnectome({ n: N, m: M, indptr, indices, weights });
const neuronsGz = gzipSync(Buffer.from(neuronsBuf), { level: 9 });
const connGz = gzipSync(Buffer.from(connBuf), { level: 9 });
if (connGz.length > MAX_GZ_BYTES) throw new Error(`connectome gz ${connGz.length} B exceeds budget; lower MAX_EDGES`);
const hash = createHash('sha256').update(Buffer.from(neuronsBuf)).update(Buffer.from(connBuf)).digest('hex').slice(0, 8);
// gzip bytes inside a .fwb file on purpose: .gz or .bin extensions make servers add Content-Encoding
// and download managers intercept them. The loader sniffs the gzip magic and inflates in the page.
for (const f of readdirSync(PUB_DIR)) if (/.(fwb|bin|gz)$/.test(f)) unlinkSync(join(PUB_DIR, f));
const neuronsName = `neurons.${hash}.fwb`, connName = `connectome.${hash}.fwb`;
writeFileSync(join(PUB_DIR, neuronsName), neuronsGz);
writeFileSync(join(PUB_DIR, connName), connGz);
writeFileSync(join(OUT_DIR, 'neurons.bin'), Buffer.from(neuronsBuf));
writeFileSync(join(OUT_DIR, 'connectome.bin'), Buffer.from(connBuf));
say(`wrote ${neuronsName} (${neuronsGz.length} B gz) and ${connName} (${connGz.length} B gz)`);

// ---------------------------------------------------------------- 9. meta.json
const types: TypeMeta[] = typeNames.map((t, ti) => {
  const members = sel.filter((s) => typeOf(s) === ti);
  const ntHist: Record<string, number> = {};
  for (const s of members) ntHist[s.nt.toLowerCase()] = (ntHist[s.nt.toLowerCase()] ?? 0) + 1;
  const majority = Object.entries(ntHist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
  const sides: [number, number, number] = [0, 0, 0];
  members.forEach((s) => sides[sideOut[indexOfBody.get(s.bodyId)!]]++);
  return { name: t.name, region: t.region, offset: indexOfBody.get(members[0].bodyId)!, count: members.length, nt: ntHist, sign: NT_SIGN[majority] ?? 0, sides };
});
const regionOffsets: number[] = [];
for (let r = 0; r < R; r++) regionOffsets.push(sel.findIndex((s) => s.region >= r) === -1 ? N : sel.findIndex((s) => s.region >= r));
regionOffsets.push(N);
const foundTypes = typeNames.filter((t) => t.region !== regionIndex('motor')).map((t) => t.name);
const motorCount = sel.filter((s) => s.region === regionIndex('motor')).length;
const missing = REQUESTED_TYPES.filter((r) => !requestedSatisfiedBy(r, foundTypes, motorCount));
const meta: Meta = {
  schema: 1,
  built_at: new Date().toISOString(),
  build_hash: hash,
  dataset: {
    name: 'Janelia FlyEM Male CNS connectome',
    short: 'MaleCNS',
    version: 'v1.0',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    url: 'https://male-cns.janelia.org/',
    download_url: 'https://male-cns.janelia.org/download/',
    citation: 'Janelia FlyEM Project Team, Male CNS connectome v1.0, with Google Research and collaborators.',
    files: Object.values(FILES).map((name) => ({ name, bytes: statSync(join(RAW_DIR, name)).size })),
  },
  n_neurons: N,
  n_edges: M,
  n_synapses: synLoaded,
  full: { n_bodies_annotated: A, n_bodies_typed: typedBodies, n_edges_total: totalEdges, n_synapses_total: totalSyn },
  regions: [...REGIONS],
  region_offsets: regionOffsets,
  types,
  requested_types: REQUESTED_TYPES,
  found_types: foundTypes,
  missing_types: missing,
  nt_field: 'predicted_nt per body, celltype_predicted_nt when absent',
  nt_sign_map: NT_SIGN,
  nt_unknown_count: ntUnknown,
  thresholds: {
    base_min_weight: BASE_MIN_WEIGHT,
    pair_overrides: overrides,
    dropped_edges_threshold: droppedEdges,
    dropped_synapses_threshold: droppedSyn,
    dropped_edges_unknown_sign: droppedUnknown,
  },
  photoreceptors: {
    n: nPhoto,
    grid: GRID,
    eyes: 2,
    from_hex_columns: fromHex,
    from_hash: fromHash,
    assignment: 'hex column of the strongest lamina target (assignedOlHex1/2); hash fallback',
  },
  files: {
    neurons: neuronsName,
    neurons_bytes: neuronsBuf.byteLength,
    neurons_bytes_gz: neuronsGz.length,
    connectome: connName,
    connectome_bytes: connBuf.byteLength,
    connectome_bytes_gz: connGz.length,
  },
};
writeFileSync(join(PUB_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
writeFileSync(join(OUT_DIR, 'build.log'), log.join('\n') + '\n');
say(`meta.json: ${N} neurons, ${M} edges, ${synLoaded} synapses, ${types.length} types, missing: ${missing.length ? missing.join(', ') : 'none'}`);
for (const t of types) say(`   ${REGIONS[t.region].padEnd(11)} ${t.name.padEnd(20)} ${String(t.count).padStart(6)}  ${Object.entries(t.nt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
say(`build done in ${Date.now() - t0} ms`);
