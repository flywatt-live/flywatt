// The record: session statistics. Labels say "this session" because that is all they are.
import type { SimBridge } from '../sim/bridge.js';
import { SessionStats } from '../sim/bridge.js';
import * as P from '../sim/params.js';
import { setupCanvas, getPalette, withAlpha, label, ticks, type Palette } from './canvas.js';
import { fmtSI, fmtHz, fmtClock } from './format.js';
import { record, labels } from '../copy/en.js';

function head(id: string, title: string, unit: string) {
  const el = document.getElementById(id)!;
  el.querySelector('.panel-title')!.textContent = title;
  el.querySelector('.panel-unit')!.textContent = unit;
  return el;
}

export function mountRecord(bridge: SimBridge) {
  document.getElementById('record-intro')!.textContent = record.intro;
  const pal = getPalette();
  const energy = setupCanvas(head('r-energy', record.energy, record.energyUnit).querySelector('canvas')!);
  const hist = setupCanvas(head('r-hist', record.histogram, record.histogramUnit).querySelector('canvas')!);
  const phase = setupCanvas(head('r-phase', record.phasePower, record.phasePowerUnit).querySelector('canvas')!);
  const peaks = head('r-peaks', record.peaks, labels.thisSession).querySelector('.peaks') as HTMLElement;

  const tick = () => {
    const st = bridge.stats;
    if (st) {
      if (energy.visible) drawEnergy(energy, st, pal);
      if (hist.visible) drawHist(hist, st, pal);
      if (phase.visible) drawPhase(phase, st, pal);
      peaks.innerHTML = `
        <dt>${record.peakPower}</dt><dd>${fmtSI(st.peakP.value, 'W')} ${record.at} ${fmtClock(st.peakP.simMs / 1000)}</dd>
        <dt>${record.peakRate}</dt><dd>${fmtHz(st.peakRate.value)} ${record.at} ${fmtClock(st.peakRate.simMs / 1000)}</dd>
        <dt>${record.energy}</dt><dd>${fmtSI(st.joules, 'J')}</dd>
        <dt>${record.simulated}</dt><dd>${fmtClock(st.simSeconds)}</dd>`;
    }
    setTimeout(tick, 500);
  };
  tick();
}

function frame(s: ReturnType<typeof setupCanvas>, pal: Palette) {
  s.ctx.fillStyle = pal.ink;
  s.ctx.fillRect(0, 0, s.w, s.h);
}

function drawEnergy(s: ReturnType<typeof setupCanvas>, st: SessionStats, pal: Palette) {
  frame(s, pal);
  const { ctx, w, h } = s;
  const x0 = 64, x1 = w - 16, y0 = 14, y1 = h - 24;
  const series = st.energySeries;
  const n = series.length;
  const max = Math.max(st.joules, 1e-9);
  const tk = ticks(0, max, 3);
  const top = Math.max(max, tk[tk.length - 1] ?? max);
  for (const v of tk) {
    const y = y1 - (v / top) * (y1 - y0);
    ctx.fillStyle = withAlpha(pal.steel, 0.15);
    ctx.fillRect(x0, y | 0, x1 - x0, 1);
    label(ctx, fmtSI(v, 'J', 2), x0 - 6, y + 4, pal, 'right');
  }
  const secs = Math.max(1, st.simSeconds);
  ctx.strokeStyle = pal.steel;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 1) / secs) * (x1 - x0);
    const y = y1 - (series[i] / top) * (y1 - y0);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(x0 + (x1 - x0), y1 - (st.joules / top) * (y1 - y0));
  ctx.stroke();
  for (const t of ticks(0, secs, 4)) {
    const x = x0 + (t / secs) * (x1 - x0);
    label(ctx, fmtClock(t), x, h - 6, pal, 'center');
  }
  label(ctx, 'simulated time', x1, y0 + 8, pal, 'right');
}

function drawHist(s: ReturnType<typeof setupCanvas>, st: SessionStats, pal: Palette) {
  frame(s, pal);
  const { ctx, w, h } = s;
  const x0 = 44, x1 = w - 16, y0 = 14, y1 = h - 24;
  const bins = st.rateHist;
  let max = 1, hi = 0;
  for (let i = 0; i < bins.length; i++) { if (bins[i] > max) max = bins[i]; if (bins[i] > 0) hi = i; }
  const shown = Math.min(bins.length, Math.max(hi + 4, 8));
  const bw = (x1 - x0) / shown;
  for (let i = 0; i < shown; i++) {
    const v = bins[i] / max;
    ctx.fillStyle = withAlpha(pal.steel, 0.85);
    ctx.fillRect(x0 + i * bw, y1 - v * (y1 - y0), Math.max(1, bw - 1), v * (y1 - y0));
  }
  const hzPerBin = SessionStats.HIST_MAX_HZ / SessionStats.HIST_BINS;
  for (const t of ticks(0, shown * hzPerBin, 5)) {
    const x = x0 + (t / hzPerBin) * bw;
    if (x > x1) continue;
    label(ctx, `${t}`, x, h - 6, pal, 'center');
  }
  label(ctx, 'Hz', x1, h - 6, pal, 'right');
  label(ctx, `samples ${max} max`, x0 - 6, y0 + 8, pal, 'left');
  const [lo, hiHz] = [P.R_MIN_HZ, P.R_MAX_HZ];
  for (const v of [lo, hiHz]) {
    const x = x0 + (v / hzPerBin) * bw;
    ctx.fillStyle = pal.patina;
    ctx.fillRect(x | 0, y0, 1, y1 - y0);
  }
}

function drawPhase(s: ReturnType<typeof setupCanvas>, st: SessionStats, pal: Palette) {
  frame(s, pal);
  const { ctx, w, h } = s;
  const x0 = 64, x1 = w - 16, y0 = 14, y1 = h - 40;
  const means = P.PHASES.map((_, i) => (st.phasePowerN[i] ? st.phasePowerSum[i] / st.phasePowerN[i] : 0));
  const max = Math.max(...means, 1e-12);
  const tk = ticks(0, max, 3);
  const top = Math.max(max, tk[tk.length - 1] ?? max);
  for (const v of tk) {
    const y = y1 - (v / top) * (y1 - y0);
    ctx.fillStyle = withAlpha(pal.steel, 0.15);
    ctx.fillRect(x0, y | 0, x1 - x0, 1);
    label(ctx, fmtSI(v, 'W', 2), x0 - 6, y + 4, pal, 'right');
  }
  const bw = (x1 - x0) / means.length;
  means.forEach((m, i) => {
    const x = x0 + i * bw + bw * 0.2;
    ctx.fillStyle = withAlpha(pal.steel, st.phasePowerN[i] ? 0.85 : 0.2);
    ctx.fillRect(x, y1 - (m / top) * (y1 - y0), bw * 0.6, (m / top) * (y1 - y0));
    label(ctx, P.PHASES[i].key, x0 + i * bw + bw / 2, h - 22, pal, 'center');
    label(ctx, st.phasePowerN[i] ? fmtSI(m, 'W', 2) : 'not yet', x0 + i * bw + bw / 2, h - 8, pal, 'center', withAlpha(pal.steel, 0.7));
  });
}
