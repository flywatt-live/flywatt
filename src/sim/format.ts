// Binary layouts shared by data/build.ts (writer) and the browser / Node simulation (reader).
// No DOM or Node APIs here.
//
// neurons.bin    'FWN1' | u32 N | u16 nTypes | u16 0 | u32 0        (16 B header)
//                bodyId Float64[N] | typeIdx Uint16[N] | region Uint8[N] | sign Int8[N]
//                side Uint8[N] | px Uint8[N] | py Uint8[N]           (each 8-byte aligned)
// connectome.bin 'FWC1' | u32 N | u32 M | u32 0                     (16 B header)
//                indptr Uint32[N+1] | indices Uint32[M] | weights Int16[M]

export const NEURONS_MAGIC = 'FWN1';
export const CONNECTOME_MAGIC = 'FWC1';
/** px value meaning "not a photoreceptor" */
export const PX_NONE = 255;

export interface NeuronsData {
  n: number;
  nTypes: number;
  bodyId: Float64Array;
  typeIdx: Uint16Array;
  region: Uint8Array;
  sign: Int8Array;
  side: Uint8Array;
  px: Uint8Array;
  py: Uint8Array;
}

export interface ConnectomeData {
  n: number;
  m: number;
  indptr: Uint32Array;
  indices: Uint32Array;
  weights: Int16Array;
}

const align8 = (x: number) => (x + 7) & ~7;

function magic(buf: ArrayBuffer, offset: number): string {
  const b = new Uint8Array(buf, offset, 4);
  return String.fromCharCode(b[0], b[1], b[2], b[3]);
}

function neuronOffsets(n: number) {
  let off = 16;
  const body = off; off = align8(off + n * 8);
  const type = off; off = align8(off + n * 2);
  const region = off; off = align8(off + n);
  const sign = off; off = align8(off + n);
  const side = off; off = align8(off + n);
  const px = off; off = align8(off + n);
  const py = off; off = align8(off + n);
  return { body, type, region, sign, side, px, py, total: off };
}

export function encodeNeurons(d: NeuronsData): ArrayBuffer {
  const n = d.n;
  const o = neuronOffsets(n);
  const buf = new ArrayBuffer(o.total);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8.set([70, 87, 78, 49], 0);
  dv.setUint32(4, n, true);
  dv.setUint16(8, d.nTypes, true);
  new Float64Array(buf, o.body, n).set(d.bodyId);
  new Uint16Array(buf, o.type, n).set(d.typeIdx);
  new Uint8Array(buf, o.region, n).set(d.region);
  new Int8Array(buf, o.sign, n).set(d.sign);
  new Uint8Array(buf, o.side, n).set(d.side);
  new Uint8Array(buf, o.px, n).set(d.px);
  new Uint8Array(buf, o.py, n).set(d.py);
  return buf;
}

export function parseNeurons(buf: ArrayBuffer): NeuronsData {
  if (magic(buf, 0) !== NEURONS_MAGIC) throw new Error('neurons.bin: bad magic');
  const dv = new DataView(buf);
  const n = dv.getUint32(4, true);
  const nTypes = dv.getUint16(8, true);
  const o = neuronOffsets(n);
  if (o.total !== buf.byteLength) throw new Error(`neurons.bin: size ${buf.byteLength} != expected ${o.total}`);
  return {
    n,
    nTypes,
    bodyId: new Float64Array(buf, o.body, n),
    typeIdx: new Uint16Array(buf, o.type, n),
    region: new Uint8Array(buf, o.region, n),
    sign: new Int8Array(buf, o.sign, n),
    side: new Uint8Array(buf, o.side, n),
    px: new Uint8Array(buf, o.px, n),
    py: new Uint8Array(buf, o.py, n),
  };
}

function connectomeOffsets(n: number, m: number) {
  let off = 16;
  const indptr = off; off = align8(off + (n + 1) * 4);
  const indices = off; off = align8(off + m * 4);
  const weights = off; off = align8(off + m * 2);
  return { indptr, indices, weights, total: off };
}

export function encodeConnectome(d: ConnectomeData): ArrayBuffer {
  const { n, m } = d;
  const o = connectomeOffsets(n, m);
  const buf = new ArrayBuffer(o.total);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8.set([70, 87, 67, 49], 0);
  dv.setUint32(4, n, true);
  dv.setUint32(8, m, true);
  new Uint32Array(buf, o.indptr, n + 1).set(d.indptr);
  new Uint32Array(buf, o.indices, m).set(d.indices);
  new Int16Array(buf, o.weights, m).set(d.weights);
  return buf;
}

export function parseConnectome(buf: ArrayBuffer): ConnectomeData {
  if (magic(buf, 0) !== CONNECTOME_MAGIC) throw new Error('connectome.bin: bad magic');
  const dv = new DataView(buf);
  const n = dv.getUint32(4, true);
  const m = dv.getUint32(8, true);
  const o = connectomeOffsets(n, m);
  if (o.total !== buf.byteLength) throw new Error(`connectome.bin: size ${buf.byteLength} != expected ${o.total}`);
  return {
    n,
    m,
    indptr: new Uint32Array(buf, o.indptr, n + 1),
    indices: new Uint32Array(buf, o.indices, m),
    weights: new Int16Array(buf, o.weights, m),
  };
}
