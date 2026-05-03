#!/bin/bash

# HEALVIS Startup Script

echo "Starting HEALVIS Application..."
echo ""

# Start Backend Server
echo "1. Starting Backend API Server..."
cd backend
npm start &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
cd ..

# Wait for backend to initialize
sleep 3

# Start Frontend Server
echo ""
echo "2. Starting Frontend Server..."
cd frontend/public
python3 -m http.server 8000 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
cd ../..

echo ""
echo "==========================================="
echo "HEALVIS is now running!"
echo "==========================================="
echo ""
echo "Frontend (Login/Portfolio): http://localhost:8000"
echo "Backend API: http://localhost:3000"
echo ""
echo "Login Page: http://localhost:8000/login.html"
echo "Dashboard: http://localhost:8000/dashboard.html"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
