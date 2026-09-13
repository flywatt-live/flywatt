// Network statistics for the README: degree, weight and sign distributions, region-pair matrix.
import { load } from './simlib.js';
const { neurons, conn, meta } = load();
const N = neurons.n, M = conn.m;
const R = meta.regions.length;
const outDeg = new Uint32Array(N), inDeg = new Uint32Array(N);
const pairE = new Float64Array(R * R), pairS = new Float64Array(R * R);
let exc = 0, inh = 0, excSyn = 0, inhSyn = 0, wmax = 0, sumW = 0;
const wHist = new Map<number, number>();
for (let i = 0; i < N; i++) {
  const ri = neurons.region[i];
  outDeg[i] = conn.indptr[i + 1] - conn.indptr[i];
  for (let k = conn.indptr[i]; k < conn.indptr[i + 1]; k++) {
    const j = conn.indices[k], w = conn.weights[k], a = Math.abs(w);
    inDeg[j]++;
    pairE[ri * R + neurons.region[j]]++;
    pairS[ri * R + neurons.region[j]] += a;
    if (w > 0) { exc++; excSyn += a; } else { inh++; inhSyn += a; }
    wmax = Math.max(wmax, a); sumW += a;
    const b = a < 10 ? a : a < 100 ? Math.floor(a / 10) * 10 : Math.floor(a / 100) * 100;
    wHist.set(b, (wHist.get(b) ?? 0) + 1);
  }
}
const sorted = (a: Uint32Array) => Float64Array.from(a).sort();
const q = (a: Float64Array, p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const so = sorted(outDeg), si = sorted(inDeg);
const mean = (a: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
const signCount = [0, 0, 0];
for (let i = 0; i < N; i++) signCount[neurons.sign[i] + 1]++;
const isolated = { noOut: 0, noIn: 0, none: 0 };
for (let i = 0; i < N; i++) { if (!outDeg[i]) isolated.noOut++; if (!inDeg[i]) isolated.noIn++; if (!outDeg[i] && !inDeg[i]) isolated.none++; }
const rc = meta.regions.map((_, i) => meta.region_offsets[i + 1] - meta.region_offsets[i]);
console.log({ N, M, synapses: sumW, density: M / (N * (N - 1)), meanW: sumW / M, wmax,
  outDeg: { mean: mean(outDeg), median: q(so, 0.5), p90: q(so, 0.9), p99: q(so, 0.99), max: so[N - 1] },
  inDeg: { mean: mean(inDeg), median: q(si, 0.5), p90: q(si, 0.9), p99: q(si, 0.99), max: si[N - 1] },
  edges: { exc, inh, excFrac: exc / M }, synapses_by_sign: { excSyn, inhSyn, excFrac: excSyn / sumW },
  neuronSign: { inh: signCount[0], zero: signCount[1], exc: signCount[2] }, isolated, regionCounts: rc });
console.log('weight histogram', [...wHist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('region pair edges (rows pre, cols post):');
console.log('            ' + meta.regions.map((r) => r.padStart(10)).join(''));
for (let i = 0; i < R; i++) console.log(meta.regions[i].padEnd(12) + meta.regions.map((_, j) => String(pairE[i * R + j]).padStart(10)).join(''));
console.log('region pair synapses:');
for (let i = 0; i < R; i++) console.log(meta.regions[i].padEnd(12) + meta.regions.map((_, j) => String(pairS[i * R + j]).padStart(10)).join(''));
// per-type sign and count
const t = meta.types as { name: string; count: number; sign: number; nt?: Record<string, number> }[];
console.log('types', t.length, 'by sign', t.filter((x) => x.sign > 0).length, t.filter((x) => x.sign < 0).length, t.filter((x) => x.sign === 0).length);
console.log('largest types', t.slice().sort((a, b) => b.count - a.count).slice(0, 12).map((x) => `${x.name}:${x.count}:${x.sign}`).join(' '));
