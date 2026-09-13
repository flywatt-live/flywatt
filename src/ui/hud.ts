// Hero overlay: the watt readout with the session counters, and the loading line while
// the connectome streams.
import type { SimBridge } from '../sim/bridge.js';
import type { Apparatus } from '../scene/apparatus.js';
import { fmtSI, fmtInt, fmtClock } from '../panels/format.js';
import { labels, hero, arithmetic } from '../copy/en.js';
import { E_AP_J } from '../sim/constants.js';
import { WINDOW_MS } from '../sim/params.js';

export function mountHud(bridge: SimBridge) {
  const watt = document.getElementById('watt')!;
  const wattLabel = document.getElementById('watt-label')!;
  const loadline = document.getElementById('loadline')!;
  const stats = document.getElementById('hud-stats')!;
  wattLabel.textContent = labels.currentDraw;
  loadline.textContent = labels.loadingConnectome;
  stats.innerHTML = `
    <div><span class="readout" id="st-energy">0 J</span><span class="label">${hero.stats.energy}</span></div>
    <div><span class="readout" id="st-time">0:00.0</span><span class="label">${hero.stats.simTime}</span></div>
    <div><span class="readout" id="st-lit">0:00.0</span><span class="label">${hero.stats.lit}</span></div>
    <div><span class="readout" id="st-peak">0 W</span><span class="label">${hero.stats.peak}</span></div>`;
  const stEnergy = document.getElementById('st-energy')!;
  const stTime = document.getElementById('st-time')!;
  const stLit = document.getElementById('st-lit')!;
  const stPeak = document.getElementById('st-peak')!;
  // the arithmetic, live, in the empty corner of the bench
  const formula = document.getElementById('hud-formula')!;
  formula.innerHTML = `
    <div class="hud-formula-sym readout">P = S / Δt × E<sub>ap</sub></div>
    <div class="hud-formula-row">
      <div class="term"><span class="readout-l" id="hf-s">0 /s</span><span class="label">${arithmetic.sLabel}</span></div>
      <span class="op readout-l">×</span>
      <div class="term"><span class="readout-l">${fmtSI(E_AP_J, 'J')}</span><span class="label">${arithmetic.eLabel}</span></div>
      <span class="op readout-l">=</span>
      <div class="term"><span class="readout-l" id="hf-p">0 W</span><span class="label">${arithmetic.pLabel}</span></div>
    </div>
    <div class="micro">Δt = ${WINDOW_MS} ms, sliding. ${arithmetic.estimate}</div>`;
  const hfS = document.getElementById('hf-s')!;
  const hfP = document.getElementById('hf-p')!;
  let apparatus: Apparatus | null = null;
  let lastText = '';
  let n = 0;

  bridge.on('progress', (p) => {
    const pct = p.total ? p.received / p.total : 0;
    const text = p.neuronsSoFar > 0 ? `${p.file}  ${fmtInt(p.neuronsSoFar)} neurons` : `${p.file}  ${fmtInt(p.received / 1024)} / ${fmtInt(p.total / 1024)} kB`;
    loadline.textContent = text;
    apparatus?.setLoadProgress(p.file.startsWith('neurons') ? pct * 0.2 : 0.2 + pct * 0.8);
  });
  bridge.on('ready', ({ n, m }) => {
    loadline.textContent = `${fmtInt(n)} neurons, ${fmtInt(m)} connections`;
    apparatus?.setLoadProgress(1);
    setTimeout(() => loadline.classList.add('fade'), 2500);
  });
  bridge.on('frame', (f) => {
    const t = fmtSI(f.P, 'W');
    if (t !== lastText) {
      watt.textContent = t;
      lastText = t;
    }
    if (++n % 8 === 0) {
      const st = bridge.stats;
      stEnergy.textContent = fmtSI(st.joulesBefore + st.joules, 'J');
      stTime.textContent = fmtClock(st.launchOffset + st.simSeconds);
      stLit.textContent = fmtClock(st.litSeconds);
      stPeak.textContent = fmtSI(st.peakP.value, 'W');
      hfS.textContent = `${fmtInt(f.S / (WINDOW_MS / 1000))} /s`;
      hfP.textContent = fmtSI(f.P, 'W');
    }
    if (f.speed < 0.95) {
      loadline.classList.remove('fade');
      loadline.textContent = `${labels.simSpeed} ${f.speed.toFixed(2)}×`;
    } else if (bridge.ready && loadline.textContent.startsWith(labels.simSpeed)) {
      loadline.textContent = '';
    }
  });

  return {
    attachApparatus(a: Apparatus) {
      apparatus = a;
    },
  };
}
