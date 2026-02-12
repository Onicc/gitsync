// ============================================
// GitSync - Application JavaScript
// ============================================

const API_BASE = '/api';

// Navigation Management
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCopyButtons();
    initActivityLog();
    initFormPresets();
    initDashboardButtons();
    initStatCards();
    initSyncTaskActions();
    initActivityControls();
    initCredentials();
    initDiagnostics();
    initFormValidation();
    loadDashboardData();
    loadSyncTasks();
});

// ============================================
// API Functions
// ============================================

async function fetchAPI(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

async function loadDashboardData() {
    try {
        const stats = await fetchAPI('/stats/dashboard');
        updateDashboardStats(stats);
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

function updateDashboardStats(stats) {
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards[0]) statCards[0].querySelector('.stat-value').textContent = stats.successful;
    if (statCards[1]) statCards[1].querySelector('.stat-value').textContent = stats.paused;
    if (statCards[2]) statCards[2].querySelector('.stat-value').textContent = stats.failed;
    if (statCards[3]) statCards[3].querySelector('.stat-value').textContent = stats.scheduled;
}

async function loadSyncTasks() {
    try {
        const tasks = await fetchAPI('/tasks/');
        renderSyncTasks(tasks);
    } catch (error) {
        console.error('Failed to load sync tasks:', error);
    }
}

function renderSyncTasks(tasks) {
    const tbody = document.querySelector('.backup-table tbody');
    if (!tbody) return;

    tbody.innerHTML = tasks.map(task => `
        <tr data-task-id="${task.id}">
            <td class="task-name"><div class="task-icon">${task.icon}</div><span>${task.name}</span></td>
            <td class="repo-cell"><div class="repo-platform ${task.source_platform.toLowerCase()}">${task.source_platform}</div><code>${task.source_url}</code></td>
            <td class="repo-cell"><div class="repo-platform ${task.dest_platform.toLowerCase()}">${task.dest_platform}</div><code>${task.dest_url}</code></td>
            <td class="timestamp">${task.last_success ? new Date(task.last_success).toLocaleString() : 'Never'}</td>
            <td><span class="status-badge ${task.status.toLowerCase()}">${getStatusIcon(task.status)} ${task.status}</span></td>
            <td class="actions">
                <button class="action-btn" onclick="syncTask(${task.id})" title="Sync Now">⟳</button>
                ${task.enabled
                    ? `<button class="action-btn" onclick="pauseTask(${task.id})" title="Pause">⏸</button>`
                    : `<button class="action-btn" onclick="resumeTask(${task.id})" title="Resume">▶</button>`
                }
                <button class="action-btn" onclick="editTask(${task.id})" title="Configure">⚙</button>
                <button class="action-btn danger" onclick="deleteTask(${task.id})" title="Delete">✕</button>
            </td>
        </tr>
    `).join('');
}

function getStatusIcon(status) {
    const icons = {
        'success': '✓',
        'running': '◉',
        'failed': '✕',
        'pending': '⏱'
    };
    return icons[status.toLowerCase()] || '•';
}

async function syncTask(taskId) {
    try {
        await fetchAPI(`/tasks/${taskId}/sync`, { method: 'POST' });
        showNotification('Sync started', 'success');

        // Start polling for status updates
        startStatusPolling(taskId);
    } catch (error) {
        showNotification('Sync failed', 'error');
    }
}

// Poll for status updates after sync
let statusPollingInterval = null;
function startStatusPolling(taskId) {
    // Clear any existing polling
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
    }

    // Poll every 2 seconds
    statusPollingInterval = setInterval(async () => {
        await loadSyncTasks();
        await loadDashboardData();
        await loadActivityLogs();

        // Check if task is still running
        try {
            const task = await fetchAPI(`/tasks/${taskId}`);
            if (task.status !== 'running') {
                clearInterval(statusPollingInterval);
                statusPollingInterval = null;

                // Reload diagnostics if failed
                if (task.status === 'failed') {
                    await loadFailedTasks();
                }
            }
        } catch (error) {
            clearInterval(statusPollingInterval);
            statusPollingInterval = null;
        }
    }, 2000);
}

async function pauseTask(taskId) {
    try {
        await fetchAPI(`/tasks/${taskId}/pause`, { method: 'POST' });
        showNotification('Task paused', 'success');
        setTimeout(loadSyncTasks, 500);
    } catch (error) {
        showNotification('Failed to pause task', 'error');
    }
}

async function resumeTask(taskId) {
    try {
        await fetchAPI(`/tasks/${taskId}/resume`, { method: 'POST' });
        showNotification('Task resumed', 'success');
        setTimeout(loadSyncTasks, 500);
    } catch (error) {
        showNotification('Failed to resume task', 'error');
    }
}

async function deleteTask(taskId) {
    // Store task ID for confirmation
    window.taskToDelete = taskId;

    // Show custom confirmation modal
    const modal = document.getElementById('deleteSyncTaskModal');
    modal.classList.add('active');
}

function closeDeleteSyncTaskModal() {
    const modal = document.getElementById('deleteSyncTaskModal');
    modal.classList.remove('active');
    window.taskToDelete = null;
}

async function confirmDeleteSyncTask() {
    if (!window.taskToDelete) return;

    try {
        await fetchAPI(`/tasks/${window.taskToDelete}`, { method: 'DELETE' });
        showNotification('Task deleted', 'success');
        closeDeleteSyncTaskModal();
        setTimeout(loadSyncTasks, 500);
    } catch (error) {
        showNotification('Failed to delete task', 'error');
    }
}

async function createBackupTask(taskData) {
    try {
        await fetchAPI('/tasks/', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
        showNotification('Sync task created successfully', 'success');
        setTimeout(loadSyncTasks, 500);
    } catch (error) {
        showNotification('Failed to create sync task', 'error');
        console.error('Task creation failed:', error);
    }
}

async function updateBackupTask(taskId, taskData) {
    try {
        await fetchAPI(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(taskData)
        });
        showNotification('Sync task updated successfully', 'success');
        setTimeout(loadSyncTasks, 500);
    } catch (error) {
        showNotification('Failed to update sync task', 'error');
        console.error('Task update failed:', error);
    }
}

function editTask(taskId) {
    // Load task data and show edit modal
    loadTaskForEdit(taskId);
}

async function loadTaskForEdit(taskId) {
    try {
        const task = await fetchAPI(`/tasks/${taskId}`);

        // Populate form fields
        document.getElementById('editTaskId').value = task.id;
        document.getElementById('editTaskName').value = task.name;
        document.getElementById('editTaskIcon').value = task.icon;
        document.getElementById('editSourcePlatform').value = task.source_platform.toLowerCase();
        document.getElementById('editSourceUrl').value = task.source_url;
        document.getElementById('editDestPlatform').value = task.dest_platform.toLowerCase();
        document.getElementById('editDestUrl').value = task.dest_url;
        document.getElementById('editCronExpression').value = task.cron_expression;
        document.getElementById('editRetryCount').value = task.retry_count;

        // Show modal
        const modal = document.getElementById('editSyncTaskModal');
        modal.classList.add('active');

        // Focus first input
        setTimeout(() => {
            document.getElementById('editTaskName').focus();
        }, 100);
    } catch (error) {
        showNotification('Failed to load task data', 'error');
        console.error('Load task error:', error);
    }
}


// ============================================
// Export and Clear Functions
// ============================================

async function exportBackupConfig() {
    try {
        const tasks = await fetchAPI('/tasks/');
        const config = {
            version: '1.0',
            exported_at: new Date().toISOString(),
            sync_tasks: tasks
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Configuration exported successfully', 'success');
    } catch (error) {
        showNotification('Failed to export configuration', 'error');
        console.error('Export failed:', error);
    }
}

async function exportLogs() {
    try {
        const logs = await fetchAPI('/stats/logs?limit=1000');
        const logText = logs.map(log => {
            const time = new Date(log.started_at).toISOString();
            return `[${time}] [${log.status.toUpperCase()}] ${log.message}`;
        }).join('\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Logs exported successfully', 'success');
    } catch (error) {
        showNotification('Failed to export logs', 'error');
        console.error('Export logs failed:', error);
    }
}

async function clearAllLogs() {
    if (!confirm('Are you sure you want to clear all diagnostic logs? This action cannot be undone.')) {
        return;
    }

    try {
        await fetchAPI('/stats/logs', { method: 'DELETE' });
        showNotification('All logs cleared successfully', 'success');
        await loadFailedTasks();
    } catch (error) {
        showNotification('Failed to clear logs', 'error');
        console.error('Clear logs failed:', error);
    }
}

// ============================================
// Form Validation and Dynamic Display
// ============================================

function initFormValidation() {
    // Add Sync Task Form
    const destPlatform = document.getElementById('destPlatform');
    const destAuthGroup = document.getElementById('destAuthGroup');
    const sourceAuth = document.getElementById('sourceAuth');
    const destAuth = document.getElementById('destAuth');
    const sourceUrl = document.getElementById('sourceUrl');
    const destUrl = document.getElementById('destUrl');

    // Show/hide destination authentication based on platform
    if (destPlatform) {
        destPlatform.addEventListener('change', () => {
            if (destPlatform.value === 'local') {
                destAuthGroup.style.display = 'none';
            } else if (destPlatform.value) {
                destAuthGroup.style.display = 'block';
            }
        });
    }

    // Update URL placeholder and validation based on auth method
    if (sourceAuth && sourceUrl) {
        sourceAuth.addEventListener('change', () => {
            updateUrlPlaceholder(sourceAuth.value, sourceUrl, 'source');
        });
    }

    if (destAuth && destUrl) {
        destAuth.addEventListener('change', () => {
            updateUrlPlaceholder(destAuth.value, destUrl, 'dest');
        });
    }

    // Edit Sync Task Form
    const editDestPlatform = document.getElementById('editDestPlatform');
    const editDestAuthGroup = document.getElementById('editDestAuthGroup');
    const editSourceAuth = document.getElementById('editSourceAuth');
    const editDestAuth = document.getElementById('editDestAuth');
    const editSourceUrl = document.getElementById('editSourceUrl');
    const editDestUrl = document.getElementById('editDestUrl');

    if (editDestPlatform) {
        editDestPlatform.addEventListener('change', () => {
            if (editDestPlatform.value === 'local') {
                editDestAuthGroup.style.display = 'none';
            } else if (editDestPlatform.value) {
                editDestAuthGroup.style.display = 'block';
            }
        });
    }

    if (editSourceAuth && editSourceUrl) {
        editSourceAuth.addEventListener('change', () => {
            updateUrlPlaceholder(editSourceAuth.value, editSourceUrl, 'source');
        });
    }

    if (editDestAuth && editDestUrl) {
        editDestAuth.addEventListener('change', () => {
            updateUrlPlaceholder(editDestAuth.value, editDestUrl, 'dest');
        });
    }
}

function updateUrlPlaceholder(authType, urlInput, type) {
    if (authType === 'ssh') {
        urlInput.placeholder = 'git@github.com:username/repository.git';
        urlInput.nextElementSibling.textContent = 'SSH URL format: git@host:username/repository.git';
    } else {
        urlInput.placeholder = 'https://github.com/username/repository.git';
        urlInput.nextElementSibling.textContent = 'HTTPS URL format: https://host/username/repository.git';
    }
}

function validateUrlFormat(url, authType) {
    if (!url) return { valid: false, message: 'URL is required' };

    if (authType === 'ssh') {
        // SSH format: git@host:username/repo.git
        const sshPattern = /^git@[^:]+:[^/]+\/.+\.git$/;
        if (!sshPattern.test(url)) {
            return {
                valid: false,
                message: 'Invalid SSH URL format. Expected: git@host:username/repository.git'
            };
        }
    } else if (authType === 'token') {
        // HTTPS format: https://host/username/repo.git
        const httpsPattern = /^https:\/\/.+\/.+\.git$/;
        if (!httpsPattern.test(url)) {
            return {
                valid: false,
                message: 'Invalid HTTPS URL format. Expected: https://host/username/repository.git'
            };
        }
    }

    return { valid: true, message: '' };
}

// ============================================
// Navigation System
// ============================================

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Get target view from href
            const targetId = item.getAttribute('href').substring(1);

            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update active view section
            viewSections.forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });
}

