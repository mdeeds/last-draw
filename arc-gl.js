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
uniform vec2 u_mid;

out vec4 fragColor;

// returns the distance from p to the line defined by a and b.
float distanceToLine(vec2 p, vec2 a, vec2 b) {
    vec2 ap = p - a;
    vec2 ab = b - a;
    float ab_squared = dot(ab, ab);

    // If a and b are the same point, return distance from p to a.
    if (ab_squared == 0.0) {
        return distance(p, a);
    }

    float t = dot(ap, ab) / ab_squared;
    vec2 closest_point = a + t * ab;
    return distance(p, closest_point);
}

// Finds the center of the circle that passes through a, b, and c.
vec2 findCircleCenter(vec2 a, vec2 b, vec2 c) {
    // Perpendicular bisector of AB
    vec2 mid_ab = (a + b) * 0.5;
    vec2 dir_ab = b - a;
    vec2 perp_ab = vec2(-dir_ab.y, dir_ab.x);

    // Perpendicular bisector of AC
    vec2 mid_ac = (a + c) * 0.5;
    vec2 dir_ac = c - a;
    vec2 perp_ac = vec2(-dir_ac.y, dir_ac.x);

    // The denominator is the 2D cross product of the perpendicular vectors.
    // If it's zero, the points are collinear and there's no unique circle.
    float denominator = perp_ab.x * perp_ac.y - perp_ab.y * perp_ac.x;
    if (abs(denominator) < 1e-6) {
        return vec2(-1.0, -1.0); // Indicate failure (collinear points)
    }

    vec2 mid_diff = mid_ac - mid_ab;
    float t = (mid_diff.x * perp_ac.y - mid_diff.y * perp_ac.x) / denominator;

    return mid_ab + t * perp_ab;
}

// Returns the magnitude of the cross product of ab cross ac
// This is determined by the sign of the 2D cross product of vectors ab and ac.
float cross_product(vec2 a, vec2 b, vec2 c) {
    vec2 ab = b - a;
    vec2 ac = c - a;
    return ab.x * ac.y - ab.y * ac.x;
}


void main() {
    vec2 p = gl_FragCoord.xy;
    vec2 uv = p / u_resolution.xy;
    // If no drag, just draw the texture

    if (distance(u_start, u_end) < 1.0) {
        fragColor = texture(u_texture, uv);
        return;
    }

    // For now, point c is at the origin.
    vec2 c = u_mid;

    if (distanceToLine(c, u_start, u_end) < 1.0) {
        fragColor = texture(u_texture, uv);
        return;
    }

    vec2 center = findCircleCenter(u_start, u_end, c);
    float radius = distance(center, c);

    float distanceFromCircle = abs(length(p - center) - radius);

    float alpha = 1.0 - smoothstep(0.0, 3.0, distanceFromCircle);
    // Only draw the arc segment, not the full circle.
    // We check if the fragment 'p' is on the same side of the line 'start-end' as 'c'.
    if (cross_product(u_start, u_end, p) * cross_product(u_start, u_end, c) < 0.0) {
        alpha = 0.0;
    }

    fragColor = mix(texture(u_texture, uv), vec4(0.0, 0.0, 0.0, 1.0), alpha);
}
    `;
    super(canvas, fragmentShaderSource);
  }
}