// @ts-check

import { TwoPointTool } from './two-point-tool.js';


class SmudgeTool extends TwoPointTool {
  /**
   * 
   * @param {HTMLCanvasElement!} canvas 
   */
  constructor(canvas) {
    super(canvas,
      `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform vec2 u_start;
  uniform vec2 u_end;

  // Helper to project a point 'p' onto a line segment from 'a' to 'b'
  vec2 projectToLine(vec2 p, vec2 a, vec2 b) {
      vec2 ap = p - a;
      vec2 ab = b - a;
      float ab2 = dot(ab, ab);
      // Handle division by zero for a zero-length drag
      if (ab2 == 0.0) {
          return a;
      }
      float t = dot(ap, ab) / ab2;
      // Clamp t to be within the line segment
      t = clamp(t, 0.0, 1.0);
      return a + ab * t;
  }

  void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 start = u_start;
      vec2 end = u_end;

      // Checkerboard UV
      vec2 checker_uv = p / u_resolution.xy;

      // If no drag, just draw the checkerboard
      if (distance(start, end) < 1.0) {
          float check_color = step(0.5, mod(floor(checker_uv.x * 16.0) + floor(checker_uv.y * 16.0), 2.0));
          gl_FragColor = vec4(vec3(check_color), 1.0);
          return;
      }

      // --- Smudge Logic ---
      
      // 1. Find the point on the line segment closest to the current fragment
      vec2 closest_point_on_line = projectToLine(p, start, end);
      
      // 2. Calculate the distance from the fragment to the center line of the "pill"
      float dist_from_line = distance(p, closest_point_on_line);

      float dist_from_end = distance(p, end);
      
      // Cacluate the smudge vector.
      vec2 smudge_vec = end - start;

      // 4. Define pill radii based on drag length
      float drag_len = length(smudge_vec);
      float inner_radius = drag_len * 0.5;
      float outer_radius = drag_len * 1.5;

      if (dist_from_line > outer_radius) {
        smudge_vec = vec2(0.0, 0.0);
      } else if (dist_from_end > inner_radius) {
        // gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        // return;
        float dist_from_outer_pill = outer_radius - dist_from_line;
        float dist_from_inner_circle = dist_from_end - inner_radius;
        float falloff = dist_from_outer_pill / (dist_from_outer_pill + dist_from_inner_circle);
        smudge_vec *= smoothstep(0.0, 1.0, falloff);
      } else {
        // Use the whole smudge amount.
      }

      // 6. Calculate the source pixel position on the original image
      vec2 displaced_pos = p - smudge_vec;
      vec2 final_uv = displaced_pos / u_resolution.xy;

      // 7. Draw the checkerboard from the new UV
      float check_color = step(0.5, mod(floor(final_uv.x * 16.0) + floor(final_uv.y * 16.0), 2.0));
      gl_FragColor = vec4(vec3(check_color), 1.0);
  }
            `);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  /** @type {HTMLElement | null} */
  const maybeCanvas = document.getElementById('smudgeCanvas');
  if (!maybeCanvas) {
    alert('Canvas element not found.');
    return;
  }
  const canvas = /** @type {HTMLCanvasElement!} */ (maybeCanvas);
  canvas.width = 1024;
  canvas.height = canvas.width;

  new SmudgeTool(canvas);
});