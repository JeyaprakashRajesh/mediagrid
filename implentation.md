# MediaGrid — Phase 1 Development Prompt

You are developing Phase 1 of a project called “MediaGrid”.

# IMPORTANT

This is NOT just a media player.

MediaGrid is a runtime-based personal cloud ecosystem focused on:

- media management
- filesystem organization
- runtime infrastructure
- category-driven media access
- client ↔ runtime communication
- realtime updates
- future extensibility

The architecture MUST remain:

- simple
- modular
- scalable
- AI-friendly
- runtime-first

DO NOT overengineer.

DO NOT create microservices.

DO NOT create unnecessary abstractions.

The runtime is the core product.

The web application is the runtime control interface.

---

# CURRENT PHASE

# PHASE 1 — Runtime Initialization, Filesystem Foundation And Client Communication

This is the MOST CRITICAL phase.

Everything depends on this phase.

The objective is to create:

- runtime bootstrap system
- filesystem initialization
- folder validation
- category-based storage
- runtime APIs
- websocket communication
- web dashboard connectivity
- category navigation

---

# TECH STACK

## Server
- Rust
- Tauri
- SQLite
- WebSockets
- REST API

## Web
- React
- Vite
- TypeScript
- Tailwind CSS
- Zustand

---

# PROJECT STRUCTURE

