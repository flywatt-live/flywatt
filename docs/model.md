# Model notes

Everything the site claims, with the reasoning and the places it lives in code. Numbers quoted here are from build `d19798da`, calibration seed 24301, and the last `data/verify.ts` run; the live values on the site are read from `meta.json`, `params.ts` and the worker, never from this file.

## 1. From the dataset to a network

### 1.1 Selection

`data/build.ts` reads three feather files of the Janelia FlyEM Male CNS v1.0 flat connectome with `apache-arrow` (LZ4 batches; `nodejs-polars` cannot read the dictionary-encoded columns of these files). Bodies are selected by the rules in `data/subcircuit.ts`, one rule per region. A rule is a regex on `type`, or a predicate on `superclass` and `subclass` for the wing motor neurons, which have no shared type prefix. The build writes `requested_types`, `found_types` and `missing_types` into `meta.json`, so the site only ever lists what exists.

The head direction ring is included with its GABAergic ER ring neurons. Without them the isolated EPG, PEN, PEG, Delta7 loop has no brake and bursts on its own; with them it settles at 4 to 14 Hz per type and stays there.

### 1.2 Sign

Each body's `predicted_nt` (falling back to `celltype_predicted_nt`) is mapped through

| transmitter | sign |
|---|---:|
| acetylcholine | +1 |
| GABA, glutamate, histamine | −1 |
| dopamine, octopamine, serotonin, unknown, unclear | 0 |

Glutamate is inhibitory in the fly (GluCl). Histamine is the photoreceptor transmitter and inhibits lamina cells through chloride channels; mapping it to zero would sever the visual input, mapping it positive would invert the lamina's OFF response. 48 neurons have no usable prediction and drive nothing; 192 edges are dropped for that reason.

### 1.3 Edges and weights

Directed edges with at least 2 synapses are kept. `weights[k] = sign(pre) × synapses`, stored as `Int16`. The build has a pair-wise threshold mechanism for keeping the compressed connectome under a size budget; at 1.42 MB it was never needed and `thresholds.pair_overrides` is empty.

Neurons are sorted by (region, type, side, body id). Regions and types are therefore contiguous index ranges, which is what lets the raster wall band by region, the circuit table find a type's rows, and the worker sum type rates with one pass.

### 1.4 Retinotopy

R1-R6 photoreceptors carry no hex column in the annotations. Each is placed at the hex column of its strongest lamina target (`assignedOlHex1/2` of the target), 3,336 of 3,377 that way and 41 by hash. Hex (h1, h2) is treated as a sheared square lattice at 5 degrees per column and folded into a 40 × 40 grid per eye. The stimulus is rendered on that grid.

### 1.5 Binary format

`neurons.<hash>.fwb`, header `FWN1`, then N `u32`, nTypes `u16`, then 8-byte aligned arrays: `bodyId Float64[N]`, `typeIdx Uint16[N]`, `region Uint8[N]`, `sign Int8[N]`, `side Uint8[N]`, `px Uint8[N]`, `py Uint8[N]`.

`connectome.<hash>.fwb`, header `FWC1`, N, M, then `indptr Uint32[N+1]`, `indices Uint32[M]`, `weights Int16[M]`.

Both are gzip streams inside a neutral `.fwb` extension. The page sniffs the magic bytes and inflates with `DecompressionStream`, falling back to `fflate`. The extension exists because download managers and some hosts treat `.gz` and `.bin` specially.

## 2. Dynamics

### 2.1 Neuron

Current-based leaky integrate-and-fire on `Float32Array`s, forward Euler with Δt = 0.5 ms. Per neuron i, per step:

```
I_i ← clamp(I_i, ISYN_MIN, ISYN_MAX)            −40 .. +22 mV
I_i ← I_i · exp(−Δt / τ_s)                       τ_s = 5 ms
A_i ← A_i + (I_i − A_i) · Δt / τ_a               τ_a = 600 ms
if refractory: V_i = V_reset; continue
V_i ← V_i + (Δt / τ_m) · (V_rest − V_i + (I_i − A_i) + D_i)
if V_i ≥ V_th: spike; V_i = V_reset; refractory 2 ms; enqueue at step + d_i
```

with V_rest = −65, V_th = −50, V_reset = −70 mV, τ_m = 20 ms, d_i drawn once from {1, 2, 3} steps. The delay queue has four slots indexed by step modulo four; delivering a spike adds `g · w_ij` to `I_j` for every postsynaptic j.

