// One shader for every opaque object on the bench. World-space lighting from the bulb.
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
varying vec2 vUv2;
attribute vec2 uv1;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vUv2 = uv1;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
