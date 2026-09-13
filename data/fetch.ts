// Downloads the MaleCNS flat-connectome feather files into data/raw with resume + retry.
// Re-runnable: complete files are skipped. `npm run data:fetch -- --weights` also fetches the 1 GB file.
import { existsSync, statSync, mkdirSync, createWriteStream, renameSync } from 'node:fs';
import { join } from 'node:path';
import { RAW_DIR, FILES, BASE_URL } from './columns.js';

mkdirSync(RAW_DIR, { recursive: true });
const wantWeights = process.argv.includes('--weights') || process.argv.includes('--all');
const names: string[] = wantWeights ? Object.values(FILES) : [FILES.annotations, FILES.neurotransmitters];

async function head(url: string): Promise<number> {
  const r = await fetch(url, { method: 'HEAD' });
  if (!r.ok) throw new Error(`HEAD ${r.status} ${url}`);
  return Number(r.headers.get('content-length') ?? r.headers.get('x-goog-stored-content-length') ?? 0);
}

async function download(name: string) {
  const url = BASE_URL + name;
  const dest = join(RAW_DIR, name);
  const part = dest + '.part';
  const total = await head(url);
  if (existsSync(dest) && statSync(dest).size === total) {
    console.log(`skip  ${name}  (${total} B, complete)`);
    return;
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    const have = existsSync(part) ? statSync(part).size : 0;
    try {
      const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {} });
      if (!res.ok && res.status !== 206) throw new Error(`GET ${res.status}`);
      const resume = have > 0 && res.status === 206;
      const out = createWriteStream(part, { flags: resume ? 'a' : 'w' });
      let got = resume ? have : 0;
      const t0 = Date.now();
      const reader = res.body!.getReader();
      let lastLog = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        got += value.length;
        if (got - lastLog > 50 * 1048576) {
          lastLog = got;
          const mbps = ((got - have) / 1048576 / ((Date.now() - t0) / 1000)).toFixed(1);
          console.log(`  ${name}  ${(got / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB  ${mbps} MB/s`);
        }
      }
      await new Promise((r) => out.end(r));
      if (statSync(part).size !== total) throw new Error(`size mismatch ${statSync(part).size} != ${total}`);
      renameSync(part, dest);
      console.log(`done  ${name}  ${total} B`);
      return;
    } catch (e) {
      console.warn(`attempt ${attempt} failed for ${name}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`could not download ${name}`);
}

for (const n of names) await download(n);
