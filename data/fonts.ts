// Downloads the two typefaces from their sources, verifies the OFL licence text,
// and places the web fonts under public/fonts. Re-runnable: `npm run fonts`.
//
// Basteleur      Keussel / Velvetyne, SIL Open Font License 1.1
//                https://velvetyne.fr/fonts/basteleur/  (source: gitlab.com/velvetyne/basteleur)
// Departure Mono Helena Zhang, SIL Open Font License 1.1
//                https://departuremono.com/  (source: github.com/rektdeckard/departure-mono)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'public', 'fonts');
const RAW = join(ROOT, 'data', 'raw');
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const BASTELEUR_BASE = 'https://gitlab.com/velvetyne/basteleur/-/raw/master/';
const BASTELEUR_FILES = ['fonts/webfonts/Basteleur-Bold.woff2', 'fonts/webfonts/Basteleur-Moonlight.woff2'];
const BASTELEUR_LICENSE = 'LICENSE.txt';
const DEPARTURE_ZIP = 'https://github.com/rektdeckard/departure-mono/releases/download/v1.500/DepartureMono-1.500.zip';

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function assertOFL(text: string, name: string) {
  if (!/SIL OPEN FONT LICENSE/i.test(text) || !/Version 1\.1/i.test(text)) {
    throw new Error(`${name}: licence text is not SIL OFL 1.1, refusing to install`);
  }
}

async function basteleur() {
  const lic = new TextDecoder().decode(await fetchBytes(BASTELEUR_BASE + BASTELEUR_LICENSE));
  assertOFL(lic, 'Basteleur');
  writeFileSync(join(OUT, 'LICENSE-Basteleur.txt'), lic);
  for (const f of BASTELEUR_FILES) {
    const bytes = await fetchBytes(BASTELEUR_BASE + f);
    if (bytes.length < 10_000 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2') {
      throw new Error(`Basteleur: ${f} is not a woff2 file`);
    }
    const name = f.split('/').pop()!;
    writeFileSync(join(OUT, name), bytes);
    console.log(`basteleur  ${name}  ${bytes.length} B`);
  }
}

async function departure() {
  const zipPath = join(RAW, 'DepartureMono-1.500.zip');
  const zip = existsSync(zipPath) ? new Uint8Array(readFileSync(zipPath)) : await fetchBytes(DEPARTURE_ZIP);
  if (!existsSync(zipPath)) writeFileSync(zipPath, zip);
  const files = unzipSync(zip);
  const find = (suffix: string) => {
    const k = Object.keys(files).find((n) => n.endsWith(suffix));
    if (!k) throw new Error(`Departure Mono: ${suffix} missing from zip`);
    return files[k];
  };
  const lic = new TextDecoder().decode(find('LICENSE'));
  assertOFL(lic, 'Departure Mono');
  writeFileSync(join(OUT, 'LICENSE-DepartureMono.txt'), lic);
  const woff2 = find('DepartureMono-Regular.woff2');
  writeFileSync(join(OUT, 'DepartureMono-Regular.woff2'), woff2);
  console.log(`departure  DepartureMono-Regular.woff2  ${woff2.length} B`);
}

await basteleur();
await departure();
console.log('fonts installed to public/fonts');
