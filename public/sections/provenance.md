# provenance

- Connectivity is measured data, not generated. Janelia FlyEM Male CNS connectome v1.0, CC BY 4.0, from https://male-cns.janelia.org/. Reconstruction by Janelia FlyEM with Google Research and collaborators.
- 38,178 neurons and 5,124,215 synapses are loaded here, a subset of the full dataset covering the visual input to wing motor pathway. Cell types included are listed above.
- Dynamics are modeled. Neurons are leaky integrate-and-fire with the parameters listed in params.ts. Synaptic sign comes from the transmitter prediction field in the source data. Global synaptic gain is calibrated to hold mean firing rate between 2 and 8 Hz.
- Power is computed as spike rate multiplied by an energy cost per action potential of 31.9 pJ, taken from Attwell and Laughlin 2001, https://doi.org/10.1097/00004647-200110000-00001. This is an estimate.
- The bulb brightness, the meter and the page luminance are driven by the running simulation.
- No live insect was used. Nothing here is connected to hardware.
- The jar, the wire, the bulb, the socket, the meter and the bench are built in code from primitives. The fly mesh is Fly by Poly by Google (CC-BY 3.0, via Poly Pizza), repainted; its motion is ours.
- Type: Basteleur by Keussel (Velvetyne, OFL) and Departure Mono by Helena Zhang (OFL).

Model parameters: membrane time constant 20 ms, rest -65 mV, threshold -50 mV, reset -70 mV, refractory 2 ms, step 0.5 ms, synaptic time constant 5 ms, delay 0.5 to 1.5 ms, adaptation 600 ms, background drive 10.71 mV (sd 2.6 mV), synaptic gain 1.6191 mV per synapse, photoreceptor drive 20 mV at full luminance, bulb range 4.93 to 5.70 Hz, floor 0.08.

Transmitter signs: acetylcholine 1, gaba -1, glutamate -1, histamine -1, dopamine 0, octopamine 0, serotonin 0, unknown 0, unclear 0.
Build d19798da (2026-09-12), calibration 2026-09-12, seed 24301.
