# Build Stage
FROM --platform=$BUILDPLATFORM node:26-alpine AS build

WORKDIR /app

RUN npm install --global pnpm@12.16.1

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Runtime Stage
FROM nginxinc/nginx-unprivileged:1.29-alpine

# Set the mode here: COPY keeps the local file's, and nginx runs as an unprivileged user
COPY --chmod=0644 nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
