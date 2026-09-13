// Physical constants with their sources. E_AP is the energy cost of one action potential.
// It is an estimate: the ATP figure is for a mammalian cortical neuron.

/** ATP molecules hydrolysed per action potential (Attwell & Laughlin 2001, Table 1 / text). */
export const ATP_PER_AP = 3.84e8;
export const ATP_PER_AP_SOURCE = {
  title: 'An energy budget for signaling in the grey matter of the brain',
  authors: 'Attwell D, Laughlin SB',
  journal: 'J Cereb Blood Flow Metab 21(10):1133-1145, 2001',
  doi: '10.1097/00004647-200110000-00001',
  url: 'https://doi.org/10.1097/00004647-200110000-00001',
};

/** Free energy of ATP hydrolysis under cellular conditions, J/mol (about 50 kJ/mol). */
export const ATP_KJ_PER_MOL = 50;
export const ATP_ENERGY_SOURCE = {
  title: 'Energy demands of diverse spiking cells from the neocortex, hippocampus, and thalamus',
  authors: 'Moujahid A, d\'Anjou A, Grana M',
  journal: 'Front Comput Neurosci 8:41, 2014',
  doi: '10.3389/fncom.2014.00041',
  url: 'https://doi.org/10.3389/fncom.2014.00041',
};

export const AVOGADRO = 6.02214076e23;

/** joules per action potential, derived: ATP_PER_AP * (ATP_KJ_PER_MOL * 1000 / AVOGADRO) */
export const E_AP_J = ATP_PER_AP * ((ATP_KJ_PER_MOL * 1000) / AVOGADRO);
