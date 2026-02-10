#!/bin/bash

echo "🔧 Setting up local development environment..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.11 or higher."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r backend/requirements.txt

# Create necessary directories
mkdir -p data backups backend/temp_repos

# Initialize database
echo "🗄️ Initializing database..."
cd backend
python -c "from database import init_db; init_db()"
cd ..

echo "✅ Setup complete!"
echo ""
echo "🚀 To start the application:"
echo "  source venv/bin/activate"
echo "  cd backend"
echo "  python main.py"
echo ""
echo "🌐 Then access: http://localhost:8080"
