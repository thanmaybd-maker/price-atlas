FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 APP_MODE=demo ATLAS_DB_PATH=/app/data/atlas.sqlite
RUN pnpm build && mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node","node_modules/next/dist/bin/next","start","apps/web","--hostname","0.0.0.0"]
