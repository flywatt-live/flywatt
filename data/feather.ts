// Feather v2 (Arrow IPC file) reader for Node, using apache-arrow with LZ4 / ZSTD
// codecs registered. MaleCNS feather files are LZ4-frame compressed per batch.
import { readFileSync, createReadStream } from 'node:fs';
import * as arrow from 'apache-arrow';
import lz4 from 'lz4js';
import { decompress as zstdDecompress } from 'fzstd';

let registered = false;
export function registerCodecs() {
  if (registered) return;
  arrow.compressionRegistry.set(arrow.CompressionType.LZ4_FRAME, { decode: (d: Uint8Array) => lz4.decompress(d) });
  arrow.compressionRegistry.set(arrow.CompressionType.ZSTD, { decode: (d: Uint8Array) => zstdDecompress(d) });
  registered = true;
}

/** Load a whole (small) feather file into memory. */
export function readTable(path: string): arrow.Table {
  registerCodecs();
  return arrow.tableFromIPC(readFileSync(path));
}

/** Stream record batches of a large feather file without materialising it. */
export async function* streamBatches(path: string): AsyncGenerator<arrow.RecordBatch> {
  registerCodecs();
  const reader = await arrow.RecordBatchReader.from(createReadStream(path, { highWaterMark: 1 << 22 }));
  await reader.open();
  for await (const batch of reader) yield batch;
}

export interface Int64Col {
  lo: Uint32Array;
  hi: Int32Array;
  offset: number;
  length: number;
}

/**
 * View an Int64 column of a batch as two 32-bit halves so rows can be read as JS numbers
 * without allocating a bigint per row. Values must fit in 2^53 (caller asserts on samples).
 */
export function int64Column(batch: arrow.RecordBatch, name: string): Int64Col {
  const vec = batch.getChild(name);
  if (!vec) throw new Error(`column ${name} missing`);
  if (vec.data.length !== 1) throw new Error(`column ${name}: expected one data chunk per batch, got ${vec.data.length}`);
  const d = vec.data[0];
  const values = d.values as BigInt64Array;
  const lo = new Uint32Array(values.buffer, values.byteOffset, values.length * 2);
  const hi = new Int32Array(values.buffer, values.byteOffset, values.length * 2);
  return { lo, hi, offset: d.offset, length: d.length };
}

export function int64At(col: Int64Col, i: number): number {
  const j = (col.offset + i) * 2;
  return col.hi[j + 1] * 4294967296 + col.lo[j];
}

export function stringColumn(table: arrow.Table | arrow.RecordBatch, name: string): (i: number) => string | null {
  const vec = table.getChild(name);
  if (!vec) throw new Error(`column ${name} missing`);
  return (i: number) => {
    const v = vec.get(i);
    return v == null ? null : String(v);
  };
}

export function numberColumn(table: arrow.Table | arrow.RecordBatch, name: string): (i: number) => number | null {
  const vec = table.getChild(name);
  if (!vec) throw new Error(`column ${name} missing`);
  return (i: number) => {
    const v = vec.get(i);
    if (v == null) return null;
    return typeof v === 'bigint' ? Number(v) : (v as number);
  };
}