// ============================================
// Copy to Clipboard Functionality
// ============================================

function initCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');

    copyButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const parent = button.closest('.key-box, .error-output');
            const content = parent.querySelector('.key-content, .output-content');

            if (content) {
                try {
                    await navigator.clipboard.writeText(content.textContent);

                    // Visual feedback
                    const originalText = button.textContent;
                    button.textContent = '✓';
                    button.style.background = 'var(--status-success)';

                    setTimeout(() => {
                        button.textContent = originalText;
                        button.style.background = '';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            }
        });
    });
}

// ============================================
// Activity Log - Real Data from API
// ============================================

function initActivityLog() {
    const activityLog = document.querySelector('.activity-log');
    if (!activityLog) return;

    // Load initial logs
    loadActivityLogs();

    // Refresh logs every 10 seconds
    setInterval(() => {
        loadActivityLogs();
    }, 10000);
}

async function loadActivityLogs() {
    try {
        const logs = await fetchAPI('/stats/logs?limit=20');
        renderActivityLogs(logs);
    } catch (error) {
        console.error('Failed to load activity logs:', error);
    }
}

function renderActivityLogs(logs) {
    const activityLog = document.querySelector('.activity-log');
    if (!activityLog) return;

    if (logs.length === 0) {
        activityLog.innerHTML = '<div class="log-entry info"><span class="log-time">--:--:--</span><span class="log-status">INFO</span><span class="log-message">No activity logs yet. Start a backup task to see logs here.</span></div>';
        return;
    }

    activityLog.innerHTML = logs.map(log => {
        const time = new Date(log.started_at).toLocaleTimeString('en-US', { hour12: false });
        const status = log.status.toLowerCase();

        return `
            <div class="log-entry ${status}">
                <span class="log-time">${time}</span>
                <span class="log-status">${getStatusLabel(status)}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `;
    }).join('');
}

