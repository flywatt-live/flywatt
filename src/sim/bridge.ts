// Main-thread side of the simulation: worker lifecycle, ring buffers for the panels,
// session statistics, and a small event bus. Every displayed number is read from here.
import * as P from './params.js';
import type { Meta } from './meta.js';
import { parseNeurons, type NeuronsData } from './format.js';
import type { FrameMsg, FromWorker, ToWorker } from './protocol.js';
import { loadMeta, loadBinary, type Progress } from './loader.js';
import SimWorker from './worker.ts?worker';
import { E_AP_J } from './constants.js';
import { launch } from '../copy/en.js';

export type BridgeEvents = {
  progress: Progress;
  ready: { n: number; m: number };
  frame: FrameMsg;
  typeRates: Float32Array;
  phase: number;
  highlight: number;
};

/** Fixed-length ring of samples with absolute sample index stamps. */
export class SeriesRing {
  readonly buf: Float32Array;
  head = 0;
  count = 0;
  constructor(readonly len: number) { this.buf = new Float32Array(len); }
  push(v: number) {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.len;
    if (this.count < this.len) this.count++;
  }
  /** i = 0 is the oldest available sample */
  at(i: number): number {
    const start = (this.head - this.count + this.len) % this.len;
    return this.buf[(start + i) % this.len];
  }
  last(): number { return this.count ? this.buf[(this.head - 1 + this.len) % this.len] : 0; }
}

/** Spike history for the raster: neuron ids with the step they fired at. */
export class RasterHistory {
  readonly ids: Uint32Array;
  readonly steps: Uint32Array;
  head = 0;
  count = 0;
  constructor(readonly cap: number) {
    this.ids = new Uint32Array(cap);
    this.steps = new Uint32Array(cap);
  }
  append(frame: FrameMsg) {
    const firstStep = frame.step - frame.ran;
    const b = frame.stepBounds;
    for (let s = 0; s < frame.ran; s++) {
      const step = firstStep + s;
      for (let k = b[s]; k < b[s + 1]; k++) {
        this.ids[this.head] = frame.spikeIds[k];
        this.steps[this.head] = step;
        this.head = (this.head + 1) % this.cap;
        if (this.count < this.cap) this.count++;
      }
    }
  }
  /** iterate from oldest to newest */
  forEach(cb: (id: number, step: number) => void) {
    const start = (this.head - this.count + this.cap) % this.cap;
    for (let i = 0; i < this.count; i++) {
      const k = (start + i) % this.cap;
      cb(this.ids[k], this.steps[k]);
    }
  }
}

export interface Peak { value: number; simMs: number; wall: string }

export class SessionStats {
  /** seconds the apparatus had been running when this page opened (0 if launch is in the future) */
  launchOffset = 0;
  /** joules estimated for the time before this page opened: offset x calibrated mean power */
  joulesBefore = 0;
  /** spikes estimated for the time before this page opened */
  spikesBefore = 0;
  /** cumulative energy, joules, this session */
  joules = 0;
  /** simulated seconds counted this session */
  simSeconds = 0;
  /** simulated seconds with the bulb clearly above its floor */
  litSeconds = 0;
  /** spikes counted this session */
  spikes = 0;
  /** histogram of r(t) samples, 0..HIST_MAX_HZ in HIST_BINS bins */
  readonly rateHist: Uint32Array;
  static HIST_BINS = 80;
  static HIST_MAX_HZ = 20;
  /** per-phase power sums for means */
  readonly phasePowerSum: Float64Array;
  readonly phasePowerN: Uint32Array;
  peakP: Peak = { value: 0, simMs: 0, wall: '' };
  peakRate: Peak = { value: 0, simMs: 0, wall: '' };
  /** cumulative joules sampled every second of simulated time */
  readonly energySeries: number[] = [];
  private nextSample = 1000;
  constructor(nPhases: number) {
    this.rateHist = new Uint32Array(SessionStats.HIST_BINS);
    this.phasePowerSum = new Float64Array(nPhases);
    this.phasePowerN = new Uint32Array(nPhases);
  }
  add(f: FrameMsg) {
    const dt = (f.ran * P.DT_MS) / 1000;
    this.joules += f.P * dt;
    this.simSeconds += dt;
    if (f.gain > P.L_FLOOR + 0.1) this.litSeconds += dt;
    this.spikes += f.spikeIds.length;
    const bin = Math.min(SessionStats.HIST_BINS - 1, Math.floor((f.r / SessionStats.HIST_MAX_HZ) * SessionStats.HIST_BINS));
    this.rateHist[bin]++;
    this.phasePowerSum[f.phase] += f.P;
    this.phasePowerN[f.phase]++;
    if (f.P > this.peakP.value) this.peakP = { value: f.P, simMs: f.simMs, wall: new Date().toISOString() };
    if (f.r > this.peakRate.value) this.peakRate = { value: f.r, simMs: f.simMs, wall: new Date().toISOString() };
    while (f.simMs >= this.nextSample) {
      this.energySeries.push(this.joules);
      this.nextSample += 1000;
    }
  }
}

