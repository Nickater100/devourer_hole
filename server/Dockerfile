# API de Angry Ball. Se construye para linux/arm64 (el servidor de Astragal es
# un Oracle Linux aarch64) desde .github/workflows/server.yml.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3010 \
    DB_PATH=/data/angryball.db

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

# La base vive en un volumen. El directorio se crea con dueño `node` para que
# el volumen nombrado herede esos permisos la primera vez.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 3010
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3010/health >/dev/null || exit 1

CMD ["node", "src/index.js"]
