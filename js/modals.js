/**
 * Custom modal system — centered dialogs replacing native alert/confirm/prompt
 */

let modalContainer = null;
let alertQueue = Promise.resolve();

// Notification queue system
let notificationQueue = [];
let notificationButton = null;
let notificationBadge = null;

function initializeModals() {
    if (modalContainer) return;

    const container = document.createElement('div');
    container.id = 'modal-system-container';
    container.setAttribute('aria-live', 'polite');
    if (document.body) {
        document.body.appendChild(container);
        modalContainer = container;
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (!modalContainer) {
                document.body.appendChild(container);
                modalContainer = container;
                initializeNotificationButton();
            }
        });
    }

    // Initialize notification button
    initializeNotificationButton();
}

function initializeNotificationButton() {
    if (notificationButton || !document.body) return;

    // Create notification button
    notificationButton = document.createElement('button');
    notificationButton.className = 'notification-button hidden';
    notificationButton.innerHTML = '<i class="fas fa-info"></i>';
    notificationButton.setAttribute('aria-label', 'View notifications');
    notificationButton.addEventListener('click', showNextNotification);

    // Create badge
    notificationBadge = document.createElement('div');
    notificationBadge.className = 'notification-badge';
    notificationBadge.style.display = 'none';
    notificationButton.appendChild(notificationBadge);

    document.body.appendChild(notificationButton);
}

function queueNotification(config) {
    notificationQueue.push(config);
    updateNotificationBadge();
}

function updateNotificationBadge() {
    if (!notificationBadge) return;

    const count = notificationQueue.length;
    if (count > 0) {
        notificationBadge.style.display = 'flex';
        notificationBadge.textContent = count > 9 ? '9+' : count;
        notificationButton.classList.remove('hidden');
    } else {
        notificationBadge.style.display = 'none';
        notificationButton.classList.add('hidden');
    }
}

function showNextNotification() {
    if (notificationQueue.length === 0) return;

    const config = notificationQueue.shift();
    updateNotificationBadge();

    // Show the modal
    createModal(config);
}

function escapeHTMLForModal(text) {
    if (text === undefined || text === null) return '';
    const p = document.createElement('p');
    p.textContent = String(text);
    return p.innerHTML.replace(/\n/g, '<br>');
}

function createModal(config) {
    if (!modalContainer) initializeModals();

    const {
        title = '',
        message = '',
        icon = '',
        buttons = [],
        type = 'info',
        input = null,
        onClose = null
    } = config;

    const overlay = document.createElement('div');
    overlay.className = 'cbt-dialog-overlay active';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'cbt-dialog-panel';

    let iconColor = '#60a5fa';
    if (type === 'success') iconColor = '#22c55e';
    if (type === 'error') iconColor = '#ef4444';
    if (type === 'warning') iconColor = '#f59e0b';
    if (type === 'confirm') iconColor = '#3b82f6';

    let html = '';
    if (icon) {
        html += `<div class="cbt-dialog-icon" style="color:${iconColor};">${icon}</div>`;
    }
    if (title) {
        html += `<h2 class="cbt-dialog-title">${escapeHTMLForModal(title)}</h2>`;
    }
    if (message) {
        html += `<p class="cbt-dialog-message">${escapeHTMLForModal(message)}</p>`;
    }
    if (input) {
        html += `<input type="text" class="cbt-dialog-input" id="cbt-dialog-input" placeholder="${escapeHTMLForModal(input.placeholder || '')}" value="${escapeHTMLForModal(input.value || '')}" maxlength="${input.maxLength || 120}" />`;
    }
    if (buttons.length) {
        html += '<div class="cbt-dialog-buttons">';
        buttons.forEach((btn) => {
            html += `<button type="button" class="cbt-dialog-btn cbt-dialog-btn-${btn.type || 'primary'}" data-action="${btn.action || 'close'}">${escapeHTMLForModal(btn.text)}</button>`;
        });
        html += '</div>';
    }

    panel.innerHTML = html;
    overlay.appendChild(panel);
    modalContainer.appendChild(overlay);

    const inputEl = panel.querySelector('#cbt-dialog-input');
    if (inputEl) {
        setTimeout(() => inputEl.focus(), 50);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                closeWith('ok', inputEl.value);
            }
        });
    }

    function closeWith(action, value) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
            if (onClose) onClose(action, value);
        }, 180);
    }

    panel.querySelectorAll('.cbt-dialog-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const value = inputEl && action === 'ok' ? inputEl.value.trim() : undefined;
            closeWith(action, value);
        });
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay && buttons.length <= 1) {
            closeWith('close');
        }
    });

    const onKey = (e) => {
        if (e.key === 'Escape' && buttons.some((b) => b.action === 'cancel')) {
            document.removeEventListener('keydown', onKey);
            closeWith('cancel');
        }
    };
    document.addEventListener('keydown', onKey);

    return overlay;
}

