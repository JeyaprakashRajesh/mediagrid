import { afterEach, describe, it, expect, vi } from 'vitest';
import { normalizeBaseUrl, inferBaseUrl, inferWebsocketUrl, createRuntimeClient } from './index';

describe('@mediagrid/api unit tests', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalWindow) {
      vi.stubGlobal('window', originalWindow);
    } else {
      delete (globalThis as typeof globalThis & { window?: Window }).window;
    }
  });

  it('should normalize base URL properly', () => {
    expect(normalizeBaseUrl('http://localhost:3001/')).toBe('http://localhost:3001');
    expect(normalizeBaseUrl('http://localhost:3001///')).toBe('http://localhost:3001');
    expect(normalizeBaseUrl('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
  });

  it('should infer websocket URL correctly', () => {
    expect(inferWebsocketUrl('http://localhost:3001')).toBe('ws://localhost:3001/ws');
    expect(inferWebsocketUrl('http://127.0.0.1:3001')).toBe('ws://127.0.0.1:3001/ws');
    expect(inferWebsocketUrl('https://mediagrid.local:3001')).toBe('wss://mediagrid.local:3001/ws');
  });

  it('should default runtime base URL to the local backend host', () => {
    expect(inferBaseUrl()).toBe('http://127.0.0.1:3001');
  });

  it('should infer the browser runtime host when the page is served from a remote host', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: '100.114.38.105',
      },
    } as Window & typeof globalThis.window);

    expect(inferBaseUrl()).toBe('http://100.114.38.105:3001');
  });

  it('should prefer the browser origin over a stored loopback base URL', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    });

    localStorage.setItem('mediagrid_runtime_base_url', 'http://127.0.0.1:3001');
    vi.stubGlobal('window', {
      location: {
        hostname: '100.114.38.105',
      },
    } as Window & typeof globalThis.window);

    expect(inferBaseUrl()).toBe('http://100.114.38.105:3001');
  });

  it('should make client API request for health, runtime, categories and media', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ runtimeStatus: 'ready', filesystemStatus: 'ready', databaseStatus: 'ready', websocketConnected: false }),
        });
      }
      if (url.endsWith('/runtime')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ runtimeVersion: '0.1.0', storageRoot: 'C:/MediaGrid', serverPort: 3001, websocketPort: 3002 }),
        });
      }
      if (url.endsWith('/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ categories: [] }),
        });
      }
      if (url.includes('/media/movies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ category: 'movies', items: [] }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const client = createRuntimeClient({ baseUrl: 'http://localhost:3001', fetchImpl: mockFetch as any });

    const health = await client.health();
    expect(health.runtimeStatus).toBe('ready');

    const runtime = await client.runtime();
    expect(runtime.storageRoot).toBe('C:/MediaGrid');

    const cats = await client.categories();
    expect(cats.categories).toEqual([]);

    const media = await client.media('movies');
    expect(media.category).toBe('movies');
  });
});
