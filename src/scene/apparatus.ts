// The apparatus: renderer, camera, the objects on the bench, and the one light.
// Bulb brightness, meter needle and fly motion all read from the simulation bridge.
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { SimBridge } from '../sim/bridge.js';
import * as P from '../sim/params.js';
import { E_AP_J } from '../sim/constants.js';
import { paletteColors, shared } from './materials.js';
import { makeComposer } from './post.js';
import { buildBench, BENCH_Y } from './geometry/bench.js';
import { buildJar, JAR } from './geometry/jar.js';
import { buildBulb, BULB } from './geometry/bulb.js';
import { buildWires } from './geometry/wire.js';
import { buildMeter } from './geometry/meter.js';
import { buildFly, type FlyParts } from './geometry/fly.js';
import { buildLeads } from './geometry/leads.js';
import { buildTag } from './geometry/tag.js';
import { fmtInt, fmtSI } from '../panels/format.js';
import { tag as tagCopy } from '../copy/en.js';
import { bakeShadowMask, planarUv1, type BakeArea } from './lightmap.js';

export type AnchorName = 'bulb' | 'wire' | 'jar' | 'fly' | 'meter';

export interface Apparatus {
  setLoadProgress(p: number): void;
  kickNeedle(): void;
  /** render one frame at a fixed gain and needle position, used by the OG tool; optional tighter camera */
  renderStill(gain: number, needle: number, cam?: { z: number; y: number; fov: number; lookY: number; x?: number }): void;
  /** resolves when the scene is complete */
  ready: Promise<void>;
  /** stop the animation loop (OG tool) */
  stop(): void;
  /** screen position (CSS px, relative to the canvas) of a named part; visible=false when behind the camera */
  anchor(name: AnchorName): { x: number; y: number; visible: boolean };
  /** which part is under a canvas-relative point, if any */
  pick(x: number, y: number): AnchorName | null;
  /** the fly's live signals for the hotspot text */
  flySignals(): { motorHz: number; dnp09Hz: number; turn: number; sensoryHz: number; flapHz: number };
  renderer: THREE.WebGLRenderer;
}

export interface ApparatusOptions {
  /** keep the drawing buffer so the OG tool can read pixels back */
  preserve?: boolean;
}

const CAMERA = { x: 0.25, y: 0.2, z: 1.42, fov: 42, lookY: 0.17 };

