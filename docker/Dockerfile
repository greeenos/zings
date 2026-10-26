# syntax=docker/dockerfile:1.6

# --- Build the web app and the server hooks ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm install -g npm@12.2.1 && npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- Fetch the PocketBase binary for the target platform ---
FROM alpine:3.20 AS pocketbase
ARG PB_VERSION=0.40.5
ARG TARGETARCH
RUN wget -qO /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && unzip /tmp/pb.zip pocketbase -d /pb

# --- Runtime: one binary, one data volume ---
FROM alpine:3.20
# tzdata: TZ sets the local time for scheduled backups. ca-certificates: outgoing SMTP over TLS.
RUN apk add --no-cache ca-certificates tzdata
COPY --from=pocketbase /pb/pocketbase /pb/pocketbase
COPY pb_migrations /pb/pb_migrations
COPY --from=build /app/pb_hooks /pb/pb_hooks
COPY --from=build /app/pb_public /pb/pb_public

VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null 2>&1 || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", \
     "--publicDir=/pb/pb_public", "--hooksDir=/pb/pb_hooks", "--migrationsDir=/pb/pb_migrations", \
     "--automigrate=false", "--hooksWatch=false"]
