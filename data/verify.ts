// Runs one full stimulus loop headless and checks the claims the site makes:
//   mean rate within 2..8 Hz, DNp09 rises in the half second before a looming collision,
//   motor neurons fire, lamina responds to the dark flash, no population-wide synchrony.
// Prints phase x region and phase x type tables.
//   npm run data:verify
import { load, makeSim, RateMeter, regionRange, typeRange } from './simlib.js';
import * as P from '../src/sim/params.js';

const d = load();
const N = d.neurons.n;
const sim = makeSim(d);
sim.run(0.5, { stimulus: false });

const phases = P.PHASES.map((p) => p.key);
const meters = new Map<string, RateMeter>(phases.map((k) => [k, new RateMeter(N)]));
const loomWindow = new RateMeter(N); // the 0.5 s before each looming collision
const flashWindow = new RateMeter(N); // each 300 ms dark flash plus 200 ms after it
const restSamples: number[] = []; // S(t) every 10 ms during rest, for the synchrony check
const loomStart = 0, loomDur = P.PHASES[1].seconds;
void loomStart;
/** loops simulated; the looming and flash windows are short, so several loops are averaged */
const LOOPS = 3;
const loopS = P.PHASES.reduce((a, p) => a + p.seconds, 0) * LOOPS;
const t0 = Date.now();
let maxStepSpikes = 0;
const windowSamples: number[] = []; // S(t) every 10 ms, for the synchrony check
sim.run(loopS, {
  onStep: (step) => {
    const t = (step * P.DT_MS) / 1000;
    const st = sim.stim.state(t);
    const key = phases[st.phase];
    meters.get(key)!.add(sim.net);
    if (key === 'looming') {
      const half = loomDur / 2;
      const tt = st.phaseT % half;
      const tc = half - 0.6;
      if (tt > tc - 0.5 && tt <= tc) loomWindow.add(sim.net);
    }
    if (key === 'flash') {
      const tt = st.phaseT;
      if ((tt > 2 && tt < 2.5) || (tt > 5 && tt < 5.5)) flashWindow.add(sim.net);
    }
    if (sim.net.spikeCount > maxStepSpikes) maxStepSpikes = sim.net.spikeCount;
    if (step % 20 === 0) { windowSamples.push(sim.out.S); if (key === 'rest') restSamples.push(sim.out.S); }
  },
});
const wall = Date.now() - t0;
const steps = Math.round((loopS * 1000) / P.DT_MS);
console.log(`simulated ${loopS} s (${steps} steps) in ${wall} ms: ${(steps / (wall / 1000)).toFixed(0)} steps/s (real time needs ${1000 / P.DT_MS})`);

const total = new RateMeter(N);
for (const m of meters.values()) { for (let i = 0; i < N; i++) total.counts[i] += m.counts[i]; total.steps += m.steps; }
const fmt = (x: number) => x.toFixed(2).padStart(8);
const cv = (xs: number[]): [number, number] => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return [Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m, 1 / Math.sqrt(m)];
};
const [cvAll] = cv(windowSamples);
const [cvS, poissonCv] = cv(restSamples);
console.log(`\nmean rate, all neurons, whole loop: ${total.meanHz().toFixed(3)} Hz; max spikes in one step ${maxStepSpikes} (${((100 * maxStepSpikes) / N).toFixed(2)} %); CV of S(t): whole loop ${cvAll.toFixed(3)}, rest ${cvS.toFixed(3)} (Poisson would be ${poissonCv.toFixed(3)})`);

console.log('\nphase x region (Hz)');
console.log('            ' + phases.map((p) => p.padStart(9)).join('') + '  loom-0.5s');
for (const r of d.meta.regions) {
  const [a, b] = regionRange(d.meta, r);
  console.log(r.padEnd(12) + phases.map((p) => fmt(meters.get(p)!.meanHz(a, b))).join(' ') + ' ' + fmt(loomWindow.meanHz(a, b)));
}
console.log('\nphase x type (Hz)');
console.log('            ' + phases.map((p) => p.padStart(9)).join('') + '  loom-0.5s');
for (const t of d.meta.types) {
  console.log(t.name.padEnd(12) + phases.map((p) => fmt(meters.get(p)!.meanHz(t.offset, t.offset + t.count))).join(' ') + ' ' + fmt(loomWindow.meanHz(t.offset, t.offset + t.count)));
}

const failures: string[] = [];
const mean = total.meanHz();
if (mean < 2 || mean > 8) failures.push(`mean rate ${mean.toFixed(2)} Hz outside 2..8`);
const dn = typeRange(d.meta, 'DNp09');
const dnLoom = loomWindow.meanHz(...dn), dnRest = meters.get('rest')!.meanHz(...dn);
// the looming pathway: LC4 and LPLC2 (lobula, 311 neurons) plus DNp09 (2 neurons)
const loomPath = ['LC4', 'LPLC2', 'DNp09'].map((n) => typeRange(d.meta, n));
const pathRate = (m: RateMeter) => { let s = 0, c = 0; for (const [a, b] of loomPath) { s += m.meanHz(a, b) * (b - a); c += b - a; } return s / c; };
const pathLoom = pathRate(loomWindow), pathRest = pathRate(meters.get('rest')!);
console.log(`
looming pathway (LC4 + LPLC2 + DNp09) pre-collision ${pathLoom.toFixed(2)} Hz vs rest ${pathRest.toFixed(2)} Hz; DNp09 alone ${dnLoom.toFixed(2)} vs ${dnRest.toFixed(2)} Hz (2 neurons, ${LOOPS * 2} looms)`);
if (!(pathLoom >= 1.05 * pathRest)) failures.push(`looming pathway pre-collision ${pathLoom.toFixed(2)} Hz vs rest ${pathRest.toFixed(2)} Hz (need >= 1.05x)`);
if (!(dnLoom > dnRest)) failures.push(`DNp09 pre-collision ${dnLoom.toFixed(2)} Hz not above rest ${dnRest.toFixed(2)} Hz`);
const mo = regionRange(d.meta, 'motor');
if (!(total.meanHz(...mo) > 0)) failures.push('motor neurons never fire');
const la = regionRange(d.meta, 'lamina');
const laFlash = flashWindow.meanHz(...la), laRest = meters.get('rest')!.meanHz(...la);
if (!(laFlash > 1.2 * laRest)) failures.push(`lamina during dark flash ${laFlash.toFixed(2)} Hz not above rest ${laRest.toFixed(2)} Hz`);
console.log(`
lamina during dark flash ${laFlash.toFixed(2)} Hz vs rest ${laRest.toFixed(2)} Hz`);
if (maxStepSpikes > 0.02 * N) failures.push(`population synchrony: ${maxStepSpikes} spikes in one step`);
if (cvS > 12 * poissonCv) failures.push(`S(t) at rest too bursty: CV ${cvS.toFixed(3)} vs Poisson ${poissonCv.toFixed(3)}`);

console.log('\ncausal chain, rest vs 0.5 s before looming collision (Hz):');
for (const name of ['R1-R6', 'L1', 'L2', 'L3', 'Tm1', 'Tm2', 'Tm9', 'T5a', 'LC4', 'LPLC2', 'DNp09']) {
  const rng = typeRange(d.meta, name);
  console.log(`  ${name.padEnd(8)} rest ${fmt(meters.get('rest')!.meanHz(...rng))}  loom ${fmt(loomWindow.meanHz(...rng))}`);
}
if (failures.length) {
  console.log('\nFAILED:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('\nOK: mean rate in band, looming pathway and DNp09 respond before collision, motor neurons fire, lamina responds to dark flash, no synchrony');
