# Server & Web UI Improvement Checklist

## Server — Indexing

- [x] Create a dedicated indexing module  
  - Current indexing logic now lives in `indexing::mod.rs`
  - Suggested: move indexing into a standalone module/service
  - References:
    - `indexing/mod.rs`
    - `jobs/mod.rs`

- [x] Implement proper incremental indexing  
  - `jobs::scan_all` now performs a delta sync against persisted media state
  - Watcher still feeds incremental updates into the same indexing service
  - Missing: delta-only indexing strategy
  - References:
    - `indexing/mod.rs`
    - `jobs/mod.rs`

- [x] Add rename detection support  
  - Watcher now forwards rename events to the indexing service
  - Rename mapping uses hash/path comparison with stable media ids
  - References:
    - `watcher/mod.rs`
    - `indexing/mod.rs`

- [x] Add structured indexing logs  
  - Index operations now emit structured trace events and log entries
  - Structured audit trail is written through runtime events
  - Index operation tracing is included in scan/index/rename/remove flows

---

# Server — Jobs / Scheduling

- [ ] Implement retry system for failed jobs  
  - `jobs` table tracks attempts
  - Worker currently does not retry failed jobs
  - References:
    - `mod.rs`

- [ ] Add failed-job handling and requeue policy  
  - Current behavior:
    - Status updated only
  - Missing:
    - Automatic retry
    - Exponential backoff
    - Dead-letter queue
    - Retry limits

- [ ] Add automated cleanup jobs  
  - Cleanup endpoint exists
  - Missing automated cleanup for:
    - Stale thumbnails
    - Cache entries
    - Orphaned metadata

---

# Server — Metadata & Hashing

- [x] Compute and store file hashes  
  - `ExtractedMetadata` now computes SHA-256 hashes during indexing
  - References:
    - `metadata/mod.rs`
    - `database/mod.rs`

- [ ] Implement metadata caching  
  - `cache/metadata` directory exists
  - Missing:
    - Cache population
    - Cache lookup usage
    - Cache invalidation
  - References:
    - `mod.rs`

---

# Server — Thumbnails & Cache

- [ ] Add placeholder thumbnail generation  
  - Current behavior:
    - Thumbnail failure results in missing thumbnail
    - Client-side fallback exists
  - Missing:
    - Server-generated placeholder thumbnails
  - References:
    - `mod.rs`
    - `MediaContent.tsx`

- [ ] Add thumbnail cache validation and cleanup  
  - DB entries removed on media delete
  - Thumbnail files may remain orphaned
  - Missing:
    - Validation routines
    - Stale thumbnail cleanup
    - Broken thumbnail detection
  - References:
    - `mod.rs`
    - `mod.rs`

---

# Server — Synchronization & WebSocket

- [x] Fix event-name mismatch between server and client (**Critical**)  
  - Server emits:
    - `MEDIA_ADDED`
    - `METADATA_UPDATED`
    - `THUMBNAIL_GENERATED`
  - Client expects:
    - `CATEGORY_UPDATED`
    - `MEDIA_ADDED`
    - Others
  - Result:
    - Realtime updates may fail in UI
  - References:
    - `mod.rs`
    - `index.ts`
    - `runtime.ts`

- [ ] Emit category update events  
  - Missing:
    - `CATEGORY_UPDATED`
    - `CATEGORY_COUNT_UPDATED`
  - UI currently performs fetch fallback instead
  - Suggested:
    - Explicit realtime category events

- [ ] Refactor `websocket/mod.rs`  
  - File currently acts as a stub
  - Actual websocket logic exists in `server/mod.rs`
  - Suggested:
    - Remove unused file
    - OR properly implement module separation
  - References:
    - `mod.rs`
    - `mod.rs`

---

# API / Web UI

- [x] Align UI event mapping with server events  
  - API endpoints are mostly complete
  - Main issue:
    - Event name mismatch
  - References:
    - Files mentioned above

- [ ] Add standardized thumbnail placeholder endpoint  
  - Client fallback exists
  - Suggested:
    - Server-hosted placeholder image endpoint
    - Consistent UX across platforms

---

# Cache / Runtime

- [ ] Implement metadata cache lifecycle  
  - Missing:
    - Population
    - Usage
    - Cleanup
    - Eviction policies
  - References:
    - `mod.rs`

- [ ] Add background cache cleanup job  
  - Missing cleanup for:
    - `cache/temp`
    - `cache/metadata`
    - Orphan thumbnails
    - Expired cache entries

---

# Testing

- [ ] Add retry and failure handling tests  
  - Missing coverage for:
    - Retry logic
    - Backoff handling
    - Dead-letter queue behavior

- [ ] Add thumbnail and corrupted-file handling tests  
  - Existing:
    - Basic scanning tests
    - DB tests
  - Missing:
    - FFmpeg failure handling
    - FFprobe failure handling
    - Thumbnail cleanup
    - Hash generation
    - Rename detection

---

# Highest Priority Fixes

## Critical

- [x] Align server event names with client runtime expectations  
  - Ensure realtime UI updates work correctly
  - References:
    - `mod.rs`
    - `runtime.ts`

- [ ] Implement retry/backoff and dead-letter handling for jobs  
  - Use `jobs.attempts`
  - Add automatic re-enqueue support
  - References:
    - `mod.rs`

- [x] Implement file hash computation and persistence  
  - Populate `hash` field properly
  - References:
    - `metadata/mod.rs`
    - `database/mod.rs`

- [ ] Add thumbnail cleanup and placeholder generation  
  - Prevent stale/orphan thumbnail buildup
  - Improve failed-thumbnail UX
  - References:
    - `mod.rs`
    - `mod.rs`

- [x] Implement rename detection strategy  
  - Suggested approaches:
    - Watcher rename events
    - Hash comparison during scans
  - References:
    - `watcher/mod.rs`
    - `indexing/mod.rs`

---

# Suggested Next Implementations

- [ ] Event-name adapter layer  
  - Map server events → client runtime events
  - Quickest fix for realtime UI

- [ ] Retry/backoff worker scaffold  
  - Add retry queue
  - Exponential backoff
  - Dead-letter handling

- [ ] File hashing + thumbnail cleanup service  
  - Compute hashes during indexing
  - Cleanup orphaned thumbnails automatically