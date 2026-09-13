// The bulb: a faceted glass envelope over a brass socket on an octagonal plate with bolts.
// The filament coil inside is the light.
import * as THREE from 'three';
import { apparatusMaterial, glassMaterial, glassShellMaterial, filamentMaterial, ALBEDO, type PaletteColors } from '../materials.js';
import { BENCH_Y } from './bench.js';
import { flatten } from './jar.js';

export const BULB = { x: 0.74, z: -0.02 };

export interface BulbParts {
  group: THREE.Group;
  filament: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  filamentPos: THREE.Vector3;
  terminal: THREE.Vector3;
  terminal2: THREE.Vector3;
  top: THREE.Vector3;
}

export function buildBulb(pal: PaletteColors): BulbParts {
  const g = new THREE.Group();
  const brass = apparatusMaterial(pal, { albedo: pal.copper, bands: 5, specular: 0.7, wear: 0.5, grain: 0.07 });
  const darkBrass = apparatusMaterial(pal, { albedo: pal.copper.clone().multiplyScalar(0.55), bands: 4, specular: 0.5, wear: 0.4, grain: 0.09 });
  const ceramic = apparatusMaterial(pal, { albedo: ALBEDO.ceramic, bands: 5, grain: 0.08, specular: 0.15 });
  const { x, z } = BULB;
  const sides = 8;
  const rot = Math.PI / sides;

  // plate with bolts
  const plate = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.085, 0.095, 0.024, sides)), darkBrass);
  plate.rotation.y = rot;
  plate.position.set(x, BENCH_Y + 0.012, z);
  g.add(plate);
  for (let i = 0; i < sides; i += 2) {
    const a = rot + (i / sides) * Math.PI * 2;
    const bolt = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 6)), brass);
    bolt.position.set(x + Math.cos(a) * 0.075, BENCH_Y + 0.028, z + Math.sin(a) * 0.075);
    g.add(bolt);
  }
  // socket: stacked octagonal blocks, a grooved collar, a ceramic ring
  let y = BENCH_Y + 0.024;
  const stack: [number, number, THREE.Material][] = [
    [0.05, 0.03, brass],
    [0.042, 0.02, darkBrass],
    [0.046, 0.012, brass],
    [0.04, 0.02, darkBrass],
    [0.046, 0.012, brass],
    [0.036, 0.024, darkBrass],
  ];
  for (const [rr, hh, m] of stack) {
    const s = new THREE.Mesh(flatten(new THREE.CylinderGeometry(rr, rr, hh, sides)), m);
    s.rotation.y = rot;
    s.position.set(x, y + hh / 2, z);
    g.add(s);
    y += hh;
  }
  const ring = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.03, 0.032, 0.012, sides)), ceramic);
  ring.rotation.y = rot;
  ring.position.set(x, y + 0.006, z);
  g.add(ring);
  y += 0.012;

  // envelope: faceted pear, ten sides, flat shaded
  const ep: THREE.Vector2[] = [];
  const neck = 0.026, belly = 0.075, total = 0.2;
  ep.push(new THREE.Vector2(neck, 0));
  const N = 9;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const swell = Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.5);
    const close = t < 0.8 ? 1 : Math.cos(((t - 0.8) / 0.2) * (Math.PI / 2));
    ep.push(new THREE.Vector2(Math.max(0.0005, neck + (belly - neck) * swell * close), t * total));
  }
  ep.push(new THREE.Vector2(0, total));
  const envGeo = flatten(new THREE.LatheGeometry(ep, 10));
  const env = new THREE.Mesh(envGeo, glassMaterial(pal));
  env.position.set(x, y, z);
  g.add(env);
  const envShell = new THREE.Mesh(envGeo, glassShellMaterial(pal));
  envShell.position.set(x, y, z);
  envShell.scale.setScalar(1.004);
  g.add(envShell);

  // stem, supports, filament coil
  const stem = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.005, 0.008, 0.06, 6)), ceramic);
  stem.position.set(x, y + 0.03, z);
  g.add(stem);
  const supportMat = apparatusMaterial(pal, { albedo: pal.steel, bands: 3, specular: 0.4 });
  for (const dx of [-0.016, 0.016]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.06, 6), supportMat);
    s.position.set(x + dx, y + 0.085, z);
    g.add(s);
  }
  const fy = y + 0.115;
  const turns = 8;
  const coilPts: THREE.Vector3[] = [];
  for (let i = 0; i <= turns * 12; i++) {
    const t = i / (turns * 12);
    const a = t * turns * Math.PI * 2;
    coilPts.push(new THREE.Vector3(x - 0.016 + t * 0.032, fy + Math.sin(a) * 0.006, z + Math.cos(a) * 0.006));
  }
  const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), turns * 24, 0.0012, 6, false);
  const filament = new THREE.Mesh(coil, filamentMaterial(pal));
  g.add(filament);
  return {
    group: g,
    filament,
    filamentPos: new THREE.Vector3(x, fy, z),
    terminal: new THREE.Vector3(x - 0.08, BENCH_Y + 0.03, z + 0.03),
    terminal2: new THREE.Vector3(x + 0.08, BENCH_Y + 0.03, z + 0.04),
    top: new THREE.Vector3(x, y + total, z),
  };
}