function getStatusLabel(status) {
    const labels = {
        'success': 'OK',
        'running': 'RUN',
        'failed': 'ERR',
        'info': 'INFO',
        'paused': 'OK',
        'pending': 'OK'
    };
    return labels[status] || 'LOG';
}

// ============================================
// Form Preset Buttons
// ============================================

function initFormPresets() {
    const presetButtons = document.querySelectorAll('.preset-btn');
    const cronInput = document.querySelector('.form-input.mono');

    if (!cronInput) return;

    const presets = {
        'Every Hour': '0 * * * *',
        'Daily 2AM': '0 2 * * *',
        'Weekly': '0 2 * * 0',
        'Monthly': '0 2 1 * *'
    };

    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const presetName = button.textContent;
            const cronExpression = presets[presetName];

            if (cronExpression) {
                cronInput.value = cronExpression;

                // Update hint text
                const hint = cronInput.nextElementSibling;
                if (hint && hint.classList.contains('form-hint')) {
                    hint.textContent = getPresetDescription(presetName);
                }

                // Visual feedback
                button.style.background = 'var(--accent-cyan-dim)';
                button.style.color = 'var(--accent-cyan)';
                button.style.borderColor = 'var(--accent-cyan)';

                setTimeout(() => {
                    button.style.background = '';
                    button.style.color = '';
                    button.style.borderColor = '';
                }, 1000);
            }
        });
    });
}