Three additions beyond a textbook LIF, each there for a reason found by running the thing:

- **Input adaptation.** The neuron integrates `I_i − A_i`, the synaptic input minus its own 600 ms running mean. Without it the medulla and the ring settle into a slow synchronous oscillation (a few hertz, every neuron together), because a purely feed-forward drive with a common mean has no mechanism to desynchronise. With it, neurons respond to changes of their input, which is what real synapses with short-term depression do to a first approximation.
- **Input saturation.** `I_i` is clamped to −40 .. +22 mV. Conductance-based synapses saturate at the reversal potential; a current-based model does not, and the highest-degree cells (in-degree up to 2,144) would otherwise fire at every step in a volley.
- **Photoreceptor gain jitter.** Each R cell's drive is 20 mV × luminance × (1 ± 0.25 jitter). Identical photoreceptors under a uniform field would spike in lockstep and the lamina would inherit the volley.

### 2.2 Background

The rest of the brain is not loaded. It is stood in for by a drive `D_i = μ + b_i + I_photo,i` where μ is calibrated, b_i is a per-neuron bias drawn once in ±3 mV, and Gaussian noise of sd 2.6 mV is added to `I_i` every 4 ms (8 steps) from a seeded table with an xorshift walk, so the whole network's noise costs one random draw per refresh.

### 2.3 Stimulus

`src/sim/stimulus.ts` renders luminance per hex column for both eyes every 4 steps (2 ms). A 54 s loop, seeded, no user input:

| phase | s | what |
|---|---:|---|
| grating | 14 | sinusoidal, 8 cycles around the panorama, drifting at 2 Hz, direction seeded per loop |
| looming | 10 | dark disc, angular radius atan(l/v ÷ (t_c − t)), l/v = 0.25 s, two approaches |
| target | 12 | 6 degree dark spot on a seeded path at constant angular speed |
| flash | 8 | two 300 ms drops to 0.02 on a 0.5 background |
| rest | 10 | uniform 0.5 |

Smooth edges everywhere. A hard-edged square wave grating produced synchronous volleys in the lamina at every edge crossing.

### 2.4 Output chain

```
S(t)   spike count over the last 200 steps (100 ms), ring buffer with a running sum
r(t)   S / (N · 0.1)                       Hz
L(t)   smoothstep(R_MIN, R_MAX, r)
L_s    += (L − L_s) · Δt / 150 ms
gain   0.08 + 0.92 · L_s
P(t)   S / 0.1 × E_ap                      W
```

The floor of 0.08 keeps the page readable when the network is quiet. R_MIN and R_MAX are the 5th and 95th percentiles of r(t) over one loop, so the bulb uses the range the network actually visits rather than a fixed scale.

## 3. Calibration

`data/calibrate.ts`, deterministic, about ten minutes on one core.

1. **μ** by bisection in [2, 16] mV, 12 iterations of 2 s each with synapses off, target 0.4 Hz for the non-sensory population. Result 10.7056 mV, 0.399 Hz. A low, non-zero background means that whatever happens above it is due to the synapses.
2. **g** by bisection of log₁₀ g in [−3, 0.5], 14 iterations, each scoring the mean of 3 s rest and 3 s grating after a 0.5 s warm-up, target 3 Hz non-sensory. A run is "exploded" if more than 30 % of the network spikes in one step or the mean passes 60 Hz, and counts as too high. Result 1.619 mV per synapse; non-sensory 3.010 Hz, all neurons 5.377 Hz (photoreceptors run near 30 Hz under a 0.5 field).
3. **R_MIN, R_MAX** from one full loop: 4.933 and 5.700 Hz. Per-phase means: grating 5.504, looming 5.171, target 5.286, flash 5.221, rest 5.302.

The block is written between `// BEGIN CALIBRATED` and `// END CALIBRATED` in `src/sim/params.ts`, with the date, seed, build hash and the record above, so the site can show it.

## 4. Verification

`data/verify.ts` runs three loops (162 s, 324,000 steps) and fails loudly if any claim breaks:

