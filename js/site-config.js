/**
 * Site-wide configuration — update baseUrl when deploying to GitHub Pages.
 * Leave baseUrl empty to auto-detect from the current page URL.
 */
(function (global) {
    const SITE = {
        name: 'MeritOn Aptitude Platform',
        shortName: 'MeritOn Platform',
        organization: 'MeritOn Aptitude Platform',
        contactEmail: 'mastersofcomputerapplication@gmail.com',
        developerName: 'MITHUN M P',
        developerEmail: 'mithunmp2004@gmail.com',
        copyrightYear: 2026,
        locale: 'en_IN',
        /**
         * Optional absolute site root, e.g. https://yourorg.github.io/MeritOn-2/
         * Leave '' to auto-detect (recommended for GitHub Pages project sites).
         */
        baseUrl: '',
        defaultDescription:
            'Official computer-based testing platform for secure online examinations with transparent monitoring, instant evaluation, and institutional reporting.',
        pages: {
            'index.html': {
                title: 'MeritOn Aptitude Platform — Secure Online Examinations',
                description:
                    'Official computer-based testing platform for aptitude and academic exams. Secure login, proctored sessions, and transparent result publication.',
                robots: 'index, follow'
            },
            'login.html': {
                title: 'Candidate Login — MeritOn Aptitude Platform',
                description:
                    'Sign in to access scheduled examinations. Institutional authentication with secure session handling.',
                robots: 'index, follow'
            },
            'test-lobby.html': {
                title: 'Exam Lobby — MeritOn Aptitude Platform',
                description:
                    'View available, upcoming, and completed examinations. Start proctored tests from your candidate dashboard.',
                robots: 'noindex, nofollow'
            },
            'exam.html': {
                title: 'Examination — MeritOn Aptitude Platform',
                description:
                    'Secure proctored examination session with autosave, fullscreen monitoring, and integrity safeguards.',
                robots: 'noindex, nofollow'
            },
            'result.html': {
                title: 'Exam Results — MeritOn Aptitude Platform',
                description:
                    'View your examination submission status and published results from the MeritOn platform.',
                robots: 'noindex, nofollow'
            },
            'admin.html': {
                title: 'Administrator Login — MeritOn Aptitude Platform',
                description: 'Authorized administrator access for examination management.',
                robots: 'noindex, nofollow'
            },
            'admin-dashboard.html': {
                title: 'Admin Dashboard — MeritOn Aptitude Platform',
                description: 'Examination administration, analytics, and institutional controls.',
                robots: 'noindex, nofollow'
            },
            'analytics.html': {
                title: 'Analytics — MeritOn Aptitude Platform',
                description: 'Performance analytics and result publication tools for administrators.',
                robots: 'noindex, nofollow'
            },
            'admin-malpractices.html': {
                title: 'Integrity Monitoring — MeritOn Aptitude Platform',
                description: 'Examination integrity and malpractice review for authorized staff.',
                robots: 'noindex, nofollow'
            },
            'about.html': {
                title: 'About — MeritOn Aptitude Platform',
                description: 'Learn about the MeritOn Aptitude Platform purpose, features, and institutional use.',
                robots: 'index, follow'
            },
            'privacy.html': {
                title: 'Privacy Policy — MeritOn Aptitude Platform',
                description: 'How candidate data, login information, and examination monitoring data are collected and used.',
                robots: 'index, follow'
            },
            'terms.html': {
                title: 'Terms of Use — MeritOn Aptitude Platform',
                description: 'Terms and conditions for using the MeritOn Aptitude Platform examination services.',
                robots: 'index, follow'
            }
        }
    };

    function getBaseUrl() {
        if (SITE.baseUrl) {
            return SITE.baseUrl.replace(/\/?$/, '/');
        }
        const path = global.location.pathname;
        const lastSlash = path.lastIndexOf('/');
        return global.location.origin + path.slice(0, lastSlash + 1);
    }

    function getPageFileName() {
        const path = global.location.pathname;
        const file = path.slice(path.lastIndexOf('/') + 1);
        return file || 'index.html';
    }

    function getPageMeta(pageFile) {
        const key = pageFile || getPageFileName();
        return SITE.pages[key] || {
            title: SITE.name,
            description: SITE.defaultDescription,
            robots: 'index, follow'
        };
    }

    function getCanonicalUrl(pageFile) {
        const file = pageFile || getPageFileName();
        return getBaseUrl() + file;
    }

    SITE.getBaseUrl = getBaseUrl;
    SITE.getPageFileName = getPageFileName;
    SITE.getPageMeta = getPageMeta;
    SITE.getCanonicalUrl = getCanonicalUrl;

    // Global debugLog that only logs when meriton_debug is enabled (securely)
    global.debugLog = function () {
        // By default, DO NOT log anything unless explicitly enabled
        try {
            // Only log if both localStorage is available AND debug flag is strictly "true"
            if (global.localStorage && global.localStorage.getItem("meriton_debug") === "true") {
                // Sanitize arguments to prevent accidental exposure of sensitive data
                const sanitizedArgs = Array.from(arguments).map(arg => {
                    if (typeof arg === 'object' && arg !== null) {
                        // Remove sensitive fields
                        const safeObj = { ...arg };
                        delete safeObj.password;
                        delete safeObj.sessionToken;
                        delete safeObj.adminToken;
                        delete safeObj.token;
                        return safeObj;
                    }
                    return arg;
                });
                console.log.apply(console, sanitizedArgs);
            }
        } catch (e) {
            // Ignore all errors to prevent console pollution
        }
    };

    // Central Maintenance Mode Interception Guard (Requirement 7 & 12)
    function checkMaintenanceGuard() {
        if (typeof window === 'undefined' || !window.location) return;

        const path = window.location.pathname.toLowerCase();
        const page = path.slice(path.lastIndexOf('/') + 1) || 'index.html';

        // 1. Exclude administrator portal and maintenance page itself
        if (
            page.includes('admin') ||
            page.includes('analytics') ||
            page === 'maintenance.html'
        ) {
            return;
        }

        // 2. Active Exam Safety (Requirement 12)
        // If candidate is actively taking an exam on exam.html, do NOT abort the live session
        if (page === 'exam.html') {
            try {
                const activeSession = localStorage.getItem('activeExamSession') ||
                                      localStorage.getItem('cbt_active_exam') ||
                                      sessionStorage.getItem('activeExamSession');
                if (activeSession) {
                    return; // Preserve in-progress examination
                }
            } catch (e) {}
        }

        // 3. Resolve API URL
        let apiUrl = '';
        if (window.MERITON_API_URL) apiUrl = window.MERITON_API_URL;
        else if (SITE.apiUrl) apiUrl = SITE.apiUrl;
        else {
            const h = window.location.hostname;
            const p = window.location.port;
            if (h === 'localhost' || h === '127.0.0.1' || h === '::1') {
                apiUrl = (p === '3000') ? '/api' : 'http://localhost:3000/api';
            } else if (window.location.origin && !window.location.origin.startsWith('file:')) {
                if (h.includes('render.com') || h.includes('meriton')) {
                    apiUrl = `${window.location.origin}/api`;
                }
            }
            if (!apiUrl) apiUrl = 'https://meriton.onrender.com/api';
        }

        // 4. Asynchronous fast status check
        fetch(`${apiUrl}?action=getMaintenanceStatus`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.success && data.maintenance && data.maintenance.active === true) {
                console.warn('[MAINTENANCE] System maintenance is active. Redirecting to maintenance page.');
                window.location.replace('maintenance.html');
            }
        })
        .catch(() => {
            // Silently ignore network failures to avoid blocking normal offline / dev usage
        });
    }

    SITE.checkMaintenanceGuard = checkMaintenanceGuard;

    // Trigger check automatically on page load
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkMaintenanceGuard);
        } else {
            checkMaintenanceGuard();
        }
    }

    global.MeritOn_SITE = SITE;
})(typeof window !== 'undefined' ? window : globalThis);
