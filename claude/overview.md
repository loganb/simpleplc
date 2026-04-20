# Project Overview

## Purpose

HVAC PLC controller application — a web interface for controlling HVAC programmable logic controllers.

## Architecture

- **Backend**: Rails 8.1 in API-only mode (no server-rendered views), serving JSON.
- **Frontend**: React 19 SPA built with Vite, lives in `frontend/`. Dev server on port 5173, Rails API on port 3000.
- **Database**: SQLite3 (via the Solid stack — Solid Queue, Solid Cache, Solid Cable — no Redis needed).
- **Real-time**: ActionCable backed by Solid Cable for WebSocket support.
- **Deployment**: Docker + Kamal, with Thruster for HTTP caching/compression.
- **Tooling**: Ruby 4.0.2, Node 22, managed via mise.

## Current State

Greenfield — scaffolded but no domain models, migrations, or API endpoints yet. The infrastructure (Rails API, React frontend, Docker, CI linting) is in place and ready for feature work.

## Key Entry Points

- `bin/dev` / `Procfile.dev` — starts both Rails and Vite dev servers.
- `config/routes.rb` — empty, ready for API routes.
- `frontend/src/` — minimal React template.
