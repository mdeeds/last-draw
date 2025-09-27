import { SmudgeTool } from './smudge-gl.js';
import { RotationTool } from './rotation-gl.js';
import { LineTool } from './line-gl.js';

function createBackground() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1024;
  tempCanvas.height = 1024;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) {
    throw new Error("Unable to create 2D context.");
  }
  const colors = ['red', 'green', 'blue', 'yellow'];
  const tileSize = tempCanvas.width / 16;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = colors[(x + y) % 4];
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
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


  const tool = new LineTool(canvas);
  tool.setBackgroundTexture(createBackground());
});