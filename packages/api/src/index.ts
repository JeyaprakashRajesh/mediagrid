import type {
  CategoryId,
  CategoryListResponse,
  HealthResponse,
  MediaListResponse,
  RuntimeInfo,
  WebSocketEventType,
  WebSocketMessage,
  WebSocketMessageMap,
} from '@mediagrid/types';

export type RuntimeClientOptions = {
  baseUrl?: string;
  websocketUrl?: string;
  fetchImpl?: typeof fetch;
};

const RUNTIME_BASE_URL_STORAGE_KEY = 'mediagrid_runtime_base_url';

let activeRuntimeBaseUrl: string | null = null;

export type RuntimeEventHandler<TType extends WebSocketEventType> = (
  message: WebSocketMessageMap[TType],
) => void;

export class RuntimeClient {
  private baseUrl: string;

  private websocketUrl?: string;

  private readonly fetchImpl: typeof fetch;

  constructor(options: RuntimeClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? inferBaseUrl());
    this.websocketUrl = options.websocketUrl ?? inferWebsocketUrl(this.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.websocketUrl = inferWebsocketUrl(this.baseUrl);
  }

  setWebsocketUrl(websocketUrl: string) {
    this.websocketUrl = websocketUrl.trim();
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  async runtime(): Promise<RuntimeInfo> {
    return this.request<RuntimeInfo>('/runtime');
  }

  async categories(): Promise<CategoryListResponse> {
    return this.request<CategoryListResponse>('/categories');
  }

  async media(category: CategoryId): Promise<MediaListResponse> {
    return this.request<MediaListResponse>(`/media/${category}`);
  }

  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  async login(body: any): Promise<any> {
    return this.request('/auth/login', { method: 'POST', body });
  }

  async logout(): Promise<any> {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async refresh(): Promise<any> {
    return this.request('/auth/refresh', { method: 'POST' });
  }

  async me(): Promise<any> {
    return this.request('/auth/me');
  }

  async getDevices(): Promise<any[]> {
    return this.request('/devices');
  }

  async pairDevice(body: any): Promise<any> {
    return this.request('/devices/pair', { method: 'POST', body });
  }

  async getPairStatus(deviceId: string): Promise<any> {
    return this.request(`/devices/pair/status?deviceId=${deviceId}`);
  }

  async getPairingToken(): Promise<any> {
    return this.request('/devices/pairing-token', { method: 'POST' });
  }

  async trustDevice(deviceId: string, trusted: boolean): Promise<any> {
    return this.request(`/devices/${deviceId}/trust`, { method: 'POST', body: { trusted } });
  }

  async renameDevice(deviceId: string, name: string): Promise<any> {
    return this.request(`/devices/${deviceId}/rename`, { method: 'POST', body: { name } });
  }

  async removeDevice(deviceId: string): Promise<any> {
    return this.request(`/devices/${deviceId}`, { method: 'DELETE' });
  }

  async getRemoteRuntime(): Promise<any> {
    return this.request('/remote/runtime');
  }

  async getRemoteSessions(): Promise<any> {
    return this.request('/remote/sessions');
  }

  async getAudioPlaylists(): Promise<any> {
    return this.request('/audio/playlists');
  }

  async createAudioPlaylist(name: string, mediaIds: string[], id?: string): Promise<any> {
    return this.request('/audio/playlists', { method: 'POST', body: { id, name, mediaIds } });
  }

  async deleteAudioPlaylist(playlistId: string): Promise<any> {
    return this.request(`/audio/playlists/${playlistId}`, { method: 'DELETE' });
  }

  async getAudioQueue(): Promise<any> {
    return this.request('/audio/queue');
  }

  async saveAudioQueue(currentIndex: number, mediaIds: string[], shuffle: boolean, repeat: string): Promise<any> {
    return this.request('/audio/queue', { method: 'POST', body: { currentIndex, mediaIds, shuffle, repeat } });
  }

  connectWebSocket(onMessage: (message: WebSocketMessage) => void): WebSocket {
    if (!this.websocketUrl) {
      throw new Error('WebSocket URL is not available for this client');
    }

    const token = this.token ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('mediagrid_token') : null);
    const url = token ? `${this.websocketUrl}?token=${token}` : this.websocketUrl;
    const socket = new WebSocket(url);
    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as WebSocketMessage;
        onMessage(parsed);
      } catch {
        // Ignore malformed messages so reconnect logic can continue.
      }
    });

    return socket;
  }

  on<TType extends WebSocketEventType>(
    socket: WebSocket,
    type: TType,
    handler: RuntimeEventHandler<TType>,
  ): () => void {
    const listener = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data)) as WebSocketMessage;
        if (parsed.type === type) {
          handler(parsed as WebSocketMessageMap[TType]);
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    socket.addEventListener('message', listener);

    return () => {
      socket.removeEventListener('message', listener);
    };
  }

  private async request<TResponse>(
    path: string,
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<TResponse> {
    const method = options.method ?? 'GET';
    const timeoutMs = options.timeoutMs ?? 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = { ...options.headers };
    
    // Add token
    const token = this.token ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('mediagrid_token') : null);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let requestBody: any = undefined;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(options.body);
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = new Error(`Request failed for ${path} with status ${response.status}`);
        (err as any).status = response.status;
        throw err;
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

export const createRuntimeClient = (options?: RuntimeClientOptions) => new RuntimeClient(options);

export const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return trimmed;
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
};

