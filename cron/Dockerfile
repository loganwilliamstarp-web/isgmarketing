# Lightweight cron service to trigger email processing
# No npm dependencies - uses Node 18+ native fetch
FROM node:18-alpine

WORKDIR /app

# Copy the cron script
COPY cron-job.js ./

# Run the cron script
CMD ["node", "cron-job.js"]
