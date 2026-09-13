// The specimen tag: a paper label propped against the jar base, written in the readout face.
// Its lines come from meta.json once the dataset is loaded; nothing on it is typed by hand.
import * as THREE from 'three';
import { apparatusMaterial, ALBEDO, type PaletteColors } from '../materials.js';
import { getPalette, MONO, SERIF } from '../../panels/canvas.js';
import { BENCH_Y } from './bench.js';

export interface TagParts {
  group: THREE.Group;
  /** write the label; the first line is set in the serif, the rest in the mono face */
  write(lines: string[]): void;
}

const W = 0.11, H = 0.07;

function tagTexture(lines: string[]): THREE.CanvasTexture {
  const pal = getPalette();
  const c = document.createElement('canvas');
  c.width = 880;
  c.height = 560;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = pal.filament;
  ctx.fillRect(0, 0, c.width, c.height);
  // a ruled edge, a punched hole with its brass eyelet, and the lines
  ctx.strokeStyle = 'rgba(26,21,18,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, c.width - 28, c.height - 28);
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.arc(52, 52, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = pal.copper;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = 124;
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? `700 46px ${SERIF}` : `34px ${MONO}`;
    ctx.fillStyle = i === 0 ? pal.ink : 'rgba(8,7,10,0.8)';
    ctx.fillText(line, 96, y);
    y += i === 0 ? 70 : 56;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildTag(pal: PaletteColors, x: number, z: number, yaw: number): TagParts {
  const group = new THREE.Group();
  const mat = apparatusMaterial(pal, { albedo: pal.filament.clone().multiplyScalar(0.9), bands: 5, grain: 0.05, specular: 0.05, side: THREE.DoubleSide });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  // leaning back against the base, a little off square, the way a tag lands
  paper.position.set(0, H / 2, 0);
  paper.rotation.x = -0.28;
  paper.rotation.z = 0.02;
  group.add(paper);
  // cardboard behind the paper, so it has an edge
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), apparatusMaterial(pal, { albedo: ALBEDO.woodEdge, bands: 3, side: THREE.DoubleSide }));
  back.position.copy(paper.position).add(new THREE.Vector3(0, -0.0005, -0.0012));
  back.rotation.copy(paper.rotation);
  group.add(back);
  group.position.set(x, BENCH_Y, z);
  group.rotation.y = yaw;
  return {
    group,
    write(lines) {
      const u = (mat as THREE.ShaderMaterial).uniforms;
      u.uMap.value = tagTexture(lines);
      u.uUseMap.value = 1;
    },
  };
}
