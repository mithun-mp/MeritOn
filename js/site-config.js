/**
 * Site-wide configuration — update baseUrl when deploying to GitHub Pages.
 * Leave baseUrl empty to auto-detect from the current page URL.
 */
(function (global) {
    const SITE = {
        name: 'MeritOn Aptitude Platform',
        shortName: 'MeritOn Platform',
        organization: 'MeritOn Aptitude Platform',
        contactEmail: 'support@cbt-platform.edu',
        copyrightYear: new Date().getFullYear(),
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

    // Global no-op debugLog to prevent ReferenceErrors when debug.js is removed
    global.debugLog = function () {};

    global.MeritOn_SITE = SITE;
})(typeof window !== 'undefined' ? window : globalThis);
