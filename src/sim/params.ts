// All model parameters in one place. Everything the site shows as "modeled parameter"
// reads from here. Values between the CALIBRATED markers are written by data/calibrate.ts.
// No DOM or Node APIs in this file: it is shared by the worker and the Node scripts.

// Experiment overrides for data/experiment.ts (never set in the browser).
const ov = (k: string, d: number): number => {
  const o = (globalThis as unknown as { __FLYWATT_OVERRIDES?: Record<string, number> }).__FLYWATT_OVERRIDES;
  return o && k in o ? o[k] : d;
};

/** integration time step */
export const DT_MS = 0.5;
/** membrane time constant */
export const TAU_M_MS = 20;
/** resting potential */
export const V_REST_MV = -65;
/** spike threshold */
export const V_THRESH_MV = -50;
/** reset potential after a spike */
export const V_RESET_MV = -70;
/** absolute refractory period */
export const T_REF_MS = 2;
/** synaptic current decay (single exponential, same for both signs) */
export const TAU_SYN_MS = 5;
/** axonal + synaptic delay per neuron, drawn uniformly (seeded) between these step counts (0.5 to 1.5 ms) */
export const DELAY_MIN_STEPS = 1;
export const DELAY_MAX_STEPS = 3;
/**
 * Adaptation: each neuron subtracts a slow running mean of its own synaptic input, so it
 * responds to changes rather than to sustained input. Without it, neurons with thousands
 * of incoming synapses sit at their maximum rate and lamina cells cannot signal light
 * decrements (their photoreceptor input is tonic inhibition).
 */
export const TAU_ADAPT_MS = ov('TAU_ADAPT_MS', 600);
/**
 * Synaptic input saturation, mV. Real synapses are conductances that saturate at their reversal
 * potential; here the summed synaptic input of a neuron is clamped to this range so a recurrent
 * loop cannot drive its members to their maximum rate.
 */
export const ISYN_MAX_MV = ov('ISYN_MAX_MV', 22);
export const ISYN_MIN_MV = -40;

/**
 * Background drive. The loaded subcircuit is a subset of the brain; inputs from everything
 * outside it are replaced by a constant mean drive (calibrated so the disconnected network
 * fires at BASELINE_TARGET_HZ) plus filtered Gaussian noise.
 */
export const NOISE_STD_MV = ov('NOISE_STD_MV', 2.6);
/** noise is refreshed every this many steps (4 ms) */
export const NOISE_EVERY_STEPS = 8;
/** per-neuron constant offset drawn uniformly in +-BIAS_JITTER_MV (seeded): cell-to-cell heterogeneity */
export const BIAS_JITTER_MV = 3;
/** target mean rate of the non-sensory network with all synapses off, used to calibrate NOISE_MEAN_MV */
export const BASELINE_TARGET_HZ = ov('BASELINE_TARGET_HZ', 0.4);

/**
 * Photoreceptor drive: luminance in [0, 1] adds I_PHOTO_GAIN_MV * lum to the input of
 * R1-R6 cells. Fly photoreceptors are graded, not spiking; here they are LIF units whose
 * rate stands in for the graded signal. Their transmitter is histamine, inhibitory on
 * lamina cells, so lamina cells respond to light decrements.
 */
export const I_PHOTO_GAIN_MV = ov('I_PHOTO_GAIN_MV', 20);
/** per-photoreceptor gain spread, uniform in 1 +- this (seeded): ommatidia are not identical */
export const PHOTO_GAIN_JITTER = 0.25;
/** looming disc: object half-size over approach speed, seconds (angular radius = atan(LOOM_LV_S / time to collision)) */
export const LOOM_LV_S = 0.25;
/** target mean rate used to calibrate G_SYN_MV (non-sensory neurons; the all-neuron mean must stay inside 2..8 Hz) */
export const GAIN_TARGET_HZ = ov('GAIN_TARGET_HZ', 3);
/** 1: the gain target applies to non-sensory neurons only; photoreceptors are driven by the stimulus, not the gain */
export const GAIN_TARGET_NONSENSORY = ov('GAIN_TARGET_NONSENSORY', 1);
/** the stimulus is re-sampled every this many steps (2 ms) */
export const STIM_EVERY_STEPS = 4;

/** interommatidial angle used to map optic lobe hex columns to visual angle (degrees) */
export const OMMATIDIUM_DEG = 5;

/** spike-count window for S(t) */
export const WINDOW_MS = 100;
/** output smoothing time constant for the bulb */
export const TAU_L_MS = 150;
/** bulb never goes below this so the page stays readable */
export const L_FLOOR = 0.08;

/** seed for every random draw in the simulation and the stimulus loop */
export const SEED = 0x5eed;

/** stimulus phases, seconds */
export const PHASES = [
  { name: 'drifting grating', key: 'grating', seconds: 14 },
  { name: 'looming disc', key: 'looming', seconds: 10 },
  { name: 'small moving target', key: 'target', seconds: 12 },
  { name: 'dark flash', key: 'flash', seconds: 8 },
  { name: 'rest', key: 'rest', seconds: 10 },
] as const;
export type PhaseKey = (typeof PHASES)[number]['key'];

/** wing beat frequency per Hz of mean wing motor neuron rate (display mapping, modeled) */
export const FLAP_HZ_PER_MOTOR_HZ = 6;
/** startle when DNp09 rate exceeds this multiple of its running mean */
export const STARTLE_FACTOR = 2.5;

// BEGIN CALIBRATED (written by data/calibrate.ts, do not edit by hand)
export const NOISE_MEAN_MV = 10.7056;
export const G_SYN_MV = 1.61905e+0;
export const R_MIN_HZ = 4.9332;
export const R_MAX_HZ = 5.6996;
export const CALIBRATION = {
  date: '2026-09-12T19:42:58.879Z',
  seed: 24301,
  build_hash: 'd19798da',
  baseline_hz: 0.3987,
  mean_hz_all: 5.3771,
  mean_hz_nonsensory: 3.0104,
  iterations: 14,
  phase_mean_hz: {"grating":5.5044,"looming":5.171,"target":5.2857,"flash":5.2205,"rest":5.3022} as Record<string, number>,
};
// END CALIBRATED
