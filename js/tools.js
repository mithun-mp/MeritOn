/**
 * Exam Tools & Avatar Utilities (Rough Pad, Calculator, Theme, Avatars)
 */

window.getAvatarPath = function(avatar) {
    if (avatar === null || avatar === undefined || avatar === '') return 'assets/avatars/avatar1.png';
    const num = Number(avatar);
    if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 11) {
        return 'assets/avatars/avatar1.png';
    }
    return `assets/avatars/avatar${num}.png`;
};

window.formatDateForInput = function(rawDate) {
    if (!rawDate) return '';
    if (rawDate instanceof Date) {
        const yyyy = rawDate.getFullYear();
        const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
        const dd = String(rawDate.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    const str = String(rawDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }
    if (str.includes('T')) {
        return str.split('T')[0];
    }
    if (str.includes(' ')) {
        return str.split(' ')[0];
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

window.formatTimeForInput = function(rawTime) {
    if (!rawTime) return '09:00';
    let str = String(rawTime).trim();
    const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const minutes = ampmMatch[2];
        const period = ampmMatch[3].toUpperCase();
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    const match = str.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
        const hours = String(parseInt(match[1], 10)).padStart(2, '0');
        const minutes = match[2];
        return `${hours}:${minutes}`;
    }
    return '09:00';
};

window.closeRoughPad = () => {
    document.getElementById('roughPadModal').style.display = 'none';
};

window.closeCalculator = () => {
    document.getElementById('calculatorModal').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    // Theme initialization
    const savedTheme = localStorage.getItem('examTheme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        const themeIcon = document.querySelector('#themeBtn i');
        if (themeIcon) themeIcon.className = 'fas fa-sun';
    }

    // Event Listeners
    document.getElementById('roughPadBtn')?.addEventListener('click', () => {
        document.getElementById('roughPadModal').style.display = 'flex';
    });

    document.getElementById('calculatorBtn')?.addEventListener('click', () => {
        document.getElementById('calculatorModal').style.display = 'flex';
    });

    document.getElementById('themeBtn')?.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-mode');
        localStorage.setItem('examTheme', isLight ? 'light' : 'dark');
        
        const themeIcon = document.querySelector('#themeBtn i');
        if (themeIcon) themeIcon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
        
        // Update logos
        document.querySelectorAll('.header-logo-svg, .loader-m-logo, .submit-loader-logo, .loader-branding-logo').forEach(img => {
            img.src = isLight ? 'assets/logo2.svg' : 'assets/logo.svg';
        });

        // Background watermark handled via CSS variable --watermark-url in style.css
        
        debugLog('UI', 'THEME', `Switched to ${isLight ? 'light' : 'dark'} mode`);
    });

    // Initial logo sync
    if (localStorage.getItem('examTheme') === 'light') {
        document.querySelectorAll('.header-logo-svg, .loader-m-logo, .submit-loader-logo, .loader-branding-logo').forEach(img => {
            img.src = 'assets/logo2.svg';
        });
    }
});
