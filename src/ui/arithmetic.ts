// The arithmetic: the power formula with live values, and where E_ap comes from.
import type { SimBridge } from '../sim/bridge.js';
import { arithmetic } from '../copy/en.js';
import { E_AP_J, ATP_PER_AP, ATP_KJ_PER_MOL, ATP_PER_AP_SOURCE, ATP_ENERGY_SOURCE } from '../sim/constants.js';
import { WINDOW_MS } from '../sim/params.js';
import { fmtSI, fmtInt, fmtClock } from '../panels/format.js';
import { launch } from '../copy/en.js';

export function mountArithmetic(bridge: SimBridge) {
  const f = document.getElementById('formula')!;
  f.innerHTML = `
    <div class="formula-row readout-l">
      <span class="sym">P</span><span class="op">=</span>
      <span class="sym">S</span><span class="op">/</span><span class="sym">Δt</span>
      <span class="op">×</span><span class="sym">E<sub>ap</sub></span>
    </div>
    <div class="formula-row values">
      <div class="term"><span class="val readout-l" id="f-s">0</span><span class="label">${arithmetic.sLabel}</span></div>
      <span class="op readout-l">×</span>
      <div class="term"><span class="val readout-l" id="f-e">${fmtSI(E_AP_J, 'J')}</span><span class="label">${arithmetic.eLabel}</span></div>
      <span class="op readout-l">=</span>
      <div class="term"><span class="val readout-l" id="f-p">0</span><span class="label">${arithmetic.pLabel}</span></div>
    </div>
    <div class="formula-note readout">Δt = ${WINDOW_MS} ms, sliding</div>`;
  const s = document.getElementById('f-s')!;
  const p = document.getElementById('f-p')!;
  let last = '';
  bridge.on('frame', (fr) => {
    const txt = `${fmtInt(fr.S / (WINDOW_MS / 1000))} /s`;
    if (txt !== last) {
      s.textContent = txt;
      p.textContent = fmtSI(fr.P, 'W');
      last = txt;
    }
  });

  // the ledger: the same arithmetic carried through the session
  const ledger = document.getElementById('ledger')!;
  ledger.querySelector('.panel-title')!.textContent = arithmetic.ledger;
  ledger.querySelector('.panel-unit')!.textContent = launch.label;
  const dl = ledger.querySelector('dl')!;
  const t0 = performance.now();
  let ln = 0;
  bridge.on('frame', (fr) => {
    if (++ln % 12 !== 0) return;
    const st = bridge.stats;
    dl.innerHTML = [
      [arithmetic.perSpike, fmtSI(E_AP_J, 'J')],
      [arithmetic.perSecond, `${fmtInt(fr.S / (WINDOW_MS / 1000))} spikes, ${fmtSI(fr.P, 'W')}`],
      [arithmetic.spikes, fmtInt(st.spikesBefore + st.spikes)],
      ['energy', fmtSI(st.joulesBefore + st.joules, 'J')],
      [arithmetic.simTime, fmtClock(st.launchOffset + st.simSeconds)],
      [arithmetic.wallTime, fmtClock((performance.now() - t0) / 1000)],
    ]
      .map(([k, v]) => `<div><dt class="label">${k}</dt><dd>${v}</dd></div>`)
      .join('');
  });

  const prose = document.getElementById('arithmetic-prose')!;
  prose.innerHTML = `
    <p>${arithmetic.paraS}</p>
    <p>${arithmetic.paraE}</p>
    <p class="readout derivation">E<sub>ap</sub> = ${ATP_PER_AP.toExponential(2)} ATP × ${ATP_KJ_PER_MOL} kJ/mol ÷ N<sub>A</sub> = ${fmtSI(E_AP_J, 'J')}</p>
    <p class="sources label">
      <a href="${ATP_PER_AP_SOURCE.url}" target="_blank" rel="noopener">${ATP_PER_AP_SOURCE.authors}, ${ATP_PER_AP_SOURCE.title}, ${ATP_PER_AP_SOURCE.journal}</a><br />
      <a href="${ATP_ENERGY_SOURCE.url}" target="_blank" rel="noopener">${ATP_ENERGY_SOURCE.authors}, ${ATP_ENERGY_SOURCE.title}, ${ATP_ENERGY_SOURCE.journal}</a>
    </p>
    <p class="label estimate">${arithmetic.estimate}</p>
    <p class="label">Counters run from ${new Date(launch.at).toUTCString()}; ${launch.estimated}.</p>`;
}
