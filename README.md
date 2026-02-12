# GitSync Pro

🚀 Professional Git Repository Backup and Synchronization System

A powerful, self-hosted solution for automated Git repository backups across GitHub, GitLab, Gitee, and local storage.

## ✨ Features

- **🔄 Mirror Backup**: Complete repository synchronization including all branches, tags, and commits
- **⏰ Scheduled Sync**: Flexible Cron-based scheduling for automated backups
- **🌐 Multi-Platform**: Support for GitHub, GitLab, Gitee, and local repositories
- **🔑 Multi-SSH Key Support**: Separate SSH keys for different platforms and users
- **📊 Real-time Dashboard**: Monitor backup status and activity logs
- **🔐 Secure Authentication**: SSH key and Personal Access Token management
- **🐳 Docker Ready**: Easy deployment with Docker and Docker Compose
- **📝 Detailed Logging**: Track all sync operations with error diagnostics
- **💾 Data Persistence**: All data (database, SSH keys, backups) persists across restarts

## 🏗️ Architecture

- **Backend**: Python 3.11 + FastAPI
- **Frontend**: Vanilla JavaScript + Modern CSS
- **Database**: SQLite (single-node)
- **Scheduler**: APScheduler with Cron support
- **Git Engine**: GitPython + subprocess for mirror operations

## 📋 Prerequisites

### For Docker Deployment (Recommended)
- Docker 20.10 or higher
- Docker Compose 2.0 or higher
- 2GB RAM minimum
- 10GB disk space (for backups)

### For Local Development
- Python 3.11 or higher
- Git 2.30 or higher
- SSH client (openssh-client)
- 2GB RAM minimum
- 10GB disk space (for backups)

## 🚀 Installation

### Option 1: Docker Deployment (Recommended)

Docker deployment provides isolated environment with automatic dependency management.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/Onicc/git-backup.git
cd git-backup
```

#### Step 2: Create Required Directories

```bash
mkdir -p data backups docker_ssh
```

#### Step 3: Start with Docker Compose

```bash
docker-compose up -d
```

The application will:
- Build the Docker image
- Start the container
- Automatically configure SSH known_hosts
- Initialize the database
- Start the web server on port 8080

#### Step 4: Access the Application

Open your browser and navigate to: **http://localhost:8080**

#### Docker Directory Structure

```
git-backup/
├── data/                    # Database files (persisted)
├── backups/                 # Backup repositories (persisted)
├── docker_ssh/             # SSH keys and config (persisted)
├── docker-compose.yml
└── Dockerfile
```

#### Docker Management Commands

```bash
# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Restart the application
docker-compose restart

# Rebuild and restart
docker-compose up -d --build

# View container status
docker ps | grep gitsync-pro
```

### Option 2: Local Development

Local deployment gives you more control and easier debugging.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/Onicc/git-backup.git
cd git-backup
```

#### Step 2: Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### Step 3: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### Step 4: Initialize Database

The database will be automatically created on first run.

#### Step 5: Start the Application

