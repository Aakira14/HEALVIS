#!/bin/bash

# HEALVIS Server Startup Script
echo "🚀 Starting HEALVIS Server..."

# Navigate to backend directory
cd "$(dirname "$0")/backend"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit backend/.env and add your GROQ_API_KEY and GOOGLE_MAPS_API_KEY"
    exit 1
fi

# Check if GROQ_API_KEY is set
if ! grep -q "GROQ_API_KEY=gsk_" .env; then
    echo "❌ Error: GROQ_API_KEY not configured in .env file"
    echo "Please add your Groq API key to backend/.env"
    exit 1
fi

# Kill any existing process on port 3000
echo "🔍 Checking for existing processes on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# Start the server
echo "✅ Starting server..."
node server.js

# If server exits, show error
if [ $? -ne 0 ]; then
    echo "❌ Server failed to start. Check the error above."
    exit 1
fi
