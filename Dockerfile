FROM python:3.11-slim

# Install git and ssh client
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create directories
RUN mkdir -p /app/database /backups /root/.ssh

# Expose port
EXPOSE 8080

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=sqlite:////app/database/git_backup.db

# Change to backend directory for proper imports
WORKDIR /app/backend

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Run application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
