#!/bin/bash

# ============================================
# PostgreSQL Docker Setup Script for AI VTuber
# ============================================
# This script sets up a PostgreSQL database using Docker
# for local development. It creates a container with the
# necessary configuration for the AI VTuber memory system.

set -e

# Configuration
CONTAINER_NAME="ai-vtuber-postgres"
POSTGRES_USER="aivtuber"
POSTGRES_PASSWORD="aivtuber_dev_password"
POSTGRES_DB="aivtuber_db"
POSTGRES_PORT="5432"
POSTGRES_VERSION="15-alpine"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AI VTuber PostgreSQL Setup${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not running.${NC}"
    echo "Please start Docker and try again."
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}Container '${CONTAINER_NAME}' already exists.${NC}"
    
    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${GREEN}Container is already running.${NC}"
    else
        echo "Starting existing container..."
        docker start ${CONTAINER_NAME}
        echo -e "${GREEN}Container started.${NC}"
    fi
else
    echo "Creating new PostgreSQL container..."
    
    # Create and start the container
    docker run -d \
        --name ${CONTAINER_NAME} \
        -e POSTGRES_USER=${POSTGRES_USER} \
        -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \
        -e POSTGRES_DB=${POSTGRES_DB} \
        -p ${POSTGRES_PORT}:5432 \
        -v ai-vtuber-postgres-data:/var/lib/postgresql/data \
        postgres:${POSTGRES_VERSION}
    
    echo -e "${GREEN}Container created and started.${NC}"
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to be ready..."
    sleep 3
    
    for i in {1..30}; do
        if docker exec ${CONTAINER_NAME} pg_isready -U ${POSTGRES_USER} &> /dev/null; then
            echo -e "${GREEN}PostgreSQL is ready!${NC}"
            break
        fi
        echo "Waiting... ($i/30)"
        sleep 1
    done
fi

# Display connection information
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Connection Information${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Host:     localhost"
echo "Port:     ${POSTGRES_PORT}"
echo "Database: ${POSTGRES_DB}"
echo "User:     ${POSTGRES_USER}"
echo "Password: ${POSTGRES_PASSWORD}"
echo ""
echo -e "${YELLOW}DATABASE_URL for .env:${NC}"
echo "DATABASE_URL=\"postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public\""
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Useful Commands${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Stop container:    docker stop ${CONTAINER_NAME}"
echo "Start container:   docker start ${CONTAINER_NAME}"
echo "Remove container:  docker rm -f ${CONTAINER_NAME}"
echo "View logs:         docker logs ${CONTAINER_NAME}"
echo "Connect to psql:   docker exec -it ${CONTAINER_NAME} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}"
echo ""
echo -e "${GREEN}Setup complete!${NC}"
