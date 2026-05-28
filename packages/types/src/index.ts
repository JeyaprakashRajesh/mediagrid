export type CategoryId =
  | 'movies'
  | 'music'
  | 'photos'
  | 'drive';

export type MediaKind = 'movie' | 'music' | 'photo' | 'drive' | 'unknown';

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
  duration?: number | null;
  codec?: string | null;
  resolution?: string | null;
  format?: string | null;
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
  | 'FILESYSTEM_REPAIRED'
  | 'STREAM_STARTED'
  | 'STREAM_STOPPED'
  | 'TRANSCODE_STARTED'
  | 'TRANSCODE_COMPLETED'
  | 'WATCH_PROGRESS_UPDATED'
  | 'PLAYBACK_ERROR';

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

export type StreamStartedMessage = RuntimeWebSocketMessage<'STREAM_STARTED'> & {
  sessionId: string;
  mediaId: string;
  deviceId: string;
  mode: string;
  streamUrl: string;
};

export type StreamStoppedMessage = RuntimeWebSocketMessage<'STREAM_STOPPED'> & {
  sessionId: string;
};

export type TranscodeStartedMessage = RuntimeWebSocketMessage<'TRANSCODE_STARTED'> & {
  sessionId: string;
  quality: string;
};

export type TranscodeCompletedMessage = RuntimeWebSocketMessage<'TRANSCODE_COMPLETED'> & {
  sessionId: string;
  mediaId: string;
  quality: string;
  jobId: string;
};

export type WatchProgressUpdatedMessage = RuntimeWebSocketMessage<'WATCH_PROGRESS_UPDATED'> & {
  mediaId: string;
  progress: number;
};

export type PlaybackErrorMessage = RuntimeWebSocketMessage<'PLAYBACK_ERROR'> & {
  sessionId: string;
  mediaId: string;
  error: string;
  jobId?: string;
};

export type WebSocketMessageMap = {
  RUNTIME_READY: RuntimeReadyMessage;
  CATEGORY_UPDATED: CategoryUpdatedMessage;
  MEDIA_ADDED: MediaAddedMessage;
  MEDIA_REMOVED: MediaRemovedMessage;
  FILESYSTEM_REPAIRED: FilesystemRepairedMessage;
  STREAM_STARTED: StreamStartedMessage;
  STREAM_STOPPED: StreamStoppedMessage;
  TRANSCODE_STARTED: TranscodeStartedMessage;
  TRANSCODE_COMPLETED: TranscodeCompletedMessage;
  WATCH_PROGRESS_UPDATED: WatchProgressUpdatedMessage;
  PLAYBACK_ERROR: PlaybackErrorMessage;
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
  { id: 'photos', name: 'Photos', folder: 'media/photos', itemCount: 0, lastScannedAt: null },
  { id: 'drive', name: 'Drive', folder: 'media/drive', itemCount: 0, lastScannedAt: null },
] as const;

export const MEDIA_EXTENSIONS: Record<CategoryId, readonly string[]> = {
  movies: ['mp4', 'mkv', 'avi'],
  music: ['mp3', 'flac', 'wav'],
  photos: ['jpg', 'png', 'webp'],
  drive: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'tar', 'gz', 'rar', '7z', 'png', 'jpg', 'jpeg', 'mp4', 'mp3', 'wav', 'flac', 'mkv', 'avi'],
};

export const createDefaultAppConfig = (): AppConfig => ({
  storageRoot: 'C:/MediaGrid',
  serverPort: 3001,
  websocketPort: 3002,
  mediaFolders: {
    movies: 'media/movies',
    music: 'media/music',
    photos: 'media/photos',
    drive: 'media/drive',
  },
});

export const getCategoryDefinition = (categoryId: CategoryId): CategoryDefinition =>
  CATEGORY_DEFINITIONS.find((definition) => definition.id === categoryId) ?? CATEGORY_DEFINITIONS[0];

export type User = {
  id: string;
  username: string;
  role: 'Admin' | 'Viewer';
  createdAt: string;
};

export type Device = {
  id: string;
  userId: string;
  name: string;
  platform: string;
  trusted: boolean;
  lastConnected: string;
};

export type Session = {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  expiresAt: string;
};

export type PairingStatus = {
  status: 'pending' | 'approved';
  token?: string;
};