type Handler<K extends keyof BridgeEvents> = (v: BridgeEvents[K]) => void;

export class SimBridge {
  meta!: Meta;
  neurons!: NeuronsData;
  latest: FrameMsg | null = null;
  typeRates: Float32Array | null = null;
  typeRatesBySide: Float32Array | null = null;
  highlightType = -1;
  ready = false;
  readonly raster = new RasterHistory(2_000_000);
  readonly series = {
    S: new SeriesRing(1500),
    r: new SeriesRing(1500),
    L: new SeriesRing(1500),
    Ls: new SeriesRing(1500),
    gain: new SeriesRing(1500),
    P: new SeriesRing(1500),
    /** simulated time of each sample, ms */
    t: new SeriesRing(1500),
    regions: [] as SeriesRing[],
  };
  stats!: SessionStats;
  private worker: Worker | null = null;
  private handlers = new Map<string, Set<(v: unknown) => void>>();
  private frameCount = 0;

  on<K extends keyof BridgeEvents>(k: K, h: Handler<K>): () => void {
    let s = this.handlers.get(k);
    if (!s) this.handlers.set(k, (s = new Set()));
    s.add(h as (v: unknown) => void);
    return () => s!.delete(h as (v: unknown) => void);
  }
  private emit<K extends keyof BridgeEvents>(k: K, v: BridgeEvents[K]) {
    this.handlers.get(k)?.forEach((h) => h(v));
  }

  async load(base = '/data/') {
    this.meta = await loadMeta(base);
    this.stats = new SessionStats(P.PHASES.length);
    // the apparatus has been on since launch: continue the clock and the stimulus loop from there,
    // and account for the energy before this page opened at the calibrated mean rate (an estimate)
    const since = (Date.now() - Date.parse(launch.at)) / 1000;
    this.stats.launchOffset = Math.max(0, since);
    const meanP = P.CALIBRATION.mean_hz_all * this.meta.n_neurons * E_AP_J;
    this.stats.joulesBefore = this.stats.launchOffset * meanP;
    this.stats.spikesBefore = this.stats.launchOffset * P.CALIBRATION.mean_hz_all * this.meta.n_neurons;
    for (let r = 0; r < this.meta.regions.length; r++) this.series.regions.push(new SeriesRing(1500));
    const f = this.meta.files;
    const nb = await loadBinary(base + f.neurons, f.neurons_bytes_gz, f.neurons_bytes, (p) => this.emit('progress', p), true);
    this.neurons = parseNeurons(nb.slice(0));
    const cb = await loadBinary(base + f.connectome, f.connectome_bytes_gz, f.connectome_bytes, (p) => this.emit('progress', p), false);
    const w = new SimWorker();
    this.worker = w;
    w.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
    const init: ToWorker = { t: 'init', neurons: nb, connectome: cb, meta: this.meta, seed: P.SEED, tOffsetMs: this.stats.launchOffset * 1000 };
    w.postMessage(init, [nb, cb]);
  }

  start() { this.worker?.postMessage({ t: 'start' } satisfies ToWorker); }
  pause() { this.worker?.postMessage({ t: 'pause' } satisfies ToWorker); }
  resume() { this.worker?.postMessage({ t: 'resume' } satisfies ToWorker); }

  setHighlight(typeIdx: number) {
    if (typeIdx === this.highlightType) return;
    this.highlightType = typeIdx;
    this.emit('highlight', typeIdx);
  }

  private onMessage(m: FromWorker) {
    switch (m.t) {
      case 'ready':
        this.ready = true;
        this.emit('ready', { n: m.n, m: m.m });
        break;
      case 'frame': {
        this.latest = m;
        this.frameCount++;
        this.raster.append(m);
        const s = this.series;
        s.S.push(m.S); s.r.push(m.r); s.L.push(m.L); s.Ls.push(m.Ls); s.gain.push(m.gain); s.P.push(m.P); s.t.push(m.simMs);
        for (let r = 0; r < s.regions.length; r++) s.regions[r].push(m.regionRates[r]);
        this.stats.add(m);
        this.emit('frame', m);
        break;
      }
      case 'typeRates':
        this.typeRates = m.rates;
        this.typeRatesBySide = m.bySide;
        this.emit('typeRates', m.rates);
        break;
      case 'phase':
        this.emit('phase', m.phase);
        break;
    }
  }
}
