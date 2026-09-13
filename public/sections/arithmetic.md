# the arithmetic

P = S / Δt × E_ap

S: spikes per second, the spikes of the loaded network in the last 100 ms.
E_ap: energy per action potential, 31.9 pJ = 3.84e+8 ATP × 50 kJ/mol ÷ N_A.

S is the number of spikes the loaded network produced in the last 100 ms. Divided by the window it becomes spikes per second. The window slides with the simulation; nothing is averaged over the session.

E_ap is the energy one action potential costs. The figure used here is the ATP consumption per spike estimated for a mammalian cortical neuron by Attwell and Laughlin, converted to joules at 50 kJ per mole of ATP. Fly neurons are smaller and probably cheaper. This is an estimate.

Sources:
- Attwell D, Laughlin SB, An energy budget for signaling in the grey matter of the brain, J Cereb Blood Flow Metab 21(10):1133-1145, 2001. https://doi.org/10.1097/00004647-200110000-00001
- Moujahid A, d'Anjou A, Grana M, Energy demands of diverse spiking cells from the neocortex, hippocampus, and thalamus, Front Comput Neurosci 8:41, 2014. https://doi.org/10.3389/fncom.2014.00041
