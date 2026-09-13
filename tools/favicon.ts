// Rasterises public/favicon.svg to 32 and 16 px PNGs.   npm run favicon
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/favicon.svg');
for (const size of [32, 16]) {
  const png = await sharp(svg, { density: 384 }).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
  writeFileSync(`public/favicon-${size}.png`, png);
  console.log(`favicon-${size}.png ${png.length} B`);
}
