# sitemap-generator/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy only package files first for layer caching
COPY package*.json ./
# Install dependencies
RUN npm install

# Copy the actual script
COPY generate-sitemaps.js ./

# --- Second Stage --- Use a smaller base if possible, ensure cron is available
FROM alpine:latest

# Install cron and nodejs runtime (needed to run the script)
# ca-certificates is needed for HTTPS requests to Strapi
RUN apk add --no-cache cron nodejs npm ca-certificates

WORKDIR /app

# Copy built artifacts from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generate-sitemaps.js ./

# Add the crontab file (we'll create this next)
COPY crontab /etc/crontabs/root

# Give execution rights on the crontab file (usually not needed but safe)
RUN chmod 0644 /etc/crontabs/root

# Create log file and grant permissions if needed
RUN touch /var/log/cron.log && chmod +w /var/log/cron.log

# Run cron in the foreground and tail the log file
# This keeps the container running
CMD crond -f -l 8 && tail -f /var/log/cron.log