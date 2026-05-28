import { create } from 'zustand';
import type {
  CategoryId,
  CategoryDefinition,
  HealthResponse,
  MediaItem,
  RuntimeInfo,
} from '@mediagrid/types';
import { buildRuntimeUrl } from '@mediagrid/api';

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'failed';
export type WebSocketStatus = 'connected' | 'connecting' | 'disconnected';

interface AppState {
  connectionState: ConnectionState;
  websocketStatus: WebSocketStatus;
  health: HealthResponse | null;
  runtime: RuntimeInfo | null;
  categories: CategoryDefinition[];
  selectedCategory: CategoryId;
  mediaItems: MediaItem[];
  loadingMedia: boolean;
  errorMessage: string | null;
  isConfigured: boolean;
  availableDrives: string[];
  isSettingUp: boolean;
  continueWatchingItems: any[];
  setContinueWatchingItems: (items: any[]) => void;
  fetchContinueWatchingItems: () => Promise<void>;
  currentView: 'library' | 'admin' | 'security' | 'devices' | 'pairing';
  setCurrentView: (view: 'library' | 'admin' | 'security' | 'devices' | 'pairing') => void;
  isAuthenticated: boolean;
  user: any | null;
  device: any | null;
  token: string | null;
  setAuth: (token: string | null, user: any | null, device: any | null) => void;
  performLogout: () => Promise<void>;

  // Video playback
  activeVideo: MediaItem | null;
  activeSession: { sessionId: string; streamUrl: string; mode: string; mediaId: string } | null;
  subtitleTracks: any[];
  activeSubtitleTrack: number | null;
  subtitlesEnabled: boolean;
  playbackSpeed: number;
  playbackQuality: string;

  // Audio playback
  activeAudio: MediaItem | null;
  audioQueue: MediaItem[];
  audioPlaylist: any | null;
  audioShuffle: boolean;
  audioRepeat: 'none' | 'one' | 'all';
  audioPlaying: boolean;
  audioCurrentIndex: number;

  currentFolderPath: string;
  setCurrentFolderPath: (path: string) => void;

