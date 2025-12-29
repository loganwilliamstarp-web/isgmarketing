# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build args for Vite env vars
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GOOGLE_MAPS_API_KEY

# Build the app using node to run vite directly
RUN node ./node_modules/vite/bin/vite.js build && cp serve.json dist/

# Production stage
FROM node:18-alpine AS runner

WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/serve.json ./dist/

# Railway sets PORT dynamically
ENV PORT=3000

# Expose port
EXPOSE $PORT

# Start the server using shell form to expand $PORT
CMD serve -s dist -l $PORT