function getPresetDescription(presetName) {
    const descriptions = {
        'Every Hour': 'Runs at the start of every hour',
        'Daily 2AM': 'Runs every day at 2:00 AM',
        'Weekly': 'Runs every Sunday at 2:00 AM',
        'Monthly': 'Runs on the 1st of every month at 2:00 AM'
    };
    return descriptions[presetName] || '';
}

// ============================================
// Dashboard Button Interactions
// ============================================

function initDashboardButtons() {
    // Refresh button
    const refreshBtn = document.querySelector('#dashboard .btn-secondary');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            // Visual feedback
            refreshBtn.style.transform = 'rotate(360deg)';
            refreshBtn.style.transition = 'transform 0.5s ease';

            // Simulate refresh
            setTimeout(() => {
                refreshBtn.style.transform = '';
                showNotification('Dashboard refreshed', 'success');
            }, 500);
        });
    }

    // New Backup button
    const newBackupBtn = document.querySelector('#dashboard .btn-primary');
    if (newBackupBtn) {
        newBackupBtn.addEventListener('click', () => {
            // Navigate to task configuration
            const taskNav = document.querySelector('a[href="#tasks"]');
            if (taskNav) {
                taskNav.click();
                showNotification('Opening task configuration...', 'info');
            }
        });
    }
}

// ============================================
// Stat Cards Interaction
// ============================================

function initStatCards() {
    const statCards = document.querySelectorAll('.stat-card');

    statCards.forEach(card => {
        card.style.cursor = 'pointer';

        card.addEventListener('click', () => {
            // Get the card type
            let filterType = 'all';
            if (card.classList.contains('success')) filterType = 'success';
            else if (card.classList.contains('running')) filterType = 'running';
            else if (card.classList.contains('failed')) filterType = 'failed';
            else if (card.classList.contains('neutral')) filterType = 'scheduled';

            // Navigate to sync tasks with filter
            const syncTasksNav = document.querySelector('a[href="#sync-tasks"]');
            if (syncTasksNav) {
                syncTasksNav.click();
                showNotification(`Filtering by: ${filterType}`, 'info');
            }

            // Visual feedback
            card.style.transform = 'scale(0.95)';
            setTimeout(() => {
                card.style.transform = '';
            }, 150);
        });
    });
}

// ============================================
// Notification System
// ============================================

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Add styles
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        background: type === 'success' ? 'var(--status-success)' :
                   type === 'error' ? 'var(--status-failed)' :
                   'var(--accent-cyan)',
        color: 'var(--bg-primary)',
        borderRadius: '4px',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        fontWeight: '600',
        zIndex: '9999',
        animation: 'slide-in 0.3s ease',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
    });

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        notification.style.transition = 'all 0.3s ease';

        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// ============================================
// Sync Task Action Buttons
// ============================================

function initSyncTaskActions() {
    const actionButtons = document.querySelectorAll('.backup-table .action-btn');

    actionButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const title = button.getAttribute('title');
            const row = button.closest('tr');
            const taskName = row.querySelector('.task-name span').textContent;

            // Handle different actions
            if (title.includes('Sync') || title.includes('Retry')) {
                showNotification(`Starting sync: ${taskName}`, 'info');
            } else if (title.includes('Pause') || title.includes('Stop')) {
                showNotification(`Pausing task: ${taskName}`, 'info');
            } else if (title.includes('Configure')) {
                const taskNav = document.querySelector('a[href="#tasks"]');
                if (taskNav) taskNav.click();
                showNotification(`Editing: ${taskName}`, 'info');
            } else if (title.includes('Delete')) {
                if (confirm(`Are you sure you want to delete "${taskName}"?`)) {
                    row.style.opacity = '0';
                    row.style.transform = 'translateX(-20px)';
                    setTimeout(() => row.remove(), 300);
                    showNotification(`Deleted: ${taskName}`, 'success');
                }
            } else if (title.includes('Logs') || title.includes('Progress')) {
                const diagNav = document.querySelector('a[href="#diagnostics"]');
                if (diagNav) diagNav.click();
                showNotification(`Viewing logs: ${taskName}`, 'info');
            }

            // Visual feedback
            button.style.transform = 'scale(0.9)';
            setTimeout(() => button.style.transform = '', 150);
        });
    });
}

// ============================================
// Activity Log Controls
// ============================================

function initActivityControls() {
    const controlButtons = document.querySelectorAll('.activity-controls .control-btn');
    let isLive = true;

    controlButtons.forEach(button => {
        button.addEventListener('click', () => {
            const text = button.textContent.trim();

            if (text.includes('Live')) {
                isLive = true;
                button.classList.add('active');
                controlButtons.forEach(btn => {
                    if (btn !== button) btn.classList.remove('active');
                });
                showNotification('Live mode enabled', 'success');
            } else if (text.includes('Pause')) {
                isLive = false;
                button.classList.add('active');
                controlButtons.forEach(btn => {
                    if (btn !== button) btn.classList.remove('active');
                });
                showNotification('Activity log paused', 'info');
            } else if (text.includes('Clear')) {
                const activityLog = document.querySelector('.activity-log');
                if (activityLog && confirm('Clear all activity logs?')) {
                    activityLog.innerHTML = '';
                    showNotification('Activity log cleared', 'success');
                }
            }

            // Visual feedback
            button.style.transform = 'scale(0.95)';
            setTimeout(() => button.style.transform = '', 150);
        });
    });
}

