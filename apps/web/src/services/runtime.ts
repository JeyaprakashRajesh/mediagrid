import { buildRuntimeUrl, createRuntimeClient } from '@mediagrid/api';
import { inferBaseUrl, setActiveRuntimeBaseUrl } from '@mediagrid/api';
import type { CategoryId, WebSocketMessage } from '@mediagrid/types';
import { useAppStore } from '../store/useAppStore';

export const client = createRuntimeClient();

let runtimeEndpointSyncPromise: Promise<string | null> | null = null;

export const ensureRuntimeEndpoint = async (): Promise<string | null> => {
  if (runtimeEndpointSyncPromise) {
    return runtimeEndpointSyncPromise;
  }

  runtimeEndpointSyncPromise = (async () => {
    // If the frontend is loaded on localhost, always prefer loopback.
    // This avoids NAT loopback / routing issues on the host PC.
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        const loopback = 'http://127.0.0.1:3001';
        setActiveRuntimeBaseUrl(loopback);
        client.setBaseUrl(loopback);
        return loopback;
      }
    }

    const inferredBaseUrl = inferBaseUrl();
    const storedBaseUrl = localStorage.getItem('mediagrid_runtime_base_url');

    if (inferredBaseUrl && !inferredBaseUrl.includes('localhost') && !inferredBaseUrl.includes('127.0.0.1')) {
      setActiveRuntimeBaseUrl(inferredBaseUrl);
      client.setBaseUrl(inferredBaseUrl);
      return inferredBaseUrl;
    }

    if (storedBaseUrl && !storedBaseUrl.includes('localhost') && !storedBaseUrl.includes('127.0.0.1')) {
      setActiveRuntimeBaseUrl(storedBaseUrl);
      client.setBaseUrl(storedBaseUrl);
      return storedBaseUrl;
    }

    try {
      // @ts-ignore
      if (window.__TAURI_INTERNALS__) {
        // @ts-ignore
        const endpoint = await window.__TAURI__.invoke<
          string | { baseUrl?: string; websocketUrl?: string } | null
        >('get_runtime_endpoint');
        if (endpoint) {
          const baseUrl = typeof endpoint === 'string' ? endpoint : endpoint.baseUrl ?? null;
          const websocketUrl = typeof endpoint === 'string' ? null : endpoint.websocketUrl ?? null;

          if (baseUrl) {
            setActiveRuntimeBaseUrl(baseUrl);
            client.setBaseUrl(baseUrl);
            if (websocketUrl) {
              client.setWebsocketUrl(websocketUrl);
            }
            localStorage.setItem('mediagrid_runtime_base_url', baseUrl);
            if (websocketUrl) {
              localStorage.setItem('mediagrid_runtime_websocket_url', websocketUrl);
            }
            return baseUrl;
          }
        }
      }
    } catch (err) {
      console.warn('Unable to auto-detect MediaGrid runtime endpoint', err);
    }

    const fallback = inferredBaseUrl || storedBaseUrl || localStorage.getItem('mediagrid_runtime_base_url');
    if (fallback) {
      setActiveRuntimeBaseUrl(fallback);
      client.setBaseUrl(fallback);
      const storedWebsocketUrl = localStorage.getItem('mediagrid_runtime_websocket_url');
      if (storedWebsocketUrl) {
        client.setWebsocketUrl(storedWebsocketUrl);
      }
      return fallback;
    }

    return null;
  })();

  const result = await runtimeEndpointSyncPromise;
  if (!result) {
    runtimeEndpointSyncPromise = null;
  }
  return result;
};

// Initialize token on client start (page refresh case)
const initialToken = localStorage.getItem('mediagrid_token');
if (initialToken) {
  client.setToken(initialToken);
}

// Subscribe to store token changes and propagate them to the SDK client.
// This runs once at module load and keeps the client in sync with login/logout
// without creating a circular import — runtime.ts already imports the store.
useAppStore.subscribe((state, prev) => {
  if (state.token !== prev.token) {
    client.setToken(state.token);
  }
  if (!state.isAuthenticated && prev.isAuthenticated) {
    cleanup();
  }
});

// ─── Tri-state result ─────────────────────────────────────────────────────────
// 'success'        – fully loaded, caller should open WebSocket
// 'unauthenticated'– server reachable but user not logged in; show login screen,
//                    do NOT enter the reconnect loop
// 'error'          – server unreachable; caller should schedule a retry
type FetchResult = 'success' | 'unauthenticated' | 'error';

