#!/bin/bash
# Start FlareSolverr for CloudFlare bypass (required for Cars.com, CarGurus, AutoTrader scrapers)

echo "🚀 Starting FlareSolverr..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q '^flaresolverr$'; then
    echo "📦 FlareSolverr container already exists"
    
    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q '^flaresolverr$'; then
        echo "✅ FlareSolverr is already running on http://localhost:8191"
    else
        echo "▶️  Starting existing container..."
        docker start flaresolverr
        echo "✅ FlareSolverr started on http://localhost:8191"
    fi
else
    echo "📥 Creating new FlareSolverr container..."
    docker run -d \
        --name flaresolverr \
        --restart always \
        -p 8191:8191 \
        -e LOG_LEVEL=warn \
        ghcr.io/flaresolverr/flaresolverr:latest
    
    echo "✅ FlareSolverr started on http://localhost:8191"
fi

# Wait for it to be ready
echo "⏳ Waiting for FlareSolverr to be ready..."
sleep 3

# Test the endpoint
if curl -s http://localhost:8191/v1 > /dev/null; then
    echo "✅ FlareSolverr is healthy and ready"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Add to .env.local:"
    echo "      FLARESOLVERR_URL=http://localhost:8191"
    echo ""
    echo "   2. Restart your dev server (npm run dev)"
    echo ""
    echo "   3. Trigger scrapers to test:"
    echo "      npm run worker scrape:cars_com"
    echo ""
else
    echo "⚠️  FlareSolverr started but not responding yet. Wait 10 seconds and try:"
    echo "   curl http://localhost:8191/v1"
fi
