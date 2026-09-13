# FLYWATT

A fruit fly connectome, wired to a light bulb. **https://flywatt.live**

38,178 neurons and 5,124,215 synapses of a male *Drosophila melanogaster*, taken from the Janelia FlyEM Male CNS connectome v1.0, are simulated as leaky integrate-and-fire neurons in a Web Worker. Their spikes light an incandescent bulb in a three.js scene, move a meter needle, and set the luminance of the page. Power is spike rate multiplied by a literature estimate of the energy of one action potential.

```
P(t) = S(t) / Δt × E_ap
```

with S(t) the spike count of the loaded network in a sliding 100 ms window and E_ap = 31.9 pJ. At the calibrated mean rate the network draws about 6.5 µW. Every number is read from the running simulation, from `public/data/meta.json`, or from `src/sim/params.ts`. No live insect is involved and nothing is connected to hardware.

Code MIT. Data CC BY 4.0. Details in [docs/model.md](docs/model.md).

## Contents

1. [What is measured, what is modeled](#what-is-measured-what-is-modeled)
2. [The subcircuit](#the-subcircuit)
3. [The model](#the-model)
4. [Calibration](#calibration)
5. [Verification](#verification)
6. [Energy](#energy)
7. [The page](#the-page)
8. [Running it](#running-it)
9. [Repository layout](#repository-layout)
10. [Assets and licences](#assets-and-licences)

## What is measured, what is modeled

| layer | status | where |
|---|---|---|
| Which neurons exist, their cell types, sides, which neuron connects to which and with how many synapses, the predicted transmitter of each neuron, the optic lobe hex column of lamina cells | **measured** | dataset, read by `data/build.ts` |
| Synaptic sign from transmitter (acetylcholine +1; GABA, glutamate, histamine -1; dopamine, octopamine, serotonin, unknown 0) | **assumed** | `data/build.ts`, listed in `meta.json` |
| Neuron model (LIF), its constants, synaptic delays, adaptation and saturation of synaptic input, the background drive standing in for the rest of the brain, the photoreceptor drive, the stimulus loop, the map from firing rate to brightness | **modeled** | `src/sim/params.ts` |
| Background drive mean, global synaptic gain, the rate range mapped onto the bulb | **calibrated** | written into `params.ts` by `data/calibrate.ts` |
| Energy per action potential | **estimated** | `src/sim/constants.ts`, two DOIs |

## The subcircuit

Visual input to wing motor. Cell types are selected by the regexes in `data/subcircuit.ts`; the build records what it asked for and what it found.

| region | cell types | neurons |
|---|---|---:|
| sensory | R1-R6 (one collective type in this dataset) | 3,377 |
| lamina | L1, L2, L3, L5, Am1, C2, C3 | 10,640 |
| medulla | Mi1, Tm1, Tm2, Tm3, Tm9, T4a-d, T5a-d | 22,721 |
| lobula | LC4, LC6, LC9, LC11, LPLC1, LPLC2 | 931 |
| central | EPG, EPGt, PEN_a, PEN_b, PEG, Delta7, ER ring neurons | 434 |
| descending | DNa01, DNa02, DNp09, DNg13 | 8 |
| motor | every wing motor neuron (`superclass = vnc_motor`, `subclass = wm`) | 67 |
| | 89 types | **38,178** |

Connections with fewer than 2 synapses are dropped (282,981 edges, one synapse each). What remains:

| | |
|---|---:|
| connections (directed edges) | 559,750 |
| synapses carried | 5,124,215 |
| density M / N(N-1) | 3.84 × 10⁻⁴ |
| synapses per connection, mean / max | 9.15 / 193 |
| out-degree, median / p99 / max | 10 / 67 / 3,458 |
| in-degree, median / p99 / max | 11 / 124 / 2,144 |
| excitatory share, by connection / by synapse | 83.0 % / 67.7 % |
| neurons by sign, + / - / 0 | 29,160 / 8,970 / 48 |
| share of the full dataset, typed neurons / synapses | 23.2 % / 1.64 % |

Connections by region, presynaptic rows to postsynaptic columns:

```
              sensory   lamina  medulla   lobula  central  descend    motor
sensory           124     9470        0        0        0        0        0
lamina           2185    44903    63280      281        0        0        0
medulla             0    37784   280210    47315        0        0        0
lobula              0       11      109    34636        0      138        0
central             0        0        0        4    39217        0        0
descending          0        0        0        0        0        8        8
motor               0        0        0        0        0        0       67
```

Two things this matrix says plainly. The visual path is dense and feed-forward: photoreceptors to lamina, lamina to medulla, medulla to lobula, lobula to descending, descending to motor. The head direction ring (central) has 39,217 internal connections and 4 inputs from the rest of the subcircuit; in this cut it runs on its own dynamics and the site says so.

Photoreceptors carry no hex column in the annotations, so each is placed at the hex column of its strongest lamina target (3,336 of 3,377; the rest by hash). The two hex axes are treated as a sheared square lattice with 5 degrees per column. This retinotopy is a modeling assumption.

## The model

Leaky integrate-and-fire, current based, Euler step Δt = 0.5 ms, on typed arrays. The same `src/sim/core.ts` runs in the browser worker and in the Node scripts and is deterministic for a seed.

```
τ_m dV_i/dt = (V_rest − V_i) + (I_i − A_i) + D_i             membrane, τ_m = 20 ms
I_i ← clamp(I_i, −40, +22) mV, then I_i ← I_i e^(−Δt/τ_s)     synaptic input, τ_s = 5 ms
I_j += g · w_ij · sign(i)  at step t + d_i                    on a spike of i, d_i ∈ {1,2,3} steps
A_i ← A_i + (I_i − A_i) Δt/τ_a                                 input adaptation, τ_a = 600 ms
D_i = μ + b_i + I_photo,i                                      drive: calibrated mean, per-cell bias ±3 mV, photoreceptor input
I_i += N(0, 2.6 mV) every 4 ms                                 background noise
V_i ≥ −50 mV → spike, V_i = −70 mV, refractory 2 ms
```

w_ij is the synapse count of the connection, g the calibrated global gain in mV per synapse. Photoreceptor input is 20 mV × luminance with a per-cell gain jitter of ±25 %. All constants, with a comment each, are in `src/sim/params.ts`.

The stimulus is autonomous and seeded, a 54 s loop rendered per hex column for both eyes: drifting sinusoidal grating (14 s), looming dark disc (10 s, two approaches, l/v = 0.25 s), small moving dark target (12 s), dark flash (8 s, two 300 ms drops), rest (10 s).

From spikes to light:

```
S(t)   spikes of all N neurons in the last 100 ms
r(t)   = S / (N · 0.1)                               mean rate, Hz
L(t)   = smoothstep(R_MIN, R_MAX, r)                 0..1
L_s    ← L_s + (L − L_s) Δt/150 ms                   smoothed
gain   = 0.08 + 0.92 · L_s                           bulb, meter, page luminance
P(t)   = S / 0.1 s × E_ap                            watts
```

## Calibration

`data/calibrate.ts` runs the headless network and writes the block between the `CALIBRATED` markers in `params.ts`. Three steps:

1. **Background drive.** Synapses off. Bisect μ in [2, 16] mV, 12 iterations of 2 s each, until the non-sensory network fires at 0.4 Hz. Result μ = 10.7056 mV, baseline 0.399 Hz.
2. **Synaptic gain.** Synapses on. Bisect log₁₀ g in [−3, 0.5] for 14 iterations, scoring the non-sensory mean rate over 3 s rest and 3 s grating after a discarded 0.5 s warm-up, target 3 Hz; a run counts as too high if any step has more than 30 % of the network spiking or the rate passes 60 Hz. Result g = 1.619 mV per synapse.
3. **Rate range.** One full stimulus loop; R_MIN and R_MAX are the 5th and 95th percentiles of r(t). Result 4.933 and 5.700 Hz.

Calibration record, build `d19798da`, seed 24301:

| | Hz |
|---|---:|
| mean rate, all neurons | 5.377 |
| mean rate, non-sensory | 3.010 |
| grating / looming / target / flash / rest | 5.504 / 5.171 / 5.286 / 5.221 / 5.302 |

## Verification

`data/verify.ts` simulates three full loops (162 s, 324,000 steps) and asserts the claims the site makes. Last run:

| check | result |
|---|---|
| mean rate in 2 to 8 Hz | 5.314 Hz |
| no population synchrony (max spikes per step under 2 % of N, rest CV of S(t) under 12 × Poisson) | 203 spikes in one step (0.53 %); CV 0.026 at rest, 0.054 over the loop (Poisson 0.007) |
| looming pathway (LC4 + LPLC2 + DNp09) fires more in the 0.5 s before collision than at rest | 6.51 vs 5.97 Hz |
| DNp09 alone | 10.33 vs 8.73 Hz (2 neurons, 6 looms) |
| lamina responds to the dark flash | 5.74 vs 3.09 Hz |
| wing motor neurons fire | yes, 0.47 to 0.50 Hz by phase |

The causal chain for the looming response, rest vs the half second before collision, in Hz: R1-R6 30.83 → 26.14, L1 5.16 → 6.82, L2 3.91 → 5.63, Tm1 1.46 → 1.86, T5a 1.62 → 2.13, LC4 6.94 → 7.53, LPLC2 5.27 → 5.78, DNp09 8.73 → 10.33. Histamine is the photoreceptor transmitter and inhibits lamina cells, so a dark disc releases L1 and L2, which is the first step of the chain. The response is modest in this reduced circuit and is shown live on the raster wall rather than claimed.

`npx tsx data/experiment.ts '[{"I_PHOTO_GAIN_MV":20}]'` runs calibration and the verification measures for a list of parameter overrides.

## Energy

```
E_ap = 3.84 × 10⁸ ATP / spike × 50 kJ/mol / N_A = 3.19 × 10⁻¹¹ J = 31.9 pJ
```

- ATP per action potential: Attwell D, Laughlin SB. An energy budget for signaling in the grey matter of the brain. *J Cereb Blood Flow Metab* 21(10):1133-1145, 2001. https://doi.org/10.1097/00004647-200110000-00001
- Free energy of ATP hydrolysis: Moujahid A, d'Anjou A, Graña M. Energy demands of diverse spiking cells from the neocortex, hippocampus, and thalamus. *Front Comput Neurosci* 8:41, 2014. https://doi.org/10.3389/fncom.2014.00041

The ATP figure is for a mammalian cortical neuron; fly neurons are smaller and probably cheaper. The site labels the result an estimate everywhere it appears. At the calibrated mean rate:

| | |
|---|---:|
| spikes per second, whole network | 205,287 |
| power | 6.55 µW |
| energy per day | 0.566 J |
| energy per year | 206 J |

The bulb on the page is not powered by this; it is a rendering whose brightness follows the rate. The meter's full scale is the power at 1.25 × R_MAX.

## The page

- **Apparatus.** three.js, one posterised shader for every solid (four light bands, baked shadow mask on the bench, film grain, vignette, a little chromatic aberration at the edges), physical glass for the jar and the bulb, one point light at the filament and nothing else. The bench, jar, bulb, socket, meter, wire, porcelain knobs and specimen tag are lathe, tube and box geometry built in code. The fly is a CC-BY mesh repainted by the same shader; its wings beat at the wing motor rate, its eyes glow with the photoreceptor rate, it flinches when DNp09 surges past 2.5 × its running mean, and it turns with the left-right descending asymmetry.
- **The wire.** Six canvas panels: stimulus (both eyes, per hex column), the raster wall (every neuron, 1 px per 5 ms, regions banded), regional rates, the window sum S, smoothing L and L_s, gain. A pinned horizontal track with motion, a stacked column without.
- **The circuit.** All 89 types, counts, region, predicted transmitter, live rate; hovering a row finds its neurons on the raster wall.
- **The arithmetic and the record.** The formula, live; a ledger of spikes, energy and time since launch; the rate histogram, per-phase mean power, peaks.
- **Launch clock.** `public/launch.json` (falling back to `launch.at` in `src/copy/en.ts`) is when the apparatus was switched on; the same file carries the contract address and the dex link, so launch-day values are edited on the server without a rebuild. The stimulus clock continues from it, so every visitor sees the same phase, and energy before the page opened is estimated at the calibrated mean rate and labelled as such.

The worker never runs ahead of wall time. It needs 2,000 steps per second; on a machine that cannot manage that, simulated time runs slower than wall time and the page says so (`sim speed 0.8×`). Counters use simulated time either way.

Data on the wire: `neurons.<hash>.fwb` (111 kB) and `connectome.<hash>.fwb` (1.42 MB), gzip bytes in a neutral extension inflated in the page, so no server compression setting can break them. CSR: `indptr Uint32[N+1]`, `indices Uint32[M]`, `weights Int16[M]` with the sign folded in. Neurons are sorted by (region, type, side, body id) so every region and type is a contiguous range.

## Running it

```
npm install
npm run fonts                     # Basteleur and Departure Mono, verifies the OFL text
npm run data:fetch -- --weights   # about 1.1 GB into data/raw, once
npm run data:probe                # what the annotations contain for our rules
npm run data:build                # public/data/*.fwb and meta.json
npm run data:calibrate            # background drive and synaptic gain, writes params.ts
npm run data:verify               # checks the claims above
npm run data:stats                # degree, weight, sign and region-pair statistics
npm run data:docs                 # public/llms.txt and public/sections/*.md
npm run favicon
npm run dev                       # http://localhost:5173
```

Build and package for static hosting:

```
npm run build
npm run package                   # flywatt-dist.zip; upload its contents to the web root
```

`public/.htaccess` sets MIME types and cache headers for Apache hosts. `/?og=1` renders the OG image and poster into `public/` through the dev server; `/?motion=1` and `/?poster=1` override the reduced-motion and poster detection.

## Repository layout

```
data/        pipeline: fetch, probe, build, calibrate, verify, experiment, docs, fonts
src/sim/     LIF core, stimulus loop, output chain, worker, bridge (shared by Node and browser)
src/scene/   three.js apparatus, shader, glass, baked shadow, fly, leads, tag
src/panels/  canvas panels: stimulus, raster wall, rates, window sum, smoothing, gain, record, minis
src/ui/      hud, hotspots, rail, scroll, circuit table, arithmetic, provenance, footer, fallback
src/copy/    every string on the site
public/      fonts, model, data, favicon, og, llms.txt, sections, .htaccess
tools/       favicon raster, dist packaging
docs/        model notes
```

## Assets and licences

| asset | source | licence |
|---|---|---|
| Connectome | Janelia FlyEM Male CNS v1.0, https://male-cns.janelia.org/ | CC BY 4.0 |
| Basteleur (Bold, Moonlight) | Keussel, Velvetyne, https://velvetyne.fr/fonts/basteleur/ | SIL OFL 1.1 |
| Departure Mono | Helena Zhang, https://departuremono.com/ | SIL OFL 1.1 |
| Fly mesh | "Fly" by Poly by Google, via Poly Pizza, https://poly.pizza/m/c7w1u4mSnXZ | CC BY 3.0 |

Reconstruction by the Janelia FlyEM Project Team with Google Research and collaborators. Code is MIT, see `LICENSE`. Data and assets keep their own licences.
