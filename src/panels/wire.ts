// The wire: six live panels drawn from the bridge rings. Nothing here invents a number.
import type { SimBridge } from '../sim/bridge.js';
import type { FrameMsg } from '../sim/protocol.js';
import * as P from '../sim/params.js';
import { PX_NONE } from '../sim/format.js';
import { setupCanvas, getPalette, withAlpha, label, ticks, MONO, type Surface, type Palette } from './canvas.js';
import { fmtSI, fmtHz, fmtInt, fmtClock } from './format.js';
import { wire, labels } from '../copy/en.js';

interface Panel {
  s: Surface;
  draw(f: FrameMsg): void;
}

function head(id: string, title: string, unit: string, caption: string) {
  const el = document.getElementById(id)!;
  el.querySelector('.panel-title')!.textContent = title;
  el.querySelector('.panel-unit')!.textContent = unit;
  const cap = document.createElement('p');
  cap.className = 'panel-caption';
  cap.textContent = caption;
  el.querySelector('.panel-head')!.after(cap);
  return { el, canvas: el.querySelector('canvas') as HTMLCanvasElement, foot: el.querySelector('.panel-foot') as HTMLElement };
}

const STEPS_PER_COL = 10; // 1 px = 5 ms

export function mountWire(bridge: SimBridge) {
  document.getElementById('wire-intro')!.textContent = wire.intro;
  const pal = getPalette();
  const meta = bridge.meta;
  const panels: Panel[] = [stimPanel(bridge, pal), rasterPanel(bridge, pal), ratesPanel(bridge, pal), sumPanel(bridge, pal), smoothPanel(bridge, pal), gainPanel(bridge, pal)];
  void meta;
  // every frame is drawn, in order; dropping one would force the raster to rebuild its history
  const queue: FrameMsg[] = [];
  bridge.on('frame', (f) => { queue.push(f); if (queue.length > 12) queue.shift(); });
  const loop = () => {
    if (queue.length) {
      const frames = queue.splice(0, queue.length);
      for (const p of panels) if (p.s.visible) for (const f of frames) p.draw(f);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ what the fly sees
function stimPanel(bridge: SimBridge, pal: Palette): Panel {
  const { canvas, foot } = head('p-stim', wire.stimulus, wire.stimulusUnit, wire.captions.stim);
  const [gw, gh] = bridge.meta.photoreceptors.grid;
  const n = bridge.neurons;
  // which grid cells carry a photoreceptor, per eye
  const has = new Uint8Array(2 * gw * gh);
  for (let i = 0; i < n.n; i++) if (n.px[i] !== PX_NONE) has[(n.side[i] === 1 ? 1 : 0) * gw * gh + n.py[i] * gw + n.px[i]] = 1;
  const s = setupCanvas(canvas);
  const footL = document.createElement('span');
  const footR = document.createElement('span');
  foot.append(footL, footR);
  let lastPhase = -1;
  return {
    s,
    draw(f) {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      const pad = 14;
      const cell = Math.max(2, Math.min(9, Math.floor(Math.min((w - pad * 3) / (2 * gw), (h - pad * 2 - 18) / gh))));
      const gx = (w - (2 * gw * cell + pad)) / 2;
      const gy = pad;
      for (let eye = 0; eye < 2; eye++) {
        const ox = gx + eye * (gw * cell + pad);
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            const c = eye * gw * gh + y * gw + x;
            const l = f.lum[c] / 255;
            const a = has[c] ? 0.25 + 0.75 * l : 0.06 + 0.2 * l;
            ctx.fillStyle = withAlpha(pal.steel, a);
            // hex columns drawn as a sheared lattice, matching the model's mapping
            const sx = ox + x * cell + ((y - gh / 2) * cell) / 2;
            ctx.fillRect(sx, gy + (gh - 1 - y) * cell, cell - 1, cell - 1);
          }
        }
        label(ctx, eye === 0 ? 'left eye' : 'right eye', ox + (gw * cell) / 2, h - 6, pal, 'center');
      }
      if (f.phase !== lastPhase) {
        lastPhase = f.phase;
        footL.textContent = `${labels.stimulusPhase}  ${P.PHASES[f.phase].name}`;
      }
      footR.textContent = `${f.phaseT.toFixed(1)} / ${f.phaseDur} s  loop ${f.loop + 1}`;
    },
  };
}

// ------------------------------------------------------------------ raster wall
function rasterPanel(bridge: SimBridge, pal: Palette): Panel {
  const { canvas, foot } = head('p-raster', wire.raster, wire.rasterUnit, wire.captions.raster);
  const meta = bridge.meta;
  const neurons = bridge.neurons;
  const GUTTER = 96;
  const AXIS = 16;
  let ring: HTMLCanvasElement | OffscreenCanvas | null = null;
  let rctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  let W = 0, H = 0;
  let lastCol = -1;
  const bands: { y0: number; h: number; offset: number; count: number; name: string }[] = [];
  const footL = document.createElement('span');
  const footR = document.createElement('span');
  foot.append(footL, footR);

  function rebuild(sf: Surface) {
    W = Math.max(10, sf.w - GUTTER - RIGHT);
    H = Math.max(10, sf.h - AXIS);
    ring = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(W * sf.dpr, H * sf.dpr) : Object.assign(document.createElement('canvas'), { width: W * sf.dpr, height: H * sf.dpr });
    rctx = ring.getContext('2d') as CanvasRenderingContext2D;
    rctx.setTransform(sf.dpr, 0, 0, sf.dpr, 0, 0);
    rctx.fillStyle = pal.ink;
    rctx.fillRect(0, 0, W, H);
    // bands proportional to sqrt(count), min height
    bands.length = 0;
    const R = meta.regions.length;
    const weights = meta.regions.map((_, r) => Math.sqrt(meta.region_offsets[r + 1] - meta.region_offsets[r]));
    const minH = 26;
    const sum = weights.reduce((a, b) => a + b, 0);
    let free = H - minH * R;
    let y = 0;
    for (let r = 0; r < R; r++) {
      const hh = minH + (free > 0 ? (free * weights[r]) / sum : 0);
      bands.push({ y0: y, h: hh, offset: meta.region_offsets[r], count: meta.region_offsets[r + 1] - meta.region_offsets[r], name: meta.regions[r] });
      y += hh;
    }
    lastCol = -1;
    redrawHistory();
  }

  // dense bands (thousands of rows in a few dozen pixels) get fainter dots so their texture stays visible
  const dotColor = meta.regions.map((name, r) => {
    const dense = meta.region_offsets[r + 1] - meta.region_offsets[r] > 3000;
    if (name === 'descending' || name === 'motor') return pal.copper; // the output, on its way to the bulb
    if (name === 'sensory') return withAlpha(pal.steel, 0.35);
    return withAlpha(pal.steel, dense ? 0.5 : 0.9);
  });
  const RIGHT = 64;
  const s = setupCanvas(canvas, (sf) => rebuild(sf));

  const yOf = (i: number) => {
    const r = neurons.region[i];
    const b = bands[r];
    return b.y0 + ((i - b.offset) / b.count) * (b.h - 1);
  };

  function plot(id: number, step: number, hl: number) {
    const col = Math.floor(step / STEPS_PER_COL) % W;
    if (col !== lastCol) {
      // clear every column from the last one up to this one, plus a cursor gap ahead
      let c = lastCol < 0 ? col : (lastCol + 1) % W;
      rctx!.fillStyle = pal.ink;
      for (let k = 0; k < W; k++) {
        rctx!.fillRect(c, 0, 1, H);
        if (c === col) break;
        c = (c + 1) % W;
      }
      for (let g = 1; g <= 3; g++) rctx!.fillRect((col + g) % W, 0, 1, H);
      lastCol = col;
    }
    const isHl = hl >= 0 && neurons.typeIdx[id] === hl;
    rctx!.fillStyle = isHl ? pal.filament : dotColor[neurons.region[id]];
    rctx!.fillRect(col, yOf(id) | 0, 1, 1);
  }

  function redrawHistory() {
    if (!rctx) return;
    rctx.fillStyle = pal.ink;
    rctx.fillRect(0, 0, W, H);
    lastCol = -1;
    const hl = bridge.highlightType;
    const latest = bridge.latest?.step ?? 0;
    const oldest = latest - W * STEPS_PER_COL;
    bridge.raster.forEach((id, step) => {
      if (step < oldest) return;
      plot(id, step, hl);
    });
  }

  bridge.on('highlight', () => redrawHistory());
  let lastDrawnStep = -1;

  return {
    s,
    draw(f) {
      if (!ring || !rctx) return;
      const hl = bridge.highlightType;
      const firstStep = f.step - f.ran;
      // frames were skipped while the panel was off screen: rebuild from the spike history
      if (lastDrawnStep >= 0 && firstStep > lastDrawnStep + 1 && f.step - lastDrawnStep > 200) redrawHistory();
      lastDrawnStep = f.step;
      const b = f.stepBounds;
      for (let st = 0; st < f.ran; st++) {
        const step = firstStep + st;
        for (let k = b[st]; k < b[st + 1]; k++) plot(f.spikeIds[k], step, hl);
      }
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      // present the ring with the newest column at the right edge
      const off = (lastCol + 4) % W; // columns after the cursor gap are the oldest
      const img = ring as CanvasImageSource;
      const d = s.dpr;
      if (W - off > 0) ctx.drawImage(img, off * d, 0, (W - off) * d, H * d, GUTTER, 0, W - off, H);
      if (off > 0) ctx.drawImage(img, 0, 0, off * d, H * d, GUTTER + W - off, 0, off, H);
      // cursor: the present moment
      ctx.fillStyle = withAlpha(pal.copper, 0.9);
      ctx.fillRect(GUTTER + W - 1, 0, 1, H);
      // band separators, labels on the left, live rates on the right
      bands.forEach((bd, ri) => {
        ctx.fillStyle = withAlpha(pal.steel, 0.25);
        ctx.fillRect(GUTTER, bd.y0 + bd.h - 0.5, W + RIGHT, 1);
        const active = hl >= 0 && meta.types[hl].region === ri;
        label(ctx, bd.name, 8, bd.y0 + 12, pal, 'left', active ? pal.filament : pal.steel);
        label(ctx, fmtInt(bd.count), 8, bd.y0 + 24, pal, 'left', withAlpha(pal.steel, 0.7));
        label(ctx, f.regionRates[ri].toFixed(1) + ' Hz', GUTTER + W + RIGHT - 6, bd.y0 + 12, pal, 'right', ri >= bands.length - 2 ? pal.copper : pal.steel);
      });
      // time axis: seconds before now
      const secs = (W * STEPS_PER_COL * P.DT_MS) / 1000;
      for (const t of ticks(0, secs, 5)) {
        const x = GUTTER + W - (t / secs) * W;
        ctx.fillStyle = withAlpha(pal.steel, 0.4);
        ctx.fillRect(x, H, 1, 4);
        label(ctx, t === 0 ? 'now' : `-${t} s`, x, h - 3, pal, t === 0 ? 'right' : 'center');
      }
      footL.textContent = `${labels.stimulusPhase}  ${P.PHASES[f.phase].name}`;
      footR.textContent = `t ${fmtClock(f.simMs / 1000)}${f.speed < 0.95 ? `  ${labels.simSpeed} ${f.speed.toFixed(2)}×` : ''}`;
    },
  };
}

// ------------------------------------------------------------------ regional rate
function ratesPanel(bridge: SimBridge, pal: Palette): Panel {
  const { canvas, foot } = head('p-rates', wire.rates, wire.ratesUnit, wire.captions.rates);
  const s = setupCanvas(canvas);
  const meta = bridge.meta;
  const footL = document.createElement('span');
  foot.append(footL);
  return {
    s,
    draw() {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      const x0 = 44, x1 = w - 84, y0 = 12, y1 = h - 22;
      const tr = bridge.series.t;
      const n = tr.count;
      if (n < 2) return;
      // axis follows the non-sensory regions; the photoreceptor line may clip at the top
      let max = 1;
      const sensoryIdx = meta.regions.indexOf('sensory');
      bridge.series.regions.forEach((r, ri) => { if (ri === sensoryIdx) return; for (let i = 0; i < n; i++) max = Math.max(max, r.at(i)); });
      max *= 1.15;
      const tk = ticks(0, max, 4);
      const top = tk[tk.length - 1] > max ? tk[tk.length - 1] : max;
      for (const v of tk) {
        const y = y1 - (v / top) * (y1 - y0);
        ctx.fillStyle = withAlpha(pal.steel, 0.15);
        ctx.fillRect(x0, y | 0, x1 - x0, 1);
        label(ctx, `${v}`, x0 - 6, y + 4, pal, 'right');
      }
      const tStart = tr.at(0), tEnd = tr.at(n - 1);
      const span = Math.max(1, tEnd - tStart);
      const hlRegion = bridge.highlightType >= 0 ? meta.types[bridge.highlightType].region : -1;
      bridge.series.regions.forEach((r, ri) => {
        ctx.strokeStyle = ri === hlRegion ? pal.filament : withAlpha(pal.steel, 0.9);
        ctx.lineWidth = ri === hlRegion ? 1.5 : 1;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = x0 + ((tr.at(i) - tStart) / span) * (x1 - x0);
          const y = Math.max(y0, y1 - (r.at(i) / top) * (y1 - y0));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        const yEnd = Math.max(y0, y1 - (r.at(n - 1) / top) * (y1 - y0));
        label(ctx, meta.regions[ri], x1 + 6, yEnd + 4, pal, 'left', ri === hlRegion ? pal.filament : pal.steel);
      });
      for (const t of ticks(0, span / 1000, 4)) {
        const x = x1 - (t / (span / 1000)) * (x1 - x0);
        label(ctx, t === 0 ? 'now' : `-${t} s`, x, h - 6, pal, t === 0 ? 'right' : 'center');
      }
      label(ctx, 'Hz', x0 - 6, y0 - 2, pal, 'right');
      const rr = bridge.latest?.regionRates;
      if (rr) footL.textContent = meta.regions.map((r, i) => `${r} ${rr[i].toFixed(1)}`).join('  ');
    },
  };
}

// ------------------------------------------------------------------ window sum
function sumPanel(bridge: SimBridge, pal: Palette): Panel {
  const { canvas, foot } = head('p-sum', wire.windowSum, wire.windowSumUnit, wire.captions.sum);
  const s = setupCanvas(canvas);
  const footL = document.createElement('span');
  foot.append(footL);
  const N = bridge.meta.n_neurons;
  return {
    s,
    draw(f) {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      const top = N * P.R_MAX_HZ * (P.WINDOW_MS / 1000) * 1.6;
      const bx = 48, bw = 56, y0 = 14, y1 = h - 22;
      const frac = Math.min(1, f.S / top);
      ctx.fillStyle = withAlpha(pal.steel, 0.15);
      ctx.fillRect(bx, y0, bw, y1 - y0);
      ctx.fillStyle = pal.steel;
      ctx.fillRect(bx, y1 - frac * (y1 - y0), bw, frac * (y1 - y0));
      for (const v of ticks(0, top, 4)) {
        const y = y1 - (v / top) * (y1 - y0);
        ctx.fillStyle = withAlpha(pal.steel, 0.5);
        ctx.fillRect(bx - 6, y | 0, 6, 1);
        label(ctx, fmtInt(v), bx - 9, y + 4, pal, 'right');
      }
      // recent trace
      const tx0 = bx + bw + 24, tx1 = w - 12;
      const r = bridge.series.S;
      const n = r.count;
      if (n > 1) {
        ctx.strokeStyle = withAlpha(pal.steel, 0.8);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = tx0 + (i / (n - 1)) * (tx1 - tx0);
          const y = y1 - Math.min(1, r.at(i) / top) * (y1 - y0);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      label(ctx, 'S', bx + bw / 2, h - 6, pal, 'center');
      label(ctx, `${fmtInt(f.S)}`, bx + bw / 2, y0 - 2, pal, 'center', pal.filament);
      footL.textContent = `S ${fmtInt(f.S)}   r ${fmtHz(f.r)}`;
    },
  };
}

// ------------------------------------------------------------------ smoothing
function smoothPanel(bridge: SimBridge, pal: Palette): Panel {
  const { canvas, foot } = head('p-smooth', wire.smoothing, wire.smoothingUnit, wire.captions.smooth);
  const s = setupCanvas(canvas);
  const footL = document.createElement('span');
  const footR = document.createElement('span');
  foot.append(footL, footR);
  return {
    s,
    draw(f) {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      const x0 = 40, x1 = w - 12, y0 = 12, y1 = h - 22;
      for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        const y = y1 - v * (y1 - y0);
        ctx.fillStyle = withAlpha(pal.steel, 0.15);
        ctx.fillRect(x0, y | 0, x1 - x0, 1);
        label(ctx, v.toFixed(2), x0 - 6, y + 4, pal, 'right');
      }
      const yf = y1 - P.L_FLOOR * (y1 - y0);
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = pal.patina;
      ctx.beginPath(); ctx.moveTo(x0, yf + 0.5); ctx.lineTo(x1, yf + 0.5); ctx.stroke();
      ctx.setLineDash([]);
      const draw = (r: typeof bridge.series.L, color: string, width: number) => {
        const n = r.count;
        if (n < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = x0 + (i / (n - 1)) * (x1 - x0);
          const y = y1 - r.at(i) * (y1 - y0);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      draw(bridge.series.L, withAlpha(pal.steel, 0.7), 1);
      draw(bridge.series.gain, pal.copper, 1.5);
      label(ctx, 'L(t)', x1, y0 + 8, pal, 'right', pal.steel);
      label(ctx, 'gain', x1, y0 + 20, pal, 'right', pal.copper);
      label(ctx, `smoothstep(${P.R_MIN_HZ.toFixed(2)}, ${P.R_MAX_HZ.toFixed(2)}, r)`, x0, h - 6, pal, 'left');
      footL.textContent = `L ${f.L.toFixed(3)}   τ ${P.TAU_L_MS} ms`;
      footR.textContent = `floor ${P.L_FLOOR}`;
    },
  };
}

// ------------------------------------------------------------------ output gain
function gainPanel(bridge: SimBridge, pal: Palette): Panel {
  const { canvas, foot } = head('p-gain', wire.gain, wire.gainUnit, wire.captions.gain);
  const s = setupCanvas(canvas);
  const meta = bridge.meta;
  const motorIdx = meta.types.map((t, i) => (meta.regions[t.region] === 'motor' ? i : -1)).filter((i) => i >= 0);
  const motorCount = motorIdx.reduce((a, i) => a + meta.types[i].count, 0);
  const dnp09 = meta.types.findIndex((t) => t.name === 'DNp09');
  const footL = document.createElement('span');
  foot.append(footL);
  return {
    s,
    draw(f) {
      const { ctx, w, h } = s;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `48px ${MONO}`;
      ctx.fillStyle = pal.copper;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(f.gain.toFixed(3), 20, 72);
      label(ctx, 'gain, to the filament and the page', 20, 92, pal);
      // a bar of the gain
      ctx.fillStyle = withAlpha(pal.steel, 0.15);
      ctx.fillRect(20, 108, w - 40, 6);
      ctx.fillStyle = pal.copper;
      ctx.fillRect(20, 108, (w - 40) * f.gain, 6);
      const rows: [string, string][] = [
        ['power', fmtSI(f.P, 'W')],
        ['rate', fmtHz(f.r)],
        ['window sum', fmtInt(f.S)],
      ];
      const tr = bridge.typeRates;
      if (tr) {
        let m = 0;
        for (const i of motorIdx) m += tr[i] * meta.types[i].count;
        rows.push([wire.motor, fmtHz(motorCount ? m / motorCount : 0)]);
        if (dnp09 >= 0) rows.push([wire.descending, fmtHz(tr[dnp09])]);
      }
      let y = 150;
      for (const [k, v] of rows) {
        label(ctx, k, 20, y, pal, 'left', withAlpha(pal.filament, 0.8));
        ctx.font = `13px ${MONO}`;
        ctx.fillStyle = pal.steel;
        ctx.textAlign = 'right';
        ctx.fillText(v, w - 20, y);
        ctx.fillStyle = withAlpha(pal.steel, 0.15);
        ctx.fillRect(20, y + 8, w - 40, 1);
        y += 30;
      }
      void h;
      footL.textContent = `L_floor ${P.L_FLOOR}  →  gain = ${P.L_FLOOR} + ${(1 - P.L_FLOOR).toFixed(2)} × Ls`;
    },
  };
}
