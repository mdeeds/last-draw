/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {{
 *   attributes: { position: number },
 *   uniforms: { resolution: WebGLUniformLocation | null, start: WebGLUniformLocation | null, end: WebGLUniformLocation | null, texture?: WebGLUniformLocation | null }
 * }} WebGLLocations
 */

export class TwoPointTool {
  /** @type {HTMLCanvasElement!} */
  canvas;
  /** @type {WebGLRenderingContext!} */
  gl;
  /** @type {boolean} */
  isDragging = false;


  constructor(canvas, fragmentShaderSource) {
    this.canvas = canvas;
    this.fragmentShaderSource = fragmentShaderSource;

    const maybeGl = canvas.getContext('webgl2');
    if (!maybeGl) {
      throw new Error('WebGL not supported');
    }
    this.gl = /** @type {WebGLRenderingContext} */ (maybeGl);

    this.initialize();
    this.backgroundTexture = undefined;
    this.targetTexture = undefined;
    this.framebuffer = undefined;
  }

  // Helper functions to create and compile shaders
  /**
   * Creates and compiles a shader.
   * @param {number} type The shader type (VERTEX_SHADER or FRAGMENT_SHADER).
   * @param {string} source The shader source code.
   * @returns {WebGLShader!}
   */
  createShader(type, source) {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create shader');
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      throw new Error('Shader compilation failed');
    }
    return shader;
  }

  createShaders() {
    // Shader source code
    const vertexShaderSource = `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
            `;

    if (!this.fragmentShaderSource) {
      throw new Error('Fragment shader source not provided. Please extend the class correctly.');
    }
    const fragmentShaderSource = this.fragmentShaderSource;

    // Create program
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(program));
      return null;
    }
    this.gl.useProgram(program);

    // Look up attribute and uniform locations
    /** @type {WebGLLocations} */
    this.locations = {
      attributes: {
        position: this.gl.getAttribLocation(program, 'a_position'),
      },
      uniforms: {
        resolution: this.gl.getUniformLocation(program, 'u_resolution'),
        start: this.gl.getUniformLocation(program, 'u_start'),
        end: this.gl.getUniformLocation(program, 'u_end'),
        mid: this.gl.getUniformLocation(program, 'u_mid'),
        texture: this.gl.getUniformLocation(program, 'u_texture'),
      },
    };

    // Create a buffer for a full-screen quad
    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

    // Set up vertex attribute pointer
    this.gl.enableVertexAttribArray(this.locations.attributes.position);
    this.gl.vertexAttribPointer(this.locations.attributes.position, 2, this.gl.FLOAT, false, 0, 0);
  }

  /**
   * Gets the canvas-relative coordinates from a mouse or touch event.  We use a right-handed coordinate
   * system measured in pixels with the origin in the lower-left corner.
   * @param {MouseEvent | Touch} e The mouse or touch event.
   * @returns {Point}
   */
  getCanvasPointFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: this.canvas.height - (e.clientY - rect.top) // Invert Y for WebGL coords
    };
  }

  #squaredDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  #distance(a, b) {
    return Math.sqrt(this.#squaredDistance(a, b));
  }

  /**
   * Returns the squared distance from p to the closest point on the line connecting a and b.
   * @param {Point} p The point to measure
   * @param {Point} a One point defining the line
   * @param {Point} b The other point defining the line
   * @returns 
   */
  #distanceToLine2(p, a, b) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: p.x - a.x, y: p.y - a.y };

    const ab2 = ab.x * ab.x + ab.y * ab.y;

    if (ab2 === 0) {
      // a and b are the same point
      return this.#squaredDistance(p, a);
    }

    // Project p onto the line defined by a and b
    const t = (ap.x * ab.x + ap.y * ab.y) / ab2;

    // // If the projection is outside the segment, clamp to the nearest endpoint
    // if (t < 0) {
    //   return this.#squaredDistance(p, a);
    // }
    // if (t > 1) {
    //   return this.#squaredDistance(p, b);
    // }

    // The projection is on the segment. Find the squared distance to the projection point.
    const closestPoint = { x: a.x + t * ab.x, y: a.y + t * ab.y };
    return this.#squaredDistance(p, closestPoint);
  }

  updateSmudgePoints() {
    if (!this.locations) {
      throw new Error('Locations not initialized');
    }
    if (!this.startPoint) {
      throw new Error('Start point not initialized');
    }
    if (!this.endPoint) {
      throw new Error('End point not initialized');
    }
    this.gl.uniform2f(this.locations.uniforms.start, this.startPoint.x, this.startPoint.y);
    this.gl.uniform2f(this.locations.uniforms.end, this.endPoint.x, this.endPoint.y);
    // Find the mid point furthest from start and end.
    let midPoint = this.startPoint;

    let maxDistance = 0;
    for (const point of this.midPoints) {
      const d2 = this.#distanceToLine2(point, this.startPoint, this.endPoint);
      if (d2 > maxDistance) {
        maxDistance = d2;
        midPoint = point;
      }
    }

    // // Find the "median" point
    // let midPoint = this.startPoint;
    // let totalDistance = 0;
    // for (let i = 1; i < this.midPoints.length; i++) {
    //   totalDistance += this.#distance(this.midPoints[i - 1], this.midPoints[i]);
    // }
    // const midDistance = totalDistance / 2.0;
    // totalDistance = 0;
    // for (let i = 1; i < this.midPoints.length; i++) {
    //   totalDistance += this.#distance(this.midPoints[i - 1], this.midPoints[i]);
    //   if (totalDistance >= midDistance) {
    //     midPoint = this.midPoints[i - 1];
    //     break;
    //   }
    // }
    this.gl.uniform2f(this.locations.uniforms.mid, midPoint.x, midPoint.y);
  }


  initialize() {
    this.createShaders();
    // Initial uniform values
    /** @type {Point} */
    this.startPoint = { x: 0, y: 0 };
    /** @type {Point} */
    this.endPoint = { x: 0, y: 0 };

    this.midPoints = [];

    // Handle mouse events
    this.canvas.addEventListener('mousedown', (e) => this.onDragStart(e));
    this.canvas.addEventListener('mousemove', (e) => this.onDragMove(e));
    this.canvas.addEventListener('mouseup', () => this.onDragEnd());
    this.canvas.addEventListener('mouseleave', () => this.onDragEnd()); // Handle mouse leaving canvas

    this.canvas.addEventListener('touchstart', (e) => this.onDragStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.onDragMove(e));
    this.canvas.addEventListener('touchend', () => this.onDragEnd());
    this.canvas.addEventListener('touchcancel', () => this.onDragEnd()); // Handle touch interruption

    // Main render loop
    // Initial render
    this.updateSmudgePoints();
    this.render();
  }

  /** @param {MouseEvent | TouchEvent} e */
  onDragStart(e) {
    e.preventDefault();
    this.isDragging = true;
    const pointSource = e instanceof MouseEvent ? e : e.touches[0];
    this.startPoint = this.getCanvasPointFromEvent(pointSource);
    this.endPoint = { ...this.startPoint };
    this.midPoints.length = 0;
    this.updateSmudgePoints();
    this.render();
  }

  /** @param {MouseEvent | TouchEvent} e */
  onDragMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    const pointSource = e instanceof MouseEvent ? e : e.touches[0];
    this.midPoints.push(this.endPoint);
    this.endPoint = this.getCanvasPointFromEvent(pointSource);
    this.updateSmudgePoints();
    this.render();
  }

  onDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;

    // 1. Render effect to target texture
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.backgroundTexture);
    this.gl.uniform1i(this.locations.uniforms.texture, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);


    // 2. Commit the changes by swapping the textures
    [this.backgroundTexture, this.targetTexture] = [this.targetTexture, this.backgroundTexture];

    // 3. Update the framebuffer to point to the new target texture
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTexture, 0);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

    // 4. Reset points to stop the smudge effect
    this.startPoint = { x: 0, y: 0 };
    this.endPoint = { x: 0, y: 0 };
    this.updateSmudgePoints();
    this.render();

  }

  render() {
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    if (!this.locations) {
      throw new Error('Locations not initialized');
    }
    this.gl.uniform2f(
      this.locations.uniforms.resolution,
      this.gl.canvas.width, this.gl.canvas.height);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    // Render target texture to canvas
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.backgroundTexture);
    this.gl.uniform1i(this.locations.uniforms.texture, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  /**
   * Creates a WebGL texture from a canvas and stores it.
   * @param {HTMLCanvasElement} canvas The source canvas for the texture.
   */
  setBackgroundTexture(canvas) {
    const gl = this.gl;

    // Dispose of old resources if they exist
    if (this.backgroundTexture) {
      gl.deleteTexture(this.backgroundTexture);
    }
    if (this.targetTexture) {
      gl.deleteTexture(this.targetTexture);
    }
    if (this.framebuffer) {
      gl.deleteFramebuffer(this.framebuffer);
    }

    const createAndSetupTexture = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    };

    this.backgroundTexture = createAndSetupTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); // Upload image

    this.targetTexture = createAndSetupTexture();

    // Create and configure the framebuffer
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.targetTexture, 0);

    // Unbind everything
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Tell the shader to use texture unit 0 for u_texture
    this.render();
  }

}