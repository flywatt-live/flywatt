// Provenance: what the data is, what is modeled, what is assumed. Just counts.
import type { SimBridge } from '../sim/bridge.js';
import { provenance, labels } from '../copy/en.js';
import * as P from '../sim/params.js';
import { E_AP_J, ATP_PER_AP_SOURCE } from '../sim/constants.js';
import { fmtSI, fmtInt } from '../panels/format.js';

export function mountProvenance(bridge: SimBridge) {
  const m = bridge.meta;
  const list = document.getElementById('provenance-list')!;
  const items: string[] = [
    provenance.measured(
      m.dataset.name,
      m.dataset.version,
      `<a href="${m.dataset.license_url}" target="_blank" rel="noopener">${m.dataset.license}</a>`,
      `<a href="${m.dataset.download_url}" target="_blank" rel="noopener">${m.dataset.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`,
    ),
    provenance.subset(fmtInt(m.n_neurons), fmtInt(m.n_synapses)),
    provenance.modeled,
    provenance.power(fmtSI(E_AP_J, 'J'), `<a href="${ATP_PER_AP_SOURCE.url}" target="_blank" rel="noopener">Attwell and Laughlin 2001</a>`),
    provenance.driven,
    provenance.noInsect,
    provenance.flyModel,
    provenance.fonts,
  ];
  list.innerHTML = items.map((t) => `<li><p>${t}</p></li>`).join('');

  const params = document.getElementById('params')!;
  const rows: [string, string, string][] = [
    ['membrane time constant', `${P.TAU_M_MS} ms`, labels.modeledParameter],
    ['resting potential', `${P.V_REST_MV} mV`, labels.modeledParameter],
    ['threshold', `${P.V_THRESH_MV} mV`, labels.modeledParameter],
    ['reset', `${P.V_RESET_MV} mV`, labels.modeledParameter],
    ['refractory period', `${P.T_REF_MS} ms`, labels.modeledParameter],
    ['time step', `${P.DT_MS} ms`, labels.modeledParameter],
    ['synaptic time constant', `${P.TAU_SYN_MS} ms`, labels.modeledParameter],
    ['synaptic delay', `${(P.DELAY_MIN_STEPS * P.DT_MS).toFixed(1)} to ${(P.DELAY_MAX_STEPS * P.DT_MS).toFixed(1)} ms`, labels.modeledParameter],
    ['adaptation time constant', `${P.TAU_ADAPT_MS} ms`, labels.modeledParameter],
    ['background drive', `${P.NOISE_MEAN_MV.toFixed(2)} mV, sd ${P.NOISE_STD_MV} mV`, `calibrated to ${P.BASELINE_TARGET_HZ} Hz over non-sensory neurons with synapses off`],
    ['synaptic gain', `${P.G_SYN_MV.toFixed(4)} mV per synapse`, `calibrated to ${P.GAIN_TARGET_HZ} Hz mean over non-sensory neurons`],
    ['synaptic saturation', `${P.ISYN_MIN_MV} to +${P.ISYN_MAX_MV} mV`, labels.modeledParameter],
    ['photoreceptor drive', `${P.I_PHOTO_GAIN_MV} mV at full luminance`, labels.modeledParameter],
    ['bulb range', `${P.R_MIN_HZ.toFixed(2)} to ${P.R_MAX_HZ.toFixed(2)} Hz`, 'p5 and p95 of r(t) over one stimulus loop'],
    ['bulb floor', `${P.L_FLOOR}`, labels.modeledParameter],
    ['energy per action potential', fmtSI(E_AP_J, 'J'), labels.assumedConstant],
    ['transmitter signs', Object.entries(m.nt_sign_map).map(([k, v]) => `${k} ${v > 0 ? '+' : v < 0 ? '−' : '0'}`).join(', '), `from ${m.nt_field}`],
    ['photoreceptor placement', `${fmtInt(m.photoreceptors.from_hex_columns)} from hex columns, ${fmtInt(m.photoreceptors.from_hash)} by hash`, m.photoreceptors.assignment],
    ['edge threshold', `${m.thresholds.base_min_weight} synapses`, `${fmtInt(m.thresholds.dropped_edges_threshold)} weaker connections not loaded`],
    ['calibration', `${P.CALIBRATION.date.slice(0, 10)}, build ${P.CALIBRATION.build_hash}`, `seed ${P.SEED}, ${P.CALIBRATION.iterations} iterations`],
    ['build', `${m.built_at.slice(0, 10)}, ${m.build_hash}`, `${m.dataset.files.map((f) => f.name).join(', ')}`],
  ];
  params.innerHTML = rows.map(([k, v, note]) => `<div class="param"><dt class="label">${k}</dt><dd class="readout">${v}</dd><dd class="micro">${note}</dd></div>`).join('');
}
