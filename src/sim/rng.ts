// Seeded random numbers. mulberry32 for uniforms; a precomputed table of standard normal
// samples (indexed by the same stream) for cheap Gaussian noise inside the step loop.

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** uniform in [0, 1) */
  next(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** uniform integer in [0, n) */
  int(n: number): number {
    return (this.next() * n) | 0;
  }
  /** raw 32-bit state step, for table indexing */
  u32(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** standard normal via Box-Muller */
  gauss(): number {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export const GAUSS_TABLE_SIZE = 1 << 14;

/** table of standard normal samples, generated from the seed once */
export function makeGaussTable(seed: number): Float32Array {
  const r = new Rng(seed ^ 0x9e3779b9);
  const t = new Float32Array(GAUSS_TABLE_SIZE);
  for (let i = 0; i < GAUSS_TABLE_SIZE; i++) t[i] = r.gauss();
  return t;
}
