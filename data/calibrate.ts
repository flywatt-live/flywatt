// Calibrates the two free scalars of the model and writes them into src/sim/params.ts:
//   NOISE_MEAN_MV  so that the network with synapses off fires at BASELINE_TARGET_HZ
//   G_SYN_MV       so that the connected network fires at ~4 Hz (between 2 and 8)
// then measures R_MIN_HZ / R_MAX_HZ (5th / 95th percentile of r(t)) over one full stimulus loop.
//   npm run data:calibrate
import { readFileSync, writeFileSync } from 'node:fs';
import { load, makeSim, RateMeter, regionRange } from './simlib.js';
import * as P from '../src/sim/params.js';

const WARMUP_S = 0.5;
const d = load();
const N = d.neurons.n;
const [s0, s1] = regionRange(d.meta, 'sensory');
const nonSensory = (m: RateMeter) => {
  let sum = 0;
  for (let i = 0; i < N; i++) if (i < s0 || i >= s1) sum += m.counts[i];
  return sum / ((N - (s1 - s0)) * m.seconds());
};

function measure(noiseMean: number, gSyn: number, seconds: number, stimulus: boolean): { all: number; nonSensory: number; exploded: boolean; ms: number } {
  const t0 = Date.now();
  const sim = makeSim(d, { noiseMean, gSyn });
  sim.run(WARMUP_S, { stimulus: false });
  const m = new RateMeter(N);
  let exploded = false;
  sim.run(seconds, {
    stimulus,
    onStep: () => {
      m.add(sim.net);
      if (sim.net.spikeCount > 0.3 * N) exploded = true;
    },
  });
  const all = m.meanHz();
  return { all, nonSensory: nonSensory(m), exploded: exploded || all > 60, ms: Date.now() - t0 };
}

// 1. baseline drive: synapses off, uniform field
console.log('baseline: bisecting NOISE_MEAN_MV (g_syn = 0)');
let lo = 2, hi = 16, noiseMean = P.NOISE_MEAN_MV, baseline = 0;
for (let it = 0; it < 12; it++) {
  const mid = (lo + hi) / 2;
  const r = measure(mid, 0, 2, false);
  console.log(`  mean ${mid.toFixed(3)} mV -> ${r.nonSensory.toFixed(3)} Hz non-sensory, ${r.all.toFixed(3)} Hz all (${r.ms} ms)`);
  if (r.nonSensory < P.BASELINE_TARGET_HZ) lo = mid; else hi = mid;
  noiseMean = mid; baseline = r.nonSensory;
}
console.log(`baseline drive ${noiseMean.toFixed(3)} mV -> ${baseline.toFixed(3)} Hz`);

// 2. synaptic gain: rest then grating
console.log('gain: bisecting log10(G_SYN_MV)');
let glo = -3, ghi = 0.5, gSyn = P.G_SYN_MV, iterations = 0, last = { all: 0, nonSensory: 0 };
for (let it = 0; it < 14; it++) {
  const mid = (glo + ghi) / 2;
  const g = Math.pow(10, mid);
  const a = measure(noiseMean, g, 3, false);
  const b = measure(noiseMean, g, 3, true);
  const ns = (a.nonSensory + b.nonSensory) / 2, all = (a.all + b.all) / 2;
  const exploded = a.exploded || b.exploded;
  console.log(`  g ${g.toExponential(3)} mV/synapse -> ${ns.toFixed(3)} Hz non-sensory, ${all.toFixed(3)} Hz all${exploded ? ' EXPLODED' : ''} (${a.ms + b.ms} ms)`);
  iterations++;
  const score = P.GAIN_TARGET_NONSENSORY ? ns : all;
  if (exploded || score > P.GAIN_TARGET_HZ) ghi = mid; else glo = mid;
  gSyn = g; last = { all, nonSensory: ns };
}
console.log(`gain ${gSyn.toExponential(4)} mV/synapse -> ${last.nonSensory.toFixed(3)} Hz non-sensory, ${last.all.toFixed(3)} Hz all`);

// 3. one full stimulus loop: r(t) percentiles and per-phase means
console.log('full loop for R_MIN / R_MAX');
const sim = makeSim(d, { noiseMean, gSyn });
sim.run(WARMUP_S, { stimulus: false });
const loopS = P.PHASES.reduce((a, p) => a + p.seconds, 0);
const samples: number[] = [];
const phaseSum = new Map<string, [number, number]>();
sim.run(loopS, {
  onStep: (step) => {
    if (step % 20 !== 0) return; // every 10 ms
    samples.push(sim.out.r);
    const st = sim.stim.state((step * P.DT_MS) / 1000);
    const k = P.PHASES[st.phase].key;
    const e = phaseSum.get(k) ?? [0, 0];
    e[0] += sim.out.r; e[1]++;
    phaseSum.set(k, e);
  },
});
samples.sort((a, b) => a - b);
const pct = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
const rMin = pct(0.05), rMax = pct(0.95);
const phaseMean: Record<string, number> = {};
for (const [k, [s, c]] of phaseSum) phaseMean[k] = s / c;
console.log(`r(t): p5 ${rMin.toFixed(3)} Hz, p50 ${pct(0.5).toFixed(3)} Hz, p95 ${rMax.toFixed(3)} Hz; per phase ${JSON.stringify(phaseMean)}`);

// 4. write params.ts
const block = `// BEGIN CALIBRATED (written by data/calibrate.ts, do not edit by hand)
export const NOISE_MEAN_MV = ${noiseMean.toFixed(4)};
export const G_SYN_MV = ${gSyn.toExponential(5)};
export const R_MIN_HZ = ${rMin.toFixed(4)};
export const R_MAX_HZ = ${rMax.toFixed(4)};
export const CALIBRATION = {
  date: '${new Date().toISOString()}',
  seed: ${P.SEED},
  build_hash: '${d.meta.build_hash}',
  baseline_hz: ${baseline.toFixed(4)},
  mean_hz_all: ${last.all.toFixed(4)},
  mean_hz_nonsensory: ${last.nonSensory.toFixed(4)},
  iterations: ${iterations},
  phase_mean_hz: ${JSON.stringify(Object.fromEntries(Object.entries(phaseMean).map(([k, v]) => [k, Number(v.toFixed(4))])))} as Record<string, number>,
};
// END CALIBRATED`;
const path = 'src/sim/params.ts';
const src = readFileSync(path, 'utf8');
const re = /\/\/ BEGIN CALIBRATED[\s\S]*?\/\/ END CALIBRATED/;
if (!re.test(src)) throw new Error('markers not found in params.ts');
writeFileSync(path, src.replace(re, block));
console.log('params.ts updated');
