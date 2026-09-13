// Simulation worker. Owns the network, runs it at wall-clock speed, posts frames.
// Never runs ahead of wall time: one step per DT_MS at most, so session totals are honest.
import * as P from './params.js';
import { parseNeurons, parseConnectome } from './format.js';
import { LIFNetwork } from './core.js';
import { StimulusLoop, buildPhotoMap } from './stimulus.js';
import { OutputChain, countTypes, countTypeSides } from './output.js';
import type { ToWorker, FromWorker, FrameMsg } from './protocol.js';

const post = (m: FromWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

/** wall-clock budget per tick; the rest of the time is left to message handling */
const BUDGET_MS = 12;
/** backlog tolerated before wall time is dropped (100 ms); beyond it the sim runs slower than real time */
const MAX_BACKLOG = 200;
/** most steps per tick (a full backlog) */
const MAX_CATCHUP = MAX_BACKLOG;
/** frame cadence */
const FRAME_MS = 16;

let net: LIFNetwork | null = null;
let stim: StimulusLoop | null = null;
let out: OutputChain | null = null;
let map: ReturnType<typeof buildPhotoMap> | null = null;
let typeCount: Uint32Array | null = null;
let typeSideCount: Uint32Array | null = null;
let running = false;
let tOffsetMs = 0; // launch offset: the stimulus loop and the clock continue from here
let t0 = 0; // wall time of step 0, moved forward whenever the worker falls behind
let speed = 1; // smoothed simulated seconds per wall second
let lastSpeedWall = 0;
let lastSpeedStep = 0;
let lastFrame = 0;
let lastPhase = -1;
let phaseState = { phase: 0, phaseT: 0, phaseDur: 1, loop: 0 };

// batch buffers
let spikeBuf = new Uint32Array(1 << 16);
let boundBuf = new Uint32Array(MAX_CATCHUP + 1);
let spikeLen = 0;
let boundLen = 0;
const lumSnap = () => new Uint8Array(stim!.cells);
const typeRateBuf = () => new Float32Array(typeCount!.length);

const channel = new MessageChannel();
channel.port1.onmessage = () => tick();
const yieldSoon = () => channel.port2.postMessage(0);

function stepOnce() {
  const n = net!;
  if (n.step % P.STIM_EVERY_STEPS === 0) {
    phaseState = stim!.render((n.step * P.DT_MS + tOffsetMs) / 1000);
    stim!.apply(map!, n);
    if (phaseState.phase !== lastPhase) {
      lastPhase = phaseState.phase;
      post({ t: 'phase', phase: lastPhase, simMs: n.step * P.DT_MS + tOffsetMs });
    }
  }
  const c = n.advance();
  out!.push(n.spikes, c, n.region, n.typeIdx);
  if (spikeLen + c > spikeBuf.length) {
    const nb = new Uint32Array(Math.max(spikeBuf.length * 2, spikeLen + c));
    nb.set(spikeBuf.subarray(0, spikeLen));
    spikeBuf = nb;
  }
  spikeBuf.set(n.spikes.subarray(0, c), spikeLen);
  spikeLen += c;
  boundBuf[boundLen++] = spikeLen;
  if (n.step % Math.round(1000 / P.DT_MS) === 0) {
    const rates = typeRateBuf();
    const bySide = new Float32Array(typeCount!.length * 3);
    out!.typeRates(typeCount!, typeSideCount!, rates, bySide);
    post({ t: 'typeRates', simMs: n.step * P.DT_MS + tOffsetMs, rates, bySide }, [rates.buffer, bySide.buffer]);
  }
}

function postFrame(ran: number, due: number) {
  const n = net!;
  const o = out!;
  const ids = spikeBuf.slice(0, spikeLen);
  const bounds = new Uint32Array(boundLen + 1);
  bounds.set(boundBuf.subarray(0, boundLen), 1);
  const lum = lumSnap();
  stim!.snapshot(lum);
  const msg: FrameMsg = {
    t: 'frame',
    step: n.step,
    simMs: n.step * P.DT_MS + tOffsetMs,
    ran,
    due,
    speed,
    stepMs,
    spikeIds: ids,
    stepBounds: bounds,
    S: o.S,
    r: o.r,
    L: o.L,
    Ls: o.Ls,
    gain: o.gain,
    P: o.P,
    regionRates: o.regionRate.slice(),
    phase: phaseState.phase,
    phaseT: phaseState.phaseT,
    phaseDur: phaseState.phaseDur,
    loop: phaseState.loop,
    lum,
  };
  post(msg, [ids.buffer, bounds.buffer, msg.regionRates.buffer, lum.buffer]);
  spikeLen = 0;
  boundLen = 0;
}

let pendingRan = 0, pendingDue = 0;
let stepMs = 0;

function tick() {
  if (!running || !net) return;
  const now = performance.now();
  let due = Math.floor((now - t0) / P.DT_MS) - net.step;
  if (due > MAX_BACKLOG) {
    // cannot keep up: let simulated time fall behind wall time instead of piling up a debt
    t0 = now - (net.step + MAX_BACKLOG) * P.DT_MS;
    due = MAX_BACKLOG;
  }
  let ran = 0;
  while (ran < due && performance.now() - now < BUDGET_MS) {
    stepOnce();
    ran++;
  }
  if (ran > 0) stepMs = stepMs * 0.9 + ((performance.now() - now) / ran) * 0.1;
  if (now - lastSpeedWall >= 500) {
    if (lastSpeedWall > 0) speed = speed * 0.5 + (((net.step - lastSpeedStep) * P.DT_MS) / (now - lastSpeedWall)) * 0.5;
    lastSpeedWall = now;
    lastSpeedStep = net.step;
  }
  pendingRan += ran;
  pendingDue += due;
  if (spikeLen > 0 || boundLen > 0) {
    if (now - lastFrame >= FRAME_MS || boundLen >= MAX_CATCHUP) {
      postFrame(pendingRan, Math.max(pendingDue, pendingRan));
      pendingRan = 0;
      pendingDue = 0;
      lastFrame = now;
    }
  }
  yieldSoon();
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.t === 'init') {
    const t = performance.now();
    const neurons = parseNeurons(m.neurons);
    const conn = parseConnectome(m.connectome);
    const [gw, gh] = m.meta.photoreceptors.grid;
    tOffsetMs = m.tOffsetMs;
    net = new LIFNetwork(neurons, conn, { seed: m.seed });
    stim = new StimulusLoop(gw, gh, m.seed);
    map = buildPhotoMap(neurons, gw, gh);
    typeCount = countTypes(neurons.typeIdx, neurons.nTypes);
    typeSideCount = countTypeSides(neurons.typeIdx, neurons.side, neurons.nTypes);
    out = new OutputChain(net.n, neurons.region, m.meta.regions.length, neurons.nTypes, neurons.side);
    post({ t: 'ready', n: net.n, m: conn.m, initMs: performance.now() - t });
  } else if (m.t === 'start') {
    if (!net) return;
    running = true;
    t0 = performance.now() - net.step * P.DT_MS;
    lastFrame = performance.now();
    lastSpeedWall = 0;
    yieldSoon();
  } else if (m.t === 'pause') {
    running = false;
  } else if (m.t === 'resume') {
    if (!net || running) return;
    running = true;
    // time spent paused is not simulated and not counted
    t0 = performance.now() - net.step * P.DT_MS;
    lastSpeedWall = 0;
    yieldSoon();
  }
};
