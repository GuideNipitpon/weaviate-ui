FROM node:18 AS builder
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend .
RUN pnpm build

FROM python:3.11-slim-bookworm
WORKDIR /app


COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY --from=builder /app/dist /app/static
COPY pyproject.toml uv.lock ./
RUN uv sync --no-install-project

COPY . .
CMD ["uv", "run", "uvicorn", "weaviate_ui.main:app", "--host", "0.0.0.0", "--port", "7777"]
