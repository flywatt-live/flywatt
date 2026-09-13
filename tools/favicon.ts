// Rasterises the logo (logo.png, the bulb with the fly) to the favicon sizes.   npm run favicon
// The bulb sits in the middle of the square source; a tight square crop keeps it legible at 16 px.
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const src = sharp('logo.png');
const { width = 0, height = 0 } = await src.metadata();
const side = Math.round(Math.min(width, height) * 0.8);
const crop = { left: Math.round((width - side) / 2), top: Math.round((height - side) / 2 + height * 0.01), width: side, height: side };
for (const [size, name] of [[180, 'apple-touch-icon.png'], [32, 'favicon-32.png'], [16, 'favicon-16.png']] as const) {
  const png = await sharp('logo.png').extract(crop).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
  writeFileSync(`public/${name}`, png);
  console.log(`${name} ${png.length} B`);
}
