import { createEraserTool } from './eraser-gl.js';
import { createSmudgeTool } from './smudge-gl.js';
import { ToolController } from './tool-controller.js';

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

  const controller = new ToolController(canvas);
  const background = createBackground();

  const tools = {
    'e': createEraserTool(controller.gl),
    's': createSmudgeTool(controller.gl)
  };

  // Initialize all tools with the background
  controller.setBackgroundTexture(background);

  controller.setTool(tools['e']); // Start with the Eraser tool

  document.addEventListener('keydown', (event) => {
    const newTool = tools[event.key];
    if (newTool && newTool !== controller.activeTool) {
      controller.setTool(newTool);
    }
  });
  const loop = () => {
    controller.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const imageUpload = document.getElementById('imageUpload');

  if (!imageUpload) {
    console.error("Image input not found.");
    return;
  }

  imageUpload.addEventListener('change', (event) => {
    const files = (event.target).files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1024;
        tempCanvas.height = 1024;
        const ctx = tempCanvas.getContext('2d');
        ctx.fillStyle = '#f0f';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        let drawWidth, drawHeight, x, y;
        const scale = 0.9 * Math.min(tempCanvas.width / img.width, tempCanvas.height / img.height);
        drawWidth = img.width * scale;
        drawHeight = img.height * scale;
        x = (tempCanvas.width - drawWidth) / 2;
        y = (tempCanvas.height - drawHeight) / 2;

        // Flip the canvas vertically to match WebGL's coordinate system
        ctx.save();
        ctx.translate(0, tempCanvas.height);
        ctx.scale(1, -1);
        ctx.drawImage(img, x, y, drawWidth, drawHeight);
        ctx.restore();
        controller.setBackgroundTexture(tempCanvas);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
});