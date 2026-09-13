// Writes public/llms.txt and public/sections/*.md from the same copy, meta and params the
// site uses, so the numbers in the text versions match the page.   npm run data:docs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Meta } from '../src/sim/meta.js';
import * as P from '../src/sim/params.js';
import { E_AP_J, ATP_PER_AP, ATP_KJ_PER_MOL, ATP_PER_AP_SOURCE, ATP_ENERGY_SOURCE } from '../src/sim/constants.js';
import { site, provenance, arithmetic, wire, circuit, record } from '../src/copy/en.js';

const meta = JSON.parse(readFileSync('public/data/meta.json', 'utf8')) as Meta;
mkdirSync('public/sections', { recursive: true });
const n = (x: number) => x.toLocaleString('en-US');
const pJ = `${(E_AP_J * 1e12).toFixed(1)} pJ`;

const sections: Record<string, string> = {
  apparatus: `# apparatus

${site.ogDescription}

A glass bell jar with a fly, a copper wire, an incandescent bulb in a brass socket, and a meter, rendered in the browser. The bulb is the only light in the scene. Its brightness is the smoothed mean firing rate of a leaky integrate-and-fire simulation of ${n(meta.n_neurons)} neurons from the ${meta.dataset.name} ${meta.dataset.version}, running in a Web Worker.

The number in the corner is the current draw: spikes per second multiplied by the energy cost of one action potential (${pJ}).
`,
  wire: `# the wire

${wire.intro}

1. ${wire.stimulus}: ${wire.stimulusUnit}. Phases: ${P.PHASES.map((p) => `${p.name} (${p.seconds} s)`).join(', ')}.
2. ${wire.raster}: ${wire.rasterUnit}. Regions: ${meta.regions.join(', ')}.
3. ${wire.rates}: ${wire.ratesUnit}.
4. ${wire.windowSum}: ${wire.windowSumUnit}.
5. ${wire.smoothing}: L(t) = smoothstep(${P.R_MIN_HZ.toFixed(2)}, ${P.R_MAX_HZ.toFixed(2)}, r(t)), low-passed with ${P.TAU_L_MS} ms.
6. ${wire.gain}: gain = ${P.L_FLOOR} + ${(1 - P.L_FLOOR).toFixed(2)} x Ls, sent to the filament, the point light and the page's --lum variable.
`,
  circuit: `# the circuit

${circuit.intro}

neurons loaded: ${n(meta.n_neurons)}
synapses loaded: ${n(meta.n_synapses)} (${n(meta.n_edges)} connections with at least ${meta.thresholds.base_min_weight} synapses)

| cell type | neurons | region | predicted transmitter | sign |
|---|---:|---|---|---|
${meta.types.map((t) => `| ${t.name} | ${n(t.count)} | ${meta.regions[t.region]} | ${Object.entries(t.nt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')} | ${t.sign > 0 ? '+' : t.sign < 0 ? '-' : '0'} |`).join('\n')}

${circuit.fraction(n(meta.n_neurons), n(meta.full.n_bodies_typed), n(meta.n_synapses), n(meta.full.n_synapses_total))}
`,
  arithmetic: `# the arithmetic

P = S / Δt × E_ap

S: ${arithmetic.sLabel}, the spikes of the loaded network in the last ${P.WINDOW_MS} ms.
E_ap: ${arithmetic.eLabel}, ${pJ} = ${ATP_PER_AP.toExponential(2)} ATP × ${ATP_KJ_PER_MOL} kJ/mol ÷ N_A.

${arithmetic.paraS}

${arithmetic.paraE}

Sources:
- ${ATP_PER_AP_SOURCE.authors}, ${ATP_PER_AP_SOURCE.title}, ${ATP_PER_AP_SOURCE.journal}. ${ATP_PER_AP_SOURCE.url}
- ${ATP_ENERGY_SOURCE.authors}, ${ATP_ENERGY_SOURCE.title}, ${ATP_ENERGY_SOURCE.journal}. ${ATP_ENERGY_SOURCE.url}
`,
  record: `# the record

${record.intro}

- ${record.energy} (${record.energyUnit})
- ${record.histogram} (${record.histogramUnit})
- ${record.phasePower} (${record.phasePowerUnit})
- ${record.peaks}: ${record.peakPower}, ${record.peakRate}

There is no global counter. Nothing leaves the browser.
`,
  provenance: `# provenance

- ${provenance.measured(meta.dataset.name, meta.dataset.version, meta.dataset.license, meta.dataset.url)}
- ${provenance.subset(n(meta.n_neurons), n(meta.n_synapses))}
- ${provenance.modeled}
- ${provenance.power(pJ, `Attwell and Laughlin 2001, ${ATP_PER_AP_SOURCE.url}`)}
- ${provenance.driven}
- ${provenance.noInsect}
- ${provenance.flyModel}
- ${provenance.fonts}

Model parameters: membrane time constant ${P.TAU_M_MS} ms, rest ${P.V_REST_MV} mV, threshold ${P.V_THRESH_MV} mV, reset ${P.V_RESET_MV} mV, refractory ${P.T_REF_MS} ms, step ${P.DT_MS} ms, synaptic time constant ${P.TAU_SYN_MS} ms, delay ${P.DELAY_MIN_STEPS * P.DT_MS} to ${P.DELAY_MAX_STEPS * P.DT_MS} ms, adaptation ${P.TAU_ADAPT_MS} ms, background drive ${P.NOISE_MEAN_MV.toFixed(2)} mV (sd ${P.NOISE_STD_MV} mV), synaptic gain ${P.G_SYN_MV.toFixed(4)} mV per synapse, photoreceptor drive ${P.I_PHOTO_GAIN_MV} mV at full luminance, bulb range ${P.R_MIN_HZ.toFixed(2)} to ${P.R_MAX_HZ.toFixed(2)} Hz, floor ${P.L_FLOOR}.

Transmitter signs: ${Object.entries(meta.nt_sign_map).map(([k, v]) => `${k} ${v}`).join(', ')}.
Build ${meta.build_hash} (${meta.built_at.slice(0, 10)}), calibration ${P.CALIBRATION.date.slice(0, 10)}, seed ${P.SEED}.
`,
};

for (const [k, v] of Object.entries(sections)) writeFileSync(`public/sections/${k}.md`, v);

const llms = `# ${site.title}

> ${site.ogDescription}

${site.url}

WATT THE FLY is a single page. A leaky integrate-and-fire simulation of ${n(meta.n_neurons)} neurons and ${n(meta.n_synapses)} synapses from the ${meta.dataset.name} ${meta.dataset.version} (${meta.dataset.license}) runs in a Web Worker. Its spikes drive an incandescent bulb in a three.js scene; the bulb is the page's only light. Power is spike rate times ${pJ} per action potential (an estimate from Attwell and Laughlin 2001). Every number on the page is read from the running simulation or from the data files; nothing is hardcoded. No live insect, no hardware.

## Sections

- [apparatus](/sections/apparatus.md): the scene and the current draw readout
- [the wire](/sections/wire.md): six live panels, from the stimulus to the bulb gain
- [the circuit](/sections/circuit.md): the ${meta.types.length} cell types loaded, with counts and transmitter predictions
- [the arithmetic](/sections/arithmetic.md): P = S / Δt × E_ap, with sources
- [the record](/sections/record.md): session statistics
- [provenance](/sections/provenance.md): data, model, constants, licences

## Data

- Dataset: ${meta.dataset.name} ${meta.dataset.version}, ${meta.dataset.license}, ${meta.dataset.download_url}
- Loaded: ${n(meta.n_neurons)} neurons, ${n(meta.n_edges)} connections, ${n(meta.n_synapses)} synapses; the visual input to wing motor pathway
- Files: /data/meta.json, /data/${meta.files.neurons}, /data/${meta.files.connectome} (gzip inside)
- Fonts: Basteleur (Velvetyne, OFL), Departure Mono (OFL)
- Scene: apparatus built in code; fly mesh by Poly by Google, CC-BY 3.0, via Poly Pizza
`;
writeFileSync('public/llms.txt', llms);
console.log('wrote public/llms.txt and public/sections/*.md');
