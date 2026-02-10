# GitSync Pro

🚀 Professional Git Repository Backup and Synchronization System

A powerful, self-hosted solution for automated Git repository backups across GitHub, GitLab, Gitee, and local storage.

## ✨ Features

- **🔄 Mirror Backup**: Complete repository synchronization including all branches, tags, and commits
- **⏰ Scheduled Sync**: Flexible Cron-based scheduling for automated backups
- **🌐 Multi-Platform**: Support for GitHub, GitLab, Gitee, and local repositories
- **📊 Real-time Dashboard**: Monitor backup status and activity logs
- **🔐 Secure Authentication**: SSH key and token management
- **🐳 Docker Ready**: Easy deployment with Docker and Docker Compose
- **📝 Detailed Logging**: Track all sync operations with error diagnostics

## 🏗️ Architecture

- **Backend**: Python + FastAPI
- **Frontend**: Vanilla JavaScript + Modern CSS
- **Database**: SQLite (single-node)
- **Scheduler**: APScheduler with Cron support
- **Git Engine**: GitPython + subprocess for mirror operations

## 📋 Prerequisites

### For Docker Deployment
- Docker & Docker Compose
- Git (included in Docker image)

### For Local Development
- Python 3.11 or higher
- Git
- SSH client (for SSH authentication)

## 🚀 Quick Start

### Option 1: Docker Deployment (Recommended)

```bash
# Clone the repository
git clone https://github.com/Onicc/git-backup.git
cd git-backup

# Start with Docker
./start.sh
```

Access the web interface at: **http://localhost:8080**

### Option 2: Local Development (with venv)

```bash
# Clone the repository
git clone https://github.com/Onicc/git-backup.git
cd git-backup

# Setup local environment
./setup_local.sh

# Activate virtual environment
source venv/bin/activate

# Start the application
cd backend
python main.py
```

Access the web interface at: **http://localhost:8080**
