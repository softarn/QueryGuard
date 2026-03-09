FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npx", "tsx", "src/mcp/server.ts"]
