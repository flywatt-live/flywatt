# the wire

What passes through the wire. Every panel is the running simulation, drawn as it happens.

1. what the fly sees: luminance per ommatidial column, two eyes. Phases: drifting grating (14 s), looming disc (10 s), small moving target (12 s), dark flash (8 s), rest (10 s).
2. raster wall: one dot per spike, one row per neuron, grouped by region. Regions: sensory, lamina, medulla, lobula, central, descending, motor.
3. regional rate: Hz, mean over 100 ms.
4. window sum: spikes in the last 100 ms.
5. smoothing: L(t) = smoothstep(4.93, 5.70, r(t)), low-passed with 150 ms.
6. output gain: gain = 0.08 + 0.92 x Ls, sent to the filament, the point light and the page's --lum variable.