```bash
# From the backend directory
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

Or use Python directly:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

#### Step 6: Access the Application

Open your browser and navigate to: **http://localhost:8080**

#### Local Directory Structure

```
git-backup/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── git_engine.py
│   ├── scheduler.py
│   ├── api_*.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── database/               # Database files
├── temp_repos/            # Temporary clone directory
└── venv/                  # Virtual environment
```

## 📖 Usage Guide

### 1. SSH Key Management

SSH keys are required for authenticating with Git platforms using SSH URLs.

#### Creating an SSH Key

1. Navigate to **Credentials** page
2. Click **Add SSH Key** button
3. Fill in the form:
   - **Platform**: Select the Git platform (GitHub, GitLab, Gitee)
   - **User ID**: Enter your username on that platform
   - **Key Name**: Give it a descriptive name (optional)
4. Click **Generate Key**
5. The public key will be displayed and automatically copied to clipboard
6. Add the public key to your Git platform:
   - **GitHub**: Settings → SSH and GPG keys → New SSH key
   - **GitLab**: Preferences → SSH Keys → Add new key
   - **Gitee**: Settings → SSH Keys → Add SSH key

#### SSH Key Features

- Each platform + user combination gets its own SSH key
- Automatic SSH config management
- Keys are stored securely in `~/.ssh/` (local) or `docker_ssh/` (Docker)
- SSH config automatically updated with Host aliases

### 2. Personal Access Token Management

Personal Access Tokens are required for HTTPS URLs.

#### Adding a Token

1. Navigate to **Credentials** page
2. Click **Add Token** button
3. Fill in the form:
   - **Platform**: Select the Git platform
   - **User ID**: Enter your username
   - **Token Name**: Give it a descriptive name
   - **Token**: Paste your Personal Access Token
   - **Scopes**: Enter token permissions (e.g., repo, read:org)
4. Click **Add Token**

#### Creating Platform Tokens

- **GitHub**: Settings → Developer settings → Personal access tokens → Generate new token
  - Required scopes: `repo` (full control of private repositories)
- **GitLab**: Preferences → Access Tokens → Add new token
  - Required scopes: `read_repository`, `write_repository`
- **Gitee**: Settings → Private Token → Generate new token
  - Required scopes: `projects`, `pull_requests`

### 3. Creating Backup Tasks

#### Step 1: Navigate to Backup Pairs

Click on **Backup Pairs** in the sidebar.

#### Step 2: Add New Backup Pair

Click the **Add Backup Pair** button.

#### Step 3: Configure Source

- **Name**: Give your backup task a descriptive name
- **Icon**: Choose an emoji icon (optional)
- **Platform**: Select source platform
- **Repository URL**: Enter the source repository URL
  - SSH format: `git@github.com:username/repo.git`
  - HTTPS format: `https://github.com/username/repo.git`
- **Authentication**: Select SSH Key or Personal Access Token

#### Step 4: Configure Destination

- **Platform**: Select destination platform or Local
- **Repository URL**: Enter the destination URL or local path
  - Remote: `git@github.com:username/backup-repo.git`
  - Local: `/backups/my-backup` (absolute path)
- **Authentication**: Select authentication method (for remote destinations)

#### Step 5: Configure Schedule

- **Cron Expression**: Set backup schedule
  - Every hour: `0 * * * *`
  - Every day at 2 AM: `0 2 * * *`
  - Every Monday at 3 AM: `0 3 * * 1`
  - Every 6 hours: `0 */6 * * *`
- **Retry Count**: Number of retry attempts on failure (default: 3)

#### Step 6: Save and Enable

Click **Create Task** to save. The task will be automatically enabled.

### 4. Managing Backup Tasks

#### Manual Sync

Click the **Sync Now** button on any backup task to trigger immediate synchronization.

#### Edit Task

Click the **Edit** button to modify task configuration.

#### Delete Task

Click the **Delete** button to remove a backup task.

#### Enable/Disable

Toggle the task status to enable or disable scheduled backups.

### 5. Monitoring and Logs

#### Dashboard

The Dashboard shows:
- Total backup tasks
- Active tasks
- Failed tasks
- Live activity stream with recent operations

#### Diagnostics

The Diagnostics page provides:
- Detailed logs for all operations
- Failed task details with error messages
- Export logs functionality
- Clear all logs option

## ⚙️ Configuration

### Environment Variables

#### Docker Deployment

Edit `docker-compose.yml` to configure:

```yaml
environment:
  - DATABASE_URL=sqlite:////app/database/git_backup.db
  - ENCRYPT_KEY=${ENCRYPT_KEY:-your_secret_key_here}
```

- `DATABASE_URL`: Database connection string
- `ENCRYPT_KEY`: Encryption key for storing credentials (change in production)

#### Local Deployment

Create a `.env` file in the backend directory:

```bash
DATABASE_URL=sqlite:///./database/git_backup.db
ENCRYPT_KEY=your_secret_key_here
```

### Port Configuration

#### Docker

Edit `docker-compose.yml`:

