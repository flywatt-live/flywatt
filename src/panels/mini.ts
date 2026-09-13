// Compact live panels stacked beside the jar in the hero: raster, regional rate, smoothing, gain.
// Same data as the wire panels, smaller drawing.
import type { SimBridge } from '../sim/bridge.js';
import type { FrameMsg } from '../sim/protocol.js';
import * as P from '../sim/params.js';
import { setupCanvas, getPalette, withAlpha, type Surface, type Palette } from './canvas.js';
import { fmtHz, fmtInt } from './format.js';
import { wire } from '../copy/en.js';

interface Mini {
  s: Surface;
  value: HTMLElement;
  draw(f: FrameMsg): void;
}

function make(host: HTMLElement, title: string): { canvas: HTMLCanvasElement; value: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'mini';
  el.innerHTML = `<div class="mini-head"><span class="mini-title">${title}</span><span class="mini-value"></span></div><canvas></canvas>`;
  host.appendChild(el);
  return { canvas: el.querySelector('canvas')!, value: el.querySelector('.mini-value')! };
}

export function mountMinis(bridge: SimBridge) {
  const host = document.getElementById('minis');
  if (!host) return;
  const pal = getPalette();
  const minis: Mini[] = [rasterMini(bridge, pal, host), ratesMini(bridge, pal, host), smoothMini(bridge, pal, host), gainMini(bridge, pal, host)];
  const queue: FrameMsg[] = [];
  bridge.on('frame', (f) => { queue.push(f); if (queue.length > 12) queue.shift(); });
  const loop = () => {
    requestAnimationFrame(loop);
    if (!queue.length) return;
    const frames = queue.splice(0, queue.length);
    for (const m of minis) if (m.s.visible) for (const f of frames) m.draw(f);
  };
  requestAnimationFrame(loop);
}

const STEPS_PER_COL = 20; // 1 px = 10 ms

function rasterMini(bridge: SimBridge, pal: Palette, host: HTMLElement): Mini {
  const { canvas, value } = make(host, wire.raster);
  const meta = bridge.meta;
  const neurons = bridge.neurons;
  const N = meta.n_neurons;
  let ring: HTMLCanvasElement | null = null;
  let rctx: CanvasRenderingContext2D | null = null;
  let W = 0, H = 0, lastCol = -1;
  const s = setupCanvas(canvas, (sf) => {
    W = sf.w; H = sf.h;
    ring = document.createElement('canvas');
    ring.width = W * sf.dpr; ring.height = H * sf.dpr;
    rctx = ring.getContext('2d')!;
    rctx.setTransform(sf.dpr, 0, 0, sf.dpr, 0, 0);
    rctx.fillStyle = pal.ink;
    rctx.fillRect(0, 0, W, H);
    lastCol = -1;
  });
  const dot = withAlpha(pal.steel, 0.5);
  return {
    s, value,
    draw(f) {
      if (!rctx || !ring) return;
      const first = f.step - f.ran;
      const b = f.stepBounds;
      for (let st = 0; st < f.ran; st++) {
        const col = Math.floor((first + st) / STEPS_PER_COL) % W;
        if (col !== lastCol) {
          rctx.fillStyle = pal.ink;
          let c = lastCol < 0 ? col : (lastCol + 1) % W;
          for (let k = 0; k < W; k++) { rctx.fillRect(c, 0, 1, H); if (c === col) break; c = (c + 1) % W; }
          rctx.fillRect((col + 1) % W, 0, 1, H);
          lastCol = col;
        }
        rctx.fillStyle = dot;
        for (let k = b[st]; k < b[st + 1]; k++) rctx.fillRect(col, ((neurons.region[f.spikeIds[k]] + (f.spikeIds[k] % 97) / 97) / meta.regions.length) * (H - 1), 1, 1);
      }
      const { ctx, w, h, dpr } = s;
      const off = (lastCol + 2) % W;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      if (W - off > 0) ctx.drawImage(ring, off * dpr, 0, (W - off) * dpr, H * dpr, 0, 0, W - off, H);
      if (off > 0) ctx.drawImage(ring, 0, 0, off * dpr, H * dpr, W - off, 0, off, H);
      value.textContent = `${fmtInt(N)} rows`;
    },
  };
}

function ratesMini(bridge: SimBridge, pal: Palette, host: HTMLElement): Mini {
  const { canvas, value } = make(host, wire.rates);
  const s = setupCanvas(canvas);
  return {
    s, value,
    draw(f) {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      const n = bridge.series.t.count;
      if (n < 2) return;
      let max = 1;
      const sensory = bridge.meta.regions.indexOf('sensory');
      bridge.series.regions.forEach((r, ri) => { if (ri === sensory) return; for (let i = 0; i < n; i++) max = Math.max(max, r.at(i)); });
      max *= 1.1;
      bridge.series.regions.forEach((r, ri) => {
        ctx.strokeStyle = withAlpha(pal.steel, ri === sensory ? 0.35 : 0.8);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = Math.max(1, h - 2 - (r.at(i) / max) * (h - 4));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      value.textContent = fmtHz(f.r);
    },
  };
}

function smoothMini(bridge: SimBridge, pal: Palette, host: HTMLElement): Mini {
  const { canvas, value } = make(host, wire.smoothing);
  const s = setupCanvas(canvas);
  return {
    s, value,
    draw(f) {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      const yf = h - 2 - P.L_FLOOR * (h - 4);
      ctx.fillStyle = withAlpha(pal.patina, 0.7);
      ctx.fillRect(0, yf | 0, w, 1);
      const draw = (r: typeof bridge.series.L, color: string, width: number) => {
        const n = r.count;
        if (n < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = h - 2 - r.at(i) * (h - 4);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      draw(bridge.series.L, withAlpha(pal.steel, 0.6), 1);
      draw(bridge.series.gain, pal.copper, 1.5);
      value.textContent = `L ${f.L.toFixed(2)}`;
    },
  };
}

function gainMini(bridge: SimBridge, pal: Palette, host: HTMLElement): Mini {
  const { canvas, value } = make(host, wire.gain);
  const s = setupCanvas(canvas);
  return {
    s, value,
    draw(f) {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      // bar with tick marks, like a meter face laid flat
      const x0 = 8, x1 = w - 8, y = h / 2;
      ctx.fillStyle = withAlpha(pal.steel, 0.2);
      ctx.fillRect(x0, y - 4, x1 - x0, 8);
      ctx.fillStyle = pal.copper;
      ctx.fillRect(x0, y - 4, (x1 - x0) * f.gain, 8);
      for (let i = 0; i <= 10; i++) {
        const x = x0 + ((x1 - x0) * i) / 10;
        ctx.fillStyle = withAlpha(pal.steel, 0.6);
        ctx.fillRect(x | 0, y + 8, 1, i % 5 === 0 ? 8 : 4);
      }
      const xf = x0 + (x1 - x0) * P.L_FLOOR;
      ctx.fillStyle = pal.patina;
      ctx.fillRect(xf | 0, y - 10, 1, 20);
      void bridge;
      value.textContent = f.gain.toFixed(3);
    },
  };
}
