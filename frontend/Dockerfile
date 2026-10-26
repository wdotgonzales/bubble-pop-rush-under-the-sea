# The build context is the repository root (see .github/workflows/deploy.yml and
# docker-compose.yml), because the client imports the spawn generator from ../shared.

# Stage 1: build the client
FROM node:20-alpine AS builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY shared /app/shared
COPY frontend/ ./
# The backend address is configuration, passed in at build time (see deploy.yml), not written in code.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Stage 2: serve the build with nginx
FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
