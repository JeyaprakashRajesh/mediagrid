import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';
import type { MediaItem } from '@mediagrid/types';

describe('Zustand useAppStore', () => {
  beforeEach(() => {
    // Reset Zustand store state before each test
    const { setSelectedCategory, setConnectionState, setWebsocketStatus, setMediaItems, setErrorMessage, setIsConfigured, setAvailableDrives, setIsSettingUp } = useAppStore.getState();
    setSelectedCategory('movies');
    setConnectionState('connecting');
    setWebsocketStatus('disconnected');
    setMediaItems([]);
    setErrorMessage(null);
    setIsConfigured(true);
    setAvailableDrives([]);
    setIsSettingUp(false);
  });

  it('should initialize with default states', () => {
    const state = useAppStore.getState();
    expect(state.connectionState).toBe('connecting');
    expect(state.websocketStatus).toBe('disconnected');
    expect(state.selectedCategory).toBe('movies');
    expect(state.mediaItems).toEqual([]);
    expect(state.loadingMedia).toBe(true);
    expect(state.isConfigured).toBe(true);
    expect(state.availableDrives).toEqual([]);
    expect(state.isSettingUp).toBe(false);
  });

  it('should support setup wizard state updates', () => {
    const { setIsConfigured, setAvailableDrives, setIsSettingUp } = useAppStore.getState();

    setIsConfigured(false);
    expect(useAppStore.getState().isConfigured).toBe(false);

    setAvailableDrives(['C:\\', 'D:\\']);
    expect(useAppStore.getState().availableDrives).toEqual(['C:\\', 'D:\\']);

    setIsSettingUp(true);
    expect(useAppStore.getState().isSettingUp).toBe(true);
  });

  it('should transition connectionState through all 5 lifecycle values', () => {
    const { setConnectionState } = useAppStore.getState();

    // 1. connecting
    setConnectionState('connecting');
    expect(useAppStore.getState().connectionState).toBe('connecting');

    // 2. connected
    setConnectionState('connected');
    expect(useAppStore.getState().connectionState).toBe('connected');

    // 3. offline
    setConnectionState('offline');
    expect(useAppStore.getState().connectionState).toBe('offline');

    // 4. reconnecting
    setConnectionState('reconnecting');
    expect(useAppStore.getState().connectionState).toBe('reconnecting');

    // 5. failed
    setConnectionState('failed');
    expect(useAppStore.getState().connectionState).toBe('failed');
  });

  it('should add media items when matching selectedCategory', () => {
    const { addMediaItem, setSelectedCategory } = useAppStore.getState();

    setSelectedCategory('movies');

    const movie: MediaItem = {
      id: 'movie-1',
      title: 'Movie 1',
      path: 'C:/MediaGrid/media/movies/movie1.mp4',
      kind: 'movie',
      category: 'movies',
      createdAt: '123',
      updatedAt: '123',
    };

    addMediaItem(movie);

    expect(useAppStore.getState().mediaItems).toEqual([movie]);
  });

  it('should not add media items when not matching selectedCategory', () => {
    const { addMediaItem, setSelectedCategory } = useAppStore.getState();

    setSelectedCategory('music');

    const movie: MediaItem = {
      id: 'movie-1',
      title: 'Movie 1',
      path: 'C:/MediaGrid/media/movies/movie1.mp4',
      kind: 'movie',
      category: 'movies',
      createdAt: '123',
      updatedAt: '123',
    };

    addMediaItem(movie);

    expect(useAppStore.getState().mediaItems).toEqual([]);
  });

  it('should remove media items correctly', () => {
    const { addMediaItem, removeMediaItem, setSelectedCategory } = useAppStore.getState();

    setSelectedCategory('movies');

    const movie: MediaItem = {
      id: 'movie-1',
      title: 'Movie 1',
      path: 'C:/MediaGrid/media/movies/movie1.mp4',
      kind: 'movie',
      category: 'movies',
      createdAt: '123',
      updatedAt: '123',
    };

    addMediaItem(movie);
    expect(useAppStore.getState().mediaItems.length).toBe(1);

    removeMediaItem('movie-1', 'movies');
    expect(useAppStore.getState().mediaItems).toEqual([]);
  });
});
