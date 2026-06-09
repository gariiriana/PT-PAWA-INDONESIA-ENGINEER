# Stage 1: Build static assets
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package configurations
COPY package.json package-lock.json tsconfig.json vite.config.shared.ts ./
COPY shared/package.json ./shared/
COPY apps/hse-web/package.json ./apps/hse-web/

# Install dependencies (only production and dev dependencies for compilation)
RUN npm ci

# Copy shared libraries and app source code
COPY shared/ ./shared/
COPY apps/hse-web/ ./apps/hse-web/

# Build the hse-web application
RUN npm run build --workspace=apps/hse-web

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/apps/hse-web/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY apps/hse-web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
