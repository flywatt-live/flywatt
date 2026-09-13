// Four thin signal leads from the fly's head up to the jar's cap fitting, as if the
// connectome were tapped there. Drawn as lines so they can follow the head every frame.
import * as THREE from 'three';
import type { PaletteColors } from '../materials.js';

export interface Leads {
  group: THREE.Group;
  /** re-route the leads between a head point and the cap point (world space) */
  update(head: THREE.Vector3, cap: THREE.Vector3, t: number): void;
}

const N = 14;

export function buildLeads(pal: PaletteColors): Leads {
  const group = new THREE.Group();
  const colors = [pal.copper, pal.patina, pal.steel, pal.filament.clone().multiplyScalar(0.7)];
  const lines = colors.map((c, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85 - i * 0.1 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    group.add(line);
    return line;
  });
  const p = new THREE.Vector3();
  return {
    group,
    update(head, cap, t) {
      lines.forEach((line, i) => {
        const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        // each lead leaves the head from a slightly different spot and sags on its own
        const ox = (i - 1.5) * 0.006, oz = ((i % 2) - 0.5) * 0.008;
        for (let k = 0; k < N; k++) {
          const u = k / (N - 1);
          p.lerpVectors(head, cap, u);
          // bow outward then straighten into the fitting; a small slow sway
          const bow = Math.sin(u * Math.PI);
          p.x += ox + bow * (0.012 + i * 0.004) * Math.cos(i + t * 0.6);
          p.z += oz + bow * (0.012 + i * 0.004) * Math.sin(i * 1.7 + t * 0.5);
          p.y -= bow * 0.01;
          pos.setXYZ(k, p.x, p.y, p.z);
        }
        pos.needsUpdate = true;
      });
    },
  };
}
