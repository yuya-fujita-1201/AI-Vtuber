#!/bin/bash
# Script to run ChromaDB locally using Python
# Usage: ./scripts/run_chroma.sh

echo "Starting ChromaDB on port 8000..."
echo "Data directory: ./chroma_data"

# Check if chromadb is installed
if ! pip3 show chromadb > /dev/null; then
    echo "Installing chromadb..."
    pip3 install chromadb
fi

# Run chroma server
# Note: As of recent versions, the CLI command might be 'chroma run'
chroma run --path ./chroma_data --host localhost --port 8000