```yaml
ports:
  - "8080:8080"  # Change left side to use different host port
```

#### Local

Change the port in the uvicorn command:

```bash
uvicorn main:app --host 0.0.0.0 --port 8080
```

### Volume Mappings (Docker)

The following directories are mapped to persist data:

```yaml
volumes:
  - ./data:/app/database          # Database storage
  - ./backups:/backups             # Backup repositories
  - ./docker_ssh:/root/.ssh        # SSH keys and config
```

## 🔧 Troubleshooting

### SSH Connection Issues

**Problem**: "Host key verification failed"

**Solution**: The application automatically adds known_hosts on startup. If you still see this error:

```bash
# For Docker
docker-compose restart

# For Local
ssh-keyscan github.com >> ~/.ssh/known_hosts
ssh-keyscan gitlab.com >> ~/.ssh/known_hosts
ssh-keyscan gitee.com >> ~/.ssh/known_hosts
```

### Permission Denied Errors

**Problem**: "Permission denied (publickey)"

**Solution**:
1. Verify the SSH public key is added to your Git platform
2. Check that the correct SSH key is selected for the task
3. Ensure the User ID matches your Git platform username

### URL Format Validation

**Problem**: "Invalid URL format"

**Solution**:
- SSH URLs must match: `git@host:username/repository.git`
- HTTPS URLs must match: `https://host/username/repository.git`
- Ensure authentication method matches URL format:
  - SSH Key → SSH URL
  - Personal Access Token → HTTPS URL

### Time Zone Issues

**Problem**: Log timestamps show wrong time

**Solution**: The application uses local system time. For Docker:

```yaml
# Add to docker-compose.yml
environment:
  - TZ=Asia/Shanghai  # Change to your timezone
```

### Database Locked

**Problem**: "Database is locked"

**Solution**:
```bash
# Stop the application
docker-compose down  # or kill the local process

# Remove lock file
rm data/git_backup.db-journal

# Restart
docker-compose up -d
```

### Container Keeps Restarting

**Problem**: Docker container in restart loop

**Solution**:
```bash
# Check logs
docker logs gitsync-pro

# Common issues:
# 1. Port already in use - change port in docker-compose.yml
# 2. Permission issues - check directory permissions
# 3. Database corruption - backup and remove data/git_backup.db
```

## 🔒 Security Best Practices

1. **Change Default Encryption Key**: Update `ENCRYPT_KEY` in production
2. **Use SSH Keys**: Prefer SSH authentication over tokens when possible
3. **Limit Token Scopes**: Only grant necessary permissions to tokens
4. **Regular Backups**: Backup the `data/` directory regularly
5. **Secure Access**: Use reverse proxy with HTTPS in production
6. **Network Isolation**: Run in isolated network or use firewall rules

## 📊 Performance Tips

1. **Backup Size**: Large repositories (>1GB) may take longer to sync
2. **Schedule Wisely**: Avoid scheduling all tasks at the same time
3. **Local Backups**: Local destinations are faster than remote
4. **Retry Count**: Set appropriate retry count based on network stability
5. **Cleanup**: Regularly clean up old logs from Diagnostics page

## 🛠️ Development

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run tests
pytest
```

### Code Structure

```
backend/
├── main.py              # FastAPI application entry point
├── database.py          # Database initialization and session management
├── models.py            # SQLAlchemy models
├── git_engine.py        # Git operations and sync logic
├── scheduler.py         # APScheduler task scheduling
├── api_tasks.py         # Backup task API endpoints
├── api_stats.py         # Statistics and logs API endpoints
├── api_credentials.py   # Credentials management API endpoints
└── crypto_utils.py      # Encryption utilities
```

### Adding New Features

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions:
- GitHub Issues: https://github.com/Onicc/git-backup/issues
- Documentation: https://github.com/Onicc/git-backup/wiki

## 🙏 Acknowledgments

- FastAPI for the excellent web framework
- APScheduler for reliable task scheduling
- GitPython for Git operations
- All contributors and users of this project

---

Made with ❤️ by the GitSync Pro team
