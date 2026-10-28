FROM public.ecr.aws/docker/library/node:22.23.4-alpine3.23 AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY backend ./backend
RUN npm run build --workspace backend

FROM public.ecr.aws/docker/library/node:22.23.4-alpine3.23 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace backend --include-workspace-root && npm cache clean --force

COPY --from=build --chown=node:node /app/backend/dist ./backend/dist

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/server.js"]
