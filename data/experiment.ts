// Quick parameter experiment: one configuration per process (module caching makes one process per
// configuration necessary). A short calibration, then the loom and flash responses and the rest-state
// noise, printed on one line.   npx tsx data/experiment.ts '{"I_PHOTO_GAIN_MV":20}'
const cfg: Record<string, number> = JSON.parse(process.argv[2] ?? '{}');
{
  (globalThis as unknown as { __FLYWATT_OVERRIDES: Record<string, number> }).__FLYWATT_OVERRIDES = cfg;
  const P = await import('../src/sim/params.js');
  const { load, makeSim, RateMeter, regionRange, typeRange } = await import('./simlib.js');
  const d = load();
  const N = d.neurons.n;
  const [s0, s1] = regionRange(d.meta, 'sensory');
  const nonSensory = (m: InstanceType<typeof RateMeter>) => { let sum = 0; for (let i = 0; i < N; i++) if (i < s0 || i >= s1) sum += m.counts[i]; return sum / ((N - (s1 - s0)) * m.seconds()); };
  const measure = (noiseMean: number, gSyn: number, seconds: number, stimulus: boolean) => {
    const sim = makeSim(d, { noiseMean, gSyn });
    sim.run(0.4, { stimulus: false });
    const m = new RateMeter(N);
    let exploded = false;
    sim.run(seconds, { stimulus, onStep: () => { m.add(sim.net); if (sim.net.spikeCount > 0.3 * N) exploded = true; } });
    return { all: m.meanHz(), ns: nonSensory(m), exploded };
  };
  let lo = 4, hi = 16, noiseMean = 12;
  for (let it = 0; it < 9; it++) { const mid = (lo + hi) / 2; const r = measure(mid, 0, 1.5, false); if (r.ns < P.BASELINE_TARGET_HZ) lo = mid; else hi = mid; noiseMean = mid; }
  let glo = -3, ghi = 0.5, gSyn = 0.1;
  for (let it = 0; it < 10; it++) { const mid = (glo + ghi) / 2; const g = Math.pow(10, mid); const a = measure(noiseMean, g, 2, false); const b = measure(noiseMean, g, 2, true); const score = P.GAIN_TARGET_NONSENSORY ? (a.ns + b.ns) / 2 : (a.all + b.all) / 2; if (a.exploded || b.exploded || score > P.GAIN_TARGET_HZ) ghi = mid; else glo = mid; gSyn = g; }
  // one loop with window meters
  const sim = makeSim(d, { noiseMean, gSyn });
  sim.run(0.5, { stimulus: false });
  const phases = P.PHASES.map((p: { key: string }) => p.key);
  const meters = new Map(phases.map((k: string) => [k, new RateMeter(N)]));
  const loomW = new RateMeter(N), flashW = new RateMeter(N);
  const restS: number[] = [];
  const loomDur = P.PHASES[1].seconds;
  const total = new RateMeter(N);
  sim.run(P.PHASES.reduce((a: number, p: { seconds: number }) => a + p.seconds, 0), {
    onStep: (step: number) => {
      const st = sim.stim.state((step * P.DT_MS) / 1000);
      const key = phases[st.phase];
      meters.get(key)!.add(sim.net); total.add(sim.net);
      if (key === 'looming') { const half = loomDur / 2; const tt = st.phaseT % half; const tc = half - 0.6; if (tt > tc - 0.5 && tt <= tc) loomW.add(sim.net); }
      if (key === 'flash') { const tt = st.phaseT; if ((tt > 2 && tt < 2.5) || (tt > 5 && tt < 5.5)) flashW.add(sim.net); }
      if (step % 20 === 0 && key === 'rest') restS.push(sim.out.S);
    },
  });
  const m = restS.reduce((a, b) => a + b, 0) / restS.length;
  const cv = Math.sqrt(restS.reduce((a, b) => a + (b - m) ** 2, 0) / restS.length) / m;
  const rest = meters.get('rest')!;
  const dn = typeRange(d.meta, 'DNp09'), lc = typeRange(d.meta, 'LC4'), la = regionRange(d.meta, 'lamina'), l1 = typeRange(d.meta, 'L1');
  const f = (x: number) => x.toFixed(2);
  console.log(JSON.stringify(cfg), `mean ${f(total.meanHz())} Hz | g ${gSyn.toExponential(2)} drive ${f(noiseMean)} | DNp09 rest ${f(rest.meanHz(...dn))} loom ${f(loomW.meanHz(...dn))} (x${f(loomW.meanHz(...dn) / Math.max(0.01, rest.meanHz(...dn)))}) | LC4 ${f(rest.meanHz(...lc))} -> ${f(loomW.meanHz(...lc))} | L1 ${f(rest.meanHz(...l1))} -> ${f(loomW.meanHz(...l1))} | lamina flash ${f(flashW.meanHz(...la))} vs ${f(rest.meanHz(...la))} | rest CV ${cv.toFixed(3)} (poisson ${(1 / Math.sqrt(m)).toFixed(3)})`);
}