// ============================================
// Credentials Management
// ============================================

function initCredentials() {
    // Load existing SSH keys
    loadSSHKeys();

    // Load existing tokens
    loadTokens();
}

// ============================================
// SSH Key Management - Multiple Keys Support
// ============================================

function showAddSSHKeyDialog() {
    const modal = document.getElementById('addSSHKeyModal');
    modal.classList.add('active');

    // Reset form
    document.getElementById('addSSHKeyForm').reset();

    // Focus first input
    setTimeout(() => {
        document.getElementById('sshKeyPlatform').focus();
    }, 100);
}

function closeAddSSHKeyModal() {
    const modal = document.getElementById('addSSHKeyModal');
    modal.classList.remove('active');
    document.getElementById('addSSHKeyForm').reset();
}

async function loadSSHKeys() {
    try {
        const keys = await fetchAPI('/credentials/ssh-keys');
        renderSSHKeys(keys);
    } catch (error) {
        console.error('Failed to load SSH keys:', error);
    }
}

function renderSSHKeys(keys) {
    const keyList = document.querySelector('.ssh-key-list');
    if (!keyList) return;

    if (keys.length === 0) {
        keyList.innerHTML = '<div class="info-row"><span class="info-label">No SSH keys configured yet.</span></div>';
        return;
    }

    keyList.innerHTML = keys.map(key => `
        <div class="token-item" data-key-id="${key.id}">
            <div class="token-platform ${key.platform.toLowerCase()}">${key.platform}</div>
            <div class="token-details">
                <div class="token-name">${key.name || 'SSH Key'}</div>
                ${key.user_id ? `<div class="token-user-id">@${key.user_id}</div>` : ''}
                <div class="token-scope">${key.fingerprint || 'No fingerprint'}</div>
            </div>
            <div class="token-actions">
                <button class="action-btn" onclick="viewSSHKeyPublicKey(${key.id})" title="View Public Key">👁️</button>
                <button class="action-btn danger" onclick="deleteSSHKey(${key.id})" title="Delete">✕</button>
            </div>
        </div>
    `).join('');
}

async function viewSSHKeyPublicKey(keyId) {
    try {
        const result = await fetchAPI(`/credentials/ssh-keys/${keyId}/public-key`);

        // Show public key in a modal or alert
        const message = `Public Key:\n\n${result.public_key}\n\nFingerprint: ${result.fingerprint}\n\nAdd this public key to your Git platform account.`;

        // Copy to clipboard
        await navigator.clipboard.writeText(result.public_key);
        showNotification('Public key copied to clipboard', 'success');

        // Also show in alert for viewing
        alert(message);
    } catch (error) {
        showNotification('Failed to load public key', 'error');
        console.error('Load public key error:', error);
    }
}

let sshKeyToDelete = null;

function deleteSSHKey(keyId) {
    sshKeyToDelete = keyId;
    const modal = document.getElementById('deleteConfirmModal');

    // Update modal text for SSH key
    const message = modal.querySelector('.confirm-message');
    const warning = modal.querySelector('.confirm-warning');
    if (message) message.textContent = 'Are you sure you want to delete this SSH key?';
    if (warning) warning.textContent = 'This action cannot be undone. Any services using this SSH key will lose access.';

    modal.classList.add('active');
}

async function confirmDeleteSSHKey() {
    if (!sshKeyToDelete) return;

    try {
        await fetchAPI(`/credentials/ssh-keys/${sshKeyToDelete}`, { method: 'DELETE' });
        showNotification('SSH key deleted successfully', 'success');
        loadSSHKeys();
        closeDeleteConfirmModal();
        sshKeyToDelete = null;
    } catch (error) {
        showNotification('Failed to delete SSH key', 'error');
        console.error('SSH key deletion failed:', error);
    }
}

async function generateSSHKeyForUser(platform, userId, name) {
    try {
        showNotification('Generating SSH key...', 'info');
        const result = await fetchAPI('/credentials/ssh-keys', {
            method: 'POST',
            body: JSON.stringify({
                platform: platform,
                user_id: userId,
                name: name || `${platform} - ${userId}`
            })
        });

        showNotification('SSH key generated successfully', 'success');
        loadSSHKeys();

        // Show public key to user
        const message = `SSH Key Generated!\n\nPublic Key:\n${result.public_key}\n\nFingerprint: ${result.fingerprint}\n\nThe public key has been copied to your clipboard.\nAdd it to your ${platform} account (@${userId}).`;

        // Copy to clipboard
        await navigator.clipboard.writeText(result.public_key);
        alert(message);
    } catch (error) {
        showNotification('Failed to generate SSH key', 'error');
        console.error('SSH key generation failed:', error);
    }
}

// ============================================
// Access Token Management
// ============================================

