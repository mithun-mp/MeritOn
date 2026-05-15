/**
 * Palette Control Script (v3.0)
 * Optimized for Enterprise CBT Layout
 */

(function() {
    const questionPalette = document.getElementById('questionPalette');
    const mobileToggleBtn = document.getElementById('mobilePaletteBtn');
    const mobileCloseBtn = document.getElementById('mobilePaletteClose');
    
    if (!questionPalette) return;

    // Mobile Toggle
    mobileToggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = questionPalette.classList.toggle('active');
        debugLog('UI', 'PALETTE', `Mobile Toggle: ${isOpen ? 'Opened' : 'Closed'}`);
    });

    // Mobile Close Button
    mobileCloseBtn?.addEventListener('click', () => {
        questionPalette.classList.remove('active');
    });

    // Close palette when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            questionPalette.classList.contains('active') && 
            !questionPalette.contains(e.target) && 
            e.target !== mobileToggleBtn) {
            questionPalette.classList.remove('active');
        }
    });

    // Handle Nav Grid clicks (close on mobile after selection)
    document.getElementById('navGrid')?.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && e.target.classList.contains('q-btn')) {
            questionPalette.classList.remove('active');
        }
    });

})();
