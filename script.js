import { createEraserTool } from './eraser-gl.js';
import { createSmudgeTool } from './smudge-gl.js';
import { ToolController } from './tool-controller.js';
import { createArcTool } from './arc-gl.js';
import { createLineTool } from './line-gl.js';
import { createRotationTool } from './rotation-gl.js';
import { GeminiChat } from './gemini-chat.js';

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

async function initializeChat() {
  try {
    const response = await fetch('api.key');
    const apiKey = await response.text();
    const chatContainer = document.getElementById('chat-container');
    new GeminiChat(chatContainer, apiKey.trim());
  } catch (error) {
    console.error("Failed to initialize Gemini Chat:", error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
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

  const toolPalette = document.getElementById('tool-palette');
  if (!toolPalette) {
    console.error("Tool palette container not found.");
    return;
  }

  const tools = {
    'e': { name: 'Eraser', tool: createEraserTool(controller.gl) },
    's': { name: 'Smudge', tool: createSmudgeTool(controller.gl) },
    'a': { name: 'Arc', tool: createArcTool(controller.gl) },
    'l': { name: 'Line', tool: createLineTool(controller.gl) },
    'r': { name: 'Rotation', tool: createRotationTool(controller.gl) },
  };

  // Create tool buttons and add to the palette
  for (const [key, { name, tool }] of Object.entries(tools)) {
    const toolDiv = document.createElement('div');
    toolDiv.classList.add('tool-item');
    toolDiv.textContent = `${name} (${key})`;
    toolDiv.dataset.toolKey = key; // Store key for event listeners
    toolPalette.appendChild(toolDiv);

    toolDiv.addEventListener('click', () => {
      controller.setTool(tool);
      updateActiveToolUI(key);
    });
  }

  function updateActiveToolUI(activeKey) {
    document.querySelectorAll('.tool-item').forEach(el => {
      if (el.dataset.toolKey === activeKey) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  // Initialize all tools with the background
  controller.setBackgroundTexture(background);

  controller.setTool(tools['e'].tool); // Start with the Eraser tool
  updateActiveToolUI('e');

  document.addEventListener('keydown', (event) => {
    const newToolInfo = tools[event.key];
    if (newToolInfo && newToolInfo.tool !== controller.activeTool) {
      controller.setTool(newToolInfo.tool);
      updateActiveToolUI(event.key);
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

  await initializeChat();
});