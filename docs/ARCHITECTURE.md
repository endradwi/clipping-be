# 🏛️ Architecture Specification - Backend (clipping-be)

## 1. Overview
High-performance video clipper backend built on **Bun** and **Elysia**, adhering to strict MVC separation and 5 Anti-Slop Core Invariants.

## 2. Five Anti-Slop Core Invariants
1. **Server-Sent Events (SSE) Progress:** Zero polling spam. Streams updates real-time via `/api/v1/clips/:id/progress`.
2. **Hard Mathematical Telemetry (RPI):** Retention Peak Index computed from normalized YouTube telemetry curves. Zero AI hallucination, 0.001s computation.
3. **Idempotency & Mutex Guard:** Jobs hashed with `sha256(url + start + end)` to block duplicate concurrent requests and protect VPS CPU.
4. **Ephemeral Disk Lifecycle:** Zero disk leaks. Slicing uses temporary sandbox directories cleaned via RAII `try...finally`.
5. **BYOK Credential Security:** Credentials never stored in plain text or client localStorage; passed via secure HTTP-only cookies and headers.

## 3. Directory Layout (MVC)
```text
src/
├── controllers/      # HTTP & SSE request handlers
├── models/           # Zod schemas & typed domain entities
├── services/         # Pure business logic (yt-dlp, ffmpeg, R2, AI, DB)
├── views/            # Standardized API response serializers
├── routes/           # Elysia route mapping
├── common/           # Mutex, errors, logger, cookies
└── index.ts          # Server bootstrap
```