export const fetchMedia = async (category: CategoryId) => {
  const { setMediaItems, setLoadingMedia } = useAppStore.getState();
  setLoadingMedia(true);
  try {
    const data = await client.media(category);
    setMediaItems(data.items);
  } catch (err) {
    console.error(`Failed to load media for ${category}`, err);
    setMediaItems([]);
  } finally {
    setLoadingMedia(false);
  }
};

export const fetchInitialData = async (retries = 5, targetConnectionId?: number): Promise<FetchResult> => {
  const { setHealth, setRuntime, setCategories, setConnectionState, setIsConfigured } =
    useAppStore.getState();

  await ensureRuntimeEndpoint();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const health = await client.health();
      if (targetConnectionId !== undefined && targetConnectionId !== connectionId) {
        return 'error';
      }
      setHealth(health);

      // Not yet configured — show setup wizard, no auth needed
      if (health.databaseStatus === 'missing' || health.filesystemStatus === 'missing') {
        setIsConfigured(false);
        setConnectionState('connected');
        try {
          const res = await fetch(buildRuntimeUrl('/setup/drives')).then((r) => r.json());
          useAppStore.getState().setAvailableDrives(res.drives || []);
        } catch {
          // drives fetch is best-effort
        }
        return 'success';
      }

      setIsConfigured(true);

      // No token in store — stay on login screen, no point hitting auth-protected routes
      const token = useAppStore.getState().token;
      if (!token) {
        setConnectionState('connected');
        return 'unauthenticated';
      }

      const [runtime, categoriesResponse] = await Promise.all([
        client.runtime(),
        client.categories(),
      ]);
      if (targetConnectionId !== undefined && targetConnectionId !== connectionId) {
        return 'error';
      }
      setRuntime(runtime);
      if (runtime.websocketPort) {
        try {
          const parsed = new URL(client['baseUrl']);
          const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          client.setWebsocketUrl(`${protocol}//${parsed.hostname}:${runtime.websocketPort}/ws`);
        } catch (e) {
          console.warn('Failed to dynamically update websocket URL', e);
        }
      }
      setCategories(categoriesResponse.categories);
      void useAppStore.getState().fetchContinueWatchingItems();
      setConnectionState('connected');
      return 'success';

    } catch (err: any) {
      if (targetConnectionId !== undefined && targetConnectionId !== connectionId) {
        return 'error';
      }
      // 401 / 403 → invalid / expired token; clear it and go to login screen
      const isAuthError =
        err?.message?.includes('401') ||
        err?.message?.includes('403') ||
        err?.status === 401 ||
        err?.status === 403 ||
        String(err).includes('401') ||
        String(err).includes('403');

      if (isAuthError) {
        console.warn('fetchInitialData: auth error – clearing token and showing login');
        setConnectionState('connected');
        useAppStore.getState().setAuth(null, null, null);
        return 'unauthenticated';
      }

      // Any other error (network, 500, etc.) → retry with backoff
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        console.error('fetchInitialData: could not reach runtime server', err);
      }
    }
  }

  return 'error';
};

// ─── WebSocket connection ─────────────────────────────────────────────────────
let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
let reconnectAttempt = 0;
let connectionId = 0;

export const cleanup = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
};

// Exported so App.tsx can call it after login to open the WebSocket
// without going through the full reconnect machinery.
export let openWebSocket: (() => void) | null = null;

