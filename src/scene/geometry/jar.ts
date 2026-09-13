// The bell jar: a smooth glass dome on an octagonal brass base with bolts, a brass collar at
// the foot of the glass, and a brass cap with the wire terminal.
import * as THREE from 'three';
import { apparatusMaterial, glassMaterial, glassShellMaterial, type PaletteColors } from '../materials.js';
import { BENCH_Y } from './bench.js';

export const JAR = { x: -0.2, z: 0.0, radius: 0.15, height: 0.36, sides: 8 };

export function flatten(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export interface JarParts {
  group: THREE.Group;
  terminal: THREE.Vector3;
  floorY: number;
  /** the dome mesh, for picking */
  glass: THREE.Mesh;
}

export function buildJar(pal: PaletteColors): JarParts {
  const g = new THREE.Group();
  const brass = apparatusMaterial(pal, { albedo: pal.copper, bands: 5, specular: 0.7, wear: 0.5, grain: 0.07 });
  const darkBrass = apparatusMaterial(pal, { albedo: pal.copper.clone().multiplyScalar(0.55), bands: 4, specular: 0.5, wear: 0.4, grain: 0.09 });
  const { x, z, radius: r, height: h, sides } = JAR;
  const rot = Math.PI / sides;

  // base: octagonal plate, a thinner step, bolts
  const base = new THREE.Mesh(flatten(new THREE.CylinderGeometry(r + 0.035, r + 0.045, 0.03, sides)), darkBrass);
  base.rotation.y = rot;
  base.position.set(x, BENCH_Y + 0.015, z);
  g.add(base);
  const step = new THREE.Mesh(flatten(new THREE.CylinderGeometry(r + 0.012, r + 0.02, 0.014, sides)), brass);
  step.rotation.y = rot;
  step.position.set(x, BENCH_Y + 0.037, z);
  g.add(step);
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const bolt = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 6)), brass);
    bolt.position.set(x + Math.cos(a) * (r + 0.03), BENCH_Y + 0.034, z + Math.sin(a) * (r + 0.03));
    g.add(bolt);
  }
  const floorY = BENCH_Y + 0.044;

  // dome: straight wall, rounded shoulder, low crown
  const pts: THREE.Vector2[] = [new THREE.Vector2(r, 0)];
  for (let i = 1; i <= 6; i++) pts.push(new THREE.Vector2(r, (i / 6) * (h - r * 0.8)));
  for (let i = 1; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0005, r * Math.cos(a)), h - r * 0.8 + r * 0.8 * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(0, h));
  const domeGeo = new THREE.LatheGeometry(pts, 48);
  const dome = new THREE.Mesh(domeGeo, glassMaterial(pal));
  dome.position.set(x, floorY, z);
  g.add(dome);
  const shell = new THREE.Mesh(domeGeo, glassShellMaterial(pal));
  shell.position.set(x, floorY, z);
  shell.scale.setScalar(1.002);
  g.add(shell);

  // brass collar at the foot of the glass
  const collar = new THREE.Mesh(new THREE.TorusGeometry(r + 0.003, 0.006, 8, 48), brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(x, floorY + 0.004, z);
  g.add(collar);

  // cap: round block, fitting, terminal knob and the side terminal the wire leaves from
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.026, 32), brass);
  cap.position.set(x, floorY + h + 0.004, z);
  g.add(cap);
  const fitting = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.018, 0.022, 0.036, 6)), darkBrass);
  fitting.position.set(x, floorY + h + 0.035, z);
  g.add(fitting);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), brass);
  knob.position.set(x, floorY + h + 0.06, z);
  g.add(knob);
  const term = new THREE.Mesh(flatten(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6)), brass);
  term.rotation.z = Math.PI / 2;
  term.position.set(x + 0.04, floorY + h + 0.04, z);
  g.add(term);
  return { group: g, terminal: new THREE.Vector3(x + 0.065, floorY + h + 0.04, z), floorY, glass: dome };
}
