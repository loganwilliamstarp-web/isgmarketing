# Lightweight cron service to trigger email processing
FROM node:18-alpine

WORKDIR /app

# Copy the cron script
COPY cron-job.js ./

# Install node-fetch for making HTTP requests
RUN npm init -y && npm install node-fetch@3

# Run the cron script
CMD ["node", "cron-job.js"]
