# --- build stage ---
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# --- runtime stage ---
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY site ./site

# API keys + usage metering live in SQLite on the Fly volume mounted here.
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8787
CMD ["node", "dist/src/index.js"]
