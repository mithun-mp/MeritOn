/**
 * Injects footer branding and candidate privacy notice (non-invasive).
 */
(function () {
    if (!window.MeritOn_SITE) return;

    function escapeHtml(text) {
        const p = document.createElement('p');
        p.textContent = String(text ?? '');
        return p.innerHTML;
    }

    function buildFooter() {
        const year = MeritOn_SITE.copyrightYear;
        const email = MeritOn_SITE.contactEmail;
        const devName = MeritOn_SITE.developerName;
        const devEmail = MeritOn_SITE.developerEmail;
        const org = MeritOn_SITE.organization;
        const name = MeritOn_SITE.name;
        const base = MeritOn_SITE.getBaseUrl();

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
                    <div style="margin-bottom: 8px;">
                        <span>Developed by <strong>${escapeHtml(devName)}</strong> </span>
                        <span style="margin: 0 10px; opacity: 0.5;">|</span>
                        <span>Contact: <a href="mailto:${escapeHtml(devEmail)}" style="color: inherit; text-decoration: none;">${escapeHtml(devEmail)}</a></span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <span>Platform Support: <a href="mailto:${escapeHtml(email)}" style="color: inherit; text-decoration: none;">${escapeHtml(email)}</a></span>
                    </div>
                    <span>© ${year} MeritOn. All rights reserved.</span>
                    <span style="display: block; margin-top: 4px; font-size: 0.75rem; opacity: 0.6;">HTTPS encrypted · Institutional use only</span>
                </div>
            </div>
        `;
        return footer;
    }

    function buildPrivacyNotice() {
        const base = MeritOn_SITE.getBaseUrl();
        const devName = MeritOn_SITE.developerName;
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
                        This platform, developed by <strong>${escapeHtml(devName)}</strong>, records login time and IP address for account security and audit trails.
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

/**
 * Reusable Admin Action Verification Loader
 */
function showAdminActionVerifyLoader(options = {}) {
    const {
        title = "Verifying Admin Action",
        message = "Confirming secure permission before continuing...",
        mode = "verify",
        steps = [
            "Checking session token",
            "Validating administrator privilege",
            "Preparing secure action"
        ]
    } = options;

    const overlayId = "adminActionLoader";
    if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

    document.body.insertAdjacentHTML("afterbegin", `
        <div id="${overlayId}" class="admin-action-overlay ${mode}">
            <div class="verify-card">
                <div class="verify-ring">
                    <i class="fas ${mode === 'exit' ? 'fa-door-open' : 'fa-shield-halved'}"></i>
                </div>
                <h2 id="actionVerifyTitle">${title}</h2>
                <p id="actionVerifyText">${message}</p>
                <div class="verify-bar"><span id="actionVerifyProgress"></span></div>
                <div class="verify-steps">
                    ${steps.map((s, i) => `<div id="actionStep${i+1}">${s}</div>`).join('')}
                </div>
            </div>
            <style>
                .admin-action-overlay {
                    position:fixed; inset:0; z-index:999999;
                    background: radial-gradient(circle at top, rgba(37,99,235,.2), transparent 40%), #020617;
                    display:flex; align-items:center; justify-content:center;
                    font-family:Inter,sans-serif; color:white;
                    animation: fadeIn .3s ease;
                }
                .admin-action-overlay .verify-card {
                    width:min(90vw, 400px); text-align:center; padding:30px;
                    background:rgba(15,23,42,.8); border:1px solid rgba(148,163,184,.2);
                    border-radius:24px; backdrop-filter:blur(15px);
                    box-shadow:0 20px 50px rgba(0,0,0,.5);
                    animation: cardSlideIn .4s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                @keyframes cardSlideIn { from {opacity:0; transform:translateY(20px) scale(0.95);} to {opacity:1; transform:translateY(0) scale(1);} }
                .admin-action-overlay.exit {
                    background: radial-gradient(circle at top, rgba(16,185,129,.15), transparent 40%), #020617;
                }
                .admin-action-overlay .verify-ring {
                    width:70px; height:70px; margin:0 auto 15px; border-radius:20px;
                    display:flex; align-items:center; justify-content:center; font-size:30px;
                    background:linear-gradient(135deg,#2563eb,#14b8a6);
                    animation: actionPulse 1.5s infinite;
                    transition: background 0.5s ease;
                }
                .admin-action-overlay.exit .verify-ring {
                    background:linear-gradient(135deg,#3b82f6,#10b981);
                }
                .admin-action-overlay .verify-bar {
                    width:100%; height:6px; background:rgba(255,255,255,.1);
                    border-radius:10px; margin:15px 0; overflow:hidden;
                }
                #actionVerifyProgress {
                    display:block; width:0%; height:100%; background:#2563eb;
                    transition: width .4s ease;
                }
                .admin-action-overlay .verify-steps {
                    font-size:13px; color:#64748b; text-align:left; margin-top:10px;
                }
                .admin-action-overlay .verify-steps div::before { content:"○ "; }
                .admin-action-overlay .verify-steps div.active { color:white; }
                .admin-action-overlay .verify-steps div.active::before { content:"◉ "; }
                .admin-action-overlay .verify-steps div.done { color:#22c55e; }
                .admin-action-overlay .verify-steps div.done::before { content:"✓ "; }
                @keyframes actionPulse { 0%,100% {transform:scale(1);} 50% {transform:scale(1.05);} }
                @keyframes fadeIn { from {opacity:0;} to {opacity:1;} }
            </style>
        </div>
    `);

    // Basic animation sequence
    let progress = 0;
    const isExit = mode === 'exit';
    const intervalTime = isExit ? 20 : 40; // Faster for exit
    
    const interval = setInterval(() => {
        progress += 5;
        const progressEl = document.getElementById("actionVerifyProgress");
        if (progressEl) progressEl.style.width = progress + "%";
        
        if (progress >= 30) document.getElementById("actionStep1")?.classList.add("active");
        if (progress >= 40) { document.getElementById("actionStep1")?.classList.remove("active"); document.getElementById("actionStep1")?.classList.add("done"); }
        if (progress >= 60) document.getElementById("actionStep2")?.classList.add("active");
        if (progress >= 70) { document.getElementById("actionStep2")?.classList.remove("active"); document.getElementById("actionStep2")?.classList.add("done"); }
        if (progress >= 90) document.getElementById("actionStep3")?.classList.add("active");

        if (progress >= 100) {
            clearInterval(interval);
            if (isExit) {
                // Auto-complete exit for smoother feel
                setTimeout(completeAdminActionVerifyLoader, 150);
            }
        }
    }, intervalTime);
}

function completeAdminActionVerifyLoader() {
    const progressEl = document.getElementById("actionVerifyProgress");
    if (progressEl) progressEl.style.width = "100%";
    
    [1,2,3].forEach(i => {
        const el = document.getElementById(`actionStep${i}`);
        if (el) { el.classList.remove("active"); el.classList.add("done"); }
    });

    setTimeout(() => {
        const loader = document.getElementById("adminActionLoader");
        if (loader) {
            loader.style.opacity = "0";
            loader.style.transition = "opacity .3s ease";
            setTimeout(() => loader.remove(), 300);
        }
    }, 350);
}

function denyAdminActionVerifyLoader() {
    const titleEl = document.getElementById("actionVerifyTitle");
    const textEl = document.getElementById("actionVerifyText");
    const ringEl = document.querySelector(".admin-action-overlay .verify-ring");
    
    if (titleEl) titleEl.innerText = "Action Denied";
    if (textEl) textEl.innerText = "Security check failed. Unauthorized action blocked.";
    if (ringEl) ringEl.style.background = "linear-gradient(135deg, #ef4444, #f97316)";

    setTimeout(() => {
        const loader = document.getElementById("adminActionLoader");
        if (loader) loader.remove();
    }, 1500);
}

function showAdminExitLoader() {
    document.getElementById("adminExitLoader")?.remove();

    document.body.insertAdjacentHTML("afterbegin", `
        <div id="adminExitLoader" style="
            position:fixed;
            inset:0;
            z-index:9999999;
            background:
                radial-gradient(circle at top, rgba(37,99,235,.25), transparent 38%),
                radial-gradient(circle at bottom, rgba(20,184,166,.16), transparent 42%),
                #020617;
            display:flex;
            align-items:center;
            justify-content:center;
            color:white;
            font-family:Inter,Arial,sans-serif;
            overflow:hidden;
        ">
            <div style="
                width:min(92vw,430px);
                text-align:center;
                padding:34px 26px;
                border-radius:30px;
                background:rgba(15,23,42,.78);
                border:1px solid rgba(148,163,184,.22);
                box-shadow:0 30px 90px rgba(0,0,0,.48);
                backdrop-filter:blur(22px);
                animation:adminExitIn .28s ease forwards;
            ">
                <div style="
                    width:82px;
                    height:82px;
                    margin:0 auto 20px;
                    border-radius:26px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:34px;
                    background:linear-gradient(135deg,#2563eb,#14b8a6);
                    box-shadow:0 0 46px rgba(37,99,235,.55);
                    animation:adminExitPulse 1.25s infinite ease-in-out;
                ">
                    <i class="fas fa-shield-halved"></i>
                </div>

                <h2 style="
                    margin:0;
                    font-size:clamp(20px,5vw,25px);
                    font-weight:900;
                    letter-spacing:-.03em;
                ">
                    Securely Exiting Admin Control
                </h2>

                <p style="
                    margin:10px 0 22px;
                    color:#94a3b8;
                    font-size:14px;
                    line-height:1.5;
                ">
                    Closing your protected workspace...
                </p>

                <div style="
                    width:100%;
                    height:9px;
                    background:rgba(148,163,184,.16);
                    border-radius:999px;
                    overflow:hidden;
                    margin-bottom:18px;
                ">
                    <span style="
                        display:block;
                        height:100%;
                        width:100%;
                        border-radius:999px;
                        background:linear-gradient(90deg,#2563eb,#22c55e,#14b8a6);
                        animation:adminExitBar 1.25s ease forwards;
                    "></span>
                </div>

                <div style="
                    display:grid;
                    gap:9px;
                    text-align:left;
                    max-width:285px;
                    margin:0 auto;
                    color:#cbd5e1;
                    font-size:13px;
                ">
                    <div class="admin-exit-step">✓ Invalidating backend session</div>
                    <div class="admin-exit-step">✓ Clearing local security context</div>
                    <div class="admin-exit-step">✓ Closing administrator workspace</div>
                </div>
            </div>

            <style>
                @keyframes adminExitIn {
                    from {
                        opacity:0;
                        transform:translateY(12px) scale(.97);
                    }
                    to {
                        opacity:1;
                        transform:translateY(0) scale(1);
                    }
                }

                @keyframes adminExitPulse {
                    0%,100% {
                        transform:scale(1);
                    }
                    50% {
                        transform:scale(1.07);
                    }
                }

                @keyframes adminExitBar {
                    from {
                        width:0%;
                    }
                    to {
                        width:100%;
                    }
                }

                .admin-exit-step {
                    opacity:0;
                    transform:translateY(6px);
                    animation:adminExitStep .4s ease forwards;
                }

                .admin-exit-step:nth-child(1) {
                    animation-delay:.15s;
                }

                .admin-exit-step:nth-child(2) {
                    animation-delay:.42s;
                }

                .admin-exit-step:nth-child(3) {
                    animation-delay:.72s;
                }

                @keyframes adminExitStep {
                    to {
                        opacity:1;
                        transform:translateY(0);
                    }
                }
            </style>
        </div>
    `);

    document.body.style.pointerEvents = "none";
}

function showStudentExitLoader() {
    document.getElementById("studentExitLoader")?.remove();

    document.body.insertAdjacentHTML("afterbegin", `
        <div id="studentExitLoader" style="
            position:fixed;
            inset:0;
            z-index:9999999;
            background:
                radial-gradient(circle at top, rgba(37,99,235,.2), transparent 40%),
                #0f172a;
            display:flex;
            align-items:center;
            justify-content:center;
            color:white;
            font-family:Inter,Arial,sans-serif;
            overflow:hidden;
        ">
            <div style="
                width:min(90vw,400px);
                text-align:center;
                padding:30px 20px;
                border-radius:24px;
                background:rgba(30,41,59,.8);
                border:1px solid rgba(255,255,255,.1);
                backdrop-filter:blur(16px);
                animation:adminExitIn .3s ease forwards;
            ">
                <div style="
                    width:70px;
                    height:70px;
                    margin:0 auto 20px;
                    border-radius:20px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:30px;
                    background:linear-gradient(135deg,#3b82f6,#2dd4bf);
                    animation:adminExitPulse 1.5s infinite ease-in-out;
                ">
                    <i class="fas fa-right-from-bracket"></i>
                </div>

                <h2 style="margin:0; font-size:22px; font-weight:700;">Logging Out</h2>
                <p style="margin:8px 0 20px; color:#94a3b8; font-size:14px;">Safely ending your session...</p>

                <div style="width:100%; height:6px; background:rgba(255,255,255,.1); border-radius:10px; overflow:hidden;">
                    <span style="display:block; height:100%; width:100%; background:#3b82f6; animation:adminExitBar 1.5s ease forwards;"></span>
                </div>
            </div>
            <style>
                @keyframes adminExitIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
                @keyframes adminExitPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
                @keyframes adminExitBar { from { width:0%; } to { width:100%; } }
            </style>
        </div>
    `);
    document.body.style.pointerEvents = "none";
}