export async function createApparatus(canvas: HTMLCanvasElement, bridge: SimBridge, opts: ApparatusOptions = {}): Promise<Apparatus> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pal = paletteColors();
  const scene = new THREE.Scene();
  scene.background = pal.ink.clone();

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.05, 8);
  camera.position.set(CAMERA.x, CAMERA.y, CAMERA.z);
  camera.lookAt(CAMERA.x, CAMERA.lookY, 0);

  const bench = buildBench(pal);
  scene.add(bench);
  const jar = buildJar(pal);
  scene.add(jar.group);
  const bulb = buildBulb(pal);
  scene.add(bulb.group);
  const wires = buildWires(pal, jar.terminal, JAR.radius, bulb.terminal, bulb.terminal2);
  scene.add(wires.group);
  const meter = buildMeter(pal);
  scene.add(meter.group);

  // bake the shadows the apparatus casts on the bench, once, from the fixed bulb position
  const area: BakeArea = { minX: -0.7, maxX: 1.2, minZ: -0.6, maxZ: 0.5, y: BENCH_Y + 0.001 };
  bench.traverse((o) => { if (o.userData.bake) planarUv1(o as THREE.Mesh, area); });
  bakeShadowMask(renderer, [jar.group, bulb.group, meter.group], bulb.filamentPos, area);

  // the only light. Intensity comes from the simulation.
  const light = new THREE.PointLight(pal.filament.clone(), 0, 4, 2);
  light.position.copy(bulb.filamentPos);
  scene.add(light);
  shared.uLightPos.value.copy(bulb.filamentPos);

  const flyGroup = new THREE.Group();
  flyGroup.position.set(JAR.x + 0.005, jar.floorY, JAR.z - 0.005);
  scene.add(flyGroup);
  let fly: FlyParts | null = null;
  const flyReady = buildFly(pal, '/models/fly.glb').then((f) => {
    fly = f;
    flyGroup.add(f.group);
  });

  // the specimen tag, propped against the front of the jar base; written once the dataset is in
  const tag = buildTag(pal, JAR.x + 0.085, JAR.z + JAR.radius + 0.09, 0.3);
  scene.add(tag.group);

  // signal leads from the fly's head to the cap fitting
  const leads = buildLeads(pal);
  scene.add(leads.group);
  const capPoint = new THREE.Vector3(JAR.x, jar.floorY + JAR.height - 0.015, JAR.z); // just under the crown, inside the glass
  const headWorld = new THREE.Vector3();

  const { composer, pass } = makeComposer(renderer, scene, camera);
  composer.addPass(new OutputPass());

  const fullScaleW = () => (bridge.meta ? bridge.meta.n_neurons * P.R_MAX_HZ * 1.25 * E_AP_J : 1);

  let loadGain = 0;
  let simDriven = false;
  const setGain = (g: number) => {
    shared.uLightIntensity.value = g;
    light.intensity = 0.05 + g * 0.6;
    bulb.filament.material.color.copy(pal.filament).multiplyScalar(0.15 + g * 1.4);
  };
  setGain(0.02);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pass.uniforms.uResolution.value.set(w, h);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = true;
  new IntersectionObserver((es) => { for (const e of es) visible = e.isIntersecting; }).observe(canvas);

  bridge.on('frame', (f) => {
    simDriven = true;
    setGain(f.gain);
    meter.setValue(f.P / fullScaleW());
  });

  const typeIndex = (name: string) => bridge.meta?.types.findIndex((t) => t.name === name) ?? -1;
  let motorIdx: number[] = [], motorCount = 1, dnp09 = -1, dna: number[] = [], sensoryRegion = -1;
  bridge.on('ready', () => {
    const m = bridge.meta;
    motorIdx = m.types.map((t, i) => (m.regions[t.region] === 'motor' ? i : -1)).filter((i) => i >= 0);
    motorCount = motorIdx.reduce((a, i) => a + m.types[i].count, 0) || 1;
    dnp09 = typeIndex('DNp09');
    dna = ['DNa01', 'DNa02'].map(typeIndex).filter((i) => i >= 0);
    sensoryRegion = m.regions.indexOf('sensory');
    tag.write([tagCopy.species, `${m.dataset.short} ${m.dataset.version}`, `${fmtInt(m.n_neurons)} neurons`, `${fmtInt(m.n_synapses)} synapses`, `E_ap ${fmtSI(E_AP_J, 'J')}, est.`]);
  });

  const signals = { motorHz: 0, dnp09Hz: 0, turn: 0, sensoryHz: 0, flapHz: 0 };
  const readSignals = () => {
    const tr = bridge.typeRates, bs = bridge.typeRatesBySide;
    let motorHz = 0, dnp09Hz = 0, turn = 0;
    if (tr) {
      for (const i of motorIdx) motorHz += tr[i] * bridge.meta.types[i].count;
      motorHz /= motorCount;
      if (dnp09 >= 0) dnp09Hz = tr[dnp09];
      if (bs && dna.length) {
        let l = 0, r = 0;
        for (const i of dna) { l += bs[i * 3]; r += bs[i * 3 + 1]; }
        turn = l + r > 0 ? (l - r) / (l + r) : 0;
      }
    }
    signals.motorHz = motorHz;
    signals.dnp09Hz = dnp09Hz;
    signals.turn = turn;
    signals.sensoryHz = bridge.latest && sensoryRegion >= 0 ? bridge.latest.regionRates[sensoryRegion] : 0;
    signals.flapHz = motorHz * P.FLAP_HZ_PER_MOTOR_HZ;
  };

  const anchors: Record<AnchorName, THREE.Vector3> = {
    bulb: new THREE.Vector3(BULB.x + 0.085, bulb.top.y - 0.06, BULB.z),
    wire: wires.mid.clone(),
    jar: new THREE.Vector3(JAR.x + JAR.radius * 0.8, jar.floorY + JAR.height * 1.02, JAR.z),
    fly: new THREE.Vector3(JAR.x + 0.05, jar.floorY + 0.1, JAR.z + 0.05),
    meter: meter.face.clone().add(new THREE.Vector3(0.1, 0.11, 0)),
  };
  const tmp = new THREE.Vector3();

  // picking: which part is under the pointer
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickSets = (): [AnchorName, THREE.Object3D[]][] => [
    ['fly', fly ? fly.pickables : []],
    ['jar', [jar.glass]],
    ['bulb', bulb.group.children],
    ['meter', meter.group.children],
    ['wire', wires.group.children],
  ];

  let last = performance.now();
  let stopped = false;
  const loop = (now: number) => {
    if (stopped) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible) return;
    if (!simDriven) setGain(Math.max(0.02, P.L_FLOOR * loadGain));
    meter.update(dt);
    readSignals();
    fly?.update({ ...signals, dt });
    if (fly) {
      fly.headWorld(headWorld);
      leads.update(headWorld, capPoint, now / 1000);
    }
    pass.uniforms.uTime.value = now / 1000;
    composer.render();
  };
  requestAnimationFrame(loop);

  return {
    renderer,
    ready: flyReady,
    setLoadProgress(p) { loadGain = p; },
    kickNeedle() { meter.kick(0.35); },
    stop() { stopped = true; },
    anchor(name) {
      tmp.copy(anchors[name]).project(camera);
      return { x: ((tmp.x + 1) / 2) * canvas.clientWidth, y: ((1 - tmp.y) / 2) * canvas.clientHeight, visible: tmp.z < 1 };
    },
    pick(x, y) {
      ndc.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      let best: { name: AnchorName; d: number } | null = null;
      for (const [name, objs] of pickSets()) {
        const hits = raycaster.intersectObjects(objs, true);
        if (hits.length && (!best || hits[0].distance < best.d)) best = { name, d: hits[0].distance };
      }
      // the fly sits inside the jar: prefer it when the ray also meets the fly just behind the glass
      if (best && best.name === 'jar' && fly) {
        const flyHits = raycaster.intersectObjects(fly.pickables, true);
        if (flyHits.length && flyHits[0].distance < best.d + 0.3) return 'fly';
      }
      return best ? best.name : null;
    },
    flySignals() { return { ...signals }; },
    renderStill(g, needle, cam) {
      if (cam) {
        camera.fov = cam.fov;
        camera.position.set(cam.x ?? CAMERA.x, cam.y, cam.z);
        camera.lookAt(cam.x ?? CAMERA.x, cam.lookY, 0);
        camera.updateProjectionMatrix();
      }
      setGain(g);
      meter.setValue(needle);
      for (let i = 0; i < 60; i++) meter.update(1 / 30);
      if (fly) for (let i = 0; i < 10; i++) fly.update({ motorHz: 2, dnp09Hz: 0, turn: 0, sensoryHz: 25, dt: 1 / 60 });
      resize();
      pass.uniforms.uTime.value = 0.37;
      composer.render();
    },
  };
}
