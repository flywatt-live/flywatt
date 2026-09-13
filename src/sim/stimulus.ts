// The world the fly sees. A seeded, autonomous loop of visual stimuli rendered as luminance
// onto the photoreceptor grid of each eye. No user input. No DOM, no Node.
import * as P from './params.js';
import { Rng } from './rng.js';
import type { NeuronsData } from './format.js';
import { PX_NONE } from './format.js';

const DEG = Math.PI / 180;

export interface PhotoMap {
  /** neuron index of each photoreceptor */
  idx: Uint32Array;
  /** luminance grid cell of each photoreceptor: eye * cells + py * gw + px */
  cell: Uint32Array;
  /** per-photoreceptor gain factor */
  gain: Float32Array;
  gw: number;
  gh: number;
  eyes: number;
}

export function buildPhotoMap(neurons: NeuronsData, gw: number, gh: number): PhotoMap {
  let n = 0;
  for (let i = 0; i < neurons.n; i++) if (neurons.px[i] !== PX_NONE) n++;
  const idx = new Uint32Array(n);
  const cell = new Uint32Array(n);
  const gain = new Float32Array(n);
  const rng = new Rng(P.SEED ^ 0x9f0);
  let k = 0;
  for (let i = 0; i < neurons.n; i++) {
    if (neurons.px[i] === PX_NONE) continue;
    const eye = neurons.side[i] === 1 ? 1 : 0;
    idx[k] = i;
    cell[k] = eye * gw * gh + neurons.py[i] * gw + neurons.px[i];
    gain[k] = 1 + (rng.next() * 2 - 1) * P.PHOTO_GAIN_JITTER;
    k++;
  }
  return { idx, cell, gain, gw, gh, eyes: 2 };
}

/**
 * Visual direction of a hex column. The two hex axes of the optic lobe are treated as a
 * sheared square lattice with OMMATIDIUM_DEG spacing; the left eye looks left. This mapping
 * is an assumption of the model, not a measured retinotopy.
 */
export function cellDirection(eye: number, px: number, py: number, gw: number, gh: number): [number, number] {
  const u = px - gw / 2 + (py - gh / 2) / 2;
  const w = (py - gh / 2) * 0.8660254;
  const az = (eye === 0 ? -1 : 1) * (70 + u * P.OMMATIDIUM_DEG);
  const el = w * P.OMMATIDIUM_DEG;
  return [az, el];
}

export interface StimulusState {
  phase: number;
  phaseT: number;
  phaseDur: number;
  loop: number;
}

export class StimulusLoop {
  readonly lum: Float32Array;
  readonly cells: number;
  private readonly az: Float32Array;
  private readonly el: Float32Array;
  private readonly total: number;
  private readonly starts: number[];
  private rng: Rng;
  private loopSeen = -1;
  // per-loop seeded choices
  private gratingDir = 1;
  private targetPath: [number, number, number, number] = [0, 0, 0, 0];
  private loomAz = 0;
  private loomEl = 0;

