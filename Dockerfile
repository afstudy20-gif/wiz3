# ── Stage 1: Build the React frontend ─────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

# Install dependencies first (layer cache)
COPY frontend/package*.json ./
RUN npm ci

# Build
COPY frontend/ ./
RUN npm run build


# ── Stage 2: Python API + serve compiled frontend ──────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy compiled React app
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Render injects $PORT at runtime (default 8000 for local)
ENV PORT=8000

EXPOSE $PORT

CMD ["sh", "-c", "cd /app/backend && uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
