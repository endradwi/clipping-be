FROM oven/bun:1.2-debian AS base
WORKDIR /app

# Install FFmpeg and Python for yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp standalone binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

ENV PORT=3000
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
