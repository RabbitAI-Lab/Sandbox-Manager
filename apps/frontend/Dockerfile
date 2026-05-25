# Build stage
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/frontend/tsconfig.json apps/frontend/tsconfig.json
COPY apps/frontend/vite.config.ts apps/frontend/vite.config.ts
COPY apps/frontend/tailwind.config.js apps/frontend/tailwind.config.js
COPY apps/frontend/postcss.config.js apps/frontend/postcss.config.js
COPY apps/frontend/index.html apps/frontend/index.html
COPY apps/frontend/src apps/frontend/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sandbox-platform/frontend build

# Runtime stage
FROM nginx:alpine
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://sandbox-platform-backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
