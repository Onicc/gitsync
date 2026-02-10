// ============================================
// GitSync Pro - Application JavaScript
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
    initBackupPairActions();
    initActivityControls();
    initCredentials();
    initDiagnostics();
    loadDashboardData();
    loadBackupPairs();
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
    if (statCards[1]) statCards[1].querySelector('.stat-value').textContent = stats.running;
    if (statCards[2]) statCards[2].querySelector('.stat-value').textContent = stats.failed;
    if (statCards[3]) statCards[3].querySelector('.stat-value').textContent = stats.scheduled;
}

async function loadBackupPairs() {
    try {
        const tasks = await fetchAPI('/tasks/');
        renderBackupPairs(tasks);
    } catch (error) {
        console.error('Failed to load backup pairs:', error);
    }
}

function renderBackupPairs(tasks) {
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
                <button class="action-btn" onclick="pauseTask(${task.id})" title="Pause">⏸</button>
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
        setTimeout(loadBackupPairs, 1000);
    } catch (error) {
        showNotification('Sync failed', 'error');
    }
}

async function pauseTask(taskId) {
    try {
        await fetchAPI(`/tasks/${taskId}/pause`, { method: 'POST' });
        showNotification('Task paused', 'success');
        setTimeout(loadBackupPairs, 500);
    } catch (error) {
        showNotification('Failed to pause task', 'error');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        await fetchAPI(`/tasks/${taskId}`, { method: 'DELETE' });
        showNotification('Task deleted', 'success');
        setTimeout(loadBackupPairs, 500);
    } catch (error) {
        showNotification('Failed to delete task', 'error');
    }
}

function editTask(taskId) {
    const taskNav = document.querySelector('a[href="#tasks"]');
    if (taskNav) taskNav.click();
    showNotification('Edit mode - Task ID: ' + taskId, 'info');
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
        'info': 'INFO'
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

            // Navigate to backup pairs with filter
            const backupPairsNav = document.querySelector('a[href="#backup-pairs"]');
            if (backupPairsNav) {
                backupPairsNav.click();
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
// Backup Pair Action Buttons
// ============================================

function initBackupPairActions() {
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
    // SSH Key Management
    const generateKeyBtn = document.querySelector('#credentials .credential-card:first-child .btn-primary');
    if (generateKeyBtn) {
        generateKeyBtn.addEventListener('click', generateSSHKey);
    }

    // Load existing SSH key
    loadSSHKey();

    // Access Tokens Management
    const addTokenBtn = document.querySelector('#credentials .credential-card:last-child .btn-primary');
    if (addTokenBtn) {
        addTokenBtn.addEventListener('click', showAddTokenDialog);
    }

    // Load existing tokens
    loadTokens();
}

async function generateSSHKey() {
    try {
        showNotification('Generating SSH key...', 'info');
        const result = await fetchAPI('/credentials/ssh/generate', { method: 'POST' });

        // Update UI with new key
        displaySSHKey(result.public_key, result.fingerprint);
        showNotification('SSH key generated successfully', 'success');
    } catch (error) {
        showNotification('Failed to generate SSH key', 'error');
        console.error('SSH key generation failed:', error);
    }
}

async function loadSSHKey() {
    try {
        const result = await fetchAPI('/credentials/ssh/public-key');
        displaySSHKey(result.public_key, 'SHA256:...');
    } catch (error) {
        // Key doesn't exist yet, that's okay
        console.log('No SSH key found');
    }
}

function displaySSHKey(publicKey, fingerprint) {
    const keyContent = document.querySelector('.key-content');
    const fingerprintEl = document.querySelector('.info-row:nth-child(2) .info-value');

    if (keyContent) {
        keyContent.textContent = publicKey;
    }
    if (fingerprintEl) {
        fingerprintEl.textContent = fingerprint;
    }
}

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
                <div class="token-scope">${token.scopes || 'No scopes specified'}</div>
            </div>
            <button class="action-btn danger" onclick="deleteToken(${token.id})" title="Delete">✕</button>
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
}

// Handle modal form submission
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('addTokenForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const platform = document.getElementById('tokenPlatform').value;
            const name = document.getElementById('tokenName').value;
            const value = document.getElementById('tokenValue').value;
            const scopes = document.getElementById('tokenScopes').value;

            await addToken(platform, name, value, scopes);
            closeAddTokenModal();
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
            const modal = document.getElementById('addTokenModal');
            if (modal && modal.classList.contains('active')) {
                closeAddTokenModal();
            }
        }
    });
});

async function addToken(platform, name, value, scopes) {
    try {
        await fetchAPI('/credentials/tokens', {
            method: 'POST',
            body: JSON.stringify({
                platform: platform,
                credential_type: 'token',
                name: name,
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

async function deleteToken(tokenId) {
    if (!confirm('Are you sure you want to delete this token?')) return;

    try {
        await fetchAPI(`/credentials/tokens/${tokenId}`, { method: 'DELETE' });
        showNotification('Token deleted successfully', 'success');
        loadTokens();
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