  setConnectionState: (state: ConnectionState) => void;
  setWebsocketStatus: (status: WebSocketStatus) => void;
  setHealth: (health: HealthResponse | null) => void;
  setRuntime: (runtime: RuntimeInfo | null) => void;
  setCategories: (categories: CategoryDefinition[]) => void;
  updateCategory: (category: CategoryDefinition) => void;
  setSelectedCategory: (categoryId: CategoryId) => void;
  setMediaItems: (items: MediaItem[]) => void;
  addMediaItem: (item: MediaItem) => void;
  removeMediaItem: (mediaId: string, category: CategoryId) => void;
  setLoadingMedia: (loading: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  setIsConfigured: (isConfigured: boolean) => void;
  setAvailableDrives: (drives: string[]) => void;
  setIsSettingUp: (isSettingUp: boolean) => void;

  // Video actions
  setActiveVideo: (video: MediaItem | null) => void;
  setActiveSession: (session: any | null) => void;
  setSubtitleTracks: (tracks: any[]) => void;
  setActiveSubtitleTrack: (trackIndex: number | null) => void;
  setSubtitlesEnabled: (enabled: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setPlaybackQuality: (quality: string) => void;

  // Audio actions
  setActiveAudio: (audio: MediaItem | null) => void;
  setAudioQueue: (queue: MediaItem[]) => void;
  addToAudioQueue: (item: MediaItem) => void;
  setAudioShuffle: (shuffle: boolean) => void;
  setAudioRepeat: (repeat: 'none' | 'one' | 'all') => void;
  setAudioPlaying: (playing: boolean) => void;
  setAudioCurrentIndex: (index: number) => void;
  playNextAudio: () => void;
  playPrevAudio: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  connectionState: 'connecting',
  websocketStatus: 'disconnected',
  health: null,
  runtime: null,
  categories: [],
  selectedCategory: 'movies',
  mediaItems: [],
  loadingMedia: true,
  errorMessage: null,
  isConfigured: true,
  availableDrives: [],
  isSettingUp: false,
  continueWatchingItems: [],
  currentView: 'devices',
  isAuthenticated: typeof localStorage !== 'undefined' && !!localStorage.getItem('mediagrid_token'),
  user: typeof localStorage !== 'undefined' && localStorage.getItem('mediagrid_user') ? JSON.parse(localStorage.getItem('mediagrid_user')!) : null,
  device: typeof localStorage !== 'undefined' && localStorage.getItem('mediagrid_device') ? JSON.parse(localStorage.getItem('mediagrid_device')!) : null,
  token: typeof localStorage !== 'undefined' ? localStorage.getItem('mediagrid_token') : null,

  // Playback defaults
  activeVideo: null,
  activeSession: null,
  subtitleTracks: [],
  activeSubtitleTrack: null,
  subtitlesEnabled: false,
  playbackSpeed: 1.0,
  playbackQuality: 'auto',

  // Audio defaults
  activeAudio: null,
  audioQueue: [],
  audioPlaylist: null,
  audioShuffle: false,
  audioRepeat: 'none',
  audioPlaying: false,
  audioCurrentIndex: -1,
  currentFolderPath: '',

  setConnectionState: (connectionState) => set({ connectionState }),
  setCurrentFolderPath: (currentFolderPath) => set({ currentFolderPath }),
  setWebsocketStatus: (websocketStatus) => set({ websocketStatus }),
  setHealth: (health) => set({ health }),
  setRuntime: (runtime) => set({ runtime }),
  setCategories: (categories) => set({ categories }),
  updateCategory: (category) =>
    set((state) => ({
      categories: state.categories.map((c) => (c.id === category.id ? category : c)),
    })),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setMediaItems: (mediaItems) => set({ mediaItems }),
  addMediaItem: (item) =>
    set((state) => {
      if (state.selectedCategory === item.category) {
        if (state.mediaItems.some((x) => x.id === item.id || x.path === item.path)) {
          return {};
        }
        return { mediaItems: [item, ...state.mediaItems] };
      }
      return {};
    }),
  removeMediaItem: (mediaId, category) =>
    set((state) => {
      if (state.selectedCategory === category) {
        return { mediaItems: state.mediaItems.filter((x) => x.id !== mediaId && x.path !== mediaId) };
      }
      return {};
    }),
  setLoadingMedia: (loadingMedia) => set({ loadingMedia }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setIsConfigured: (isConfigured) => set({ isConfigured }),
  setAvailableDrives: (availableDrives) => set({ availableDrives }),
  setIsSettingUp: (isSettingUp) => set({ isSettingUp }),
  setContinueWatchingItems: (continueWatchingItems) => set({ continueWatchingItems }),
  fetchContinueWatchingItems: async () => {
    try {
      const token = localStorage.getItem('mediagrid_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(buildRuntimeUrl('/watch/continue'), { headers });
      if (res.ok) {
        const data = await res.json();
        set({ continueWatchingItems: data.items || [] });
      }
    } catch (err) {
      console.error('Failed to fetch continue watching items', err);
    }
  },
  setCurrentView: (currentView) => set({ currentView }),
  setAuth: (token, user, device) => {
    if (token) {
      localStorage.setItem('mediagrid_token', token);
      localStorage.setItem('mediagrid_user', JSON.stringify(user));
      localStorage.setItem('mediagrid_device', JSON.stringify(device));
      set({ token, user, device, isAuthenticated: true });
    } else {
      localStorage.removeItem('mediagrid_token');
      localStorage.removeItem('mediagrid_user');
      localStorage.removeItem('mediagrid_device');
      set({ token: null, user: null, device: null, isAuthenticated: false });
    }
  },
  performLogout: async () => {
    try {
      const token = localStorage.getItem('mediagrid_token');
      if (token) {
        const res = await fetch(buildRuntimeUrl('/auth/logout'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!res.ok) console.error("Server logout rejected");
      }
    } catch (e) {
      console.error(e);
    }
    useAppStore.getState().setAuth(null, null, null);
  },

  // Video setters
  setActiveVideo: (activeVideo) => set({ activeVideo }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setSubtitleTracks: (subtitleTracks) => set({ subtitleTracks }),
  setActiveSubtitleTrack: (activeSubtitleTrack) => set({ activeSubtitleTrack }),
  setSubtitlesEnabled: (subtitlesEnabled) => set({ subtitlesEnabled }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setPlaybackQuality: (playbackQuality) => set({ playbackQuality }),

  // Audio setters
  setActiveAudio: (activeAudio) => set({ activeAudio }),
  setAudioQueue: (audioQueue) => set({ audioQueue }),
  addToAudioQueue: (item) =>
    set((state) => {
      if (state.audioQueue.some((x) => x.id === item.id)) {
        return {};
      }
      return { audioQueue: [...state.audioQueue, item] };
    }),
  setAudioShuffle: (audioShuffle) => set({ audioShuffle }),
  setAudioRepeat: (audioRepeat) => set({ audioRepeat }),
  setAudioPlaying: (audioPlaying) => set({ audioPlaying }),
  setAudioCurrentIndex: (audioCurrentIndex) => set({ audioCurrentIndex }),

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  playNextAudio: () =>
    set((state) => {
      if (state.audioQueue.length === 0) return {};
      if (state.audioRepeat === 'one') {
        return {
          audioCurrentIndex: state.audioCurrentIndex,
          activeAudio: state.audioQueue[state.audioCurrentIndex],
          audioPlaying: true,
        };
      }
      let nextIndex = state.audioCurrentIndex;

      if (state.audioShuffle) {
        nextIndex = state.audioQueue.length > 1
          ? Math.floor(Math.random() * state.audioQueue.length)
          : state.audioCurrentIndex;
        if (state.audioQueue.length > 1 && nextIndex === state.audioCurrentIndex) {
          nextIndex = (nextIndex + 1) % state.audioQueue.length;
        }
      } else {
        nextIndex = state.audioCurrentIndex + 1;
        if (nextIndex >= state.audioQueue.length) {
          if (state.audioRepeat === 'all') {
            nextIndex = 0;
          } else {
            return { audioPlaying: false };
          }
        }
      }
      return {
        audioCurrentIndex: nextIndex,
        activeAudio: state.audioQueue[nextIndex],
        audioPlaying: true,
      };
    }),
  playPrevAudio: () =>
    set((state) => {
      if (state.audioQueue.length === 0) return {};
      if (state.audioRepeat === 'one') {
        return {
          audioCurrentIndex: state.audioCurrentIndex,
          activeAudio: state.audioQueue[state.audioCurrentIndex],
          audioPlaying: true,
        };
      }
      let prevIndex = state.audioCurrentIndex;

      if (state.audioShuffle) {
        prevIndex = state.audioQueue.length > 1
          ? Math.floor(Math.random() * state.audioQueue.length)
          : state.audioCurrentIndex;
        if (state.audioQueue.length > 1 && prevIndex === state.audioCurrentIndex) {
          prevIndex = (prevIndex - 1 + state.audioQueue.length) % state.audioQueue.length;
        }
      } else {
        prevIndex = state.audioCurrentIndex - 1;
        if (prevIndex < 0) {
          if (state.audioRepeat === 'all') {
            prevIndex = state.audioQueue.length - 1;
          } else {
            prevIndex = 0;
          }
        }
      }
      return {
        audioCurrentIndex: prevIndex,
        activeAudio: state.audioQueue[prevIndex],
        audioPlaying: true,
      };
    }),
}));
