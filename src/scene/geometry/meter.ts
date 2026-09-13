// The meter: a brass-cased instrument on a wooden foot, enamel dial with the maker's name,
// a needle on a damped spring, four bezel screws.
import * as THREE from 'three';
import { apparatusMaterial, glassMaterial, ALBEDO, type PaletteColors } from '../materials.js';
import { getPalette, MONO, SERIF } from '../../panels/canvas.js';
import { BENCH_Y } from './bench.js';
import { flatten } from './jar.js';

export const METER = { x: 0.3, z: -0.04, w: 0.2, h: 0.15, d: 0.09, yaw: -0.55 };

export interface MeterParts {
  group: THREE.Group;
  needle: THREE.Group;
  setValue(v: number): void;
  kick(amount: number): void;
  update(dt: number): void;
  /** dial centre, for the hotspot label */
  face: THREE.Vector3;
}

function dialTexture(): THREE.CanvasTexture {
  const pal = getPalette();
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = pal.filament;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(26,21,18,0.22)';
  ctx.lineWidth = 36;
  ctx.strokeRect(18, 18, c.width - 36, c.height - 36);
  const cx = c.width / 2, cy = c.height * 0.98, R = c.height * 0.7;
  const a0 = Math.PI * 1.18, a1 = Math.PI * 1.82;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, R, a0, a1);
  ctx.stroke();
  for (let i = 0; i <= 40; i++) {
    const a = a0 + ((a1 - a0) * i) / 40;
    const major = i % 10 === 0, mid = i % 5 === 0;
    const len = major ? 40 : mid ? 26 : 13;
    ctx.lineWidth = major ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
    ctx.stroke();
    if (major) {
      ctx.font = `30px ${MONO}`;
      ctx.fillStyle = pal.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i / 10 * 10), cx + Math.cos(a) * (R - 72), cy + Math.sin(a) * (R - 72));
    }
  }
  ctx.font = `700 44px ${SERIF}`;
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WATT THE FLY', cx, c.height * 0.4);
  ctx.font = `26px ${MONO}`;
  ctx.fillText('µW', cx, c.height * 0.55);
  ctx.font = `20px ${MONO}`;
  ctx.fillStyle = 'rgba(8,7,10,0.7)';
  ctx.fillText('current draw', cx, c.height * 0.63);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildMeter(pal: PaletteColors): MeterParts {
  const g = new THREE.Group();
  const brass = apparatusMaterial(pal, { albedo: pal.copper, bands: 5, specular: 0.7, wear: 0.5, grain: 0.07 });
  const darkBrass = apparatusMaterial(pal, { albedo: pal.copper.clone().multiplyScalar(0.55), bands: 4, specular: 0.5, wear: 0.4, grain: 0.09 });
  const wood = apparatusMaterial(pal, { albedo: ALBEDO.woodEdge, bands: 4, grain: 0.14 });
  const { w, h, d } = METER;
  const y0 = BENCH_Y;
  // wooden foot
  const foot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.02, d + 0.05), wood);
  foot.position.set(0, y0 + 0.01, 0);
  g.add(foot);
  // case
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), darkBrass);
  body.position.set(0, y0 + 0.02 + h / 2, 0);
  g.add(body);
  // bezel frame around the face
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.014, h + 0.014, 0.012), brass);
  bezel.position.set(0, y0 + 0.02 + h / 2, d / 2);
  g.add(bezel);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const screw = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 6)), darkBrass);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(sx * (w / 2 - 0.006), y0 + 0.02 + h / 2 + sy * (h / 2 - 0.006), d / 2 + 0.008);
    g.add(screw);
  }
  // top knobs
  for (const dx of [-0.05, 0.05]) {
    const k = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6)), brass);
    k.position.set(dx, y0 + 0.02 + h + 0.006, -0.01);
    g.add(k);
  }
  // dial and its glass
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.024, h - 0.024), apparatusMaterial(pal, { albedo: pal.filament, map: dialTexture(), bands: 6, grain: 0.03, specular: 0.1 }));
  dial.position.set(0, y0 + 0.02 + h / 2, d / 2 + 0.0065);
  g.add(dial);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), glassMaterial(pal));
  glass.position.set(0, y0 + 0.02 + h / 2, d / 2 + 0.013);
  g.add(glass);
  // needle
  const needle = new THREE.Group();
  const nl = h * 0.78;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.0024, nl, 0.0008), apparatusMaterial(pal, { albedo: pal.fault, bands: 2 }));
  blade.position.y = nl / 2;
  needle.add(blade);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.003, 12), brass);
  hub.rotation.x = Math.PI / 2;
  needle.add(hub);
  needle.position.set(0, y0 + 0.02 + 0.014, d / 2 + 0.01);
  g.add(needle);
  g.position.set(METER.x, 0, METER.z);
  g.rotation.y = -METER.yaw;

  let target = 0, value = 0, vel = 0, kick = 0;
  const A0 = Math.PI * 0.32, A1 = -Math.PI * 0.32;
  return {
    group: g,
    needle,
    face: new THREE.Vector3(METER.x, y0 + 0.02 + h / 2, METER.z + d / 2),
    setValue(v) { target = Math.max(0, Math.min(1, v)); },
    kick(amount) { kick += amount; },
    update(dt) {
      const k = 60, c = 2 * Math.sqrt(k);
      const goal = Math.min(1, target + kick);
      const acc = k * (goal - value) - c * vel;
      vel += acc * dt;
      value += vel * dt;
      kick *= Math.exp(-dt * 6);
      needle.rotation.z = A0 + (A1 - A0) * value;
    },
  };
}
