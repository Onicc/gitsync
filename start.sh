#!/bin/bash

echo "🚀 Starting GitSync Pro..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Create necessary directories
mkdir -p data backups

# Build and start containers
echo "📦 Building Docker image..."
docker-compose build

echo "🔄 Starting services..."
docker-compose up -d

echo "✅ GitSync Pro is running!"
echo "🌐 Access the web interface at: http://localhost:8080"
echo ""
echo "📋 Useful commands:"
echo "  - View logs: docker-compose logs -f"
echo "  - Stop: docker-compose down"
echo "  - Restart: docker-compose restart"
