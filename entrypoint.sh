#!/bin/bash
set -e

# Ensure .ssh directory exists
mkdir -p /root/.ssh
chmod 700 /root/.ssh

# Add known hosts for common Git platforms if not already present
if [ ! -f /root/.ssh/known_hosts ]; then
    echo "Adding SSH known hosts for common Git platforms..."
    ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null
    ssh-keyscan gitlab.com >> /root/.ssh/known_hosts 2>/dev/null
    ssh-keyscan gitee.com >> /root/.ssh/known_hosts 2>/dev/null
    chmod 644 /root/.ssh/known_hosts
    echo "Known hosts added successfully"
else
    echo "Known hosts file already exists"
fi

# Execute the main command
exec "$@"
