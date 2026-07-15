FROM node:22-slim AS frontend
WORKDIR /src/frontend
ARG VITE_APP_BASE_PATH=/events/
ARG VITE_ALBUM_TITLE=Свадебный альбом
ARG VITE_MAX_UPLOAD_BYTES=314572800
ARG VITE_SHARE_TITLE=Свадебное фото
ENV VITE_APP_BASE_PATH=${VITE_APP_BASE_PATH} \
    VITE_ALBUM_TITLE=${VITE_ALBUM_TITLE} \
    VITE_MAX_UPLOAD_BYTES=${VITE_MAX_UPLOAD_BYTES} \
    VITE_SHARE_TITLE=${VITE_SHARE_TITLE}
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    WEB_CONCURRENCY=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libheif1 \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /src/frontend/dist ./static
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY}"]
