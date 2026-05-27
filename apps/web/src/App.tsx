import { useEffect, useMemo, useState } from 'react';
import { createRuntimeClient } from '@mediagrid/api';
import {
  CATEGORY_DEFINITIONS,
  type CategoryDefinition,
  type CategoryId,
  type HealthResponse,
  type MediaItem,
  type RuntimeInfo,
  type WebSocketMessage,
} from '@mediagrid/types';
import './App.css';

const runtimeClient = createRuntimeClient();

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

const getCategoryLabel = (categoryId: CategoryId): string =>
  CATEGORY_DEFINITIONS.find((definition) => definition.id === categoryId)?.name ?? categoryId;

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>('movies');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCategoryDefinition = useMemo(
    () => categories.find((category) => category.id === activeCategory) ?? null,
    [activeCategory, categories],
  );

  useEffect(() => {
    let cancelled = false;

    const loadRuntimeData = async () => {
      try {
        const [healthResponse, runtimeResponse, categoryResponse] = await Promise.all([
          runtimeClient.health(),
          runtimeClient.runtime(),
          runtimeClient.categories(),
        ]);

        if (cancelled) {
          return;
        }

        setHealth(healthResponse);
        setRuntime(runtimeResponse);
        setCategories(categoryResponse.categories);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unable to reach the runtime.');
        setHealth(null);
        setRuntime(null);
        setCategories(CATEGORY_DEFINITIONS.map((definition) => ({ ...definition })));
      } finally {
        if (!cancelled) {
        }
      }
    };

    void loadRuntimeData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCategoryMedia = async () => {
      setLoadingMedia(true);

      try {
        const response = await runtimeClient.media(activeCategory);

        if (cancelled) {
          return;
        }

        setMediaItems(response.items);
      } catch {
        if (!cancelled) {
          setMediaItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMedia(false);
        }
      }
    };

    void loadCategoryMedia();

    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | undefined;
    let socket: WebSocket | null = null;
    let attempt = 0;

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }

      setConnectionState(attempt === 0 ? 'offline' : 'reconnecting');
      reconnectTimer = window.setTimeout(() => {
        attempt += 1;
        connect();
      }, Math.min(1000 * 2 ** attempt, 10000));
    };

    const handleMessage = (message: WebSocketMessage) => {
      if (message.type === 'RUNTIME_READY') {
        setRuntime(message.runtime);
        setConnectionState('connected');
        return;
      }

      if (message.type === 'CATEGORY_UPDATED') {
        setCategories((currentCategories) =>
          currentCategories.map((category) =>
            category.id === message.category.id ? message.category : category,
          ),
        );

        if (message.category.id === activeCategory) {
          void runtimeClient.media(activeCategory).then((response) => {
            if (!cancelled) {
              setMediaItems(response.items);
            }
          });
        }
      }

      if (message.type === 'MEDIA_ADDED' && message.media.category === activeCategory) {
        setMediaItems((currentItems) => [message.media, ...currentItems]);
      }

      if (message.type === 'MEDIA_REMOVED' && message.category === activeCategory) {
        setMediaItems((currentItems) =>
          currentItems.filter((item) => item.id !== message.mediaId),
        );
      }

      if (message.type === 'FILESYSTEM_REPAIRED') {
        setErrorMessage(`Filesystem repaired: ${message.repairedPaths.join(', ')}`);
      }
    };

    const connect = () => {
      try {
        socket = runtimeClient.connectWebSocket((message) => {
          handleMessage(message);
        });

        socket.addEventListener('open', () => {
          if (!cancelled) {
            attempt = 0;
            setConnectionState('connected');
          }
        });

        socket.addEventListener('close', () => {
          if (!cancelled) {
            scheduleReconnect();
          }
        });

        socket.addEventListener('error', () => {
          if (!cancelled) {
            setConnectionState('offline');
          }
        });
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      cancelled = true;

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [activeCategory]);

  const displayedCategories = categories.length > 0 ? categories : (CATEGORY_DEFINITIONS as CategoryDefinition[]);
  const isEmptyCategory = !loadingMedia && mediaItems.length === 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark">MG</span>
          <div>
            <p className="eyebrow">Runtime-first</p>
            <h1>MediaGrid</h1>
          </div>
        </div>

        <div className={`connection-banner connection-${connectionState}`}>
          <span className="connection-dot" />
          <span>{connectionState === 'connected' ? 'Runtime connected' : 'Waiting for runtime'}</span>
        </div>

        <nav className="category-nav" aria-label="Media categories">
          {displayedCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`category-pill ${category.id === activeCategory ? 'active' : ''}`}
              onClick={() => setActiveCategory(category.id)}
            >
              <span>
                <strong>{category.name}</strong>
                <small>{category.folder}</small>
              </span>
              <b>{category.itemCount}</b>
            </button>
          ))}
        </nav>

        <section className="sidebar-summary">
          <h2>Runtime Summary</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{health?.runtimeStatus ?? 'offline'}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{runtime?.storageRoot ?? 'C:/MediaGrid'}</dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>{health?.databaseStatus ?? 'missing'}</dd>
            </div>
          </dl>
        </section>
      </aside>

      <main className="dashboard">
        <header className="hero-panel">
          <div>
            <p className="eyebrow">Phase 1 implementation</p>
            <h2>{getCategoryLabel(activeCategory)}</h2>
            <p>
              Runtime status, filesystem repair state, category navigation, and media access are
              wired into a single local-first control surface.
            </p>
          </div>

          <div className="hero-metrics">
            <div>
              <span>WebSocket</span>
              <strong>{connectionState}</strong>
            </div>
            <div>
              <span>Categories</span>
              <strong>{displayedCategories.length}</strong>
            </div>
            <div>
              <span>Media</span>
              <strong>{mediaItems.length}</strong>
            </div>
          </div>
        </header>

        <section className="content-grid">
          <article className="panel panel-wide">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Category view</p>
                <h3>{activeCategoryDefinition?.name ?? getCategoryLabel(activeCategory)}</h3>
              </div>
              <span className="panel-badge">
                {activeCategoryDefinition?.itemCount ?? mediaItems.length} items
              </span>
            </div>

            {loadingMedia ? (
              <div className="empty-state">
                <h4>Loading category</h4>
                <p>Fetching the latest media index from the runtime.</p>
              </div>
            ) : isEmptyCategory ? (
              <div className="empty-state">
                <h4>No media indexed yet</h4>
                <p>
                  Once the runtime scans {activeCategoryDefinition?.folder ?? activeCategory}, the
                  items will appear here.
                </p>
              </div>
            ) : (
              <div className={activeCategory === 'photos' ? 'photo-grid media-grid' : 'media-grid'}>
                {mediaItems.map((item) => (
                  <article className="media-card" key={item.id}>
                    <div className="media-card-art">
                      {item.thumbnailPath ? (
                        <img src={item.thumbnailPath} alt={item.title} />
                      ) : (
                        <span>{item.kind}</span>
                      )}
                    </div>
                    <div className="media-card-body">
                      <h4>{item.title}</h4>
                      <p>{item.path}</p>
                      <div className="media-meta">
                        <span>{item.artist ?? item.kind}</span>
                        <span>{item.album ?? getCategoryLabel(item.category)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <aside className="panel panel-side">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Runtime health</p>
                <h3>System status</h3>
              </div>
            </div>

            <dl className="status-list">
              <div>
                <dt>Runtime</dt>
                <dd>{runtime?.runtimeStatus ?? 'offline'}</dd>
              </div>
              <div>
                <dt>Filesystem</dt>
                <dd>{health?.filesystemStatus ?? 'missing'}</dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd>{health?.databaseStatus ?? 'missing'}</dd>
              </div>
              <div>
                <dt>Last scan</dt>
                <dd>{runtime?.lastScanAt ?? 'not scanned yet'}</dd>
              </div>
              <div>
                <dt>Last repair</dt>
                <dd>{runtime?.lastRepairAt ?? 'no repair recorded'}</dd>
              </div>
            </dl>

            <div className="message-box">
              <h4>Runtime message</h4>
              <p>
                {errorMessage ?? 'The dashboard is waiting for the runtime to report readiness.'}
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App
