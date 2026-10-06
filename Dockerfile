# ── DEV VAN LIFE ─────────────────────────────────────────────────────────────
# One container, one volume. The Express server serves both the API and the built
# SPA, and data/store.json lives on the mounted volume so agents, personas and
# settings survive deploys. NEVER deploy this to serverless (ephemeral filesystem
# = the blank Agents tab bug).

FROM node:20-slim AS webbuild
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server/ server/
COPY --from=webbuild /app/web/dist web/dist
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["node", "server/index.js"]
