# Project Overview

## Purpose

HVAC PLC controller application — a web interface for controlling HVAC programmable logic controllers.

## Architecture

- **Backend**: Rails 8.1 in API-only mode (no server-rendered views), serving JSON.
- **Frontend**: React 19 + TypeScript SPA built with Vite, lives in `frontend/`. Uses shadcn/ui (Radix + Tailwind CSS v4) for components and styling. Dev server on port 5173, Rails API on port 3000.
- **Database**: SQLite3 (via the Solid stack — Solid Queue, Solid Cache, Solid Cable — no Redis needed).
- **Real-time**: ActionCable backed by Solid Cable for WebSocket support.
- **Deployment**: Docker + Kamal, with Thruster for HTTP caching/compression.
- **Tooling**: Ruby 4.0.2, Node 22, managed via mise.

## Current State

Backend has Modbus polling working — three devices (DS18B20 temp board, NTC temp board, relay I/O board) are being polled and their state stored in the `devices` table (`current_state` JSON column). Frontend has a placeholder dashboard shell with shadcn/ui Card components for each device.

## Key Entry Points

- `bin/dev` / `Procfile.dev` — starts both Rails and Vite dev servers.
- `config/routes.rb` — empty, ready for API routes.
- `frontend/src/App.tsx` — main dashboard component.
- `frontend/src/components/ui/` — shadcn/ui components (add more via `npx shadcn@latest add <component>`).
- `frontend/src/lib/utils.ts` — shadcn utility (cn class merger).
