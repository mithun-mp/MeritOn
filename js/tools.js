/**
 * Exam Tools Logic (Rough Pad, Calculator, Theme)
 */

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
