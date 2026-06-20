# syntax=docker/dockerfile:1

# --- Stage 1: build web ---
FROM node:20-slim AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Stage 2: build server ---
FROM node:20-slim AS server-build
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# --- Stage 3: runtime ---
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /server/dist ./dist
# bundled JSON data is imported at runtime; copy it next to dist
COPY --from=server-build /server/src/data ./dist/data
COPY --from=web-build /web/dist ./public
EXPOSE 8080
USER node
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
