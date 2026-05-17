/**
 * Injects footer branding and candidate privacy notice (non-invasive).
 */
(function () {
    if (!window.CBT_SITE) return;

    function escapeHtml(text) {
        const p = document.createElement('p');
        p.textContent = String(text ?? '');
        return p.innerHTML;
    }

    function buildFooter() {
        const year = CBT_SITE.copyrightYear;
        const email = CBT_SITE.contactEmail;
        const org = CBT_SITE.organization;
        const name = CBT_SITE.name;
        const base = CBT_SITE.getBaseUrl();

        const footer = document.createElement('footer');
        footer.className = 'cbt-site-footer';
        footer.setAttribute('role', 'contentinfo');
        footer.innerHTML = `
            <div class="cbt-footer-inner">
                <div class="cbt-footer-brand">
                    <strong>${escapeHtml(org)}</strong>
                    <span>Secure Computer-Based Testing</span>
                </div>
                <nav class="cbt-footer-links" aria-label="Legal and information">
                    <a href="${base}about.html">About</a>
                    <a href="${base}privacy.html">Privacy</a>
                    <a href="${base}terms.html">Terms</a>
                    <a href="mailto:${escapeHtml(email)}">Support</a>
                </nav>
                <div class="cbt-footer-meta">
                    <span>© ${year} ${escapeHtml(name)}. All rights reserved.</span>
                    <span>HTTPS encrypted · Institutional use only</span>
                </div>
            </div>
        `;
        return footer;
    }

    function buildPrivacyNotice() {
        const base = CBT_SITE.getBaseUrl();
        const aside = document.createElement('aside');
        aside.className = 'cbt-privacy-notice';
        aside.setAttribute('role', 'note');
        aside.setAttribute('aria-label', 'Exam security and privacy notice');
        aside.innerHTML = `
            <div class="cbt-privacy-notice-inner">
                <i class="fas fa-shield-halved" aria-hidden="true"></i>
                <div>
                    <strong>Exam integrity &amp; privacy notice</strong>
                    <p>
                        This platform records login time and IP address for account security and audit trails.
                        During examinations, tab switches and fullscreen exits may be logged for anti-malpractice review.
                        Data is used only for examination administration and is handled per our
                        <a href="${base}privacy.html">Privacy Policy</a>.
                    </p>
                </div>
            </div>
        `;
        return aside;
    }

    function injectFooter() {
        if (!document.body.hasAttribute('data-cbt-footer')) return;
        if (document.querySelector('.cbt-site-footer')) return;
        document.body.appendChild(buildFooter());
    }

    function injectPrivacyNotice() {
        if (!document.body.hasAttribute('data-cbt-privacy-notice')) return;
        if (document.querySelector('.cbt-privacy-notice')) return;

        const notice = buildPrivacyNotice();
        const slot = document.getElementById('cbt-privacy-notice-slot');
        if (slot?.classList.contains('cbt-privacy-notice--compact')) {
            notice.classList.add('cbt-privacy-notice--compact');
        }
        if (slot) {
            slot.appendChild(notice);
        } else {
            document.body.insertBefore(notice, document.body.firstChild);
        }
    }

    function init() {
        injectFooter();
        injectPrivacyNotice();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
