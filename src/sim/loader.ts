// Streams the gzipped binaries with byte-level progress and decompresses them in the page.
// Works whether or not the server strips the gzip layer itself (magic-byte sniff).
import { gunzipSync } from 'fflate';
import type { Meta } from './meta.js';

export interface Progress {
  file: string;
  received: number;
  total: number;
  /** neurons counted so far while neurons.bin streams (bytes / 8 while the bodyId section arrives) */
  neuronsSoFar: number;
}

export async function loadMeta(base: string): Promise<Meta> {
  const res = await fetch(`${base}meta.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`meta.json ${res.status}`);
  return (await res.json()) as Meta;
}

/** Fetch a .bin.gz, report progress, return the decompressed bytes. */
export async function loadBinary(url: string, expectedGz: number, expectedRaw: number, onProgress: (p: Progress) => void, isNeurons: boolean): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} ${res.status}`);
  const total = Number(res.headers.get('content-length')) || expectedGz;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const name = url.split('/').pop() ?? url;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress({ file: name, received, total, neuronsSoFar: isNeurons ? Math.min(expectedRaw, Math.floor(((received / total) * expectedRaw - 16) / 8)) : 0 });
  }
  const all = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  const gz = all[0] === 0x1f && all[1] === 0x8b;
  if (!gz) return all.buffer;
  if (typeof DecompressionStream === 'function') {
    try {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([all]).stream().pipeThrough(ds);
      return await new Response(stream).arrayBuffer();
    } catch {
      /* fall through to fflate */
    }
  }
  const out = gunzipSync(all);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
