import { create } from 'zustand';
import { client } from '../../services/runtime';

export interface StoredPlaylist {
  id: string;
  name: string;
  media_ids?: string[];
  mediaIds?: string[];
}

interface PlaylistStoreState {
  playlists: StoredPlaylist[];
  loadingPlaylists: boolean;
  fetchPlaylists: () => Promise<void>;
  createPlaylist: (name: string, mediaIds?: string[]) => Promise<StoredPlaylist | null>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
  deletePlaylist: (playlistId: string) => Promise<boolean>;
}

export const usePlaylistStore = create<PlaylistStoreState>((set, get) => ({
  playlists: [],
  loadingPlaylists: false,

  fetchPlaylists: async () => {
    set({ loadingPlaylists: true });
    try {
      const response = await client.getAudioPlaylists();
      const list = Array.isArray(response?.playlists) ? response.playlists : [];
      set({ playlists: list, loadingPlaylists: false });
    } catch (error) {
      console.warn('Failed to fetch audio playlists', error);
      set({ playlists: [], loadingPlaylists: false });
    }
  },

  createPlaylist: async (name, mediaIds = []) => {
    try {
      const trimmed = name.trim();
      if (!trimmed) return null;
      
      await client.createAudioPlaylist(trimmed, mediaIds, trimmed);
      await get().fetchPlaylists();
      
      const updated = get().playlists;
      return updated.find((p) => p.name === trimmed || p.id === trimmed) || null;
    } catch (error) {
      console.error('Failed to create playlist', error);
      return null;
    }
  },

  addSongToPlaylist: async (playlistId, songId) => {
    try {
      const existing = get().playlists.find((p) => p.id === playlistId || p.name === playlistId);
      if (!existing) return false;
      
      const currentIds = existing.media_ids ?? existing.mediaIds ?? [];
      if (currentIds.includes(songId)) return true; // Already exists
      
      const updatedIds = [...currentIds, songId];
      await client.createAudioPlaylist(existing.name, updatedIds, existing.id);
      await get().fetchPlaylists();
      return true;
    } catch (error) {
      console.error('Failed to add song to playlist', error);
      return false;
    }
  },

  removeSongFromPlaylist: async (playlistId, songId) => {
    try {
      const existing = get().playlists.find((p) => p.id === playlistId || p.name === playlistId);
      if (!existing) return false;
      
      const currentIds = existing.media_ids ?? existing.mediaIds ?? [];
      const updatedIds = currentIds.filter((id) => id !== songId);
      
      await client.createAudioPlaylist(existing.name, updatedIds, existing.id);
      await get().fetchPlaylists();
      return true;
    } catch (error) {
      console.error('Failed to remove song from playlist', error);
      return false;
    }
  },

  deletePlaylist: async (playlistId) => {
    try {
      await client.deleteAudioPlaylist(playlistId);
      await get().fetchPlaylists();
      return true;
    } catch (error) {
      console.error('Failed to delete playlist', error);
      return false;
    }
  },
}));
