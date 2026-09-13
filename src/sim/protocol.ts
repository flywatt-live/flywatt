// Messages between the page and the simulation worker. Typed arrays are transferred.
import type { Meta } from './meta.js';

export interface InitMsg {
  t: 'init';
  neurons: ArrayBuffer;
  connectome: ArrayBuffer;
  meta: Meta;
  seed: number;
  /** simulated milliseconds already elapsed since launch when this page opened */
  tOffsetMs: number;
}
export interface ControlMsg {
  t: 'start' | 'pause' | 'resume';
}
export type ToWorker = InitMsg | ControlMsg;

export interface ReadyMsg {
  t: 'ready';
  n: number;
  m: number;
  initMs: number;
}

/** One batch of simulation steps. Sent every few milliseconds while running. */
export interface FrameMsg {
  t: 'frame';
  /** step index after this batch */
  step: number;
  /** simulated time in ms after this batch */
  simMs: number;
  /** steps run in this batch */
  ran: number;
  /** steps that were due by wall clock */
  due: number;
  /** simulated seconds per wall second, smoothed; below 1 when the worker cannot keep up */
  speed: number;
  /** smoothed wall-clock cost of one step in the worker, ms */
  stepMs: number;
  /** neuron ids that spiked in this batch, grouped by step */
  spikeIds: Uint32Array;
  /** offsets into spikeIds, length ran + 1 */
  stepBounds: Uint32Array;
  /** window sum, rate, brightness chain, power */
  S: number;
  r: number;
  L: number;
  Ls: number;
  gain: number;
  P: number;
  regionRates: Float32Array;
  /** stimulus phase index and time inside it */
  phase: number;
  phaseT: number;
  phaseDur: number;
  loop: number;
  /** luminance grid, 8 bit, 2 eyes */
  lum: Uint8Array;
}

export interface TypeRatesMsg {
  t: 'typeRates';
  simMs: number;
  rates: Float32Array;
  /** per (type, side): index type * 3 + side, side 0 left, 1 right, 2 other */
  bySide: Float32Array;
}

export interface PhaseMsg {
  t: 'phase';
  phase: number;
  simMs: number;
}

export type FromWorker = ReadyMsg | FrameMsg | TypeRatesMsg | PhaseMsg;
