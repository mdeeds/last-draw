// See: https://ai.google.dev/gemini-api/docs/image-generation#image_generation_text-to-image

// No dice: "gemini-2.5-flash-image";
// No dice: "gemini-2.5-flash-image-preview"
// Bogus: "gemini-2.5-flash-lite-image"
// Text only: "gemini-2.0-flash-exp-image-generation"

// Text only: "gemini-flash-latest"

const MODEL_NAME = "gemini-flash-latest";

export class GeminiChat {
  /**
   * @param {HTMLElement} containerEl The element to build the chat UI in.
   * @param {string} apiKey The Google AI API key.
   */
  constructor(containerEl, apiKey) {
    if (!containerEl) {
      throw new Error("Container element not provided for GeminiChat.");
    }
    if (!apiKey) {
      throw new Error("API key not provided for GeminiChat.");
    }

    this.container = containerEl;
    this.apiKey = apiKey;
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${this.apiKey}`;
    this.history = [];

    this.setupUI();
  }

  setupUI() {
    this.container.classList.add('chat-container');

    this.messagesContainer = document.createElement('div');
    this.messagesContainer.classList.add('chat-messages');

    this.inputBox = document.createElement('div');
    this.inputBox.classList.add('chat-input-box');
    this.inputBox.contentEditable = 'true';
    this.inputBox.setAttribute('placeholder', 'Ask Gemini...');

    this.container.append(this.messagesContainer, this.inputBox);

    this.inputBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const prompt = this.inputBox.textContent.trim();
        if (prompt) {
          this.sendMessage(prompt);
          this.inputBox.textContent = '';
        }
      }
    });
  }

  /**
   * 
   * @param {Uint8ClampedArray} imageData RGBA encoded image data.
   */
  setImage(imageData, width, height) {
    this.imageWidth = width;
    this.imageHeight = height;
    this.imageData = imageData;
  }

  /**
   * @param {string} role "user" or "model"
   * @param {string} text The message content
   */
  addMessageToUI(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', `${role}-message`);
    messageDiv.textContent = text;
    this.messagesContainer.appendChild(messageDiv);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  async sendMessage(prompt) {
    this.addMessageToUI('user', prompt);

    const userParts = [{ text: prompt }];

    if (this.imageData && this.imageWidth && this.imageHeight) {
      // Create a temporary canvas to encode the PNG
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.imageWidth;
      tempCanvas.height = this.imageHeight;
      const ctx = tempCanvas.getContext('2d');

      if (ctx) {
        // The image data from WebGL's readPixels is flipped vertically.
        // We need to draw it to a canvas and then flip it back.
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = this.imageWidth;
        sourceCanvas.height = this.imageHeight;
        const sourceCtx = sourceCanvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(this.imageData.buffer), this.imageWidth, this.imageHeight);
        sourceCtx.putImageData(imgData, 0, 0);

        // Flip the image vertically when drawing to the destination canvas
        ctx.save();
        ctx.translate(0, this.imageHeight);
        ctx.scale(1, -1);
        ctx.drawImage(sourceCanvas, 0, 0);
        ctx.restore();
        const dataUrl = tempCanvas.toDataURL('image/png');
        const base64Data = dataUrl.substring('data:image/png;base64,'.length);

        userParts.unshift({
          inline_data: {
            mime_type: 'image/png',
            data: base64Data
          }
        });

        // Clear the image data after adding it to the message parts
        this.clearImageData();
      }
    }

    this.history.push({ role: 'user', parts: userParts });

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: this.history,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const modelResponse = data.candidates[0].content.parts[0].text;

      this.addMessageToUI('model', modelResponse);
      this.history.push({ role: 'model', parts: [{ text: modelResponse }] });

    } catch (error) {
      console.error("Error calling Gemini API:", error);
      this.addMessageToUI('model', 'Sorry, I encountered an error.');
    }
  }

  clearImageData() {
    this.imageData = undefined;
    this.imageWidth = undefined;
    this.imageHeight = undefined;
  }
}