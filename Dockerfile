FROM node:20-alpine AS builder

WORKDIR /app

# Copy only package files first for layer caching
COPY package*.json ./
# Install dependencies
RUN npm install --omit=dev # Omit devDependencies for smaller final image

# Copy the actual script
COPY generate-sitemaps.js ./

# --- Second Stage --- Use a smaller base if possible, ensure cron is available
FROM alpine:latest

# Install dcron (for cron daemon), nodejs runtime, and ca-certificates
RUN apk add --no-cache dcron nodejs npm ca-certificates

WORKDIR /app

# Copy built artifacts from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generate-sitemaps.js ./

# Add the crontab file (we'll create this next)
COPY crontab /etc/crontabs/root

# Give execution rights on the crontab file (usually not needed but safe)
# RUN chmod 0644 /etc/crontabs/root # This might not be needed if crond runs as root

# Create log file and make it writable
RUN touch /var/log/cron.log && chmod 666 /var/log/cron.log # Make writable by crond

# Run crond in the foreground and tail the log file
# This keeps the container running
CMD crond -f -l 8 -L /var/log/cron.log && tail -f /var/log/cron.log