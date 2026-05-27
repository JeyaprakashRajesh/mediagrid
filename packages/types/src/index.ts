export type CategoryId =
  | 'movies'
  | 'music'
  | 'shows'
  | 'photos'
  | 'downloads';

export type MediaKind = 'movie' | 'music' | 'show' | 'photo' | 'download' | 'unknown';

export type RuntimeStatus = 'starting' | 'ready' | 'degraded' | 'offline' | 'stopped';

export type FilesystemStatus = 'missing' | 'repairing' | 'ready' | 'error';

export type DatabaseStatus = 'missing' | 'initializing' | 'ready' | 'error';

export type HealthResponse = {
  runtimeStatus: RuntimeStatus;
  filesystemStatus: FilesystemStatus;
  databaseStatus: DatabaseStatus;
  websocketConnected: boolean;
};

export type RuntimeInfo = {
  runtimeVersion: string;
  storageRoot: string;
  serverPort: number;
  websocketPort: number;
  runtimeStatus: RuntimeStatus;
  filesystemStatus: FilesystemStatus;
  databaseStatus: DatabaseStatus;
  lastScanAt: string | null;
  lastRepairAt: string | null;
};

export type CategoryDefinition = {
  id: CategoryId;
  name: string;
  folder: string;
  itemCount: number;
  lastScannedAt: string | null;
};

export type MediaItem = {
  id: string;
  title: string;
  path: string;
  kind: MediaKind;
  category: CategoryId;
  createdAt: string;
  updatedAt: string;
  artist?: string | null;
  album?: string | null;
  thumbnailPath?: string | null;
  previewPath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type MediaListResponse = {
  category: CategoryId;
  items: MediaItem[];
  total: number;
};

export type CategoryListResponse = {
  categories: CategoryDefinition[];
  total: number;
};

export type WebSocketEventType =
  | 'RUNTIME_READY'
  | 'CATEGORY_UPDATED'
  | 'MEDIA_ADDED'
  | 'MEDIA_REMOVED'
  | 'FILESYSTEM_REPAIRED';

export type RuntimeWebSocketMessage<TType extends WebSocketEventType = WebSocketEventType> = {
  type: TType;
  timestamp: string;
};

export type RuntimeReadyMessage = RuntimeWebSocketMessage<'RUNTIME_READY'> & {
  runtime: RuntimeInfo;
};

export type CategoryUpdatedMessage = RuntimeWebSocketMessage<'CATEGORY_UPDATED'> & {
  category: CategoryDefinition;
};

export type MediaAddedMessage = RuntimeWebSocketMessage<'MEDIA_ADDED'> & {
  media: MediaItem;
};

export type MediaRemovedMessage = RuntimeWebSocketMessage<'MEDIA_REMOVED'> & {
  mediaId: string;
  category: CategoryId;
};

export type FilesystemRepairedMessage = RuntimeWebSocketMessage<'FILESYSTEM_REPAIRED'> & {
  repairedPaths: string[];
};

export type WebSocketMessageMap = {
  RUNTIME_READY: RuntimeReadyMessage;
  CATEGORY_UPDATED: CategoryUpdatedMessage;
  MEDIA_ADDED: MediaAddedMessage;
  MEDIA_REMOVED: MediaRemovedMessage;
  FILESYSTEM_REPAIRED: FilesystemRepairedMessage;
};

export type WebSocketMessage = WebSocketMessageMap[WebSocketEventType];

export type AppConfig = {
  storageRoot: string;
  serverPort: number;
  websocketPort: number;
  mediaFolders: Record<CategoryId, string>;
};

export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  { id: 'movies', name: 'Movies', folder: 'media/movies', itemCount: 0, lastScannedAt: null },
  { id: 'music', name: 'Music', folder: 'media/music', itemCount: 0, lastScannedAt: null },
  { id: 'shows', name: 'Shows', folder: 'media/shows', itemCount: 0, lastScannedAt: null },
  { id: 'photos', name: 'Photos', folder: 'media/photos', itemCount: 0, lastScannedAt: null },
  { id: 'downloads', name: 'Downloads', folder: 'media/downloads', itemCount: 0, lastScannedAt: null },
] as const;

export const MEDIA_EXTENSIONS: Record<CategoryId, readonly string[]> = {
  movies: ['mp4', 'mkv', 'avi'],
  music: ['mp3', 'flac', 'wav'],
  shows: ['mp4', 'mkv', 'avi'],
  photos: ['jpg', 'png', 'webp'],
  downloads: [],
};

export const createDefaultAppConfig = (): AppConfig => ({
  storageRoot: 'C:/MediaGrid',
  serverPort: 3001,
  websocketPort: 3002,
  mediaFolders: {
    movies: 'media/movies',
    music: 'media/music',
    shows: 'media/shows',
    photos: 'media/photos',
    downloads: 'media/downloads',
  },
});

export const getCategoryDefinition = (categoryId: CategoryId): CategoryDefinition =>
  CATEGORY_DEFINITIONS.find((definition) => definition.id === categoryId) ?? CATEGORY_DEFINITIONS[0];
