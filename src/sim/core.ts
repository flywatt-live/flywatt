// Leaky integrate-and-fire network on typed arrays. No DOM, no Node: runs in the worker
// and in the Node calibration scripts identically. Deterministic for a given seed.
import * as P from './params.js';
import { Rng, makeGaussTable, GAUSS_TABLE_SIZE } from './rng.js';
import type { NeuronsData, ConnectomeData } from './format.js';

const DELAY_SLOTS = 4; // must exceed DELAY_MAX_STEPS

export interface NetOptions {
  seed?: number;
  gSyn?: number;
  noiseMean?: number;
}

export class LIFNetwork {
  readonly n: number;
  readonly indptr: Uint32Array;
  readonly indices: Uint32Array;
  readonly weights: Int16Array;
  readonly region: Uint8Array;
  readonly typeIdx: Uint16Array;

  readonly v: Float32Array;
  readonly isyn: Float32Array;
  readonly iext: Float32Array;
  readonly bias: Float32Array;
  /** mean drive + bias + external input, combined once so the hot loop reads one array */
  readonly drive: Float32Array;
  /** slow running mean of each neuron's synaptic input, subtracted from it (adaptation) */
  readonly adapt: Float32Array;
  readonly refr: Uint8Array;

  /** spikes of the last completed step */
  spikes: Uint32Array;
  spikeCount = 0;
  private spikesNext: Uint32Array;
  /** per-neuron delay in steps */
  readonly delay: Uint8Array;
  /** delay queues: spikes to deliver at step (now + d) live in queue[(now + d) % DELAY_SLOTS] */
  private readonly queue: Uint32Array[];
  private readonly queueCount: Uint32Array;

  step = 0;
  gSyn: number;
  noiseMean: number;
  private readonly rng: Rng;
  private readonly gauss: Float32Array;
  private readonly refSteps: number;
  private readonly decayM: number;
  private readonly decayS: number;
  private readonly alphaAdapt: number;

  constructor(neurons: NeuronsData, conn: ConnectomeData, opts: NetOptions = {}) {
    if (neurons.n !== conn.n) throw new Error('neurons / connectome mismatch');
    this.n = neurons.n;
    this.indptr = conn.indptr;
    this.indices = conn.indices;
    this.weights = conn.weights;
    this.region = neurons.region;
    this.typeIdx = neurons.typeIdx;
    const n = this.n;
    this.v = new Float32Array(n);
    this.isyn = new Float32Array(n);
    this.iext = new Float32Array(n);
    this.bias = new Float32Array(n);
    this.drive = new Float32Array(n);
    this.adapt = new Float32Array(n);
    this.refr = new Uint8Array(n);
    this.spikes = new Uint32Array(n);
    this.spikesNext = new Uint32Array(n);
    this.delay = new Uint8Array(n);
    this.queue = [];
    for (let q = 0; q < DELAY_SLOTS; q++) this.queue.push(new Uint32Array(n));
    this.queueCount = new Uint32Array(DELAY_SLOTS);
    this.gSyn = opts.gSyn ?? P.G_SYN_MV;
    this.noiseMean = opts.noiseMean ?? P.NOISE_MEAN_MV;
    const seed = opts.seed ?? P.SEED;
    this.rng = new Rng(seed);
    this.gauss = makeGaussTable(seed);
    this.refSteps = Math.round(P.T_REF_MS / P.DT_MS);
    this.decayM = P.DT_MS / P.TAU_M_MS;
    this.decayS = Math.exp(-P.DT_MS / P.TAU_SYN_MS);
    this.alphaAdapt = P.DT_MS / P.TAU_ADAPT_MS;
    for (let i = 0; i < n; i++) {
      this.v[i] = P.V_RESET_MV + this.rng.next() * (P.V_THRESH_MV - P.V_RESET_MV);
      this.bias[i] = (this.rng.next() * 2 - 1) * P.BIAS_JITTER_MV;
      this.delay[i] = P.DELAY_MIN_STEPS + this.rng.int(P.DELAY_MAX_STEPS - P.DELAY_MIN_STEPS + 1);
    }
    this.refreshDrive();
  }

  /** call after changing iext or noiseMean */
  refreshDrive() {
    const { n, drive, bias, iext } = this;
    const m = this.noiseMean;
    for (let i = 0; i < n; i++) drive[i] = m + bias[i] + iext[i];
  }

  /** update the drive of one neuron after its external input changed */
  setExternal(i: number, value: number) {
    this.iext[i] = value;
    this.drive[i] = this.noiseMean + this.bias[i] + value;
  }

  /** Advance one step of DT_MS. Returns the number of spikes emitted in this step. */
  advance(): number {
    const { n, v, isyn, drive, adapt, refr, delay, indptr, indices, weights } = this;
    const aa = this.alphaAdapt;
    const g = this.gSyn;
    const a = this.decayM;
    const ds = this.decayS;
    const vRest = P.V_REST_MV, vTh = P.V_THRESH_MV, vRe = P.V_RESET_MV;
    const sMax = P.ISYN_MAX_MV, sMin = P.ISYN_MIN_MV;

    // 1. deliver the spikes whose delay ends at this step
    const slot = this.step % DELAY_SLOTS;
    {
      const pend = this.queue[slot];
      const sc = this.queueCount[slot];
      if (g !== 0) {
        for (let s = 0; s < sc; s++) {
          const i = pend[s];
          const k1 = indptr[i + 1];
          for (let k = indptr[i]; k < k1; k++) isyn[indices[k]] += weights[k] * g;
        }
      }
      this.queueCount[slot] = 0;
    }

    // 2. background noise refresh
    if (this.step % P.NOISE_EVERY_STEPS === 0) {
      const tbl = this.gauss;
      const mask = GAUSS_TABLE_SIZE - 1;
      const sd = P.NOISE_STD_MV;
      let h = this.rng.u32();
      for (let i = 0; i < n; i++) {
        // xorshift on top of one seeded draw per refresh keeps this cheap and deterministic
        h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
        isyn[i] += tbl[h & mask] * sd;
      }
    }

    // 3. integrate and threshold
    const out = this.spikesNext;
    let c = 0;
    for (let i = 0; i < n; i++) {
      let s = isyn[i];
      if (s > sMax) s = sMax; else if (s < sMin) s = sMin;
      isyn[i] = s * ds;
      // adaptation: the neuron responds to changes of its synaptic input, not to its mean
      const ad = adapt[i] + (s - adapt[i]) * aa;
      adapt[i] = ad;
      if (refr[i] !== 0) {
        refr[i]--;
        v[i] = vRe;
        continue;
      }
      const vi = v[i] + a * (vRest - v[i] + (s - ad) + drive[i]);
      if (vi >= vTh) {
        v[i] = vRe;
        refr[i] = this.refSteps;
        out[c++] = i;
        const q = (this.step + delay[i]) % DELAY_SLOTS;
        this.queue[q][this.queueCount[q]++] = i;
      } else {
        v[i] = vi;
      }
    }

    const prev = this.spikes;
    this.spikes = out;
    this.spikeCount = c;
    this.spikesNext = prev;
    this.step++;
    return c;
  }
}