```text
MediaGrid/
├── apps/
│   ├── server/
│   └── web/
│
├── packages/
│   ├── shared/
│   ├── types/
│   ├── ui/
│   └── api/
DEVELOPMENT STORAGE ROOT

During development ALWAYS use:

C:/MediaGrid

If the folder does not exist:

create it automatically
IMPORTANT FUTURE TODO

Inside implementation comments add:

TODO:
Replace development root path with installer-selected storage path during production setup.

This TODO must exist in filesystem initialization logic.

FILESYSTEM ARCHITECTURE

The runtime MUST initialize this structure automatically:

C:/MediaGrid/
├── media/
│   ├── movies/
│   ├── music/
│   ├── shows/
│   ├── photos/
│   └── downloads/
│
├── cache/
│   ├── thumbnails/
│   ├── metadata/
│   └── temp/
│
├── database/
│   └── mediagrid.db
│
├── logs/
│
├── config/
│   └── config.json
│
└── runtime/
CRITICAL REQUIREMENT

On EVERY runtime startup:

Validate root folder
Validate all required subfolders
Create missing folders automatically
Validate config
Validate database
Repair missing resources automatically

This process MUST be idempotent.

Meaning:

safe to run repeatedly
no corruption
no duplicate resources
CATEGORY SYSTEM

The architecture is category-driven.

Each category maps to a dedicated folder.

Category	Folder
Movies	media/movies
Music	media/music
Shows	media/shows
Photos	media/photos
Downloads	media/downloads

Future categories must be dynamically extendable.

CATEGORY FLOW

Example:

User Clicks Movies
       ↓
Web App Calls Runtime API
       ↓
Runtime Reads media/movies
       ↓
Returns Indexed Movie Files
       ↓
Web UI Displays Movies
SERVER IMPLEMENTATION REQUIREMENTS
1. Runtime Bootstrap System

Create:

apps/server/src/runtime/

Responsibilities:

initialize runtime
initialize filesystem
initialize config
initialize database
initialize APIs
initialize websocket server
initialize scanners
initialize logging
Runtime Features

Implement:

graceful startup
graceful shutdown
module initialization order
startup validation
runtime state management
2. Logging System

Logs location:

C:/MediaGrid/logs/

Implement:

info logs
warning logs
error logs
startup logs
3. Filesystem Initialization System

Create:

apps/server/src/storage/

This is the MOST IMPORTANT MODULE.

Responsibilities:

validate root folder
validate media folders
validate cache folders
validate database folder
validate config folder
validate runtime folder
create missing folders automatically
Required Folder Validation

Validate:

media/
movies/
music/
shows/
photos/
downloads/
cache/
database/
logs/
config/
runtime/

If missing:

create automatically
4. Config System

Create:

apps/server/src/config/

Config path:

C:/MediaGrid/config/config.json

Default config:

{
  "storageRoot": "C:/MediaGrid",
  "serverPort": 3001,
  "websocketPort": 3002,
  "mediaFolders": {
    "movies": "media/movies",
    "music": "media/music",
    "shows": "media/shows",
    "photos": "media/photos"
  }
}

Requirements:

auto create config
validate config
load config into runtime
5. Database System

Create:

apps/server/src/database/

Database path:

C:/MediaGrid/database/mediagrid.db

Use SQLite.

Required tables:

media
id
title
path
type
category
createdAt
updatedAt
categories
id
name
folder
runtime_state
id
lastScan
runtimeVersion

Requirements:

auto create database
auto create tables
startup validation
6. Media Scanner

Create:

apps/server/src/media/

Responsibilities:

scan category folders
detect media files
store indexed media
Supported Formats
Movies
mp4
mkv
avi
Music
mp3
flac
wav
Photos
jpg
png
webp
7. API Layer

Create:

apps/server/src/api/

Required endpoints:

Health
GET /health

Returns:

runtime status
filesystem status
database status
Runtime
GET /runtime

Returns:

runtime information
storage root
runtime version
Categories
GET /categories

Returns:

categories
media counts
Media By Category
GET /media/:category

Examples:

/media/movies
/media/music
8. WebSocket System

Create:

apps/server/src/websocket/

Events:

RUNTIME_READY
CATEGORY_UPDATED
MEDIA_ADDED
MEDIA_REMOVED
FILESYSTEM_REPAIRED
WEB APPLICATION REQUIREMENTS
1. Runtime Connectivity

On startup:

Web App Starts
      ↓
Calls /health
      ↓
Displays Runtime Status

Implement:

reconnect handling
websocket reconnect
runtime offline handling
2. Sidebar Navigation

Required categories:

Movies
Music
Shows
Photos
Downloads

Flow:

Click Category
      ↓
Call API
      ↓
Render Category Data
3. Media Display
Movies

Display:

thumbnails
filenames
metadata
Music

Display:

song name
artist
album
Photos

Display:

image previews
4. Runtime Dashboard

Display:

runtime status
storage root
media counts
category counts
scan status
5. Realtime Updates

The UI must automatically update when:

media added
folders repaired
scans completed

Use WebSockets.

IMPORTANT ARCHITECTURE RULES
RULE 1

Web app NEVER directly accesses filesystem.

Always:

web → api → runtime
RULE 2

Keep folder structure FLAT.

Avoid:

deep nesting
enterprise patterns
excessive abstractions
RULE 3

Build complete vertical features.

Example:

Filesystem
    ↓
Database
    ↓
API
    ↓
Web UI

Complete fully before next feature.

PHASE 1 SUCCESS CRITERIA

The following workflow MUST work:

Runtime Starts
      ↓
C:/MediaGrid Created Automatically
      ↓
Required Folders Validated
      ↓
Missing Folders Auto-Repaired
      ↓
Web App Connects To Runtime
      ↓
Categories Display In Sidebar
      ↓
Click Movies
      ↓
Movie Files Displayed
      ↓
Click Music
      ↓
Music Files Displayed
IMPLEMENTATION STYLE

Requirements:

strongly typed
modular
readable
maintainable
production-oriented
AI-friendly

Use:

clear naming
simple architecture
predictable folder structure

Avoid:

premature optimization
distributed systems
advanced streaming
unnecessary complexity

And here is the standalone `phase-1.md` checklist document:

```md
# MediaGrid — Phase 1 Checklist

# Phase 1
Runtime Initialization, Filesystem Foundation And Client Communication

---

# SERVER CHECKLIST

# Runtime System

- [ ] Create runtime bootstrap system
- [ ] Create lifecycle manager
- [ ] Create startup sequence
- [ ] Create graceful shutdown system
- [ ] Create runtime validation system
- [ ] Create runtime state manager

---

# Logging System

