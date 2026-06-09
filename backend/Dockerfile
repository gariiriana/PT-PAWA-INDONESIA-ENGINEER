# Stage 1: Build the Go application
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go.mod from root build context
COPY go.mod ./

# Copy the rest of the backend source code
COPY backend/ ./backend/

# Compile statically-linked Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main ./backend/cmd/api/main.go

# Stage 2: Minimal runtime image
FROM alpine:3.19

WORKDIR /app

# Copy compiled binary from builder stage
COPY --from=builder /app/main .

EXPOSE 8080

CMD ["./main"]
