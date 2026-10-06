// ─── crt.glsl ────────────────────────────────────────────────────────────────
// Scanline + CRT vignette post-process fragment shader.
// ─────────────────────────────────────────────────────────────────────────────

uniform sampler2D tDiffuse;
uniform vec2      uResolution;   // internal render target size
uniform float     uScanStrength; // 0..1
uniform float     uVigStrength;  // 0..1
uniform float     uTime;

varying vec2 vUv;

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;

  // Scanlines — one dark line every 2 pixels in the internal buffer
  float line = mod(floor(vUv.y * uResolution.y), 2.0);
  col *= 1.0 - uScanStrength * 0.35 * (1.0 - line);

  // Vignette
  vec2  uv2  = vUv * (1.0 - vUv.yx);
  float vig  = uv2.x * uv2.y * 15.0;
  vig = clamp(pow(vig, 0.25), 0.0, 1.0);
  col = mix(col, col * vig, uVigStrength);

  gl_FragColor = vec4(col, 1.0);
}
