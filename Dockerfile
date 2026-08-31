FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src/schema ./src/schema
COPY --chown=node:node docs/third-party-ai-review-standard.md ./docs/third-party-ai-review-standard.md

RUN mkdir -p /var/lib/word2html-volume/data /var/backups/word2html-volume/backups && \
    chown -R node:node /var/lib/word2html-volume /var/backups/word2html-volume

USER node
EXPOSE 5173
STOPSIGNAL SIGTERM
CMD ["node", "server/index.mjs", "--production"]
