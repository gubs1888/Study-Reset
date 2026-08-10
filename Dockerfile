FROM node:22.22.0-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node client ./client
COPY --chown=node:node server ./server
COPY --chown=node:node LICENSE ./LICENSE

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "server/server.js"]
