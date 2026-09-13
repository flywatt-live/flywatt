// Posterised lighting from a single point light (the filament). Palette-locked output:
// every pixel is a mix between ink and the object's albedo, plus one stepped highlight.
precision highp float;

uniform vec3 uLightPos;
uniform float uLightIntensity; // 0..1 from the simulation
uniform vec3 uAlbedo;
uniform vec3 uInk;
uniform vec3 uHighlight;
uniform float uSpecular;       // 0 for matte, up to 1 for brass
uniform float uBands;          // number of light bands
uniform float uAlpha;
uniform float uGrain;          // surface grain amount
uniform sampler2D uShadow;     // baked shadow mask (uv2), white = lit
uniform float uUseShadow;
uniform float uWear;           // edge wear amount for metal
uniform sampler2D uMap;        // optional printed surface (the meter dial)
uniform float uUseMap;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
varying vec2 vUv2;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 toL = uLightPos - vWorldPos;
  float d = length(toL);
  vec3 l = toL / max(d, 1e-4);
  float ndl = max(dot(n, l), 0.0);
  // inverse square with a soft knee so the bench near the bulb does not blow out
  float att = 1.0 / (1.0 + 0.9 * d * d);
  float shadow = 1.0;
  if (uUseShadow > 0.5) shadow = texture2D(uShadow, vUv2).r;
  // gain 0.08..1 from the simulation maps to a perceptual intensity curve; the floor keeps the room visible
  float intensity = 0.38 + 0.62 * uLightIntensity;
  float light = ndl * att * shadow * intensity * 4.2;
  // quantise into bands, keep a little of the continuous value so gradients read as facets, not stripes
  float q = floor(light * uBands) / uBands;
  float lit = mix(q, clamp(light, 0.0, 1.0), 0.15);
  // fine grain, fixed to the surface, so flat facets have tooth
  float g = (hash(vUv * 512.0 + floor(vWorldPos.xz * 40.0)) - 0.5) * uGrain;
  lit = clamp(lit + g * (0.3 + lit), 0.0, 1.0);
  vec3 albedo = uAlbedo;
  if (uUseMap > 0.5) {
    vec3 t = texture2D(uMap, vUv).rgb;
    albedo = pow(t, vec3(2.2));
  }
  vec3 col = mix(uInk, albedo, lit);
  // one stepped highlight for metal and glass rims
  vec3 v = normalize(cameraPosition - vWorldPos);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 48.0) * att * intensity * uSpecular;
  spec = step(0.18, spec) * 0.55 + step(0.5, spec) * 0.45;
  col = mix(col, uHighlight, spec * uSpecular);
  // edge wear on metal: normals facing the camera get slightly lighter
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * uWear * intensity;
  col = mix(col, albedo, rim * 0.4);
  gl_FragColor = vec4(col, uAlpha);
}
