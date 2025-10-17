// @ts-check

import { ShaderTool } from './shader-tool.js';

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {ShaderTool}
 */
export function createEraserTool(gl) {
  const fragmentShaderTemplate = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_start;
uniform vec2 u_end;

out vec4 fragColor;

const float PI = 3.14159265359;
const int MAX_BLUR_RADIUS = 30; // Max radius to prevent excessive sampling

vec4 applyBlur(vec2 current_pixel_coord, float blur_radius, vec2 blur_direction) {
    vec4 total_color = vec4(0.0);
    float total_weight = 0.0;
    
    for (int b = -MAX_BLUR_RADIUS; b <= MAX_BLUR_RADIUS; ++b) {
        if (abs(float(b)) > blur_radius) {
            continue;
        }
        
        vec2 offset = float(b) * blur_direction;
        
        // Calculate cosine weights for x and y offsets
        float weight = cos(PI * 0.5 * float(b) / blur_radius);
        
        // Get the color of the neighboring pixel
        vec4 sampled_color = texture(u_texture, (current_pixel_coord + offset) / u_resolution);
        
        total_color += sampled_color * weight;
        total_weight += weight;
    }
    
    return total_color / total_weight;

}

void main() {
    vec2 p = gl_FragCoord.xy;
    
    vec4 final_color = texture(u_texture, p / u_resolution);

    float drag_length = distance(u_end, u_start);
    if (drag_length < 1.0) {
        fragColor = final_color;
        return;
    }

    // --- Blur Logic ---

    // Calculate distance to the "pill" shape
    vec2 start_to_end = u_end - u_start;
    vec2 start_to_p = p - u_start;
    float t = dot(start_to_p, start_to_end) / dot(start_to_end, start_to_end);
    vec2 closest_point_on_line = u_start + clamp(t, 0.0, 1.0) * start_to_end;
    float dist_from_line = distance(p, closest_point_on_line);

    // Interpolate the blur radius based on distance from the pill's edge
    float inner_radius = drag_length * 0.2;
    float outer_radius = drag_length * 1.2;
    float blur_radius_factor = 1.0 - smoothstep(inner_radius, outer_radius, dist_from_line);
    float blur_radius = blur_radius_factor * inner_radius;

    if (blur_radius < 1.0) {
            fragColor = final_color;
            return;
    }

    // Blur in the horizontal direction only
    vec2 blur_direction = __BLUR_DIRECTION__;
    vec4 blurred_color = applyBlur(p, blur_radius, blur_direction);
    
    // --- Lightening Logic ---
    // Blend the blurred color with white based on the blur radius factor
    float lighten_factor = blur_radius_factor * 0.5;
    fragColor = mix(blurred_color, vec4(1.0, 1.0, 1.0, 1.0), lighten_factor);
}
`;
  return new ShaderTool(gl, [
    fragmentShaderTemplate.replace('__BLUR_DIRECTION__', 'vec2(1.0, 0.0)'),
    fragmentShaderTemplate.replace('__BLUR_DIRECTION__', 'vec2(0.0, 1.0)')
  ]);
}