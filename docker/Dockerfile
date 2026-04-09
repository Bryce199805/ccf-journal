# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: Build Go server
FROM golang:1.22-alpine AS go-builder

RUN apk add --no-cache gcc musl-dev git

WORKDIR /app
COPY server/ .
RUN go mod tidy && \
    go mod download && \
    CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o /ccf-server ./cmd/server

# Stage 3: Runtime
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy Go binary
COPY --from=go-builder /ccf-server /app/ccf-server

# Copy database files
COPY server/db/schema.sql /app/db/schema.sql
COPY server/db/import_data.json /app/db/import_data.json

# Copy React build output as the frontend
COPY --from=frontend-builder /web/dist/ /app/frontend/

EXPOSE 8080

ENV DB_PATH=/app/data/ccf.db \
    PORT=8080 \
    FRONTEND_DIR=/app/frontend \
    SCHEMA_PATH=/app/db/schema.sql \
    IMPORT_PATH=/app/db/import_data.json

CMD ["/app/ccf-server"]
