// Click a part of the apparatus (or its label) and a card opens with the object's live numbers.
import type { SimBridge } from '../sim/bridge.js';
import type { Apparatus, AnchorName } from '../scene/apparatus.js';
import * as P from '../sim/params.js';
import { E_AP_J } from '../sim/constants.js';
import { hotspots, labels } from '../copy/en.js';
import { fmtSI, fmtInt, fmtHz, fmtClock } from '../panels/format.js';

const NAMES: AnchorName[] = ['jar', 'fly', 'wire', 'meter', 'bulb'];

export function mountHotspots(bridge: SimBridge, apparatus: Apparatus) {
  const hero = document.getElementById('apparatus')!;
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const layer = document.createElement('div');
  layer.className = 'hotspots';
  hero.appendChild(layer);
  const items = NAMES.map((name) => {
    const el = document.createElement('div');
    el.className = `hotspot hotspot-${name}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hotspot-btn readout';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `<span class="tick"></span>${hotspots[name].label}`;
    const card = document.createElement('div');
    card.className = 'hotspot-card';
    card.innerHTML = `<h2>${hotspots[name].title}</h2><p>${hotspots[name].text}</p><dl class="readout"></dl>`;
    el.append(btn, card);
    layer.appendChild(el);
    btn.addEventListener('click', () => toggle(name));
    return { name, el, btn, card, dl: card.querySelector('dl')!, open: false };
  });
  const byName = (n: AnchorName) => items.find((i) => i.name === n)!;

  const closeAll = () => {
    for (const it of items) {
      it.open = false;
      it.el.classList.remove('open');
      it.btn.setAttribute('aria-expanded', 'false');
    }
  };
  const toggle = (name: AnchorName) => {
    const it = byName(name);
    const wasOpen = it.open;
    closeAll();
    if (!wasOpen) {
      it.open = true;
      it.el.classList.add('open');
      it.btn.setAttribute('aria-expanded', 'true');
      fill(it);
    }
  };
  hero.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  // the objects themselves: hover highlights the label, click opens the card
  let hovered: AnchorName | null = null;
  let downAt: [number, number] | null = null;
  const rel = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = rel(e);
    const hit = apparatus.pick(x, y);
    if (hit !== hovered) {
      hovered = hit;
      canvas.style.cursor = hit ? 'pointer' : '';
      for (const it of items) it.el.classList.toggle('hover', it.name === hit);
    }
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    canvas.style.cursor = '';
    for (const it of items) it.el.classList.remove('hover');
  });
  canvas.addEventListener('pointerdown', (e) => { downAt = rel(e); });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const [x, y] = rel(e);
    const moved = Math.hypot(x - downAt[0], y - downAt[1]) > 6;
    downAt = null;
    if (moved) return;
    const hit = apparatus.pick(x, y);
    if (hit) toggle(hit);
    else closeAll();
  });

  const v = hotspots.values;
  const rows = (name: AnchorName): [string, string][] => {
    const f = bridge.latest;
    const m = bridge.meta;
    const s = apparatus.flySignals();
    switch (name) {
      case 'bulb':
        return [
          [v.gain, f ? f.gain.toFixed(3) : '0'],
          [v.rate, f ? fmtHz(f.r) : '0 Hz'],
          ['range', `${P.R_MIN_HZ.toFixed(2)} to ${P.R_MAX_HZ.toFixed(2)} Hz`],
          ['floor', String(P.L_FLOOR)],
          [v.power, f ? fmtSI(f.P, 'W') : '0 W'],
        ];
      case 'wire':
        return [
          [v.window, f ? fmtInt(f.S) : '0'],
          [v.spikesPerS, f ? `${fmtInt(f.S / (P.WINDOW_MS / 1000))} /s` : '0'],
          [v.eap, fmtSI(E_AP_J, 'J')],
          [v.power, f ? fmtSI(f.P, 'W') : '0 W'],
          [v.speed, f ? `${f.speed.toFixed(2)}×` : '1.00×'],
        ];
      case 'jar':
        return [
          [v.dataset, m ? `${m.dataset.short} ${m.dataset.version}` : ''],
          [v.neurons, m ? fmtInt(m.n_neurons) : ''],
          [v.synapses, m ? fmtInt(m.n_synapses) : ''],
          [v.phase, f ? P.PHASES[f.phase].name : labels.loadingConnectome],
          [v.simTime, f ? fmtClock(f.simMs / 1000) : '0:00.0'],
        ];
      case 'fly':
        return [
          [v.flap, `${s.flapHz.toFixed(1)} Hz`],
          [v.motor, fmtHz(s.motorHz)],
          [v.dnp09, fmtHz(s.dnp09Hz)],
          [v.turn, `${s.turn >= 0 ? '+' : ''}${s.turn.toFixed(2)}`],
          [v.eyes, fmtHz(s.sensoryHz)],
        ];
      case 'meter': {
        const full = m ? m.n_neurons * P.R_MAX_HZ * 1.25 * E_AP_J : 0;
        return [
          [v.power, f ? fmtSI(f.P, 'W') : '0 W'],
          [v.fullScale, fmtSI(full, 'W')],
          [v.needle, f && full ? `${Math.min(100, (100 * f.P) / full).toFixed(0)} %` : '0 %'],
        ];
      }
    }
  };
  const fill = (it: (typeof items)[number]) => {
    it.dl.innerHTML = rows(it.name).map(([k, val]) => `<div><dt class="label">${k}</dt><dd>${val}</dd></div>`).join('');
  };

  let tickN = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    for (const it of items) {
      const a = apparatus.anchor(it.name);
      it.el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`;
      it.el.style.visibility = a.visible ? 'visible' : 'hidden';
    }
    if (++tickN % 6 === 0) for (const it of items) if (it.open) fill(it);
  };
  requestAnimationFrame(loop);
}
