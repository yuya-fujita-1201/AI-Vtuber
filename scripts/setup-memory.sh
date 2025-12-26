#!/bin/bash

# Day 7 Memory System Setup Script
# This script automates the installation and setup of the hybrid memory system

set -e  # Exit on error

echo "========================================="
echo "AI VTuber - Memory System Setup"
echo "========================================="
echo ""

# Check if Docker is running
echo "🔍 Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi
echo "✅ Docker is running"
echo ""

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install @prisma/client chromadb
npm install -D prisma
echo "✅ Dependencies installed"
echo ""

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

# Run database migrations
echo "🗄️  Running database migrations..."
npx prisma migrate dev --name init
echo "✅ Database migrated"
echo ""

# Start ChromaDB in Docker
echo "🚀 Starting ChromaDB in Docker..."
if docker ps -a | grep -q chromadb; then
    echo "   Removing existing ChromaDB container..."
    docker rm -f chromadb
fi

docker run -d \
  --name chromadb \
  -p 8000:8000 \
  -v chromadb_data:/chroma/chroma \
  chromadb/chroma:latest

echo "✅ ChromaDB started on http://localhost:8000"
echo ""

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
        echo "✅ ChromaDB is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ ChromaDB failed to start in 30 seconds"
        exit 1
    fi
    sleep 1
done
echo ""

# Check if .env exists
echo "🔧 Checking environment configuration..."
if [ ! -f .env ]; then
    echo "   Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update your .env file with your OPENAI_API_KEY"
else
    echo "✅ .env file exists"
fi
echo ""

echo "========================================="
echo "✅ Memory System Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Update your .env file with OPENAI_API_KEY"
echo "2. Run 'npx ts-node test_memory.ts' to test the setup"
echo "3. Check the implementation guide: docs/DAY7_MEMORY_IMPLEMENTATION.md"
echo ""
echo "ChromaDB Management:"
echo "  - View logs: docker logs chromadb"
echo "  - Stop: docker stop chromadb"
echo "  - Restart: docker restart chromadb"
echo "  - Remove: docker rm -f chromadb"
echo ""
