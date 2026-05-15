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
        
        debugLog('UI', 'THEME', `Switched to ${isLight ? 'light' : 'dark'} mode`);
    });
});