  constructor(readonly gw: number, readonly gh: number, seed: number) {
    this.cells = 2 * gw * gh;
    this.lum = new Float32Array(this.cells);
    this.az = new Float32Array(this.cells);
    this.el = new Float32Array(this.cells);
    for (let eye = 0; eye < 2; eye++)
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const [a, e] = cellDirection(eye, x, y, gw, gh);
          const c = eye * gw * gh + y * gw + x;
          this.az[c] = a * DEG;
          this.el[c] = e * DEG;
        }
    this.starts = [];
    let t = 0;
    for (const p of P.PHASES) { this.starts.push(t); t += p.seconds; }
    this.total = t;
    this.rng = new Rng(seed ^ 0x51a7);
  }

  state(tSec: number): StimulusState {
    const loop = Math.floor(tSec / this.total);
    const tl = tSec - loop * this.total;
    let phase = P.PHASES.length - 1;
    for (let i = 0; i < P.PHASES.length; i++) if (tl >= this.starts[i]) phase = i;
    return { phase, phaseT: tl - this.starts[phase], phaseDur: P.PHASES[phase].seconds, loop };
  }

  private rollLoop(loop: number) {
    // deterministic per loop index regardless of when it is first queried
    this.rng = new Rng((P.SEED ^ 0x51a7) + loop * 7919);
    this.gratingDir = this.rng.next() < 0.5 ? -1 : 1;
    this.loomAz = (this.rng.next() * 2 - 1) * 60 * DEG;
    this.loomEl = (this.rng.next() * 2 - 1) * 20 * DEG;
    const a0 = (this.rng.next() * 2 - 1) * 120 * DEG;
    const e0 = (this.rng.next() * 2 - 1) * 30 * DEG;
    const a1 = (this.rng.next() * 2 - 1) * 120 * DEG;
    const e1 = (this.rng.next() * 2 - 1) * 30 * DEG;
    this.targetPath = [a0, e0, a1, e1];
    this.loopSeen = loop;
  }

  /** Render luminance for simulation time tSec into this.lum. Returns the phase state. */
  render(tSec: number): StimulusState {
    const st = this.state(tSec);
    if (st.loop !== this.loopSeen) this.rollLoop(st.loop);
    const { lum, az, el, cells } = this;
    const key = P.PHASES[st.phase].key;
    const t = st.phaseT;
    switch (key) {
      case 'grating': {
        // sinusoidal grating, 8 cycles around the panorama, drifting at 2 Hz (smooth edges, no synchronous volleys)
        const cyc = 8, hz = 2;
        const ph = this.gratingDir * t * hz * 2 * Math.PI;
        for (let c = 0; c < cells; c++) lum[c] = 0.5 + 0.4 * Math.sin(az[c] * cyc + ph);
        break;
      }
      case 'looming': {
        // a dark disc approaching at constant speed: angular radius = atan(l / v / (tc - t)), two per phase
        const half = st.phaseDur / 2;
        const tt = t % half;
        const tc = half - 0.6; // collision time inside each half; disc stays full afterwards
        const lv = P.LOOM_LV_S;
        const r = tt < tc ? Math.atan(lv / (tc - tt)) : Math.PI / 2;
        const ca = Math.cos(this.loomAz), sa = Math.sin(this.loomAz), ce = Math.cos(this.loomEl), se = Math.sin(this.loomEl);
        for (let c = 0; c < cells; c++) {
          const cosd = ce * Math.cos(el[c]) * (ca * Math.cos(az[c]) + sa * Math.sin(az[c])) + se * Math.sin(el[c]);
          lum[c] = cosd > Math.cos(r) ? 0.05 : 0.5;
        }
        break;
      }
      case 'target': {
        // a 6 degree dark spot moving along a seeded path at constant angular speed
        const [a0, e0, a1, e1] = this.targetPath;
        const u = (t / st.phaseDur) % 1;
        const ta = a0 + (a1 - a0) * u, te = e0 + (e1 - e0) * u;
        const rr = Math.cos(3 * DEG);
        const ca = Math.cos(ta), sa = Math.sin(ta), ce = Math.cos(te), se = Math.sin(te);
        for (let c = 0; c < cells; c++) {
          const cosd = ce * Math.cos(el[c]) * (ca * Math.cos(az[c]) + sa * Math.sin(az[c])) + se * Math.sin(el[c]);
          lum[c] = cosd > rr ? 0.05 : 0.5;
        }
        break;
      }
      case 'flash': {
        // uniform field with two 300 ms drops to near black
        const dark = (t > 2 && t < 2.3) || (t > 5 && t < 5.3);
        lum.fill(dark ? 0.02 : 0.5);
        break;
      }
      default:
        lum.fill(0.5);
    }
    return st;
  }

  /** Write the current luminance into the external input of the photoreceptors. */
  apply(map: PhotoMap, net: { setExternal(i: number, v: number): void }) {
    const { idx, cell, gain } = map;
    const g = P.I_PHOTO_GAIN_MV;
    for (let k = 0; k < idx.length; k++) net.setExternal(idx[k], g * gain[k] * this.lum[cell[k]]);
  }

  /** 8-bit copy of the luminance grid for display */
  snapshot(out: Uint8Array) {
    for (let c = 0; c < this.cells; c++) out[c] = (this.lum[c] * 255) | 0;
  }
}
