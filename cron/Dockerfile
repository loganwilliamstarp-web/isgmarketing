# Lightweight cron service to trigger email processing
FROM node:18-alpine

WORKDIR /app

# Copy the cron script (Node 18+ has native fetch, no dependencies needed)
COPY cron-job.js ./

# Run the cron script
CMD ["node", "cron-job.js"]