export const getStoredRuntimeBaseUrl = (): string | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const stored = localStorage.getItem(RUNTIME_BASE_URL_STORAGE_KEY);
  return stored ? normalizeBaseUrl(stored) : null;
};

export const getActiveRuntimeBaseUrl = (): string | null => activeRuntimeBaseUrl;

export const setActiveRuntimeBaseUrl = (baseUrl: string | null): void => {
  activeRuntimeBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : null;
};

export const setStoredRuntimeBaseUrl = (baseUrl: string): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(RUNTIME_BASE_URL_STORAGE_KEY, normalizeBaseUrl(baseUrl));
};

export const clearStoredRuntimeBaseUrl = (): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(RUNTIME_BASE_URL_STORAGE_KEY);
};

export const buildRuntimeUrl = (path: string, baseUrl = inferBaseUrl()): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const effectiveBaseUrl = getActiveRuntimeBaseUrl() ?? baseUrl;
  return `${normalizeBaseUrl(effectiveBaseUrl)}${normalizedPath}`;
};

export const inferBaseUrl = (): string => {
  if (activeRuntimeBaseUrl) {
    return activeRuntimeBaseUrl;
  }

  // If the frontend is loaded on localhost, always prefer loopback.
  // Connecting to a computer's own Tailscale IP from the local computer itself
  // can fail or timeout due to routing/firewall loopback limitations.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'http://127.0.0.1:3001';
    }
  }

  const storedBaseUrl = getStoredRuntimeBaseUrl();
  const browserRuntimeBaseUrl = getBrowserRuntimeBaseUrl();

  if (storedBaseUrl && !isLoopbackBaseUrl(storedBaseUrl)) {
    return storedBaseUrl;
  }

  if (browserRuntimeBaseUrl && !isLoopbackBaseUrl(browserRuntimeBaseUrl)) {
    return browserRuntimeBaseUrl;
  }

  const env = (import.meta as ImportMeta & {
    env?: {
      VITE_MEDIAGRID_BASE_URL?: string;
      VITE_RUNTIME_BASE_URL?: string;
      VITE_API_BASE_URL?: string;
    };
  }).env;

  const configuredBaseUrl = env?.VITE_MEDIAGRID_BASE_URL ?? env?.VITE_RUNTIME_BASE_URL ?? env?.VITE_API_BASE_URL;

  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  if (storedBaseUrl) {
    return storedBaseUrl;
  }

  return 'http://127.0.0.1:3001';
};

const getBrowserRuntimeBaseUrl = (): string | null => {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return null;
  }

  const hostname = window.location.hostname.trim();
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return null;
  }

  return normalizeBaseUrl(`http://${hostname}:3001`);
};

const isLoopbackBaseUrl = (baseUrl: string): boolean => {
  try {
    const parsed = new URL(normalizeBaseUrl(baseUrl));
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  } catch {
    return false;
  }
};

export const inferWebsocketUrl = (baseUrl: string): string => {
  const parsed = new URL(baseUrl);
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  let host = parsed.host;
  if (parsed.port === '3001') {
    host = `${parsed.hostname}:3002`;
  }

  return `${protocol}//${host}/ws`;
};

export type { CategoryDefinition, CategoryId, HealthResponse, MediaListResponse, RuntimeInfo, WebSocketMessage } from '@mediagrid/types';
