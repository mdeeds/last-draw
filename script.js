import { SmudgeTool } from './smudge-gl.js';
import { RotationTool } from './rotation-gl.js';
import { LineTool } from './line-gl.js';
import { ArcTool } from './arc-gl.js';

function createBackground() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1024;
  tempCanvas.height = 1024;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) {
    throw new Error("Unable to create 2D context.");
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  return tempCanvas;
}


document.addEventListener('DOMContentLoaded', () => {
  /** @type {HTMLElement | null} */
  const maybeCanvas = document.getElementById('smudgeCanvas');
  if (!maybeCanvas) {
    alert('Canvas element not found.');
    return;
  }
  const canvas = /** @type {HTMLCanvasElement!} */ (maybeCanvas);
  canvas.width = 1024;
  canvas.height = canvas.width;


  const tool = new ArcTool(canvas);
  tool.setBackgroundTexture(createBackground());
});