// Every string on the site. Dry, measured, no promises.

/** When the apparatus was switched on. Counters run from here; change it at launch. */
export const launch = {
  at: '2026-09-13T02:40:00+03:00',
  label: 'since launch',
  estimated: 'before this page opened, estimated at the calibrated mean rate',
};

export const site = {
  title: 'FLYWATT',
  ogDescription: 'A fruit fly connectome, wired to a light bulb.',
  url: 'https://flywatt.live',
  xUrl: 'https://x.com/flywatt',
  xHandle: '@flywatt',
};

export const sections = {
  apparatus: 'apparatus',
  wire: 'the wire',
  circuit: 'the circuit',
  arithmetic: 'the arithmetic',
  record: 'the record',
  provenance: 'provenance',
} as const;

export const labels = {
  currentDraw: 'current draw',
  cumulative: 'cumulative, this session',
  stimulusPhase: 'stimulus phase',
  neuronsLoaded: 'neurons loaded',
  synapsesLoaded: 'synapses loaded',
  firingRate: 'firing rate',
  predictedTransmitter: 'predicted transmitter',
  modeledParameter: 'modeled parameter',
  assumedConstant: 'assumed constant',
  loadingConnectome: 'loading connectome',
  simLag: 'sim lag',
  simSpeed: 'sim speed',
  thisSession: 'this session',
};

export const wire = {
  intro: 'What passes through the wire. Every panel is the running simulation, drawn as it happens.',
  stimulus: 'what the fly sees',
  stimulusUnit: 'luminance per ommatidial column, two eyes',
  raster: 'raster wall',
  rasterUnit: 'one dot per spike, one row per neuron, grouped by region',
  rates: 'regional rate',
  ratesUnit: 'Hz, mean over 100 ms',
  windowSum: 'window sum',
  windowSumUnit: 'spikes in the last 100 ms',
  smoothing: 'smoothing',
  smoothingUnit: 'L(t) and its 150 ms low-pass',
  gain: 'output gain',
  gainUnit: 'to the bulb',
  motor: 'wing motor rate',
  descending: 'DNp09 rate',
  captions: {
    stim: 'The stimulus loop writes a luminance value to every ommatidial column of both eyes. Photoreceptors are driven by it; nothing else touches the network from outside.',
    raster: 'Every spike of every loaded neuron, as it happens, one row per neuron. The bands are the regions of the pathway, input at the top, wing motor neurons at the bottom. Hover a cell type in the circuit table to light it up here.',
    rates: 'Mean firing rate per region over a sliding 100 ms window. The photoreceptor line follows the stimulus; everything below it is what the network makes of that.',
    sum: 'S(t): spikes in the last 100 ms across the whole network. This single number is what the wire carries to the bulb.',
    smooth: 'S(t) becomes a rate, the rate is mapped onto 0..1 between the calibrated 5th and 95th percentiles, then low-passed like a filament with thermal mass.',
    gain: 'The value that drives the filament, the point light and the page luminance. Below it, the two signals the fly reads: its wing motor neurons and DNp09.',
  },
};

export const circuit = {
  intro: 'Cell types in the loaded subcircuit, read from the dataset. Rates are live.',
  regions: 'by region',
  signs: 'synaptic sign',
  signNote: 'from the transmitter prediction of each presynaptic neuron',
  excitatory: 'excitatory',
  inhibitory: 'inhibitory',
  neutral: 'no effect',
  path: 'the pathway',
  pathText: 'Light on the photoreceptors, a decrement signal in the lamina, motion and edge detectors in the medulla and lobula, the head direction ring, four descending neurons, and the wing motor neurons that end the chain.',
  colType: 'cell type',
  colCount: 'neurons',
  colRegion: 'region',
  colNt: 'predicted transmitter',
  colRate: 'firing rate',
  fraction: (n: string, nFull: string, m: string, mFull: string) =>
    `${n} of ${nFull} typed neurons and ${m} of ${mFull} synapses in the full dataset, covering the visual input to wing motor pathway.`,
  hoverHint: 'hover a row to find its neurons on the raster wall',
};

export const arithmetic = {
  formula: 'P = S / Δt × E_ap',
  ledger: 'the ledger',
  ledgerText: 'The same arithmetic, carried through the session.',
  perSpike: 'per spike',
  perSecond: 'per second, now',
  session: 'this session',
  wallTime: 'wall time',
  simTime: 'simulated time',
  spikes: 'spikes counted',
  sLabel: 'spikes per second',
  eLabel: 'energy per action potential',
  pLabel: 'power',
  paraS:
    'S is the number of spikes the loaded network produced in the last 100 ms. Divided by the window it becomes spikes per second. The window slides with the simulation; nothing is averaged over the session.',
  paraE:
    'E_ap is the energy one action potential costs. The figure used here is the ATP consumption per spike estimated for a mammalian cortical neuron by Attwell and Laughlin, converted to joules at 50 kJ per mole of ATP. Fly neurons are smaller and probably cheaper. This is an estimate.',
  estimate: 'This is an estimate.',
};

