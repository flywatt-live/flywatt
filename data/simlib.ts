// Headless harness: runs the same simulation core as the browser worker in Node,
// from the uncompressed binaries in data/out. Used by calibrate.ts and verify.ts.
import { readFileSync } from 'node:fs';
import { parseNeurons, parseConnectome, type NeuronsData, type ConnectomeData } from '../src/sim/format.js';
import type { Meta } from '../src/sim/meta.js';
import { LIFNetwork, type NetOptions } from '../src/sim/core.js';
import { StimulusLoop, buildPhotoMap, type PhotoMap } from '../src/sim/stimulus.js';
import { OutputChain, countTypes } from '../src/sim/output.js';
import * as P from '../src/sim/params.js';

export interface Loaded {
  neurons: NeuronsData;
  conn: ConnectomeData;
  meta: Meta;
  typeCount: Uint32Array;
}

function toArrayBuffer(b: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

export function load(): Loaded {
  const neurons = parseNeurons(toArrayBuffer(readFileSync('data/out/neurons.bin')));
  const conn = parseConnectome(toArrayBuffer(readFileSync('data/out/connectome.bin')));
  const meta = JSON.parse(readFileSync('public/data/meta.json', 'utf8')) as Meta;
  if (meta.n_neurons !== neurons.n || meta.n_edges !== conn.m) throw new Error('meta.json does not match data/out binaries; rerun data:build');
  return { neurons, conn, meta, typeCount: countTypes(neurons.typeIdx, neurons.nTypes) };
}

export interface Sim {
  net: LIFNetwork;
  stim: StimulusLoop;
  map: PhotoMap;
  out: OutputChain;
  /** run for `seconds` of simulated time; onStep is called after each step */
  run(seconds: number, opts?: { stimulus?: boolean; fixedLum?: number; onStep?: (step: number) => void; tOffset?: number }): void;
  simSeconds(): number;
}

export function makeSim(d: Loaded, opts: NetOptions = {}): Sim {
  const [gw, gh] = d.meta.photoreceptors.grid;
  const net = new LIFNetwork(d.neurons, d.conn, opts);
  const stim = new StimulusLoop(gw, gh, opts.seed ?? P.SEED);
  const map = buildPhotoMap(d.neurons, gw, gh);
  const out = new OutputChain(net.n, d.neurons.region, d.meta.regions.length, d.neurons.nTypes, d.neurons.side);
  const sim: Sim = {
    net, stim, map, out,
    simSeconds: () => (net.step * P.DT_MS) / 1000,
    run(seconds, o = {}) {
      const steps = Math.round((seconds * 1000) / P.DT_MS);
      const useStim = o.stimulus !== false;
      for (let s = 0; s < steps; s++) {
        if (net.step % P.STIM_EVERY_STEPS === 0) {
          if (useStim) {
            stim.render((net.step * P.DT_MS) / 1000 + (o.tOffset ?? 0));
          } else {
            stim.lum.fill(o.fixedLum ?? 0.5);
          }
          stim.apply(map, net);
        }
        const c = net.advance();
        out.push(net.spikes, c, net.region, net.typeIdx);
        o.onStep?.(net.step);
      }
    },
  };
  return sim;
}

/** Mean rate (Hz) over a set of neurons for spikes accumulated by an accumulator run. */
export class RateMeter {
  readonly counts: Uint32Array;
  steps = 0;
  constructor(n: number) { this.counts = new Uint32Array(n); }
  add(net: LIFNetwork) {
    const s = net.spikes;
    for (let k = 0, c = net.spikeCount; k < c; k++) this.counts[s[k]]++;
    this.steps++;
  }
  seconds() { return (this.steps * P.DT_MS) / 1000; }
  meanHz(from = 0, to = this.counts.length): number {
    let sum = 0;
    for (let i = from; i < to; i++) sum += this.counts[i];
    return sum / ((to - from) * this.seconds());
  }
  reset() { this.counts.fill(0); this.steps = 0; }
}

export function regionRange(meta: Meta, name: string): [number, number] {
  const r = meta.regions.indexOf(name);
  return [meta.region_offsets[r], meta.region_offsets[r + 1]];
}

export function typeRange(meta: Meta, name: string): [number, number] {
  const t = meta.types.find((x) => x.name === name);
  if (!t) throw new Error(`type ${name} not in meta`);
  return [t.offset, t.offset + t.count];
}
