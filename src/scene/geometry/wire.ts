// Copper wire: from the jar terminal, down the side of the jar, straight along the bench to the
// bulb's plate, and a second lead that leaves the bench at the front (the scroll hint).
import * as THREE from 'three';
import { apparatusMaterial, ALBEDO, type PaletteColors } from '../materials.js';
import { BENCH_Y } from './bench.js';

export interface WireParts {
  group: THREE.Group;
  /** a point on the straight run, for the hotspot label */
  mid: THREE.Vector3;
}

function run(points: THREE.Vector3[], radius: number, mat: THREE.Material): THREE.Mesh {
  // straight runs between corners; corners rounded by a short catmull-rom blend
  const dense: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.02));
    for (let k = 0; k < n; k++) dense.push(a.clone().lerp(b, k / n));
  }
  dense.push(points[points.length - 1].clone());
  const curve = new THREE.CatmullRomCurve3(dense, false, 'centripetal', 0.3);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, dense.length * 2, radius, 8, false), mat);
}

export function buildWires(pal: PaletteColors, jarTerminal: THREE.Vector3, jarRadius: number, socketTerminal: THREE.Vector3, socketTerminal2: THREE.Vector3): WireParts {
  const g = new THREE.Group();
  const copper = apparatusMaterial(pal, { albedo: pal.copper.clone().multiplyScalar(1.05), bands: 4, grain: 0.1, specular: 0.55, wear: 0.3 });
  const y0 = BENCH_Y + 0.006;
  const a = jarTerminal;
  const sideX = a.x + jarRadius + 0.03 - 0.065; // just outside the glass
  const pts = [
    a.clone(),
    new THREE.Vector3(sideX, a.y, a.z),
    new THREE.Vector3(sideX + 0.02, a.y - 0.03, a.z + 0.02),
    new THREE.Vector3(sideX + 0.02, y0 + 0.03, a.z + 0.02),
    new THREE.Vector3(sideX + 0.05, y0, a.z + 0.05),
    new THREE.Vector3(socketTerminal.x - 0.06, y0, socketTerminal.z + 0.04),
    new THREE.Vector3(socketTerminal.x - 0.02, y0 + 0.01, socketTerminal.z + 0.02),
    socketTerminal.clone(),
  ];
  g.add(run(pts, 0.0045, copper));
  // porcelain knobs: the straight run is tied to the bench at two points, the front lead at one
  const porcelain = apparatusMaterial(pal, { albedo: ALBEDO.ceramic, bands: 4, specular: 0.5, grain: 0.04 });
  const brassNail = apparatusMaterial(pal, { albedo: pal.copper, bands: 4, specular: 0.7, wear: 0.4 });
  const knob = (p: THREE.Vector3, side: number) => {
    const k = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.004, 12), porcelain);
    base.position.y = 0.002;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.007, 12), porcelain);
    neck.position.y = 0.0075;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.004, 12), porcelain);
    cap.position.y = 0.013;
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.002, 8), brassNail);
    nail.position.y = 0.016;
    k.add(base, neck, cap, nail);
    // the knob sits beside the wire so the run lies in its groove
    k.position.set(p.x, BENCH_Y, p.z + side * 0.0125);
    return k;
  };
  const straight = [pts[4], pts[5]];
  for (const u of [0.32, 0.68]) g.add(knob(straight[0].clone().lerp(straight[1], u), 1));
  // second lead: from the far terminal to the front edge and down, out of the frame
  const b = socketTerminal2;
  const pts2 = [
    b.clone(),
    new THREE.Vector3(b.x + 0.03, y0, b.z + 0.06),
    new THREE.Vector3(b.x + 0.02, y0, b.z + 0.36),
    new THREE.Vector3(b.x + 0.0, y0 - 0.04, b.z + 0.4),
    new THREE.Vector3(b.x - 0.02, y0 - 0.6, b.z + 0.42),
  ];
  g.add(run(pts2, 0.0045, copper));
  g.add(knob(pts2[1].clone().lerp(pts2[2], 0.55), -1));
  // ferrules
  const brass = apparatusMaterial(pal, { albedo: pal.copper, bands: 5, specular: 0.7, wear: 0.5 });
  for (const p of [socketTerminal, b]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 8), brass);
    f.position.copy(p);
    g.add(f);
  }
  return { group: g, mid: new THREE.Vector3((sideX + socketTerminal.x) / 2, y0, a.z + 0.045) };
}