export const record = {
  intro: 'What this session has produced so far. Counters start at page load. Nothing is stored.',
  energy: 'cumulative energy',
  energyUnit: 'joules, this session',
  histogram: 'firing rate histogram',
  histogramUnit: 'samples of r(t), this session',
  phasePower: 'mean power by stimulus phase',
  phasePowerUnit: 'watts, this session',
  peaks: 'peaks',
  peakPower: 'highest power',
  peakRate: 'highest rate',
  at: 'at',
  simulated: 'simulated time',
};

export const provenance = {
  measured: (dataset: string, version: string, license: string, source: string) =>
    `Connectivity is measured data, not generated. ${dataset} ${version}, ${license}, from ${source}. Reconstruction by Janelia FlyEM with Google Research and collaborators.`,
  subset: (n: string, m: string) =>
    `${n} neurons and ${m} synapses are loaded here, a subset of the full dataset covering the visual input to wing motor pathway. Cell types included are listed above.`,
  modeled:
    'Dynamics are modeled. Neurons are leaky integrate-and-fire with the parameters listed in params.ts. Synaptic sign comes from the transmitter prediction field in the source data. Global synaptic gain is calibrated to hold mean firing rate between 2 and 8 Hz.',
  power: (value: string, reference: string) =>
    `Power is computed as spike rate multiplied by an energy cost per action potential of ${value}, taken from ${reference}. This is an estimate.`,
  driven: 'The bulb brightness, the meter and the page luminance are driven by the running simulation. Nothing on this page is a pre-rendered loop.',
  noInsect: 'No live insect was used. Nothing here is connected to hardware.',
  flyModel: 'The jar, the wire, the bulb, the socket, the meter and the bench are built in code from primitives. The fly mesh is Fly by Poly by Google (CC-BY 3.0, via Poly Pizza), repainted; its motion is ours.',
  fonts: 'Type: Basteleur by Keussel (Velvetyne, OFL) and Departure Mono by Helena Zhang (OFL).',
};

export const footer = {
  contract: 'contract',
  contractValue: 'soon',
  copied: 'copied',
  dex: 'dexscreener',
  dexUrl: '',
  x: 'x',
  source: 'source',
  sourceUrl: 'https://github.com/flywatt-live/flywatt',
  soon: 'soon',
};

export const hero = {
  tagline: 'A fruit fly connectome, wired to a light bulb.',
  sub: 'Live. Nothing here is a recording.',
  stats: {
    energy: 'energy, since launch',
    simTime: 'running since launch',
    lit: 'bulb above floor, this session',
    peak: 'peak draw, this session',
  },
  hint: 'click the jar, the fly, the meter or the bulb',
};

/** the paper tag against the jar base; the other lines come from meta.json */
export const tag = {
  species: 'Drosophila melanogaster, male',
};

export const hotspots = {
  bulb: {
    label: 'bulb',
    title: 'incandescent bulb',
    text: 'The only light in the room. Its brightness is the smoothed mean firing rate of the loaded network, mapped between the 5th and 95th percentile of the rate over one stimulus loop. It never goes below the floor so the page stays readable.',
  },
  wire: {
    label: 'wire',
    title: 'copper lead',
    text: 'Carries the spike count. Every 100 ms window sum S is divided by the window and multiplied by the energy of one action potential; that product is the power the meter shows.',
  },
  jar: {
    label: 'jar',
    title: 'specimen jar',
    text: 'Inside it, the connectome: the visual input to wing motor pathway of a male fruit fly, measured synapse by synapse, simulated as leaky integrate-and-fire neurons in a worker thread.',
  },
  fly: {
    label: 'fly',
    title: 'the fly',
    text: 'Its wings beat at a rate set by the wing motor neurons, its eyes glow with the photoreceptor rate, it flinches when DNp09 surges, and it turns with the left-right descending asymmetry.',
  },
  meter: {
    label: 'meter',
    title: 'microwatt meter',
    text: 'Full scale is the power the network would draw at the top of its calibrated rate range. The needle is a critically damped spring; the value it follows is live.',
  },
  values: {
    gain: 'gain',
    power: 'power',
    rate: 'mean rate',
    spikesPerS: 'spikes per second',
    window: 'spikes in 100 ms',
    eap: 'energy per spike',
    neurons: 'neurons',
    synapses: 'synapses',
    dataset: 'dataset',
    phase: 'stimulus phase',
    flap: 'wing beat',
    motor: 'wing motor rate',
    dnp09: 'DNp09 rate',
    turn: 'descending asymmetry',
    eyes: 'photoreceptor rate',
    fullScale: 'full scale',
    needle: 'needle',
    speed: 'sim speed',
    simTime: 'simulated time',
  },
};

export const fallback = {
  poster: 'The apparatus needs WebGL and a desktop-sized screen. The simulation below still runs.',
  reduced: 'Reduced motion is on. The scene stays live; the page scrolls normally.',
};
