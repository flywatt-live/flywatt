// The bench: dark wooden planks with worn edges, and a wall far back in the dark.
import * as THREE from 'three';
import { apparatusMaterial, ALBEDO, type PaletteColors } from '../materials.js';

/** bench top height for other builders */
export const BENCH_Y = 0.0;

export function buildBench(pal: PaletteColors): THREE.Group {
  const g = new THREE.Group();
  const planks = 7;
  const depth = 1.6, width = 3.2;
  const pw = depth / planks;
  for (let i = 0; i < planks; i++) {
    // each plank a little different: height, tone, gap
    const tone = 0.8 + ((i * 37) % 7) * 0.06;
    const mat = apparatusMaterial(pal, { albedo: ALBEDO.wood.clone().multiplyScalar(tone), bands: 5, grain: 0.16, specular: 0.12, shadow: true });
    const h = 0.04;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(width, h, pw - 0.016), mat);
    const yJitter = (((i * 53) % 5) - 2) * 0.0008;
    plank.position.set(0.2, BENCH_Y - h / 2 + yJitter, 0.35 - (i + 0.5) * pw);
    plank.userData.bake = true;
    g.add(plank);
  }
  // front edge board
  const edge = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.02), apparatusMaterial(pal, { albedo: ALBEDO.woodEdge, bands: 4, grain: 0.14 }));
  edge.position.set(0.2, BENCH_Y - 0.03, 0.36);
  g.add(edge);
  // back wall: far and dark, only the bulb's halo reaches it
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), apparatusMaterial(pal, { albedo: ALBEDO.wall, bands: 6, grain: 0.14 }));
  wall.position.set(0.2, 1.2, -1.25);
  g.add(wall);
  return g;
}
