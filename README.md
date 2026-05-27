# MediaGrid

# Runtime-Based Personal Cloud Ecosystem

MediaGrid is a self-hosted runtime-driven personal cloud ecosystem focused on:

* Media management
* Local-first infrastructure
* Personal streaming
* Category-driven organization
* Realtime synchronization
* Runtime ↔ Client communication
* Future extensibility

MediaGrid is NOT designed as a simple media player.

The platform is designed as a:

# Runtime-Based Personal Media Infrastructure

---

# Vision

MediaGrid aims to provide:

* Personal media infrastructure
* Runtime-managed storage
* Organized category-based content
* Browser-accessible media system
* Future mobile ecosystem
* Local-first architecture
* Privacy-focused infrastructure

The platform is intended to evolve into:

* Personal cloud system
* Media ecosystem
* Device-connected infrastructure
* Distributed runtime platform

---

# Current Focus

Current development focuses on:

1. Runtime Server
2. Web Dashboard
3. Filesystem Architecture
4. Runtime ↔ Client Communication
5. Category-Based Media System

The mobile application will be implemented after runtime stabilization.

---

# Core Principles

# 1. Runtime First

The runtime server is the core product.

Everything revolves around:

* Runtime lifecycle
* Filesystem management
* Media indexing
* APIs
* Realtime communication

The web application is the runtime interface.

---

# 2. Local First

MediaGrid prioritizes:

* local storage
* local indexing
* local infrastructure
* local control

No cloud dependency is required.

---

# 3. Simple Architecture

The architecture intentionally avoids:

* microservices
* distributed complexity
* deep enterprise structures
* unnecessary abstractions

The architecture remains:

* modular
* flat
* readable
* scalable

---

# 4. AI-Friendly Development

The entire project is structured for:

* AI-assisted development
* predictable architecture
* strongly typed systems
* clear module boundaries
* readable implementation flows

---

# Project Architecture

```text
MediaGrid/
├── apps/
│   ├── server/
│   ├── web/
│   └── mobile/
│
├── packages/
│   ├── shared/
│   ├── types/
│   ├── ui/
│   └── api/
│
├── docs/
├── scripts/
├── assets/
└── README.md
```

---

# Applications

# 1. Server Runtime

The runtime server is responsible for:

* filesystem management
* folder validation
* media indexing
* metadata storage
* websocket communication
* runtime APIs
* storage lifecycle
* future streaming infrastructure

---

# 2. Web Application

The web application is responsible for:

* runtime control
* category navigation
* media display
* realtime updates
* runtime monitoring
* future streaming interface

---

# 3. Mobile Application

The mobile application is planned for later phases.

Future responsibilities:

* remote access
* media streaming
* notifications
* runtime monitoring
* synchronization

---

# Technology Stack

| Layer            | Technology                |
| ---------------- | ------------------------- |
| Runtime          | Rust                      |
| Runtime UI       | Tauri + React             |
| Web App          | React + Vite + TypeScript |
| Mobile           | React Native + Expo       |
| Database         | SQLite                    |
| Styling          | Tailwind CSS              |
| State Management | Zustand                   |
| Validation       | Zod                       |
| Networking       | Tailscale                 |
| Realtime         | WebSockets                |
| Streaming        | FFmpeg                    |

---

# Development Philosophy

# Build Vertically

Features must be completed end-to-end.

Example:

```text
Filesystem
    ↓
Database
    ↓
API
    ↓
Web UI
```

Avoid building isolated incomplete layers.

---

# Keep Runtime Independent

The runtime must function independently from the UI.

Meaning:

```text
Runtime
   ↓
API
   ↓
Web Client
```

The runtime should remain functional even without the web application.

---

# Avoid Overengineering

Do NOT:

* create microservices
* create distributed orchestration
* create complex plugin systems early
* create unnecessary abstractions

Focus on:

* stability
* maintainability
* runtime quality
* predictable architecture

---

# Development Storage Root

During development:

```text
C:/MediaGrid
```

This folder is automatically created during runtime initialization.

---

# IMPORTANT TODO

Future production builds must:

