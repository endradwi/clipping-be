# 🚀 Coolify Deployment Guide

1. Create a new service in Coolify from GitHub repository `endradwi/clipping-be`.
2. Select **Dockerfile** build pack.
3. Configure Environment Variables:
   - `PORT=3000`
   - `R2_ACCOUNT_ID=...`
   - `R2_ACCESS_KEY_ID=...`
   - `R2_SECRET_ACCESS_KEY=...`
   - `R2_BUCKET_NAME=cheat-clip-media`
   - `R2_PUBLIC_DOMAIN=https://pub-054cc5f9c9824a97a630013aee308d7e.r2.dev`
   - `PUBLIC_SUPABASE_URL=https://orhefbethsebaldqhigs.supabase.co`
   - `PUBLIC_SUPABASE_PUBLISHABLE_KEY=...`
   - `AI_ROUTER_BASE_URL=https://router.endra.web.id/v1`
   - `AI_ROUTER_API_KEY=sk-9router`
   - `GROQ_API_KEY=...`
4. Set Domain in Coolify (e.g., `api-clip.endra.web.id`).
