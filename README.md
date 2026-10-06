# 🎬 Cheat-Clip API (`clipping-be`)

Ultra-lean, high-efficiency AI auto-clipper backend engine built with **Bun** & **Elysia**.

## Features
- **Zero-Disk Slicing:** FFmpeg direct stream slicing without saving whole videos.
- **Pure Math Telemetry:** 3 non-overlapping peak retention hotspots calculated via RPI algorithm.
- **Server-Sent Events (SSE):** Real-time progress notifications without polling.
- **Anti-Double Click Mutex:** Hash-locked execution prevents server freeze.
- **Ephemeral RAII Disk Cleanup:** All scratch files safely deleted after render.
- **Cloudflare R2 Integration:** Automated upload with 7-day lifecycle.
- **BYOK AI Cascade:** 9Router primary -> Groq Whisper LPU fallback.

## Quick Start
```bash
bun install
bun run src/index.ts
```
