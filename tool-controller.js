/**
 * @typedef {{x: number, y: number}} Point
 */

/**
 * A simple renderer that just copies a texture to the canvas.
 * This is used for the default state when no tool is active.
 */
class PassthroughRenderer {
  /**
   * @param {WebGL2RenderingContext} gl
   */
  constructor(gl) {
    this.gl = gl;
    const vs = `#version 300 es
      in vec2 a_position;
      out vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_position * 0.5 + 0.5;
      }`;
    const fs = `#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_texture;
      out vec4 fragColor;
      void main() {
        fragColor = texture(u_texture, v_texCoord);
      }`;

    const vertexShader = this.#createShader(gl.VERTEX_SHADER, vs);
    const fragmentShader = this.#createShader(gl.FRAGMENT_SHADER, fs);
    this.program = this.#createProgram(vertexShader, fragmentShader);
    this.textureLocation = gl.getUniformLocation(this.program, 'u_texture');
  }

  #createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }

  #createProgram(vs, fs) {
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);
    return program;
  }
}

import { ShaderTool } from './shader-tool.js';

export class ToolController {
  /** @type {HTMLCanvasElement} */
  canvas;
  /** @type {WebGL2RenderingContext} */
  gl;
  /** @type {boolean} */
  isDragging = false;
  /** @type {boolean} */
  isDirty = true;
  /** @type {ShaderTool | null} */
  activeTool = null;
  /** @type {PassthroughRenderer | null} */
  passthroughRenderer = null;