async function loadTokens() {
    try {
        const tokens = await fetchAPI('/credentials/tokens');
        renderTokens(tokens);
    } catch (error) {
        console.error('Failed to load tokens:', error);
    }
}

function renderTokens(tokens) {
    const tokenList = document.querySelector('.token-list');
    if (!tokenList) return;

    if (tokens.length === 0) {
        tokenList.innerHTML = '<div class="info-row"><span class="info-label">No tokens configured yet.</span></div>';
        return;
    }

    tokenList.innerHTML = tokens.map(token => `
        <div class="token-item" data-token-id="${token.id}">
            <div class="token-platform ${token.platform.toLowerCase()}">${token.platform}</div>
            <div class="token-details">
                <div class="token-name">${token.name}</div>
                ${token.user_id ? `<div class="token-user-id">@${token.user_id}</div>` : ''}
                <div class="token-scope">${token.scopes || 'No scopes specified'}</div>
            </div>
            <div class="token-actions">
                <button class="action-btn" onclick="editToken(${token.id})" title="Edit">✏️</button>
                <button class="action-btn danger" onclick="deleteToken(${token.id})" title="Delete">✕</button>
            </div>
        </div>
    `).join('');
}

function showAddTokenDialog() {
    const modal = document.getElementById('addTokenModal');
    modal.classList.add('active');

    // Reset form
    document.getElementById('addTokenForm').reset();

    // Focus first input
    setTimeout(() => {
        document.getElementById('tokenPlatform').focus();
    }, 100);
}

function closeAddTokenModal() {
    const modal = document.getElementById('addTokenModal');
    modal.classList.remove('active');

    // Reset modal state
    tokenToEdit = null;
    document.querySelector('#addTokenModal .modal-title').textContent = 'Add Access Token';
    document.querySelector('#addTokenForm button[type="submit"]').textContent = 'Add Token';
    document.getElementById('addTokenForm').reset();
}

// ============================================
// Add Sync Task Modal Functions
// ============================================

function showAddSyncTaskModal() {
    const modal = document.getElementById('addSyncTaskModal');
    modal.classList.add('active');

    // Reset form
    document.getElementById('addSyncTaskForm').reset();

    // Focus first input
    setTimeout(() => {
        document.getElementById('taskName').focus();
    }, 100);
}

function closeAddSyncTaskModal() {
    const modal = document.getElementById('addSyncTaskModal');
    modal.classList.remove('active');
}

function closeEditSyncTaskModal() {
    const modal = document.getElementById('editSyncTaskModal');
    modal.classList.remove('active');
}

function setCronPreset(expression, description) {
    const cronInput = document.getElementById('cronExpression');
    const hint = cronInput.nextElementSibling;

    cronInput.value = expression;
    if (hint && hint.classList.contains('form-hint')) {
        const descriptions = {
            'Every Hour': 'Runs at the start of every hour',
            'Daily 2AM': 'Runs every day at 2:00 AM',
            'Weekly': 'Runs every Sunday at 2:00 AM',
            'Monthly': 'Runs on the 1st of every month at 2:00 AM'
        };
        hint.textContent = descriptions[description] || description;
    }
}

function setEditCronPreset(expression, description) {
    const cronInput = document.getElementById('editCronExpression');
    const hint = cronInput.nextElementSibling;

    cronInput.value = expression;
    if (hint && hint.classList.contains('form-hint')) {
        const descriptions = {
            'Every Hour': 'Runs at the start of every hour',
            'Daily 2AM': 'Runs every day at 2:00 AM',
            'Weekly': 'Runs every Sunday at 2:00 AM',
            'Monthly': 'Runs on the 1st of every month at 2:00 AM'
        };
        hint.textContent = descriptions[description] || description;
    }
}