```text
Allow users to select storage root during installation.
```

Current development uses:

```text
C:/MediaGrid
```

for simplicity and consistency.

---

# Filesystem Architecture

```text
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
```

---

# Category System

MediaGrid uses a category-driven architecture.

Each category maps to a dedicated filesystem location.

| Category  | Folder          |
| --------- | --------------- |
| Movies    | media/movies    |
| Music     | media/music     |
| Shows     | media/shows     |
| Photos    | media/photos    |
| Downloads | media/downloads |

Future categories will be dynamically extendable.

---

# Category Navigation Flow

Example:

```text
User Clicks Movies
       ↓
Web App Requests Movies Category
       ↓
Runtime Reads media/movies
       ↓
Indexed Files Returned
       ↓
Movies Displayed In UI
```

Example:

```text
User Clicks Music
       ↓
Web App Requests Music Category
       ↓
Runtime Reads media/music
       ↓
Indexed Files Returned
       ↓
Music Displayed In UI
```

---

# Runtime Initialization

Every runtime startup must:

1. Validate MediaGrid root
2. Validate required folders
3. Create missing folders
4. Validate config
5. Validate database
6. Initialize APIs
7. Initialize websocket server
8. Initialize scanners
9. Initialize runtime state

This process must remain:

* repeatable
* stable
* idempotent

---

# API Architecture

The web application NEVER directly accesses the filesystem.

All communication happens through APIs.

```text
Web App
    ↓
Runtime API
    ↓
Filesystem
```

---

# Realtime Communication

Realtime communication uses WebSockets.

Initial events:

* RUNTIME_READY
* CATEGORY_UPDATED
* MEDIA_ADDED
* MEDIA_REMOVED
* FILESYSTEM_REPAIRED

---

# Development Workflow

# Start Development Environment

Run from root:

```bash
npm start
```

This automatically:

* starts server runtime
* starts web development server
* opens separate terminals

The mobile app exists but is intentionally disabled from auto-start.

---

# Server Development

Server runtime handles:

* initialization
* storage
* APIs
* indexing
* runtime lifecycle

---

# Web Development

The web application handles:

* runtime dashboard
* category navigation
* media display
* realtime updates

---

# Initial Development Goals

# Phase 1

The first milestone is:

```text
Runtime Starts
      ↓
C:/MediaGrid Created
      ↓
Required Folders Validated
      ↓
Web App Connects To Runtime
      ↓
Categories Display In Sidebar
      ↓
Media Displayed Correctly
```

---

# Future Planned Features

Planned future capabilities:

* Advanced streaming
* HLS transcoding
* Authentication system
* Device pairing
* Tailscale integration
* Mobile ecosystem
* File synchronization
* AI semantic search
* Recommendation systems
* Plugin architecture
* Distributed runtime nodes

---

# Current Development Priorities

Current priorities:

1. Runtime stability
2. Filesystem reliability
3. API consistency
4. Realtime communication
5. Category-driven architecture
6. Web ↔ Runtime synchronization

---

# Coding Standards

# Required

* Strong typing
* Predictable naming
* Simple architecture
* Flat folder structures
* Readable modules
* Clear responsibilities

---

# Avoid

* deep nesting
* premature optimization
* complex abstractions
* unnecessary dependencies
* enterprise patterns too early

---

# AI Development Guidelines

When using AI agents:

* implement complete vertical features
* avoid placeholder systems
* maintain modular boundaries
* preserve filesystem architecture
* preserve runtime-first design

Every feature should:

```text
Filesystem
    ↓
Database
    ↓
API
    ↓
Web UI
```

---

# Runtime Philosophy

MediaGrid is fundamentally:

# A Runtime-Based Personal Media Infrastructure

NOT:

* just a streaming app
* just a dashboard
* just a media player

The runtime remains the heart of the ecosystem.

---

# License

License information will be added later.

---

# Current Status

Current development stage:

```text
Phase 1 — Runtime Initialization, Filesystem Foundation And Client Communication
```

Focus:

* runtime startup
* filesystem initialization
* category system
* API communication
* realtime synchronization
* web dashboard integration
