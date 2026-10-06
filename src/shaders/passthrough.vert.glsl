// ─── passthrough.vert.glsl ───────────────────────────────────────────────────
// Full-screen quad vertex shader used by all post-process passes.
// ─────────────────────────────────────────────────────────────────────────────

varying vec2 vUv;

void main() {
  vUv         = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
