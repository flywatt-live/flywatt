// Materials: one posterised shader for the bench, glass only on the jar and bulb.
import * as THREE from 'three';
import vert from './shaders/apparatus.vert.glsl?raw';
import frag from './shaders/apparatus.frag.glsl?raw';
import { getPalette } from '../panels/canvas.js';

export interface PaletteColors {
  ink: THREE.Color;
  bench: THREE.Color;
  filament: THREE.Color;
  copper: THREE.Color;
  patina: THREE.Color;
  steel: THREE.Color;
  fault: THREE.Color;
}

/** a colour given directly in linear space, for albedos that must render visibly under one bulb */
export const linear = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

/** albedos of the bench materials; the palette colours are what they look like once lit */
export const ALBEDO = {
  wood: linear(0.14, 0.086, 0.052),
  woodEdge: linear(0.08, 0.048, 0.03),
  wall: linear(0.014, 0.011, 0.009),
  marble: linear(0.22, 0.2, 0.17),
  ceramic: linear(0.4, 0.36, 0.3),
  meterCase: linear(0.05, 0.035, 0.028),
  flyBody: linear(0.13, 0.095, 0.062),
  flyLeg: linear(0.07, 0.055, 0.045),
};

export function paletteColors(): PaletteColors {
  const p = getPalette();
  const c = (h: string) => new THREE.Color(h).convertSRGBToLinear();
  return { ink: c(p.ink), bench: c(p.bench), filament: c(p.filament), copper: c(p.copper), patina: c(p.patina), steel: c(p.steel), fault: c(p.fault) };
}

/** Shared uniforms so one number drives every material. */
export const shared = {
  uLightPos: { value: new THREE.Vector3() },
  uLightIntensity: { value: 0.08 },
  uShadow: { value: null as THREE.Texture | null },
};

/** materials that sample the baked shadow mask once it exists */
const shadowReceivers: THREE.ShaderMaterial[] = [];
export function setShadowMask(tex: THREE.Texture) {
  shared.uShadow.value = tex;
  for (const m of shadowReceivers) m.uniforms.uUseShadow.value = 1;
}

export interface ApparatusMaterialOptions {
  albedo: THREE.Color;
  specular?: number;
  bands?: number;
  alpha?: number;
  grain?: number;
  shadow?: boolean;
  wear?: number;
  side?: THREE.Side;
  map?: THREE.Texture;
}

export function apparatusMaterial(pal: PaletteColors, o: ApparatusMaterialOptions): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uLightPos: shared.uLightPos,
      uLightIntensity: shared.uLightIntensity,
      uShadow: shared.uShadow,
      uAlbedo: { value: o.albedo },
      uInk: { value: pal.ink },
      uHighlight: { value: pal.filament },
      uSpecular: { value: o.specular ?? 0 },
      uBands: { value: o.bands ?? 4 },
      uAlpha: { value: o.alpha ?? 1 },
      uGrain: { value: o.grain ?? 0.05 },
      uUseShadow: { value: o.shadow && shared.uShadow.value ? 1 : 0 },
      uWear: { value: o.wear ?? 0 },
      uMap: { value: o.map ?? null },
      uUseMap: { value: o.map ? 1 : 0 },
    },
    transparent: (o.alpha ?? 1) < 1,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.shadow) shadowReceivers.push(m);
  return m;
}

export function glassMaterial(pal: PaletteColors): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    transmission: 0.97,
    roughness: 0.03,
    metalness: 0,
    ior: 1.5,
    thickness: 0.01,
    specularIntensity: 0.6,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** a faint shaded shell drawn over glass so its facets and edges read in the dark */
export function glassShellMaterial(pal: PaletteColors): THREE.ShaderMaterial {
  const m = apparatusMaterial(pal, { albedo: pal.filament.clone().multiplyScalar(0.5), bands: 3, alpha: 0.12, specular: 1.0, grain: 0.02, side: THREE.FrontSide });
  m.depthWrite = false;
  m.blending = THREE.AdditiveBlending; // only lit facets add a sheen; unlit glass stays invisible
  return m;
}

export function filamentMaterial(pal: PaletteColors): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: pal.filament.clone(), toneMapped: false });
}
