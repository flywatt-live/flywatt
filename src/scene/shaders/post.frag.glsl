// Post chain in one pass: film grain 0.06, vignette 0.35, chromatic aberration 0.0015 at the edges.
precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec2 uResolution;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;

varying vec2 vUv;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r = length(c) * 1.4142;
  // aberration only near the edges
  float ab = uAberration * smoothstep(0.5, 1.0, r);
  vec2 dir = normalize(c + 1e-5);
  float cr = texture2D(tDiffuse, uv + dir * ab).r;
  float cg = texture2D(tDiffuse, uv).g;
  float cb = texture2D(tDiffuse, uv - dir * ab).b;
  vec3 col = vec3(cr, cg, cb);
  // grain: per pixel, per frame
  float g = hash(gl_FragCoord.xy + fract(uTime) * 1000.0) - 0.5;
  // grain rides on the light: black stays black
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col += g * uGrain * (0.25 + 1.5 * luma);
  // vignette
  float v = 1.0 - uVignette * smoothstep(0.35, 1.05, r);
  col *= v;
  gl_FragColor = vec4(col, 1.0);
}
