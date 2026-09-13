// The circuit: a table of the loaded cell types, read from meta.json, with live rates.
import type { SimBridge } from '../sim/bridge.js';
import { circuit, labels } from '../copy/en.js';
import { fmtInt, fmtHz } from '../panels/format.js';

export function mountCircuit(bridge: SimBridge) {
  const meta = bridge.meta;
  document.getElementById('circuit-intro')!.textContent = circuit.intro;
  const counts = document.getElementById('circuit-counts')!;
  counts.innerHTML = `
    <div class="count"><div class="readout-l">${fmtInt(meta.n_neurons)}</div><div class="label">${labels.neuronsLoaded}</div></div>
    <div class="count"><div class="readout-l">${fmtInt(meta.n_synapses)}</div><div class="label">${labels.synapsesLoaded}</div></div>`;

  const table = document.getElementById('circuit-table') as HTMLTableElement;
  const head = `<thead><tr>
    <th class="label">${circuit.colType}</th>
    <th class="label num">${circuit.colCount}</th>
    <th class="label">${circuit.colRegion}</th>
    <th class="label">${circuit.colNt}</th>
    <th class="label num">${circuit.colRate}</th></tr></thead>`;
  const rows = meta.types
    .map((t, i) => {
      const nt = Object.entries(t.nt).sort((a, b) => b[1] - a[1]);
      const major = nt[0]?.[0] ?? 'unknown';
      const share = nt[0] ? Math.round((100 * nt[0][1]) / t.count) : 0;
      const ntText = share === 100 ? major : `${major} <span class="micro">${share}%</span>`;
      const sign = t.sign > 0 ? '+' : t.sign < 0 ? '−' : '0';
      return `<tr data-type="${i}" tabindex="0">
        <td class="readout type">${t.name}</td>
        <td class="readout num">${fmtInt(t.count)}</td>
        <td class="readout">${meta.regions[t.region]}</td>
        <td class="readout nt">${ntText} <span class="micro sign">${sign}</span></td>
        <td class="readout num rate" id="rate-${i}">0.00 Hz</td></tr>`;
    })
    .join('');
  table.innerHTML = head + `<tbody>${rows}</tbody>`;
  const hint = document.createElement('p');
  hint.className = 'label hint';
  hint.textContent = circuit.hoverHint;
  table.parentElement!.after(hint);

  const rateCells = meta.types.map((_, i) => document.getElementById(`rate-${i}`)!);
  bridge.on('typeRates', (rates) => {
    for (let i = 0; i < rates.length; i++) rateCells[i].textContent = fmtHz(rates[i]);
  });

  const body = table.tBodies[0];
  const setFrom = (el: Element | null) => {
    const tr = el?.closest('tr[data-type]') as HTMLTableRowElement | null;
    bridge.setHighlight(tr ? Number(tr.dataset.type) : -1);
    body.querySelectorAll('tr.hl').forEach((r) => r.classList.remove('hl'));
    tr?.classList.add('hl');
  };
  body.addEventListener('mouseover', (e) => setFrom(e.target as Element));
  body.addEventListener('mouseleave', () => setFrom(null));
  body.addEventListener('focusin', (e) => setFrom(e.target as Element));
  body.addEventListener('focusout', () => setFrom(null));

  // side column: regions with live rates, the sign legend, the pathway in one paragraph
  const side = document.getElementById('circuit-side')!;
  const regionRows = meta.regions
    .map((r, i) => `<div class="side-row"><span class="readout">${r}</span><span class="readout num">${fmtInt(meta.region_offsets[i + 1] - meta.region_offsets[i])}</span><span class="readout num" id="side-rate-${i}">0.0 Hz</span></div>`)
    .join('');
  side.insertAdjacentHTML(
    'beforeend',
    `<h2 class="side-title">${circuit.regions}</h2>
    <div class="side-rows"><div class="side-row head"><span class="label">region</span><span class="label num">neurons</span><span class="label num">rate</span></div>${regionRows}</div>
    <h2 class="side-title">${circuit.signs}</h2>
    <div class="side-rows">
      <div class="side-row two"><span class="readout">+ ${circuit.excitatory}</span><span class="readout">acetylcholine</span></div>
      <div class="side-row two"><span class="readout">− ${circuit.inhibitory}</span><span class="readout">GABA, glutamate, histamine</span></div>
      <div class="side-row two"><span class="readout">0 ${circuit.neutral}</span><span class="readout">dopamine, octopamine, serotonin, unknown</span></div>
    </div>
    <p class="label">${circuit.signNote}</p>
    <h2 class="side-title">${circuit.path}</h2>
    <p>${circuit.pathText}</p>`,
  );
  const sideRates = meta.regions.map((_, i) => document.getElementById(`side-rate-${i}`)!);
  let sideN = 0;
  bridge.on('frame', (f) => {
    if (++sideN % 10 !== 0) return;
    for (let i = 0; i < sideRates.length; i++) sideRates[i].textContent = `${f.regionRates[i].toFixed(1)} Hz`;
  });

  document.getElementById('circuit-fraction')!.textContent = circuit.fraction(
    fmtInt(meta.n_neurons),
    fmtInt(meta.full.n_bodies_typed),
    fmtInt(meta.n_synapses),
    fmtInt(meta.full.n_synapses_total),
  );
}
