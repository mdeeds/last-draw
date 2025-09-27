/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {{
 *   attributes: { position: number },
 *   uniforms: { resolution: WebGLUniformLocation | null, start: WebGLUniformLocation | null, end: WebGLUniformLocation | null }
 * }} WebGLLocations
 */

export class TwoPointTool {
  /** @type {HTMLCanvasElement!} */
  canvas;
  /** @type {WebGLRenderingContext!} */
  gl;


  constructor(canvas, fragmentShaderSource) {
    this.canvas = canvas;
    this.fragmentShaderSource = fragmentShaderSource;

    const maybeGl = canvas.getContext('webgl');
    if (!maybeGl) {
      throw new Error('WebGL not supported');
    }
    this.gl = /** @type {WebGLRenderingContext} */ (maybeGl);

    this.initialize();

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
    const vertexShaderSource = `
                attribute vec2 a_position;
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
  }


  initialize() {
    this.createShaders();

    // Set canvas size
    const setCanvasSize = () => {
      const size = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.7);
      this.canvas.width = size;
      this.canvas.height = size;
      // When the size changes, we need to re-render
      if (!!this.gl && !!this.locations) {
        this.render();
      }
    };
    setCanvasSize();
    window.addEventListener('resize', () => setCanvasSize());

    // Initial uniform values
    /** @type {Point} */
    this.startPoint = { x: 0, y: 0 };
    /** @type {Point} */
    this.endPoint = { x: 0, y: 0 };
    let isDragging = false;

    // Handle mouse events
    /** @param {MouseEvent} e */
    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      this.startPoint = this.getCanvasPointFromEvent(e);
      this.endPoint = { ...this.startPoint };
      this.updateSmudgePoints();
      this.render();
    });

    /** @param {MouseEvent} e */
    this.canvas.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      this.endPoint = this.getCanvasPointFromEvent(e);
      this.updateSmudgePoints();
      this.render();
    });

    this.canvas.addEventListener('mouseup', () => {
      isDragging = false;
      // Reset points to stop the smudge effect
      this.startPoint = { x: 0, y: 0 };
      this.endPoint = { x: 0, y: 0 };
      this.updateSmudgePoints();
      this.render();
    });

    // Handle touch events
    /** @param {TouchEvent} e */
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isDragging = true;
      const touch = e.touches[0];
      this.startPoint = this.getCanvasPointFromEvent(touch);
      this.endPoint = { ...this.startPoint };
      this.updateSmudgePoints();
      this.render();
    });

    /** @param {TouchEvent} e */
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!isDragging) return;
      const touch = e.touches[0];
      this.endPoint = this.getCanvasPointFromEvent(touch);
      this.updateSmudgePoints();
      this.render();
    });

    this.canvas.addEventListener('touchend', () => {
      isDragging = false;
      // Reset points to stop the smudge effect
      this.startPoint = { x: 0, y: 0 };
      this.endPoint = { x: 0, y: 0 };
      this.updateSmudgePoints();
      this.render();
    });

    // Main render loop
    // Initial render
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
  }

}