// ─── beam shaders ─────────────────────────────────────────────────────────────
// Additive-blended volumetric light-beam cone shaders for the Rooftop nav beams.
// ─────────────────────────────────────────────────────────────────────────────

// VERTEX ──────────────────────────────────────────────────────────────────────
// beam.vert.glsl
varying float vHeight;    // 0 at base, 1 at tip of cone

void main() {
  // position.y is normalised 0..1 along the cone height in model space
  vHeight = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