export const connectRuntime = () => {
  const currentId = ++connectionId;
  const store = useAppStore.getState();

  cleanup();

  const scheduleReconnect = () => {
    if (currentId !== connectionId) return;
    if (reconnectTimer) return;

    store.setWebsocketStatus('connecting');
    // Exponential backoff capped at 15 s
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 15000);
    reconnectAttempt += 1;

    if (reconnectAttempt > 12) {
      store.setConnectionState('failed');
    } else if (reconnectAttempt > 2) {
      store.setConnectionState('reconnecting');
    } else {
      store.setConnectionState('offline');
    }

    reconnectTimer = window.setTimeout(async () => {
      if (currentId !== connectionId) return;
      reconnectTimer = undefined;

      const result = await fetchInitialData(2, currentId);
      if (currentId !== connectionId) return;

      if (result === 'success') {
        reconnectAttempt = 0;
        connect();
      } else if (result === 'unauthenticated') {
        // Server is alive but we're not logged in — stop reconnecting;
        // the login screen is already visible.
        reconnectAttempt = 0;
      } else {
        // Network error — keep retrying
        scheduleReconnect();
      }
    }, delay);
  };

  const handleMessage = (msg: WebSocketMessage) => {
    if (currentId !== connectionId) return;
    const s = useAppStore.getState();
    switch (msg.type) {
      case 'RUNTIME_READY':
        s.setRuntime(msg.runtime);
        s.setWebsocketStatus('connected');
        s.setConnectionState('connected');
        break;
      case 'CATEGORY_UPDATED':
        s.updateCategory(msg.category);
        if (s.selectedCategory === msg.category.id) fetchMedia(s.selectedCategory);
        break;
      case 'MEDIA_ADDED':
        s.addMediaItem(msg.media);
        client.categories().then((r) => s.setCategories(r.categories)).catch(() => {});
        break;
      case 'MEDIA_REMOVED':
        s.removeMediaItem(msg.mediaId, msg.category);
        client.categories().then((r) => s.setCategories(r.categories)).catch(() => {});
        break;
      case 'FILESYSTEM_REPAIRED':
        s.setErrorMessage(`Filesystem repaired: ${msg.repairedPaths.join(', ')}`);
        fetchInitialData(5, currentId);
        break;
      case 'WATCH_PROGRESS_UPDATED' as any:
        s.fetchContinueWatchingItems();
        break;
    }
  };

  const connect = async () => {
    if (currentId !== connectionId) return;
    try {
      await ensureRuntimeEndpoint();
      if (currentId !== connectionId) return;
      const s = useAppStore.getState();
      s.setWebsocketStatus('connecting');
      socket = client.connectWebSocket(handleMessage);

      socket.addEventListener('open', () => {
        if (currentId !== connectionId) return;
        reconnectAttempt = 0;
        const s = useAppStore.getState();
        s.setWebsocketStatus('connected');
        s.setConnectionState('connected');
        s.setErrorMessage(null);
        // Refresh data now that we have a live channel
        fetchInitialData(5, currentId).then((result) => {
          if (currentId !== connectionId) return;
          if (result === 'success') fetchMedia(useAppStore.getState().selectedCategory);
        });
      });

      socket.addEventListener('close', () => {
        if (currentId !== connectionId) return;
        cleanup();
        // Only reconnect if the user is still authenticated
        if (useAppStore.getState().isAuthenticated) {
          scheduleReconnect();
        }
      });

      socket.addEventListener('error', () => {
        if (currentId !== connectionId) return;
        cleanup();
        if (useAppStore.getState().isAuthenticated) {
          scheduleReconnect();
        }
      });
    } catch {
      if (currentId !== connectionId) return;
      cleanup();
      if (useAppStore.getState().isAuthenticated) {
        scheduleReconnect();
      }
    }
  };

  // Expose connect() so App.tsx can call it after login
  openWebSocket = connect;

  // Kickstart
  store.setConnectionState('connecting');
  if (store.isAuthenticated) {
    void fetchInitialData(0, currentId).then((result) => {
      if (currentId !== connectionId) return;
      if (result === 'success') {
        void connect();
      } else if (result === 'unauthenticated') {
        // Stale token has been cleared, login screen is now visible
      } else {
        // Network error (server offline/reachable but request failed)
        // Fall back to trying to connect/reconnect
        void connect();
      }
    });
  } else {
    void fetchInitialData(5, currentId).then((result) => {
      if (currentId !== connectionId) return;
      if (result === 'unauthenticated') {
        // Server is reachable, user just needs to log in — stop here.
        // connectionState is already 'connected' so the login screen renders.
        reconnectAttempt = 0;
      }
    });
  }

  return () => {
    openWebSocket = null;
    if (currentId === connectionId) cleanup();
  };
};

export const submitSetup = async (storageRoot: string) => {
  const store = useAppStore.getState();
  store.setIsSettingUp(true);
  try {
    await ensureRuntimeEndpoint();
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      // @ts-ignore
      await window.__TAURI__.invoke('setup_runtime', { storageRoot });
    } else {
      const res = await fetch(buildRuntimeUrl('/setup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_root: storageRoot }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Setup failed');
      }
      await res.json();
    }

    store.setIsConfigured(true);
    await fetchInitialData();
    fetchMedia(store.selectedCategory);
    return { success: true };
  } catch (err: any) {
    console.error('Setup failed', err);
    return { success: false, error: err.message || 'Setup execution failed' };
  } finally {
    store.setIsSettingUp(false);
  }
};

export const browseStorageRoot = async (): Promise<string | null> => {
  // @ts-ignore
  if (window.__TAURI_INTERNALS__) {
    // @ts-ignore
    return await window.__TAURI__.invoke('select_storage_root');
  }
  return null;
};
