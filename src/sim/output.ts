// From spikes to numbers: S(t), r(t), L(t), gain, P(t). Pure functions on rings.
// Everything shown on the page comes through here. No DOM, no Node.
import * as P from './params.js';
import { E_AP_J } from './constants.js';

export const WINDOW_STEPS = Math.round(P.WINDOW_MS / P.DT_MS);

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class OutputChain {
  /** total spikes in the last WINDOW_MS */
  S = 0;
  /** mean firing rate over the window, Hz */
  r = 0;
  /** smoothstep(R_MIN, R_MAX, r) */
  L = 0;
  /** low-pass filtered L */
  Ls = 0;
  /** bulb drive in [L_FLOOR, 1] */
  gain = P.L_FLOOR;
  /** power in watts */
  P = 0;
  /** mean rate per region over the window, Hz */
  readonly regionRate: Float32Array;
  /** spikes per type accumulated since the last typeRates() */
  readonly typeCounts: Uint32Array;
  /** spikes per (type, side) accumulated since the last typeRates(): index type * 3 + side */
  readonly typeSideCounts: Uint32Array;
  private readonly side: Uint8Array;
  typeSteps = 0;

  private readonly ring: Uint16Array;
  private readonly regionRing: Uint16Array;
  private head = 0;
  private readonly regionSum: Uint32Array;
  private readonly regionCount: Uint32Array;
  private readonly alphaL: number;

  constructor(readonly n: number, region: Uint8Array, readonly nRegions: number, nTypes: number, side: Uint8Array, readonly rMin = P.R_MIN_HZ, readonly rMax = P.R_MAX_HZ) {
    this.side = side;
    this.typeSideCounts = new Uint32Array(nTypes * 3);
    this.ring = new Uint16Array(WINDOW_STEPS);
    this.regionRing = new Uint16Array(WINDOW_STEPS * nRegions);
    this.regionSum = new Uint32Array(nRegions);
    this.regionCount = new Uint32Array(nRegions);
    for (let i = 0; i < region.length; i++) this.regionCount[region[i]]++;
    this.regionRate = new Float32Array(nRegions);
    this.typeCounts = new Uint32Array(nTypes);
    this.alphaL = P.DT_MS / P.TAU_L_MS;
  }

  /** Feed the spikes of one step. */
  push(spikes: Uint32Array, count: number, region: Uint8Array, typeIdx: Uint16Array) {
    const h = this.head;
    const nr = this.nRegions;
    // remove the oldest step from the window
    this.S -= this.ring[h];
    for (let r = 0; r < nr; r++) this.regionSum[r] -= this.regionRing[h * nr + r];
    // count this step
    const rr = this.regionRing;
    for (let r = 0; r < nr; r++) rr[h * nr + r] = 0;
    for (let s = 0; s < count; s++) {
      const i = spikes[s];
      rr[h * nr + region[i]]++;
      this.typeCounts[typeIdx[i]]++;
      this.typeSideCounts[typeIdx[i] * 3 + this.side[i]]++;
    }
    this.ring[h] = count;
    this.S += count;
    for (let r = 0; r < nr; r++) this.regionSum[r] += rr[h * nr + r];
    this.head = (h + 1) % WINDOW_STEPS;
    this.typeSteps++;
    // derived quantities
    const win = P.WINDOW_MS / 1000;
    this.r = this.S / (this.n * win);
    for (let r = 0; r < nr; r++) this.regionRate[r] = this.regionCount[r] ? this.regionSum[r] / (this.regionCount[r] * win) : 0;
    this.L = smoothstep(this.rMin, this.rMax, this.r);
    this.Ls += (this.L - this.Ls) * this.alphaL;
    this.gain = P.L_FLOOR + (1 - P.L_FLOOR) * this.Ls;
    this.P = (this.S / win) * E_AP_J;
  }

  /** Mean rate per type since the last reset, Hz, and per (type, side); then reset. */
  typeRates(typeCountOf: Uint32Array, typeSideCountOf: Uint32Array, out: Float32Array, outSide: Float32Array) {
    const secs = (this.typeSteps * P.DT_MS) / 1000;
    for (let t = 0; t < out.length; t++) out[t] = secs > 0 && typeCountOf[t] > 0 ? this.typeCounts[t] / (typeCountOf[t] * secs) : 0;
    for (let k = 0; k < outSide.length; k++) outSide[k] = secs > 0 && typeSideCountOf[k] > 0 ? this.typeSideCounts[k] / (typeSideCountOf[k] * secs) : 0;
    this.typeCounts.fill(0);
    this.typeSideCounts.fill(0);
    this.typeSteps = 0;
  }
}

/** number of neurons per (type, side) */
export function countTypeSides(typeIdx: Uint16Array, side: Uint8Array, nTypes: number): Uint32Array {
  const c = new Uint32Array(nTypes * 3);
  for (let i = 0; i < typeIdx.length; i++) c[typeIdx[i] * 3 + side[i]]++;
  return c;
}

/** number of neurons per type, from the typeIdx array */
export function countTypes(typeIdx: Uint16Array, nTypes: number): Uint32Array {
  const c = new Uint32Array(nTypes);
  for (let i = 0; i < typeIdx.length; i++) c[typeIdx[i]]++;
  return c;
}