function queueAlert(fn) {
    alertQueue = alertQueue.then(fn).catch(() => {});
    return alertQueue;
}

window.showAlert = function (message, title = 'Notice') {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: 'ℹ️',
            type: 'info',
            buttons: [{ text: 'OK', type: 'primary', action: 'ok' }],
            onClose: (action) => resolve(action === 'ok')
        });
    });
};

window.showSuccess = function (message, title = 'Success') {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: '✅',
            type: 'success',
            buttons: [{ text: 'OK', type: 'success', action: 'ok' }],
            onClose: (action) => resolve(action === 'ok')
        });
    });
};

window.showError = function (message, title = 'Error') {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: '❌',
            type: 'error',
            buttons: [{ text: 'OK', type: 'danger', action: 'ok' }],
            onClose: (action) => resolve(action === 'ok')
        });
    });
};

window.showWarning = function (message, title = 'Warning') {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: '⚠️',
            type: 'warning',
            buttons: [{ text: 'OK', type: 'warning', action: 'ok' }],
            onClose: (action) => resolve(action === 'ok')
        });
    });
};

window.showInfo = function (message, title = 'Information') {
    return showAlert(message, title);
};

window.showConfirm = function (message, title = 'Confirm') {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: '❓',
            type: 'confirm',
            buttons: [
                { text: 'Cancel', type: 'secondary', action: 'cancel' },
                { text: 'Yes', type: 'primary', action: 'yes' }
            ],
            onClose: (action) => resolve(action === 'yes')
        });
    });
};

window.showDeleteConfirm = function (
    message = 'Are you sure you want to delete this item? This action cannot be undone.',
    title = 'Delete Confirmation'
) {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: '🗑️',
            type: 'warning',
            buttons: [
                { text: 'Cancel', type: 'secondary', action: 'cancel' },
                { text: 'Delete', type: 'danger', action: 'delete' }
            ],
            onClose: (action) => resolve(action === 'delete')
        });
    });
};

window.showActionConfirm = function (message, title = 'Confirm Action', actionText = 'Proceed') {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: '⚡',
            type: 'confirm',
            buttons: [
                { text: 'Cancel', type: 'secondary', action: 'cancel' },
                { text: actionText, type: 'primary', action: 'proceed' }
            ],
            onClose: (action) => resolve(action === 'proceed')
        });
    });
};

window.showPrompt = function (message, title = 'Input Required', defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
        createModal({
            title,
            message,
            icon: '✏️',
            type: 'confirm',
            input: { value: defaultValue, placeholder, maxLength: 120 },
            buttons: [
                { text: 'Cancel', type: 'secondary', action: 'cancel' },
                { text: 'OK', type: 'primary', action: 'ok' }
            ],
            onClose: (action, value) => {
                if (action === 'ok' && value) resolve(value);
                else resolve(null);
            }
        });
    });
};

function installNativeDialogPolyfill() {
    /**
     * =========================================================
     * CUSTOM MODAL SYSTEM - Beautiful UI/UX Popups
     * =========================================================
     * Replaces browser alerts/confirms with custom styled modals
     * - showAlert() - Display message only
     * - showConfirm() - Ask for user confirmation (returns Promise)
     * - showSuccess() - Success notification
     * - showError() - Error notification
     * - showWarning() - Warning notification
     * - showInfo() - Info notification
     * - queueNotification() - Queue message for later display via info button
     * =========================================================
     */

    // Global modal container
    let modalContainer = null;

    // Notification queue system
    let notificationQueue = [];
    let notificationButton = null;
    let notificationBadge = null;

    window.alert = function (message, title) {
        if (typeof queueAlert === 'function') {
            return queueAlert(() => showAlert(String(message ?? ''), title || 'Notice'));
        } else {
            console.log('Polyfill fallback Alert:', message);
            return Promise.resolve();
        }
    };
}

window.Modal = {
    alert: showAlert,
    confirm: showConfirm,
    success: showSuccess,
    error: showError,
    warning: showWarning,
    info: showInfo,
    deleteConfirm: showDeleteConfirm,
    actionConfirm: showActionConfirm,
    prompt: showPrompt,
    queue: queueNotification
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeModals();
        installNativeDialogPolyfill();
    });
} else {
    initializeModals();
    installNativeDialogPolyfill();
}
