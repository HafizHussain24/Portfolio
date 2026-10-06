// ─── vertexSnap.vert ─────────────────────────────────────────────────────────
// PS1-style vertex snapping + sub-pixel wobble vertex shader.
// Snap positions to a low-resolution grid in clip space, simulating
// the PS1 fixed-point rasteriser. Toggleable: set uSnap = 0.0 to disable.
// ─────────────────────────────────────────────────────────────────────────────

uniform float uSnap;      // grid size in clip-space pixels (e.g. 1.0 / 240.0)
uniform float uWobble;    // wobble amplitude (e.g. 0.002). 0 = off.
uniform float uTime;

void main() {
  vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

  if (uSnap > 0.0) {
    // Snap to grid in homogeneous clip space
    vec2 snapped = floor(pos.xy / pos.w / uSnap + 0.5) * uSnap * pos.w;
    pos.xy = snapped;
  }

  if (uWobble > 0.0) {
    // Tiny sinusoidal wobble to fake affine-texture drift
    pos.x += sin(uTime * 0.7 + position.y * 3.14) * uWobble;
    pos.y += cos(uTime * 0.5 + position.x * 2.71) * uWobble;
  }

  gl_Position = pos;
}
