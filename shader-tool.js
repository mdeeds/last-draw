/**
 * @typedef {{
 *   program: WebGLProgram,
 *   locations: { attributes: { position: number }, uniforms: { resolution: WebGLUniformLocation | null, start: WebGLUniformLocation | null, end: WebGLUniformLocation | null, mid: WebGLUniformLocation | null, texture: WebGLUniformLocation | null, isDragging?: WebGLUniformLocation | null, dragLength?: WebGLUniformLocation | null } }
 * }} WebGLProgramInfo
 */

export class ShaderTool {
  /** @type {WebGLProgramInfo[]} */
  programs = [];

  /**
   * @param {WebGL2RenderingContext} gl The WebGL rendering context.
   * @param {string | string[]} fragmentShaderSources An array of fragment shader source strings.
   */
  constructor(gl, fragmentShaderSources) {
    this.gl = gl;
    this.fragmentShaderSources = Array.isArray(fragmentShaderSources) ? fragmentShaderSources : [fragmentShaderSources];
    this.createShaders();
  }

  /**
   * Creates and compiles a shader.
   * @param {number} type The shader type (VERTEX_SHADER or FRAGMENT_SHADER).
   * @param {string} source The shader source code.
   * @returns {WebGLShader}
   */
  createShader(type, source) {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
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
    const vertexShaderSource = `#version 300 es
      in vec2 a_position;
      void main() { 
          gl_Position = vec4(a_position, 0.0, 1.0);
      }`;

    if (!this.fragmentShaderSources || this.fragmentShaderSources.length === 0) {
      throw new Error('At least one fragment shader source must be provided.');
    }

    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
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
          attributes: { position: this.gl.getAttribLocation(program, 'a_position') },
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
  }
}