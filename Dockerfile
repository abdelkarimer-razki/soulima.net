# ==============================================================================
# Soulima — High-Performance Commercial-Grade P2P Media Streaming Platform
# Multi-Stage Dockerfile (Web Frontend Builder + FFmpeg/Node.js Streaming Server)
# ==============================================================================

# ─── Stage 1: Build Angular Web Application ──────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source and build configurations
COPY angular.json tsconfig*.json ./
COPY src/ ./src/

# Compile production-optimized web application to docs/
RUN npm run build

# ─── Stage 2: Production Streaming Engine & Transcoder ────────────────────────
FROM node:20-bookworm-slim AS runner

LABEL maintainer="Soulima Engineering" \
      description="Commercial-grade peer-to-peer media streaming platform" \
      version="1.0.0"

# Install system dependencies:
# - ffmpeg: Real-time MKV to fragmented MP4 remuxing & non-browser audio transcoding
# - python3, pip, setuptools: ffsubsync execution environment
# - curl: Container health monitoring
# - ca-certificates: TLS verification for TMDB, SubDL, and tracker discovery
# - tini: Proper process reaping and SIGTERM/SIGINT graceful shutdown
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    tini \
 && rm -rf /var/lib/apt/lists/*

# Install ffsubsync for automated frame-accurate subtitle alignment
RUN pip3 install --no-cache-dir --break-system-packages ffsubsync || \
    pip3 install --no-cache-dir ffsubsync || true

WORKDIR /app

# Install streaming engine production dependencies
COPY streaming-server/package.json streaming-server/package-lock.json ./streaming-server/
RUN cd streaming-server && (npm ci --omit=dev || npm install --omit=dev)

# Copy streaming server backend logic
COPY streaming-server/ ./streaming-server/

# Copy compiled Angular frontend from builder stage into /app/docs
# (server.js automatically serves static assets from path.join(__dirname, '../docs'))
COPY --from=builder /app/docs ./docs

# Configure persistent data directory (/data) for torrent pieces, downloads, and sync cache
RUN mkdir -p /data/cache /data/media && chown -R node:node /data /app

# Environment defaults
ENV PORT=3030 \
    NODE_ENV=production \
    SOULIMA_CACHE_DIR=/data/cache \
    MEDIA_DIR=/data/media \
    FFMPEG_PATH=/usr/bin/ffmpeg

# Switch to non-root node user for container security
USER node

# Expose HTTP streaming, API, and Web UI port
EXPOSE 3030

# Persistent volume mount for torrent swarm buffer, offline library, and subtitle cache
VOLUME ["/data"]

# API healthcheck monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3030/api/health || exit 1

# Process init and graceful signal management
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "streaming-server/server.js"]
