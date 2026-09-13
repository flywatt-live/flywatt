// Baked shadow mask for the bench top. Rendered once at start-up, top-down, from the fixed
// bulb position, then sampled by the bench materials through uv1. No shadow maps at run time.
import * as THREE from 'three';
import { setShadowMask } from './materials.js';

export interface BakeArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

/** assign planar uv1 (world XZ inside the bake area) to a horizontal mesh */
export function planarUv1(mesh: THREE.Mesh, area: BakeArea) {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    uv[i * 2] = (v.x - area.minX) / (area.maxX - area.minX);
    uv[i * 2 + 1] = (v.z - area.minZ) / (area.maxZ - area.minZ);
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
}

/**
 * Render the shadows the occluders cast on the bench plane from a light at lightPos.
 * White = lit, black = shadow. Uses a temporary shadow-casting light for one frame only.
 */
export function bakeShadowMask(renderer: THREE.WebGLRenderer, occluders: THREE.Object3D[], lightPos: THREE.Vector3, area: BakeArea, size = 1024): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const light = new THREE.PointLight(0xffffff, 1, 0, 0);
  light.position.copy(lightPos);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0005;
  light.shadow.radius = 4;
  light.shadow.camera.near = 0.02;
  light.shadow.camera.far = 3;
  scene.add(light);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(area.maxX - area.minX, area.maxZ - area.minZ),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((area.minX + area.maxX) / 2, area.y, (area.minZ + area.maxZ) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  // occluders cast shadows but never draw: the top-down camera must see the ground under them
  const casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (const o of occluders) {
    const clone = o.clone(true);
    const drop: THREE.Object3D[] = [];
    clone.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const t = (m.material as THREE.Material).type;
      // glass and the filament surround the light itself; they must not cast
      if (t === 'MeshPhysicalMaterial' || t === 'MeshBasicMaterial') { drop.push(m); return; }
      m.material = casterMat;
      m.castShadow = true;
      m.receiveShadow = false;
    });
    for (const d of drop) d.removeFromParent();
    scene.add(clone);
  }
  const cam = new THREE.OrthographicCamera(-(area.maxX - area.minX) / 2, (area.maxX - area.minX) / 2, (area.maxZ - area.minZ) / 2, -(area.maxZ - area.minZ) / 2, 0.01, 2);
  cam.position.set((area.minX + area.maxX) / 2, area.y + 1, (area.minZ + area.maxZ) / 2);
  cam.up.set(0, 0, -1);
  cam.lookAt((area.minX + area.maxX) / 2, area.y, (area.minZ + area.maxZ) / 2);
  const target = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const prevShadow = renderer.shadowMap.enabled;
  const prevType = renderer.shadowMap.type;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  renderer.shadowMap.enabled = prevShadow;
  renderer.shadowMap.type = prevType;
  light.shadow.dispose();
  // the ortho camera looks down with up = -z, so v runs along +z: matches planarUv1
  target.texture.flipY = false;
  setShadowMask(target.texture);
  return target.texture;
}
