// ─── dither.glsl ─────────────────────────────────────────────────────────────
// Ordered (Bayer 4×4) dithering + colour quantization post-process fragment shader.
// Used as a Three.js ShaderMaterial in the post-process pass.
// ─────────────────────────────────────────────────────────────────────────────

uniform sampler2D tDiffuse;
uniform vec2      uResolution;
uniform float     uStrength;    // 0..1  dither intensity
uniform float     uPalette;     // steps per channel (e.g. 8.0)

varying vec2 vUv;

// Bayer 4×4 matrix, normalised to [0,1)
float bayerMatrix(ivec2 p) {
  const int bayer[16] = int[16](
     0,  8,  2, 10,
    12,  4, 14,  6,
     3, 11,  1,  9,
    15,  7, 13,  5
  );
  return float(bayer[(p.y & 3) * 4 + (p.x & 3)]) / 16.0;
}

vec3 quantize(vec3 col, float steps) {
  return floor(col * steps + 0.5) / steps;
}

void main() {
  vec3 color = texture2D(tDiffuse, vUv).rgb;

  // Ordered dither
  ivec2 px    = ivec2(gl_FragCoord.xy);
  float threshold = bayerMatrix(px) - 0.5; // [-0.5, 0.5)
  color += threshold * uStrength * (1.0 / uPalette);

  // Quantize
  color = quantize(color, uPalette);

  gl_FragColor = vec4(color, 1.0);
}