  /**
   * @param {HTMLCanvasElement} canvas The canvas element to draw on.
   */
  constructor(canvas) {
    this.canvas = canvas;

    const maybeGl = canvas.getContext('webgl2');
    if (!maybeGl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = maybeGl;
    this.passthroughRenderer = new PassthroughRenderer(this.gl);

    this.initialize();
    this.sourceTexture = undefined;
    this.targetTextureA = undefined;
    this.targetTextureB = undefined;
    this.framebuffer = undefined;
  }

  /**
   * @param {ShaderTool} tool
   */
  setTool(tool) {
    if (this.activeTool !== tool) {
      this.activeTool = tool;
      this.isDirty = true;
    }
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

  /**
   * Returns the squared distance from p to the closest point on the line connecting a and b.
   * @param {Point} p The point to measure
   * @param {Point} a One point defining the line
   * @param {Point} b The other point defining the line
   * @returns {number}
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

    // The projection is on the segment. Find the squared distance to the projection point.
    const closestPoint = { x: a.x + t * ab.x, y: a.y + t * ab.y };
    return this.#squaredDistance(p, closestPoint);
  }

  updateToolPoints() {
    if (!this.activeTool) return;
    if (!this.startPoint) throw new Error('Start point not initialized');
    if (!this.endPoint) throw new Error('End point not initialized');

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
    this.activeTool.programs.forEach(({ program, locations }) => {
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
    /** @type {Point} */
    this.startPoint = { x: 0, y: 0 };
    /** @type {Point} */
    this.endPoint = { x: 0, y: 0 };
    /** @type {Point[]} */
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
    if (!this.activeTool) return;
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
    if (!this.activeTool || !this.isDragging) return;
    e.preventDefault();
    const pointSource = e instanceof MouseEvent ? e : e.touches[0];
    this.midPoints.push(this.endPoint);
    this.endPoint = this.getCanvasPointFromEvent(pointSource);
    this.isDirty = true;
  }

  onDragEnd() {
    if (!this.activeTool || !this.isDragging) return;
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

  #runTwoShaderPasses(commitTexture) {
    if (!this.activeTool) return;
    // Pass 1: Render from sourceTexture to targetTextureA
    const { program: program0, locations: locations0 } = this.activeTool.programs[0];
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTextureA, 0);
    this.#runProgram(program0, locations0, this.sourceTexture);

    // Pass 2: Render from targetTextureA (result of pass 1) to final destination
    const { program: program1, locations: locations1 } = this.activeTool.programs[1];
    if (!commitTexture) {
      // Final pass is a preview, so render to the canvas using targetTextureA as source.
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.#runProgram(program1, locations1, this.targetTextureA);
    } else {
      // Final pass is a commit. Render the result of pass 1 (in targetTextureA) to targetTextureB
      // because we cannot read from and write to the same texture in a single pass.
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTextureB, 0);
      this.#runProgram(program1, locations1, this.targetTextureA);
      // The final result is in targetTextureB. Swap it into sourceTexture.
      [this.sourceTexture, this.targetTextureB] = [this.targetTextureB, this.sourceTexture];
      console.log('Committing two passes. Swapped targetTextureB into sourceTexture.');
    }
  }

  #runSingleShaderPass(commitTexture) {
    if (!this.activeTool) return;
    const { program, locations } = this.activeTool.programs[0];
    if (!commitTexture) {
      // Easy case: just display the final output
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    } else {
      // When committing, we render to an intermediate texture first...
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTextureA, 0);
    }
    this.#runProgram(program, locations, this.sourceTexture);
    if (commitTexture) {
      [this.targetTextureA, this.sourceTexture] = [this.sourceTexture, this.targetTextureA];
      console.log('Committing single pass. Swapped targetTextureA into sourceTexture.');

    }
  }

  #runMultipleShaderPasses(commitTexture) {
    if (!this.activeTool) return;
    let currentSource = this.sourceTexture;
    for (let i = 0; i < this.activeTool.programs.length; i++) {
      const { program, locations } = this.activeTool.programs[i];
      const isLastPass = i === this.activeTool.programs.length - 1;

      if (isLastPass) {
        if (!commitTexture) {
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        } else {
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
          this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTextureA, 0);
        }
      } else {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.targetTextureA, 0);
      }

      this.#runProgram(program, locations, currentSource);

      currentSource = this.targetTextureA;
      [this.targetTextureA, this.targetTextureB] = [this.targetTextureB, this.targetTextureA];
    }
  }

  runShaderPasses(commitTexture) {
    if (!this.activeTool) return;
    if (this.activeTool.programs.length === 1) {
      this.#runSingleShaderPass(commitTexture);
    } else if (this.activeTool.programs.length === 2) {
      this.#runTwoShaderPasses(commitTexture);
    } else {
      this.#runMultipleShaderPasses(commitTexture);
    }
  }

  render() {
    if (!this.isDirty || !this.activeTool || !this.sourceTexture) {
      return;
    }

    this.isDirty = false;

    // If there's no active drag, just render the source texture directly.
    const isIdle = this.startPoint.x === 0 && this.startPoint.y === 0 && this.endPoint.x === 0 && this.endPoint.y === 0;

    if (isIdle && !this.needsCommit) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
      this.gl.useProgram(this.passthroughRenderer.program);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
      this.gl.uniform1i(this.passthroughRenderer.textureLocation, 0);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
      console.log('Passthrough done.');
    } else {
      this.updateToolPoints();
      this.runShaderPasses(this.needsCommit);
    }

    if (this.needsCommit) {
      this.startPoint = { x: 0, y: 0 };
      this.endPoint = { x: 0, y: 0 };
      this.needsCommit = false;
      this.isDirty = true;
    }
  }

  /**
   * Creates a WebGL texture from a canvas and stores it.
   * @param {HTMLCanvasElement} canvas The source canvas for the texture.
   */
  setBackgroundTexture(canvas) {
    const gl = this.gl;

    // Initialize textures and framebuffer on first run
    if (!this.framebuffer) {
      // The vertex buffer was missing, let's add it here.
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.deleteTexture(this.sourceTexture);
      gl.deleteTexture(this.targetTextureA);
      gl.deleteTexture(this.targetTextureB);
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
    console.log('Setting background texture. New sourceTexture created.');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    this.targetTextureA = createAndSetupTexture();
    this.targetTextureB = createAndSetupTexture();

    if (!this.framebuffer) {
      this.framebuffer = gl.createFramebuffer();
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    this.isDirty = true;
  }
}