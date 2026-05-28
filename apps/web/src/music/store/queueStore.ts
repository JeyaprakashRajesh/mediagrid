import { create } from 'zustand';
import { useAppStore } from '../../store/useAppStore';
import type { MediaItem } from '@mediagrid/types';

interface QueueStoreState {
  history: MediaItem[];
  addHistory: (song: MediaItem) => void;
  clearHistory: () => void;
  
  // Actions that modify global audioQueue in useAppStore
  addToQueue: (song: MediaItem) => void;
  addNext: (song: MediaItem) => void;
  removeFromQueue: (songId: string) => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  clearQueue: () => void;
}

export const useQueueStore = create<QueueStoreState>((set) => ({
  history: [],
  
  addHistory: (song) => set((state) => {
    // Avoid double entries side-by-side
    if (state.history[0]?.id === song.id) return {};
    return { history: [song, ...state.history].slice(0, 50) };
  }),
  
  clearHistory: () => set({ history: [] }),

  addToQueue: (song) => {
    const { audioQueue, setAudioQueue } = useAppStore.getState();
    if (audioQueue.some((x) => x.id === song.id)) return;
    setAudioQueue([...audioQueue, song]);
  },

  addNext: (song) => {
    const { audioQueue, audioCurrentIndex, setAudioQueue } = useAppStore.getState();
    
    // Remove if already in queue to avoid duplicates
    const filteredQueue = audioQueue.filter((x) => x.id !== song.id);
    
    // Calculate insert position
    const insertIdx = audioCurrentIndex + 1;
    
    const newQueue = [
      ...filteredQueue.slice(0, insertIdx),
      song,
      ...filteredQueue.slice(insertIdx),
    ];
    
    setAudioQueue(newQueue);
  },

  removeFromQueue: (songId) => {
    const { audioQueue, audioCurrentIndex, setAudioQueue, setAudioCurrentIndex, setActiveAudio, setAudioPlaying } = useAppStore.getState();
    
    const targetIdx = audioQueue.findIndex((x) => x.id === songId);
    if (targetIdx === -1) return;
    
    const newQueue = audioQueue.filter((x) => x.id !== songId);
    
    if (newQueue.length === 0) {
      setAudioQueue([]);
      setAudioCurrentIndex(-1);
      setActiveAudio(null);
      setAudioPlaying(false);
      return;
    }
    
    let newIdx = audioCurrentIndex;
    if (targetIdx === audioCurrentIndex) {
      // If we remove the playing song, skip to next, or clamp to last item
      newIdx = audioCurrentIndex >= newQueue.length ? 0 : audioCurrentIndex;
      setActiveAudio(newQueue[newIdx]);
    } else if (targetIdx < audioCurrentIndex) {
      newIdx = audioCurrentIndex - 1;
    }
    
    setAudioQueue(newQueue);
    setAudioCurrentIndex(newIdx);
  },

  reorderQueue: (startIndex, endIndex) => {
    const { audioQueue, audioCurrentIndex, setAudioQueue, setAudioCurrentIndex } = useAppStore.getState();
    
    const result = Array.from(audioQueue);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    
    // Calculate new current index
    let newIdx = audioCurrentIndex;
    if (audioCurrentIndex === startIndex) {
      newIdx = endIndex;
    } else if (audioCurrentIndex > startIndex && audioCurrentIndex <= endIndex) {
      newIdx = audioCurrentIndex - 1;
    } else if (audioCurrentIndex < startIndex && audioCurrentIndex >= endIndex) {
      newIdx = audioCurrentIndex + 1;
    }
    
    setAudioQueue(result);
    setAudioCurrentIndex(newIdx);
  },

  clearQueue: () => {
    const { setAudioQueue, setAudioCurrentIndex, setActiveAudio, setAudioPlaying } = useAppStore.getState();
    setAudioQueue([]);
    setAudioCurrentIndex(-1);
    setActiveAudio(null);
    setAudioPlaying(false);
  },
}));
