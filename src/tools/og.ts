// Dev-only capture page: /?og=1 renders the apparatus at a fixed brightness and offers
// og.png (1200 x 630, with the site title) and poster.jpg (1600 x 900, no text) to save
// into public/. Manual on purpose: the brief asks for eyes on this render before it ships.
import { SimBridge } from '../sim/bridge.js';
import { createApparatus } from '../scene/apparatus.js';
import { site } from '../copy/en.js';

const GAIN = 0.78;
const NEEDLE = 0.62;

export async function mountOg() {
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#08070a;color:#e8dcc0;font-family:Basteleur,serif;padding:24px';
  const info = document.createElement('p');
  info.textContent = 'rendering';
  document.body.appendChild(info);
  const stage = document.createElement('canvas');
  stage.style.cssText = 'display:block;width:1200px;height:630px;background:#08070a';
  document.body.appendChild(stage);
  const bridge = new SimBridge();
  await document.fonts.load('700 120px Basteleur');
  const app = await createApparatus(stage, bridge, { preserve: true });
  await app.ready;
  app.stop();
  await new Promise((r) => setTimeout(r, 300));

  const links = document.createElement('div');
  links.style.cssText = 'display:flex;gap:24px;margin-top:16px';
  document.body.appendChild(links);

  const shoot = async (w: number, h: number, withText: boolean, name: string, type: string) => {
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    app.renderer.setPixelRatio(1);
    // tighter than the page: the card is wide and small
    const cam = { z: 1.45, y: 0.2, fov: 38, lookY: 0.15, x: 0.26 };
    app.renderStill(GAIN, NEEDLE, cam);
    await new Promise((r) => setTimeout(r, 200));
    app.renderStill(GAIN, NEEDLE, cam);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(stage, 0, 0, w, h);
    if (withText) {
      ctx.font = `700 ${Math.round(h * 0.13)}px Basteleur, serif`;
      ctx.fillStyle = 'rgba(232,220,192,0.96)';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillText(site.title, Math.round(w * 0.05), Math.round(h * 0.21));
    }
    const url = out.toDataURL(type, 0.9);
    // dev server endpoint writes the file into public/
    try {
      const r = await fetch('/__save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, dataUrl: url }) });
      const j = (await r.json()) as { ok: boolean; bytes: number };
      const note = document.createElement('p');
      note.textContent = `saved public/${name} (${j.bytes} B)`;
      links.appendChild(note);
    } catch (e) {
      const note = document.createElement('p');
      note.textContent = `could not save ${name}: ${String(e)}`;
      links.appendChild(note);
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.textContent = `save ${name} (${w} x ${h})`;
    a.style.cssText = 'color:#b5763a;font-size:18px';
    links.appendChild(a);
    const preview = document.createElement('img');
    preview.src = url;
    preview.style.cssText = 'display:block;max-width:600px;margin-top:16px;border:1px solid #4a6b63';
    document.body.appendChild(preview);
  };
  await shoot(1200, 630, true, 'og.png', 'image/png');
  await shoot(1600, 900, false, 'poster.jpg', 'image/jpeg');
  info.textContent = 'right click the links and save into public/';
}