- [ ] Create logs folder automatically
- [ ] Create startup logging
- [ ] Create info logging
- [ ] Create warning logging
- [ ] Create error logging

---

# Filesystem Initialization

- [ ] Create `C:/MediaGrid` automatically
- [ ] Create `media/` automatically
- [ ] Create `media/movies/`
- [ ] Create `media/music/`
- [ ] Create `media/shows/`
- [ ] Create `media/photos/`
- [ ] Create `media/downloads/`
- [ ] Create `cache/`
- [ ] Create `cache/thumbnails/`
- [ ] Create `cache/metadata/`
- [ ] Create `cache/temp/`
- [ ] Create `database/`
- [ ] Create `logs/`
- [ ] Create `config/`
- [ ] Create `runtime/`

---

# Filesystem Validation

- [ ] Validate root folder on every startup
- [ ] Validate media folders on every startup
- [ ] Repair missing folders automatically
- [ ] Validate config existence
- [ ] Validate database existence
- [ ] Ensure startup process is idempotent

---

# TODO System

- [ ] Add TODO for installer-selected storage root
- [ ] Add TODO for future setup wizard

---

# Config System

- [ ] Create config initialization system
- [ ] Auto create config.json
- [ ] Load config into runtime
- [ ] Validate config structure
- [ ] Validate ports
- [ ] Validate folder paths

---

# Database System

- [ ] Initialize SQLite database
- [ ] Auto create mediagrid.db
- [ ] Create media table
- [ ] Create categories table
- [ ] Create runtime_state table
- [ ] Validate database on startup

---

# Media Scanner

- [ ] Create category scanner
- [ ] Scan movies folder
- [ ] Scan music folder
- [ ] Scan shows folder
- [ ] Scan photos folder
- [ ] Detect supported file formats
- [ ] Store indexed files in database
- [ ] Store category information

---

# API Layer

- [ ] Create REST API server
- [ ] Create `/health` endpoint
- [ ] Create `/runtime` endpoint
- [ ] Create `/categories` endpoint
- [ ] Create `/media/:category` endpoint

---

# WebSocket System

- [ ] Create websocket server
- [ ] Emit RUNTIME_READY event
- [ ] Emit CATEGORY_UPDATED event
- [ ] Emit MEDIA_ADDED event
- [ ] Emit MEDIA_REMOVED event
- [ ] Emit FILESYSTEM_REPAIRED event

---

# WEB CHECKLIST

# Runtime Connectivity

- [ ] Connect to runtime API
- [ ] Create health check system
- [ ] Create reconnect handling
- [ ] Handle runtime offline state
- [ ] Connect websocket client

---

# Sidebar Navigation

- [ ] Create sidebar UI
- [ ] Add Movies category
- [ ] Add Music category
- [ ] Add Shows category
- [ ] Add Photos category
- [ ] Add Downloads category

---

# Category Navigation

- [ ] Create category switching
- [ ] Load category data dynamically
- [ ] Render category-based content
- [ ] Handle empty categories

---

# Media UI

- [ ] Create movie grid
- [ ] Display thumbnails
- [ ] Display filenames
- [ ] Create music list
- [ ] Display artist metadata
- [ ] Display album metadata
- [ ] Create photos grid
- [ ] Display image previews

---

# Runtime Dashboard

- [ ] Display runtime status
- [ ] Display storage root
- [ ] Display category counts
- [ ] Display media counts
- [ ] Display scan status

---

# Realtime Features

- [ ] Handle websocket connection
- [ ] Handle runtime events
- [ ] Handle filesystem repair events
- [ ] Update UI automatically
- [ ] Refresh categories in realtime

---

# PHASE 1 SUCCESS CRITERIA

- [ ] Runtime starts successfully
- [ ] `C:/MediaGrid` auto-created
- [ ] Missing folders auto-repaired
- [ ] Config auto-created
- [ ] Database auto-created
- [ ] Web app connects successfully
- [ ] Categories visible in sidebar
- [ ] Movies display correctly
- [ ] Music displays correctly
- [ ] Photos display correctly
- [ ] Realtime updates working