// Handle modal form submission
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('addTokenForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const platform = document.getElementById('tokenPlatform').value;
            const name = document.getElementById('tokenName').value;
            const userId = document.getElementById('tokenUserId').value;
            const value = document.getElementById('tokenValue').value;
            const scopes = document.getElementById('tokenScopes').value;

            // Check if we're editing or creating
            if (tokenToEdit) {
                await updateToken(tokenToEdit, platform, name, userId, value, scopes);
            } else {
                await addToken(platform, name, userId, value, scopes);
            }
            closeAddTokenModal();
        });
    }

    // Handle Add SSH Key form submission
    const sshKeyForm = document.getElementById('addSSHKeyForm');
    if (sshKeyForm) {
        sshKeyForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const platform = document.getElementById('sshKeyPlatform').value;
            const userId = document.getElementById('sshKeyUserId').value;
            const name = document.getElementById('sshKeyName').value;

            await generateSSHKeyForUser(platform, userId, name);
            closeAddSSHKeyModal();
        });
    }

    // Handle Add Sync Task form submission
    const syncTaskForm = document.getElementById('addSyncTaskForm');
    if (syncTaskForm) {
        syncTaskForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const sourceAuth = document.getElementById('sourceAuth').value;
            const sourceUrl = document.getElementById('sourceUrl').value;
            const destPlatform = document.getElementById('destPlatform').value;
            const destAuth = document.getElementById('destAuth').value;
            const destUrl = document.getElementById('destUrl').value;

            // Validate source URL format
            const sourceValidation = validateUrlFormat(sourceUrl, sourceAuth);
            if (!sourceValidation.valid) {
                showNotification(`Source URL: ${sourceValidation.message}`, 'error');
                return;
            }

            // Validate destination URL format (only for non-local destinations)
            if (destPlatform !== 'local') {
                const destValidation = validateUrlFormat(destUrl, destAuth);
                if (!destValidation.valid) {
                    showNotification(`Destination URL: ${destValidation.message}`, 'error');
                    return;
                }
            }

            const taskData = {
                name: document.getElementById('taskName').value,
                icon: document.getElementById('taskIcon').value,
                source_platform: document.getElementById('sourcePlatform').value,
                source_url: sourceUrl,
                dest_platform: destPlatform,
                dest_url: destUrl,
                cron_expression: document.getElementById('cronExpression').value,
                retry_count: parseInt(document.getElementById('retryCount').value)
            };

            await createBackupTask(taskData);
            closeAddSyncTaskModal();
        });
    }

    // Handle Edit Sync Task form submission
    const editSyncTaskForm = document.getElementById('editSyncTaskForm');
    if (editSyncTaskForm) {
        editSyncTaskForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const editSourceAuth = document.getElementById('editSourceAuth').value;
            const editSourceUrl = document.getElementById('editSourceUrl').value;
            const editDestPlatform = document.getElementById('editDestPlatform').value;
            const editDestAuth = document.getElementById('editDestAuth').value;
            const editDestUrl = document.getElementById('editDestUrl').value;

            // Validate source URL format
            const sourceValidation = validateUrlFormat(editSourceUrl, editSourceAuth);
            if (!sourceValidation.valid) {
                showNotification(`Source URL: ${sourceValidation.message}`, 'error');
                return;
            }

            // Validate destination URL format (only for non-local destinations)
            if (editDestPlatform !== 'local') {
                const destValidation = validateUrlFormat(editDestUrl, editDestAuth);
                if (!destValidation.valid) {
                    showNotification(`Destination URL: ${destValidation.message}`, 'error');
                    return;
                }
            }

            const taskId = document.getElementById('editTaskId').value;
            const taskData = {
                name: document.getElementById('editTaskName').value,
                icon: document.getElementById('editTaskIcon').value,
                source_platform: document.getElementById('editSourcePlatform').value,
                source_url: editSourceUrl,
                dest_platform: editDestPlatform,
                dest_url: editDestUrl,
                cron_expression: document.getElementById('editCronExpression').value,
                retry_count: parseInt(document.getElementById('editRetryCount').value)
            };

            await updateBackupTask(taskId, taskData);
            closeEditSyncTaskModal();
        });
    }

    // Close modal on overlay click
    const modal = document.getElementById('addTokenModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                closeAddTokenModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const tokenModal = document.getElementById('addTokenModal');
            if (tokenModal && tokenModal.classList.contains('active')) {
                closeAddTokenModal();
            }
            const syncTaskModal = document.getElementById('addSyncTaskModal');
            if (syncTaskModal && syncTaskModal.classList.contains('active')) {
                closeAddSyncTaskModal();
            }
            const editSyncTaskModal = document.getElementById('editSyncTaskModal');
            if (editSyncTaskModal && editSyncTaskModal.classList.contains('active')) {
                closeEditSyncTaskModal();
            }
            const deleteSyncTaskModal = document.getElementById('deleteSyncTaskModal');
            if (deleteSyncTaskModal && deleteSyncTaskModal.classList.contains('active')) {
                closeDeleteSyncTaskModal();
            }
            const deleteModal = document.getElementById('deleteConfirmModal');
            if (deleteModal && deleteModal.classList.contains('active')) {
                closeDeleteConfirmModal();
            }
        }
    });

    // Close Sync Task modal on overlay click
    const syncTaskModal = document.getElementById('addSyncTaskModal');
    if (syncTaskModal) {
        syncTaskModal.addEventListener('click', (e) => {
            if (e.target === syncTaskModal || e.target.classList.contains('modal-overlay')) {
                closeAddSyncTaskModal();
            }
        });
    }

    // Close Edit Sync Task modal on overlay click
    const editSyncTaskModal = document.getElementById('editSyncTaskModal');
    if (editSyncTaskModal) {
        editSyncTaskModal.addEventListener('click', (e) => {
            if (e.target === editSyncTaskModal || e.target.classList.contains('modal-overlay')) {
                closeEditSyncTaskModal();
            }
        });
    }

    // Close Delete Sync Task modal on overlay click
    const deleteSyncTaskModal = document.getElementById('deleteSyncTaskModal');
    if (deleteSyncTaskModal) {
        deleteSyncTaskModal.addEventListener('click', (e) => {
            if (e.target === deleteSyncTaskModal || e.target.classList.contains('modal-overlay')) {
                closeDeleteSyncTaskModal();
            }
        });
    }
});

