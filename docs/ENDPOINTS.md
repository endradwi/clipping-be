# 📡 API Endpoints Documentation

### Health Check
- `GET /health`
  - Response: `{ status: "healthy", timestamp: "...", uptime: 12.3 }`

### Video Analysis & Hotspots
- `POST /api/v1/analyze`
  - Body: `{ "url": "https://www.youtube.com/watch?v=..." }`
  - Response:
    ```json
    {
      "success": true,
      "data": {
        "videoId": "dQw4w9WgXcQ",
        "title": "Video Title",
        "duration": 212,
        "heatmapPoints": [...],
        "topClips": [
          { "rank": 1, "start": 0, "end": 30, "duration": 30, "score": 98, "label": "Peak #1" },
          { "rank": 2, "start": 45, "end": 75, "duration": 30, "score": 88, "label": "Peak #2" },
          { "rank": 3, "start": 90, "end": 120, "duration": 30, "score": 82, "label": "Peak #3" }
        ]
      }
    }
    ```

### Clip Rendering & Progress
- `POST /api/v1/clips/render`
  - Body:
    ```json
    {
      "url": "https://www.youtube.com/watch?v=...",
      "start": 0,
      "end": 30,
      "aspectRatio": "9:16",
      "burnSubtitles": true
    }
    ```
  - Response: `{ "success": true, "data": { "jobId": "<uuid>", "status": "queued" } }`

- `GET /api/v1/clips/:id/progress`
  - Server-Sent Events (SSE) streaming updates:
    `data: {"status": "slicing", "progressPercent": 50}`

- `GET /api/v1/clips/:id`
  - Query current status of job.

### Settings (BYOK)
- `GET /api/v1/settings`
- `POST /api/v1/settings`
