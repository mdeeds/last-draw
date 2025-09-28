/**
 * A class to interact with the Google Drive API using pure JavaScript and OAuth 2.0.
 *
 * This class handles the OAuth 2.0 Implicit Grant Flow for client-side authentication
 * and provides methods to read and write files in a user's Google Drive.
 */
class GoogleDriveManager {
  /**
   * @param {object} config
   * @param {string} config.clientId - Your Google API client ID.
   * @param {string} config.redirectUri - The URI to redirect to after authentication.
   * @param {string} [config.scope='https://www.googleapis.com/auth/drive.file'] - The scope of Google Drive access.
   */
  constructor({ clientId, redirectUri, scope = 'https://www.googleapis.com/auth/drive.file' }) {
    if (!clientId || !redirectUri) {
      throw new Error("clientId and redirectUri are required.");
    }
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.scope = scope;
    this.token = null;

    this.DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
    this.DRIVE_UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

    this._loadToken();
  }

  /**
   * Loads the token from sessionStorage.
   * @private
   */
  _loadToken() {
    const storedToken = sessionStorage.getItem('google_drive_token');
    if (storedToken) {
      this.token = JSON.parse(storedToken);
      // Simple check for expiration. A more robust solution would check the 'expires_in' value.
      if (this.token.timestamp && (Date.now() - this.token.timestamp > 3500 * 1000)) {
        this.token = null;
        sessionStorage.removeItem('google_drive_token');
      }
    }
  }

  /**
   * Handles the OAuth 2.0 callback by parsing the token from the URL hash.
   * This should be called on your redirect page.
   */
  handleAuthentication() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (accessToken) {
      this.token = {
        access_token: accessToken,
        timestamp: Date.now()
      };
      sessionStorage.setItem('google_drive_token', JSON.stringify(this.token));
      // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
  }

  /**
   * Checks if the user is authenticated and redirects to Google's auth screen if not.
   * @returns {Promise<void>}
   */
  async authenticate() {
    if (!this.token) {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${this.clientId}` +
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(this.scope)}`;

      // Redirect the user to authenticate
      window.location.href = authUrl;

      // This promise will never resolve because of the redirect, but it stops further execution.
      return new Promise(() => { });
    }
  }

  /**
   * Makes an authenticated request to the Google Drive API.
   * @private
   */
  async _apiRequest(url, options = {}) {
    await this.authenticate();

    const headers = new Headers(options.headers || {});
    headers.append('Authorization', `Bearer ${this.token.access_token}`);

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${error.error.message} (Code: ${error.error.code})`);
    }
    return response;
  }

  /**
   * Finds the ID of a folder by name.
   * @private
   * @param {string} folderName - The name of the folder. 'root' can be used for the root directory.
   * @returns {Promise<string>} The folder ID.
   */
  async _getFolderId(folderName) {
    if (folderName.toLowerCase() === 'root') {
      return 'root';
    }
    const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
    const url = `${this.DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    const response = await this._apiRequest(url);
    const data = await response.json();

    if (data.files.length > 0) {
      return data.files[0].id;
    } else {
      throw new Error(`Folder '${folderName}' not found.`);
    }
  }

  /**
   * Finds a file by name within a specific folder.
   * @private
   * @param {string} fileName - The name of the file.
   * @param {string} folderId - The ID of the parent folder.
   * @returns {Promise<object|null>} The file object or null if not found.
   */
  async _findFileInFolder(fileName, folderId) {
    const query = `'${folderId}' in parents and name='${fileName}' and trashed=false`;
    const url = `${this.DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    const response = await this._apiRequest(url);
    const data = await response.json();

    return data.files.length > 0 ? data.files[0] : null;
  }

  /**
   * Retrieves the content of a file from Google Drive.
   * @param {string} folderName - The name of the folder containing the file.
   * @param {string} fileName - The name of the file to retrieve.
   * @returns {Promise<string>} The content of the file.
   */
  async getFile(folderName, fileName) {
    const folderId = await this._getFolderId(folderName);
    const file = await this._findFileInFolder(fileName, folderId);

    if (!file) {
      throw new Error(`File '${fileName}' not found in folder '${folderName}'.`);
    }

    const url = `${this.DRIVE_API_BASE}/files/${file.id}?alt=media`;
    const response = await this._apiRequest(url);
    return response.text();
  }

  /**
   * Creates or updates a file in Google Drive.
   * @param {string} folderName - The name of the folder to place the file in.
   * @param {string} fileName - The name of the file.
   * @param {string} content - The content to write to the file.
   * @returns {Promise<object>} The Google Drive file resource object.
   */
  async putFile(folderName, fileName, content) {
    const folderId = await this._getFolderId(folderName);
    const existingFile = await this._findFileInFolder(fileName, folderId);

    const metadata = {
      name: fileName,
      mimeType: 'text/plain',
    };

    let url;
    let method;

    if (existingFile) {
      // File exists, prepare to update it
      url = `${this.DRIVE_UPLOAD_API_BASE}/files/${existingFile.id}?uploadType=media`;
      method = 'PATCH';
    } else {
      // File does not exist, prepare to create it
      metadata.parents = [folderId];
      url = `${this.DRIVE_UPLOAD_API_BASE}/files?uploadType=multipart`;
      method = 'POST';
    }

    const body = method === 'POST'
      ? this._createMultipartBody(metadata, content)
      : content;

    const headers = method === 'POST'
      ? { 'Content-Type': 'multipart/related; boundary=foo_bar_baz' }
      : { 'Content-Type': 'text/plain' };

    const response = await this._apiRequest(url, {
      method: method,
      headers: headers,
      body: body
    });

    return response.json();
  }

  /**
   * Creates a multipart request body for creating a new file with metadata.
   * @private
   */
  _createMultipartBody(metadata, content) {
    const boundary = 'foo_bar_baz';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/plain\r\n\r\n' +
      content +
      close_delim;

    return multipartRequestBody;
  }
}
