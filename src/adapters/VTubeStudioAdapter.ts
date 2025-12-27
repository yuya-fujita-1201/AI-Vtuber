import WebSocket from 'ws';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IVisualOutputAdapter } from '../interfaces';

export interface VTubeStudioConfig {
  host?: string;
  port?: number;
  pluginName?: string;
  pluginDeveloper?: string;
  authToken?: string;
}

type VTSRequest = {
  apiName?: string;
  apiVersion?: string;
  requestID: string;
  messageType: string;
  data?: Record<string, unknown>;
};

type VTSResponse = {
  apiName: string;
  apiVersion: string;
  timestamp: number;
  requestID: string;
  messageType: string;
  data: any;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class VTubeStudioAdapter implements IVisualOutputAdapter {
  private ws: WebSocket | null = null;
  private requestIdCounter = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private connected = false;
  private authenticated = false;
  private config: Required<VTubeStudioConfig> = {
    host: 'localhost',
    port: 8001,
    pluginName: 'AI-VTuber',
    pluginDeveloper: 'AI-VTuber Developer',
    authToken: ''
  };
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly requestTimeoutMs = 5000;

  async connect(config: VTubeStudioConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    const url = `ws://${this.config.host}:${this.config.port}`;
    console.log(`[VTS] Connecting to ${url}...`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', async () => {
        console.log('[VTS] WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;

        try {
          await this.authenticate();
          console.log('[VTS] Authentication successful');
          resolve();
        } catch (error) {
          console.error('[VTS] Authentication failed:', error);
          reject(error);
        }
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        console.error('[VTS] WebSocket error:', error);
        if (!this.connected) {
          reject(error);
        }
      });

      this.ws.on('close', () => {
        console.log('[VTS] WebSocket closed');
        this.connected = false;
        this.authenticated = false;
        this.handleReconnect();
      });
    });
  }

  async disconnect(): Promise<void> {
    console.log('[VTS] Disconnecting...');
    this.connected = false;
    this.authenticated = false;

    // Clear all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  async setParameter(paramId: string, value: number): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    try {
      await this.send('InjectParameterDataRequest', {
        parameterValues: [
          {
            id: paramId,
            value: Math.max(0, Math.min(1, value))
          }
        ]
      });
    } catch (error) {
      console.warn(`[VTS] Failed to set parameter ${paramId}:`, error);
    }
  }

  async triggerHotkey(hotkeyId: string): Promise<void> {
    if (!this.isConnected() || !hotkeyId) {
      return;
    }

    try {
      await this.send('HotkeyTriggerRequest', {
        hotkeyID: hotkeyId
      });
    } catch (error) {
      console.warn(`[VTS] Failed to trigger hotkey ${hotkeyId}:`, error);
    }
  }

  private async authenticate(): Promise<void> {
    if (this.config.authToken) {
      // Try to authenticate with stored token
      try {
        const response = await this.send('AuthenticationRequest', {
          pluginName: this.config.pluginName,
          pluginDeveloper: this.config.pluginDeveloper,
          authenticationToken: this.config.authToken
        });

        if (response.data?.authenticated) {
          this.authenticated = true;
          return;
        }
      } catch (error) {
        console.warn('[VTS] Stored token authentication failed, requesting new token');
      }
    }

    // Request new token
    const newToken = await this.requestNewToken();
    this.config.authToken = newToken;

    // Save token to .env file
    try {
      await this.saveTokenToEnv(newToken);
      console.log('[VTS] ============================================');
      console.log('[VTS] NEW TOKEN RECEIVED AND SAVED!');
      console.log(`[VTS] Token saved to .env file: VTS_AUTH_TOKEN=${newToken}`);
      console.log('[VTS] ============================================');
    } catch (error) {
      console.warn('[VTS] Failed to save token to .env file:', error);
      console.log('[VTS] ============================================');
      console.log('[VTS] NEW TOKEN RECEIVED! Please manually add to .env:');
      console.log(`[VTS] VTS_AUTH_TOKEN=${newToken}`);
      console.log('[VTS] ============================================');
    }

    // Authenticate with new token
    const response = await this.send('AuthenticationRequest', {
      pluginName: this.config.pluginName,
      pluginDeveloper: this.config.pluginDeveloper,
      authenticationToken: newToken
    });

    if (response.data?.authenticated) {
      this.authenticated = true;
    } else {
      throw new Error('Authentication failed');
    }
  }

  async requestNewToken(): Promise<string> {
    const response = await this.send('AuthenticationTokenRequest', {
      pluginName: this.config.pluginName,
      pluginDeveloper: this.config.pluginDeveloper
    });

    if (!response.data?.authenticationToken) {
      throw new Error('Failed to receive authentication token');
    }

    return response.data.authenticationToken;
  }

  private send(messageType: string, data: Record<string, unknown> = {}): Promise<VTSResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }

    const requestId = this.generateRequestId();
    const request: VTSRequest = {
      apiName: 'VTubeStudioPublicAPI',
      apiVersion: '1.0',
      requestID: requestId,
      messageType,
      data
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${messageType} timed out`));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const response: VTSResponse = JSON.parse(data.toString());
      const pending = this.pendingRequests.get(response.requestID);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.requestID);

        if (response.data?.errorID) {
          pending.reject(new Error(response.data.message || 'VTS API error'));
        } else {
          pending.resolve(response);
        }
      }
    } catch (error) {
      console.error('[VTS] Failed to parse message:', error);
    }
  }

  private generateRequestId(): string {
    return `${Date.now()}-${this.requestIdCounter++}`;
  }

  private async saveTokenToEnv(token: string): Promise<void> {
    const envPath = path.join(process.cwd(), '.env');

    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (error) {
      // .env file doesn't exist, create it
      envContent = '';
    }

    const tokenLine = `VTS_AUTH_TOKEN=${token}`;
    const tokenRegex = /^VTS_AUTH_TOKEN=.*$/m;

    if (tokenRegex.test(envContent)) {
      // Update existing token
      envContent = envContent.replace(tokenRegex, tokenLine);
    } else {
      // Add new token
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += tokenLine + '\n';
    }

    await fs.writeFile(envPath, envContent, 'utf-8');
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[VTS] Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[VTS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (!this.connected) {
        this.connect(this.config).catch((error) => {
          console.error('[VTS] Reconnection failed:', error);
        });
      }
    }, delay);
  }
}
