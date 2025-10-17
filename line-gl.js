// @ts-check

import { ShaderTool } from './shader-tool.js';

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {ShaderTool}
 */
export function createLineTool(gl) {
  const fragmentShaderSource = `#version 300 es

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
    vec2 uv = p / u_resolution.xy;

    // If no drag, just draw the texture
    if (distance(u_start, u_end) < 1.0) {
        fragColor = texture(u_texture, uv);
        return;
    }

    vec2 closest_point_on_line = projectToLine(p, u_start, u_end);
    float dist_from_line = distance(p, closest_point_on_line);

    float line_width = 3.0;
    float blend_size = 1.0;
    float alpha = 1.0 - smoothstep(line_width - blend_size, line_width + blend_size, dist_from_line);
    fragColor = mix(texture(u_texture, uv), vec4(0.0, 0.0, 0.0, 1.0), alpha);
}
    `;
  return new ShaderTool(gl, fragmentShaderSource);
}