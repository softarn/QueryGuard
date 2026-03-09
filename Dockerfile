FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
ENV NODE_ENV=production
ENV DB_PATH=/data/app.db
EXPOSE 3000
CMD ["node", "build"]
