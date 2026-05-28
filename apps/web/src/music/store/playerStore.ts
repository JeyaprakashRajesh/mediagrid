import { create } from 'zustand';

export interface RecentlyPlayedItem {
  id: string;
  type: 'song' | 'playlist' | 'album' | 'artist';
  name: string;
  cover?: string;
}

interface PlayerStoreState {
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isExpanded: boolean;
  likedSongs: string[];
  recentlyPlayed: RecentlyPlayedItem[];
  
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setIsMuted: (isMuted: boolean) => void;
  setIsExpanded: (isExpanded: boolean) => void;
  toggleLikeSong: (songId: string) => void;
  addRecentlyPlayed: (item: RecentlyPlayedItem) => void;
}

export const usePlayerStore = create<PlayerStoreState>((set) => {
  // Safe localStorage loading
  const getLikedSongs = (): string[] => {
    try {
      const stored = localStorage.getItem('mediagrid_liked_songs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const getRecentlyPlayed = (): RecentlyPlayedItem[] => {
    try {
      const stored = localStorage.getItem('mediagrid_recently_played');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  return {
    currentTime: 0,
    duration: 0,
    volume: (() => {
      try {
        const stored = localStorage.getItem('mediagrid_volume');
        return stored ? parseFloat(stored) : 0.8;
      } catch {
        return 0.8;
      }
    })(),
    isMuted: false,
    isExpanded: false,
    likedSongs: getLikedSongs(),
    recentlyPlayed: getRecentlyPlayed(),

    setCurrentTime: (currentTime) => set({ currentTime }),
    setDuration: (duration) => set({ duration }),
    setVolume: (volume) => {
      set({ volume });
      try {
        localStorage.setItem('mediagrid_volume', volume.toString());
      } catch {}
    },
    setIsMuted: (isMuted) => set({ isMuted }),
    setIsExpanded: (isExpanded) => set({ isExpanded }),
    
    toggleLikeSong: (songId) => set((state) => {
      const isLiked = state.likedSongs.includes(songId);
      const likedSongs = isLiked
        ? state.likedSongs.filter((id) => id !== songId)
        : [...state.likedSongs, songId];
      
      try {
        localStorage.setItem('mediagrid_liked_songs', JSON.stringify(likedSongs));
      } catch {}
      
      return { likedSongs };
    }),

    addRecentlyPlayed: (item) => set((state) => {
      // Remove existing item to avoid duplicate
      const filtered = state.recentlyPlayed.filter(
        (x) => !(x.id === item.id && x.type === item.type)
      );
      // Keep up to 12 items, new items at the front
      const updated = [item, ...filtered].slice(0, 12);
      
      try {
        localStorage.setItem('mediagrid_recently_played', JSON.stringify(updated));
      } catch {}
      
      return { recentlyPlayed: updated };
    }),
  };
});
