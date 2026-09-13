// One full-screen pass: grain, vignette, edge aberration. No bloom.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import frag from './shaders/post.frag.glsl?raw';

export const POST = { grain: 0.06, vignette: 0.35, aberration: 0.0015 };

export function makeComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uGrain: { value: POST.grain },
      uVignette: { value: POST.vignette },
      uAberration: { value: POST.aberration },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: frag,
  });
  composer.addPass(pass);
  return { composer, pass };
}