async function addToken(platform, name, userId, value, scopes) {
    try {
        await fetchAPI('/credentials/tokens', {
            method: 'POST',
            body: JSON.stringify({
                platform: platform,
                credential_type: 'token',
                name: name,
                user_id: userId,
                value: value,
                scopes: scopes
            })
        });

        showNotification('Token added successfully', 'success');
        loadTokens();
    } catch (error) {
        showNotification('Failed to add token', 'error');
        console.error('Token creation failed:', error);
    }
}

async function updateToken(tokenId, platform, name, userId, value, scopes) {
    try {
        await fetchAPI(`/credentials/tokens/${tokenId}`, {
            method: 'PUT',
            body: JSON.stringify({
                platform: platform,
                credential_type: 'token',
                name: name,
                user_id: userId,
                value: value,
                scopes: scopes
            })
        });

        showNotification('Token updated successfully', 'success');
        loadTokens();
    } catch (error) {
        showNotification('Failed to update token', 'error');
        console.error('Token update failed:', error);
    }
}

// Store token ID for deletion confirmation
let tokenToDelete = null;
let tokenToEdit = null;

function editToken(tokenId) {
    // Load token data and show edit modal
    loadTokenForEdit(tokenId);
}

async function loadTokenForEdit(tokenId) {
    try {
        const tokens = await fetchAPI('/credentials/tokens');
        const token = tokens.find(t => t.id === tokenId);

        if (!token) {
            showNotification('Token not found', 'error');
            return;
        }

        // Store token ID for update
        tokenToEdit = tokenId;

        // Populate form fields
        document.getElementById('tokenPlatform').value = token.platform.toLowerCase();
        document.getElementById('tokenName').value = token.name;
        document.getElementById('tokenUserId').value = token.user_id || '';
        document.getElementById('tokenValue').value = ''; // Don't show existing token value
        document.getElementById('tokenScopes').value = token.scopes || '';

        // Change modal title and button text
        document.querySelector('#addTokenModal .modal-title').textContent = 'Edit Access Token';
        document.querySelector('#addTokenForm button[type="submit"]').textContent = 'Update Token';

        // Show modal
        const modal = document.getElementById('addTokenModal');
        modal.classList.add('active');

        // Focus first input
        setTimeout(() => {
            document.getElementById('tokenPlatform').focus();
        }, 100);
    } catch (error) {
        showNotification('Failed to load token data', 'error');
        console.error('Load token error:', error);
    }
}

function deleteToken(tokenId) {
    tokenToDelete = tokenId;
    const modal = document.getElementById('deleteConfirmModal');
    modal.classList.add('active');
}

function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    modal.classList.remove('active');
    tokenToDelete = null;
    sshKeyToDelete = null;
}

async function confirmDeleteToken() {
    // Handle both SSH key and token deletion
    if (sshKeyToDelete) {
        await confirmDeleteSSHKey();
        return;
    }

    if (!tokenToDelete) return;

    try {
        await fetchAPI(`/credentials/tokens/${tokenToDelete}`, { method: 'DELETE' });
        showNotification('Token deleted successfully', 'success');
        loadTokens();
        closeDeleteConfirmModal();
    } catch (error) {
        showNotification('Failed to delete token', 'error');
        console.error('Token deletion failed:', error);
    }
}

// ============================================
// Diagnostics Management
// ============================================

function initDiagnostics() {
    loadFailedTasks();

    // Refresh diagnostics every 15 seconds
    setInterval(() => {
        loadFailedTasks();
    }, 15000);
}

async function loadFailedTasks() {
    try {
        const failedTasks = await fetchAPI('/stats/failed-tasks');
        renderFailedTasks(failedTasks);
    } catch (error) {
        console.error('Failed to load diagnostics:', error);
    }
}

function renderFailedTasks(tasks) {
    const container = document.querySelector('.diagnostics-container');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = '<div class="diagnostic-card"><div class="diagnostic-header"><div class="diagnostic-title">No failed tasks found</div></div></div>';
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="diagnostic-card">
            <div class="diagnostic-header">
                <div class="diagnostic-title">
                    <span class="status-badge failed">✕ Failed</span>
                    <h3>${task.task_name}</h3>
                </div>
                <span class="diagnostic-time">${new Date(task.failed_at).toLocaleString()}</span>
            </div>
            <div class="diagnostic-body">
                <div class="diagnostic-info">
                    <div class="info-row">
                        <span class="info-label">Source:</span>
                        <code>${task.source_url}</code>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Destination:</span>
                        <code>${task.dest_url}</code>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Error:</span>
                        <span>${task.error_message}</span>
                    </div>
                </div>
                <div class="error-output">
                    <div class="output-header">
                        <span>Git Error Output (stderr)</span>
                        <button class="copy-btn" onclick="copyErrorOutput(this)" title="Copy">📋</button>
                    </div>
                    <pre class="output-content">${task.error_output || 'No error output available'}</pre>
                </div>
            </div>
        </div>
    `).join('');
}

function copyErrorOutput(button) {
    const outputContent = button.closest('.error-output').querySelector('.output-content');
    if (outputContent) {
        navigator.clipboard.writeText(outputContent.textContent).then(() => {
            button.textContent = '✓';
            button.style.background = 'var(--status-success)';
            setTimeout(() => {
                button.textContent = '📋';
                button.style.background = '';
            }, 2000);
        });
    }
}
