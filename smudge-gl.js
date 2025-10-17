// @ts-check

import { ShaderTool } from './shader-tool.js';

class SmudgeSource {
  static fragmentShaderSource = `#version 300 es

precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_start;
uniform vec2 u_end;

out vec4 fragColor;

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

    // If no drag, just draw the texture
    if (distance(start, end) < 1.0) {
        vec2 uv = p / u_resolution.xy;
        fragColor = texture(u_texture, uv);
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

    // 7. Sample the texture from the new UV
    fragColor = texture(u_texture, final_uv);
}
`
}

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {ShaderTool}
 */
export function createSmudgeTool(gl) {
  return new ShaderTool(gl, SmudgeSource.fragmentShaderSource);
}

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {ShaderTool}
 */
export function createDoubleSmudgeTool(gl) {
  return new ShaderTool(gl, [SmudgeSource.fragmentShaderSource, SmudgeSource.fragmentShaderSource]);
}
