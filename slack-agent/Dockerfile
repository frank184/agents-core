# Multi-stage build for Slack Documentation Agent

# Stage 1: Builder
FROM node:18-bullseye AS builder

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3.9 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# Install Node dependencies
RUN npm ci --only=production

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Stage 2: Runtime
FROM node:18-bullseye

WORKDIR /app

# Install Python and minimal runtime dependencies
RUN apt-get update && apt-get install -y \
    python3.9 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Install runtime Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source for Python modules (needed at runtime by child_process.spawn)
COPY src/document-parser/ ./src/document-parser/

# Create directories for document storage
RUN mkdir -p /app/processed_docs

# Set environment variables
ENV NODE_ENV=production
ENV DOC_STORAGE_PATH=/app/processed_docs

# Run the bot using Socket Mode (no exposed port)
CMD ["node", "dist/src/index.js"]
