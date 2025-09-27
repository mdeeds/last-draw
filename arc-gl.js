// @ts-check

import { TwoPointTool } from './two-point-tool.js';

export class ArcTool extends TwoPointTool {
  /**
   * 
   * @param {HTMLCanvasElement!} canvas 
   */
  constructor(canvas) {
    const fragmentShaderSource = `#version 300 es

precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_start;
uniform vec2 u_end;

out vec4 fragColor;

// Helper function to create the mat4 from four points.
mat4 createCircleTestMatrix(vec2 a, vec2 b, vec2 c, vec2 d) {
    // Each row is x^2 + y^2, x, y, 1
    mat4 mat = mat4(
        dot(a, a), a.x, a.y, 1.0,
        dot(b, b), b.x, b.y, 1.0,
        dot(c, c), c.x, c.y, 1.0,
        dot(d, d), d.x, d.y, 1.0
    );
    return mat;
}

float circleDeterminant(vec2 a, vec2 b, vec2 c, vec2 d) {
    mat4 mat = createCircleTestMatrix(a, b, c, d);
    return determinant(mat);
}

void main() {
    vec2 p = gl_FragCoord.xy;
    vec2 uv = p / u_resolution.xy;
    // If no drag, just draw the texture
    if (distance(u_start, u_end) < 1.0) {
        fragColor = texture(u_texture, uv);
        return;
    }

    float d = circleDeterminant(u_start, u_end, vec2(0.0, 0.0), p);
    float alpha = 1.0 - smoothstep(0.0, 1.0e9, d);
    fragColor = mix(texture(u_texture, uv), vec4(0.0, 0.0, 0.0, 1.0), alpha);
}
    `;
    super(canvas, fragmentShaderSource);
  }
}