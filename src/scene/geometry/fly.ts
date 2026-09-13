// The fly: a CC-BY low-poly mesh (Fly by Poly by Google, via Poly Pizza) repainted with the
// scene shader, wings split off and hinged, eyes lit by the photoreceptor rate. It stands on
// the jar floor. Every motion reads from the simulation: wing beat from the wing motor
// neurons, startle from DNp09, heading from the descending asymmetry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { apparatusMaterial, ALBEDO, type PaletteColors } from '../materials.js';
import * as P from '../../sim/params.js';

export interface FlySignals {
  motorHz: number;
  dnp09Hz: number;
  /** left minus right descending rate, normalised -1..1 */
  turn: number;
  /** photoreceptor mean rate, Hz */
  sensoryHz: number;
  dt: number;
}

export interface FlyParts {
  group: THREE.Group;
  update(s: FlySignals): void;
  /** meshes to raycast against */
  pickables: THREE.Object3D[];
  /** world position of the top of the head */
  headWorld(out: THREE.Vector3): THREE.Vector3;
}

/** split a primitive's triangles by centroid x sign into two geometries */
function splitByX(geo: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const left: number[] = [], right: number[] = [], ln: number[] = [], rn: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const target = cx < 0 ? left : right;
    const tn = cx < 0 ? ln : rn;
    for (let k = 0; k < 3; k++) {
      target.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      if (nor) tn.push(nor.getX(t + k), nor.getY(t + k), nor.getZ(t + k));
    }
  }
  const mk = (p: number[], n: number[]) => {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    if (n.length) b.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    else b.computeVertexNormals();
    return b;
  };
  return [mk(left, ln), mk(right, rn)];
}

/** model units to metres: the body is about 145 units long and stands 26 units below the origin */
const SCALE = 0.00105;
const FOOT = 25.8 * SCALE;

export async function buildFly(pal: PaletteColors, url: string): Promise<FlyParts> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const bodyMat = apparatusMaterial(pal, { albedo: ALBEDO.flyBody, bands: 4, grain: 0.08, specular: 0.35, wear: 0.25 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: pal.fault.clone(), toneMapped: false });
  const legMat = apparatusMaterial(pal, { albedo: ALBEDO.flyLeg, bands: 3, grain: 0.05 });
  const wingMat = apparatusMaterial(pal, { albedo: pal.filament.clone().multiplyScalar(0.5), bands: 3, alpha: 0.26, side: THREE.DoubleSide, specular: 0.3 });
  const wings: THREE.Object3D[] = [];
  const pickables: THREE.Object3D[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = (m.material as THREE.Material).name.toLowerCase();
    if (name.includes('white')) {
      const [l, r] = splitByX(m.geometry);
      for (const [geo, sign] of [[l, -1], [r, 1]] as const) {
        const pivot = new THREE.Group();
        pivot.position.set(sign * 3, 34, -6);
        geo.translate(-sign * 3, -34, 6);
        const mesh = new THREE.Mesh(geo, wingMat);
        pivot.add(mesh);
        body.add(pivot);
        wings.push(pivot);
        pickables.push(mesh);
      }
      return;
    }
    const mat = name.includes('orange') ? eyeMat : name.includes('black') ? legMat : bodyMat;
    const mesh = new THREE.Mesh(m.geometry, mat);
    body.add(mesh);
    pickables.push(mesh);
  });
  body.scale.setScalar(SCALE);
  body.position.y = FOOT;
  const baseYaw = -0.45; // three-quarter view, head toward the camera's left
  body.rotation.y = baseYaw;

  let flapPhase = 0, dnMean = 0, startle = 0, yaw = 0, lift = 0, glow = 0;
  const headLocal = new THREE.Vector3(0, 48, 48); // model units: crown of the head
  const api: FlyParts = {
    group,
    pickables,
    headWorld(out) {
      return out.copy(headLocal).applyMatrix4(body.matrixWorld);
    },
    update(s) {
      const dt = Math.min(0.05, s.dt);
      flapPhase += 2 * Math.PI * P.FLAP_HZ_PER_MOTOR_HZ * s.motorHz * dt;
      const flap = Math.sin(flapPhase);
      wings[0].rotation.z = flap * 0.9 + 0.3;
      wings[1].rotation.z = -flap * 0.9 - 0.3;
      wings[0].rotation.x = flap * 0.15;
      wings[1].rotation.x = flap * 0.15;
      dnMean += (s.dnp09Hz - dnMean) * Math.min(1, dt / 4);
      if (s.dnp09Hz > P.STARTLE_FACTOR * Math.max(0.5, dnMean) && startle <= 0) startle = 0.3;
      if (startle > 0) startle -= dt;
      const jump = startle > 0 ? Math.sin((startle / 0.3) * Math.PI) : 0;
      lift += (jump * 0.03 - lift) * Math.min(1, dt * 20);
      yaw += (s.turn * 0.4 - yaw) * Math.min(1, dt * 2);
      body.rotation.y = baseYaw + yaw;
      body.position.y = FOOT + lift;
      body.rotation.x = jump * -0.2;
      // compound eyes glow with the photoreceptor rate (0..40 Hz)
      const g = Math.min(1, s.sensoryHz / 40);
      glow += (g - glow) * Math.min(1, dt * 4);
      // compound eyes: dark red at rest, warming toward the filament colour as the photoreceptors fire
      eyeMat.color.copy(pal.fault).lerp(pal.filament, glow * 0.45).multiplyScalar(0.35 + glow * 1.1);
    },
  };
  return api;
}
