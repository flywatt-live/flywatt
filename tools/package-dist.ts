// Zips dist/ into flywatt-dist.zip for upload to Hostinger's public_html.   npm run package
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const root = 'dist';
const files: Record<string, Uint8Array> = {};
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(root, p).replace(/\\/g, '/')] = new Uint8Array(readFileSync(p));
  }
};
walk(root);
const zip = zipSync(files, { level: 6 });
writeFileSync('flywatt-dist.zip', zip);
const total = Object.values(files).reduce((a, f) => a + f.length, 0);
console.log(`flywatt-dist.zip: ${Object.keys(files).length} files, ${(total / 1048576).toFixed(2)} MB raw, ${(zip.length / 1048576).toFixed(2)} MB zipped`);
console.log('upload the contents of the zip to public_html (the folder itself, not the zip)');