| claim | measure | threshold | last run |
|---|---|---|---|
| plausible rates | mean rate, all neurons | 2 to 8 Hz | 5.314 Hz |
| no volleys | max spikes in one step | < 2 % of N | 203 (0.53 %) |
| no slow global oscillation | CV of S(t) at rest | < 12 × the Poisson CV | 0.026 vs 0.007 (0.054 over the whole loop, stimulus included) |
| looming reaches the descending neurons | LC4 + LPLC2 + DNp09, 0.5 s before collision vs rest | ≥ 1.05 × | 6.51 vs 5.97 Hz (1.09 ×) |
| DNp09 itself | same, 2 neurons, 6 looms | > rest | 10.33 vs 8.73 Hz |
| lamina OFF response | lamina during the dark flash vs rest | ≥ 1.2 × | 5.74 vs 3.09 Hz (1.86 ×) |
| motor output | wing motor neurons fire | > 0 | 0.47 to 0.50 Hz |

When the looming check fails, the script prints the chain R1-R6 → L1/L2/L3 → Tm1/Tm2/Tm9/T5 → LC4/LPLC2 → DNp09 at rest and before collision, so the break can be located. Last run, in Hz, rest → loom:

```
R1-R6   30.83 → 26.14      the disc darkens the field
L1       5.16 →  6.82      released from histaminergic inhibition
L2       3.91 →  5.63
L3       1.55 →  2.20
Tm1      1.46 →  1.86
Tm2      1.22 →  1.64
Tm9      0.79 →  0.99
T5a      1.62 →  2.13
LC4      6.94 →  7.53
LPLC2    5.27 →  5.78
DNp09    8.73 → 10.33
```

The effect is real and small. This is a cut of the visual system with no lateral inhibition beyond what the selected types provide, LIF cells instead of the graded, non-spiking lamina and medulla neurons of the actual fly, and no rest-of-brain. It is shown live rather than described.

## 5. Energy

```
E_ap = 3.84 × 10⁸ ATP · 50 kJ mol⁻¹ / 6.022 × 10²³ mol⁻¹ = 3.188 × 10⁻¹¹ J
```

Attwell & Laughlin (2001) estimate 3.84 × 10⁸ ATP per action potential for a rat cortical pyramidal neuron, most of it spent by the Na⁺/K⁺ pump restoring the gradients. Moujahid et al. (2014) use 50 kJ/mol for the free energy of ATP hydrolysis under cellular conditions. `src/sim/constants.ts` derives E_ap from these two numbers at build time; nothing is typed in as 31.9 pJ.

At the calibrated mean rate of 5.377 Hz over 38,178 neurons, the network produces 205,287 spikes per second and would spend 6.55 µW, 0.566 J per day, 206 J per year. Fly neurons are far smaller than rat pyramidal cells; the figure is an upper-end estimate and is labelled as one on the site.

## 6. Running it in a browser

The worker owns the network and steps it against the wall clock: at each tick it computes how many steps are due, runs at most 12 ms worth, and posts a frame with the spike ids of the steps it ran, S, r, L, L_s, gain, P, per-region rates, phase and stimulus grid. It never runs ahead of wall time. If it falls behind by more than 200 steps it resets its origin and reports `speed`, simulated seconds per wall second, which the page shows as `sim speed 0.8×` when below 0.95.

Real time needs 2,000 steps per second. A Chrome worker on a 2020s laptop manages about 1,600 to 2,000 for this network (0.5 to 0.6 ms per step; the CSR walk over 559,750 edges at 5 Hz dominates). Float64 state was tried and was slower; SharedArrayBuffer was not used because shared hosting cannot set the isolation headers.

The main thread keeps a 2,000,000-spike ring for the raster wall. Every frame is drawn in order; the wall only rebuilds from history when a panel comes back after more than 200 steps off screen. Session statistics (joules, simulated seconds, lit seconds, rate histogram, per-phase power, peaks) accumulate on the main thread from the frames.

The launch clock: `launch.at` in `src/copy/en.ts` is when the apparatus was switched on. The worker is given the simulated milliseconds elapsed since then, so the stimulus phase is the same for every visitor at the same wall time, and energy and spikes before the page opened are estimated at the calibrated mean rate and labelled as an estimate.

## 7. Things that were tried and taken out

- Float64 state arrays: slower in V8 than Float32 for this access pattern, no visible difference in the dynamics.
- Square-wave grating and hard-edged stimuli: synchronous lamina volleys.
- The ring without ER neurons: bursts.
- A pure LIF without input adaptation: slow global oscillation.
- A pure LIF without saturation: high-degree volleys.
- A procedural fly built from primitives: rejected on looks; the CC-BY mesh, repainted, stayed.
- Faceted, ribbed jar: read as a birdcage; the smooth lathe dome stayed.
