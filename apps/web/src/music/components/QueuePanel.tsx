import React from 'react';
import { Trash2, ArrowUp, ArrowDown, Trash, Clock, Music, Disc } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useQueueStore } from '../store/queueStore';

interface QueuePanelProps {
  onClose?: () => void;
}

const getPlaylistGradient = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const c1 = Math.abs(hash % 360);
  const c2 = (c1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${c1},80%,45%), hsl(${c2},70%,22%))`;
};

export const QueuePanel: React.FC<QueuePanelProps> = ({ onClose }) => {
  const { 
    audioQueue, 
    audioCurrentIndex, 
    activeAudio, 
    audioPlaying,
    setAudioCurrentIndex, 
    setActiveAudio, 
    setAudioPlaying 
  } = useAppStore();

  const { history, removeFromQueue, reorderQueue, clearQueue, clearHistory } = useQueueStore();

  const playQueueItem = (idx: number) => {
    setAudioCurrentIndex(idx);
    setActiveAudio(audioQueue[idx]);
    setAudioPlaying(true);
  };

  const handleMoveUp = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (idx > 0) {
      reorderQueue(idx, idx - 1);
    }
  };

  const handleMoveDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (idx < audioQueue.length - 1) {
      reorderQueue(idx, idx + 1);
    }
  };

  const nextSongs = audioQueue.slice(audioCurrentIndex + 1);
  const nextSongsStartIdx = audioCurrentIndex + 1;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        color: '#f8fafc',
        background: 'rgba(16, 16, 20, 0.4)',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} style={{ color: '#38bdf8' }} />
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            Play Queue
          </h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {audioQueue.length > 0 && (
            <button
              onClick={() => clearQueue()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 99,
                background: 'rgba(255, 69, 58, 0.12)',
                border: '1px solid rgba(255, 69, 58, 0.25)',
                color: '#ff453a',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <Trash size={10} /> Clear
            </button>
          )}
          {onClose && (
            <button onClick={onClose} style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
              CLOSE
            </button>
          )}
        </div>
      </div>

      {/* Queue Body */}
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Section 1: Now Playing */}
        <div>
          <h4 style={{ margin: '0 0 10px 0', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Now Playing
          </h4>
          {activeAudio ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 16,
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: getPlaylistGradient(activeAudio.album || activeAudio.title),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                }}
              >
                {audioPlaying ? (
                  <Disc size={18} className="spin-art" style={{ color: '#38bdf8' }} />
                ) : (
                  <Music size={16} style={{ color: '#fff' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeAudio.title}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeAudio.artist || 'Unknown Artist'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b', padding: '10px 0' }}>Nothing playing</div>
          )}
        </div>

        {/* Section 2: Next Up */}
        <div>
          <h4 style={{ margin: '0 0 10px 0', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Next Up ({nextSongs.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nextSongs.map((song, i) => {
              const queueIdx = nextSongsStartIdx + i;
              return (
                <div
                  key={song.id + '-' + queueIdx}
                  onClick={() => playQueueItem(queueIdx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: getPlaylistGradient(song.album || song.title),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 'bold',
                    }}
                  >
                    {song.title.substring(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {song.title}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {song.artist || 'Unknown Artist'}
                    </div>
                  </div>

                  {/* Reorder and Delete Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      disabled={i === 0}
                      onClick={(e) => handleMoveUp(e, queueIdx)}
                      style={{ padding: 4, color: i === 0 ? '#475569' : '#94a3b8' }}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      disabled={i === nextSongs.length - 1}
                      onClick={(e) => handleMoveDown(e, queueIdx)}
                      style={{ padding: 4, color: i === nextSongs.length - 1 ? '#475569' : '#94a3b8' }}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      onClick={() => removeFromQueue(song.id)}
                      style={{ padding: 4, color: '#ef4444' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
            {nextSongs.length === 0 && (
              <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', padding: '16px 0', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 12 }}>
                Queue is empty
              </div>
            )}
          </div>
        </div>

        {/* Section 3: History */}
        {history.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Recently Played History
              </h4>
              <button onClick={() => clearHistory()} style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>
                CLEAR
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map((song, idx) => (
                <div
                  key={'hist-' + song.id + '-' + idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    opacity: 0.7,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: getPlaylistGradient(song.album || song.title),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 'bold',
                    }}
                  >
                    {song.title.substring(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {song.title}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {song.artist || 'Unknown Artist'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
