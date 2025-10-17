/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {{
 *   program: WebGLProgram,
 *   locations: { attributes: { position: number }, uniforms: { resolution: WebGLUniformLocation | null, start: WebGLUniformLocation | null, end: WebGLUniformLocation | null, mid: WebGLUniformLocation | null, texture: WebGLUniformLocation | null, isDragging?: WebGLUniformLocation | null, dragLength?: WebGLUniformLocation | null } }
 * }} WebGLLocations
 */

export class TwoPointTool {
  /** @type {HTMLCanvasElement!} */
  canvas;
  /** @type {WebGLRenderingContext!} */
  gl;
  /** @type {boolean} */
  isDragging = false;
  /** @type {boolean} */
  isDirty = true;

  /** @type {TwoPointTool | null} */
  static activeTool = null;

  /**
   * @param {HTMLCanvasElement} canvas The canvas element to draw on.
   * @param {string[]} fragmentShaderSources An array of fragment shader source strings.
   */
  constructor(canvas, fragmentShaderSources) {
    this.canvas = canvas;
    this.fragmentShaderSources = Array.isArray(fragmentShaderSources) ? fragmentShaderSources : [fragmentShaderSources];

    const maybeGl = canvas.getContext('webgl2');
    if (!maybeGl) {
      throw new Error('WebGL not supported');
    }
    this.gl = maybeGl;

    this.initialize();
    this.sourceTexture = undefined;
    this.targetTextureA = undefined;
    this.targetTextureB = undefined;
    this.framebuffer = undefined;
    TwoPointTool.activeTool = this;
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

    if (!this.fragmentShaderSources || this.fragmentShaderSources.length === 0) {
      throw new Error('At least one fragment shader source must be provided.');
    }

    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    /** @type {WebGLLocations[]} */
    this.programs = this.fragmentShaderSources.map(fragmentShaderSource => {
      const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
      const program = this.gl.createProgram();
      if (!program) throw new Error("Failed to create program");

      this.gl.attachShader(program, vertexShader);
      this.gl.attachShader(program, fragmentShader);
      this.gl.linkProgram(program);

      if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(program));
        throw new Error("Program linking failed");
      }

      return {
        program,
        locations: {
          attributes: {
            position: this.gl.getAttribLocation(program, 'a_position'),
          },
          uniforms: {
            resolution: this.gl.getUniformLocation(program, 'u_resolution'),
            start: this.gl.getUniformLocation(program, 'u_start'),
            end: this.gl.getUniformLocation(program, 'u_end'),
            mid: this.gl.getUniformLocation(program, 'u_mid'),
            texture: this.gl.getUniformLocation(program, 'u_texture'),
            isDragging: this.gl.getUniformLocation(program, 'u_is_dragging'),
            dragLength: this.gl.getUniformLocation(program, 'u_drag_length'),
          },
        }
      };
    });

    // Create a buffer for a full-screen quad
    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
    // This attribute is the same for all programs, so we can set it up once.
    const posLocation = this.programs[0].locations.attributes.position;

    // Set up vertex attribute pointer
    this.gl.enableVertexAttribArray(posLocation);
    this.gl.vertexAttribPointer(posLocation, 2, this.gl.FLOAT, false, 0, 0);
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
    if (!this.startPoint) {
      throw new Error('Start point not initialized');
    }
    if (!this.endPoint) {
      throw new Error('End point not initialized');
    }

    const dx = this.endPoint.x - this.startPoint.x;
    const dy = this.endPoint.y - this.startPoint.y;
    const dragLength = Math.sqrt(dx * dx + dy * dy);

    // Find the mid point furthest from start and end.
    let midPoint = this.startPoint;

    if (this.midPoints.length === 0) {
      this.midPoints.push(this.startPoint);
    }

    let maxDistance = 0;
    for (const point of this.midPoints) {
      const d2 = this.#distanceToLine2(point, this.startPoint, this.endPoint);
      if (d2 > maxDistance) {
        maxDistance = d2;
        midPoint = point;
      }
    }

    // Set uniforms for all programs
    this.programs.forEach(({ program, locations }) => {
      this.gl.useProgram(program);
      this.gl.uniform2f(locations.uniforms.resolution, this.gl.canvas.width, this.gl.canvas.height);
      this.gl.uniform2f(locations.uniforms.start, this.startPoint.x, this.startPoint.y);
      this.gl.uniform2f(locations.uniforms.end, this.endPoint.x, this.endPoint.y);
      this.gl.uniform2f(locations.uniforms.mid, midPoint.x, midPoint.y);
      if (locations.uniforms.isDragging) {
        this.gl.uniform1f(locations.uniforms.isDragging, this.isDragging ? 1.0 : 0.0);
      }
      if (locations.uniforms.dragLength) {
        this.gl.uniform1f(locations.uniforms.dragLength, dragLength);
      }
    });
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
  }


  /** @param {MouseEvent | TouchEvent} e */
  onDragStart(e) {
    if (TwoPointTool.activeTool !== this) { return; }
    console.log('start');
    e.preventDefault();
    this.isDragging = true;
    const pointSource = e instanceof MouseEvent ? e : e.touches[0];
    this.startPoint = this.getCanvasPointFromEvent(pointSource);
    this.endPoint = { ...this.startPoint };
    this.midPoints.length = 0;
    this.needsCommit = false;
    this.isDirty = true;
  }

  /** @param {MouseEvent | TouchEvent} e */
  onDragMove(e) {
    if (TwoPointTool.activeTool !== this) { return; }
    if (!this.isDragging) return;
    e.preventDefault();
    const pointSource = e instanceof MouseEvent ? e : e.touches[0];
    this.midPoints.push(this.endPoint);
    this.endPoint = this.getCanvasPointFromEvent(pointSource);
    this.isDirty = true;
  }

  onDragEnd() {
    if (TwoPointTool.activeTool !== this) { return; }
    if (!this.isDragging) return;

    // The render loop will handle committing the change.
    // We just need to mark it as dirty.
    console.log(`end.  Program length: ${this.fragmentShaderSources.length}`);
    this.isDragging = false;
    this.isDirty = true;
    this.needsCommit = true;
  }

  #runProgram(program, locations, currentSource) {
    this.gl.useProgram(program);
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, currentSource);
    this.gl.uniform1i(locations.uniforms.texture, 0);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.gl.flush();
  }

  /**
   * 
   * @param {boolean} commitTexture The texture to render the final output to. If null, renders to the canvas.
   */
  #runTwoShaderPasses(commitTexture) {
    // Pass 1: Render from sourceTexture to targetTextureA
    const { program: program0, locations: locations0 } = this.programs[0];
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D, this.targetTextureA, 0);
    this.#runProgram(program0, locations0, this.sourceTexture);

    // Pass 2: Render from targetTextureA (result of pass 1) to final destination
    const { program: program1, locations: locations1 } = this.programs[1];
    if (!commitTexture) {
      // Final pass is a preview, so render to the canvas.
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.#runProgram(program1, locations1, this.targetTextureA);
    } else {
      // Final pass is a commit. Render the result of pass 1 (in targetTextureA) to targetTextureB.
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0,
        this.gl.TEXTURE_2D, this.targetTextureB, 0);
      this.#runProgram(program1, locations1, this.targetTextureA);
      // Now, swap the original source with the final result to "commit" the change.
      [this.sourceTexture, this.targetTextureB] = [this.targetTextureB, this.sourceTexture];
    }
  }

  // Special case for a single shader pass.  This is tricky when committing a change
  // because we need to swap textures around
  #runSingleShaderPass(commitTexture) {
    const { program, locations } = this.programs[0];
    if (!commitTexture) {
      // Easy case: just display the final output
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.#runProgram(program, locations, this.sourceTexture);
    } else {
      // When committing, we render to an intermediate texture first...
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0,
        this.gl.TEXTURE_2D, this.targetTextureA, 0);
      this.#runProgram(program, locations, this.sourceTexture);

      // ...then we swap the source and target textures to "commit" the change.
      // The old source becomes the new target, and the result becomes the new source.
      [this.targetTextureA, this.sourceTexture] = [this.sourceTexture, this.targetTextureA];
    }
  }

  /**
   * 
   * @param {boolean} commitTexture The texture to render the final output to. If null, renders to the canvas.
   */
  #runMultipleShaderPasses(commitTexture) {
    let currentSource = this.sourceTexture;
    for (let i = 0; i < this.programs.length; i++) {
      const { program, locations } = this.programs[i];
      const isLastPass = i === this.programs.length - 1;

      if (isLastPass) {
        if (!commitTexture) {
          // Final pass is a preview, so render to the canvas.
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        } else {
          // Final pass is a commit. Render to the current target texture.
          // We can't render directly to `finalDestinationTexture` if it's also the
          // `currentSource` from the previous pass.
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
          this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTextureA, 0);
        }
      } else {
        // Intermediate pass: Render to the pong texture.
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTextureA, 0);
      }

      this.#runProgram(program, locations, currentSource);

      // The texture we just wrote to (targetTextureA) becomes the source for the next pass.
      currentSource = this.targetTextureA;
      // Swap the target textures so we write to a different one in the next iteration.
      [this.targetTextureA, this.targetTextureB] = [this.targetTextureB, this.targetTextureA];
    }
  }

  /**
   * Runs the shader pipeline.
   * @param {WebGLTexture} initialSourceTexture The texture to use as input for the first pass.
   * @param {boolean} commitTexture The texture to render the final output to. If null, renders to the canvas.
   */
  runShaderPasses(commitTexture) {
    if (this.programs.length === 1) {
      this.#runSingleShaderPass(commitTexture);
    } else if (this.programs.length === 2) {
      this.#runTwoShaderPasses(commitTexture);
    } else { // For more than two passes, use the generic multiple pass handler
      this.#runMultipleShaderPasses(commitTexture);
    }
  }

  render() {
    TwoPointTool.activeTool = this;
    if (!this.isDirty || !this.sourceTexture) {
      return;
    }
    this.isDirty = false;
    this.updateSmudgePoints();
    this.runShaderPasses(this.needsCommit);
    if (this.needsCommit) {
      // Reset points to prevent re-applying the effect on the next frame.
      this.startPoint = { x: 0, y: 0 };
      this.endPoint = { x: 0, y: 0 };
      this.needsCommit = false;
      this.isDirty = true;
    }

    // Flush the command buffer to ensure the render is processed promptly.
    // this.gl.flush();
  }

  /**
   * Creates a WebGL texture from a canvas and stores it.
   * @param {HTMLCanvasElement} canvas The source canvas for the texture.
   */
  setBackgroundTexture(canvas) {
    const gl = this.gl;

    // Dispose of old resources if they exist
    if (this.sourceTexture) {
      gl.deleteTexture(this.sourceTexture);
    }
    if (this.targetTextureA) {
      gl.deleteTexture(this.targetTextureA);
      gl.deleteTexture(this.targetTextureB);
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

    this.sourceTexture = createAndSetupTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); // Upload image

    this.targetTextureA = createAndSetupTexture();
    this.targetTextureB = createAndSetupTexture();

    // Create and configure the framebuffer
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    // Unbind everything
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.isDirty = true;
  }

}