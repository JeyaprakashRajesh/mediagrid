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

export type RuntimeEventHandler<TType extends WebSocketEventType> = (
  message: WebSocketMessageMap[TType],
) => void;

export class RuntimeClient {
  private readonly baseUrl: string;

  private readonly websocketUrl?: string;

  private readonly fetchImpl: typeof fetch;

  constructor(options: RuntimeClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? inferBaseUrl());
    this.websocketUrl = options.websocketUrl ?? inferWebsocketUrl(this.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
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

  connectWebSocket(onMessage: (message: WebSocketMessage) => void): WebSocket {
    if (!this.websocketUrl) {
      throw new Error('WebSocket URL is not available for this client');
    }

    const socket = new WebSocket(this.websocketUrl);
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

  private async request<TResponse>(path: string): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);

    if (!response.ok) {
      throw new Error(`Request failed for ${path} with status ${response.status}`);
    }

    return (await response.json()) as TResponse;
  }
}

export const createRuntimeClient = (options?: RuntimeClientOptions) => new RuntimeClient(options);

export const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

export const inferBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  return `${window.location.protocol}//${window.location.hostname}:3001`;
};

export const inferWebsocketUrl = (baseUrl: string): string => {
  const parsed = new URL(baseUrl);
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${protocol}//${parsed.hostname}:3002`;
};

export type { CategoryDefinition, CategoryId, HealthResponse, MediaListResponse, RuntimeInfo, WebSocketMessage } from '@mediagrid/types';
