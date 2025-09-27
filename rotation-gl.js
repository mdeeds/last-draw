// @ts-check

import { TwoPointTool } from './two-point-tool.js';


export class RotationTool extends TwoPointTool {
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

const float PI = 3.14159265359;

float getAngle(vec2 start, vec2 end) {
    vec2 d = end - start;
    return atan(d.y, d.x);
}

float getRadius(vec2 start, vec2 end) {
    return length(end - start);
}

mat2 rotate2d(float angle){
    return mat2(cos(angle), -sin(angle),
                sin(angle),  cos(angle));
}

void main() {
    vec2 p = gl_FragCoord.xy;
    float angle = getAngle(u_start, u_end);
    float radius = getRadius(u_start, u_end);
    vec2 center = u_start;
    
    // If no drag, just pass through the texture
    if (radius < 1.0) {
      fragColor = texture(u_texture, p / u_resolution.xy);
      return;
    }

    // --- Rotation Logic ---

    // Calculate distance from the center point
    float dist_from_center = distance(p, center);
    
    // Calculate the dynamic outer radius based on the magnitude of the angle
    float normalized_angle = abs(angle) / PI;
    float outer_radius_multiplier = 1.0 + normalized_angle * 2.0;
    float outer_radius = radius * outer_radius_multiplier;

    // Determine the rotation amount based on distance from center
    float rotate_factor = 1.0 - smoothstep(radius, outer_radius, dist_from_center);
    float final_angle = angle * rotate_factor;

    // Translate the point to be relative to the center
    vec2 p_relative = p - center;

    // Apply the rotation
    vec2 rotated_p = rotate2d(final_angle) * p_relative;

    // Translate the point back to its original coordinate system
    vec2 final_p = rotated_p + center;
    
    // Calculate final UV from the rotated position
    vec2 final_uv = final_p / u_resolution.xy;

    // Draw the checkerboard from the new UV
    fragColor = texture(u_texture, final_uv);
}
    `;
    super(canvas, fragmentShaderSource);
  }
}
