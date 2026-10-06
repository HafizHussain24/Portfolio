// ─── beam.frag.glsl ──────────────────────────────────────────────────────────
// Fragment shader for volumetric beam cones (additive blend).
// ─────────────────────────────────────────────────────────────────────────────

uniform vec3  uColor;       // beam tint (accent color)
uniform float uIntensity;   // 0..1, brightened on hover
uniform float uTime;

varying float vHeight;

void main() {
  // Fade: full alpha at base, transparent at tip
  float alpha = (1.0 - vHeight) * uIntensity;

  // Subtle animated pulse
  alpha *= 0.85 + 0.15 * sin(uTime * 2.0 + vHeight * 6.28);

  gl_FragColor = vec4(uColor * alpha, alpha * 0.55);
}
