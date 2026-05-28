import React from 'react';
import { createRuntimeClient } from '@mediagrid/api';
import { useAppStore } from '../../store/useAppStore';

export const SyncInitializer: React.FC = () => {
  const store = useAppStore();

  React.useEffect(() => {
    const client = createRuntimeClient();
    let socket: WebSocket | null = null;

    try {
      socket = client.connectWebSocket((msg) => {
        // handle extended event types emitted by runtime
        switch ((msg as any).type) {
          case 'THUMBNAIL_GENERATED':
            // refresh media details / item
            if ((msg as any).mediaId) {
              // naive: refetch active category
              store.setMediaItems([...(store.mediaItems || [])]);
            }
            break;
          case 'METADATA_UPDATED':
            // refetch active category
            store.setMediaItems([...(store.mediaItems || [])]);
            break;
          case 'JOB_COMPLETED':
            // optionally refresh jobs - not implemented here
            break;
          default:
            break;
        }
      });
    } catch (err) {
      // ignore
    }

    return () => {
      if (socket) socket.close();
    };
  }, [store]);

  return null;
};
