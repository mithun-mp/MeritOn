/**
 * Admin Logic - FINAL STABLE VERSION (Production Ready)
 */

let currentDraftID = null;
let isDraftDirty = false;
let autosaveInterval = null;

// PDF Branding Helpers
const PDF_ASSETS = {
    logoDark: 'assets/logo-pdf-dark.png',
    logoLight: 'assets/logo-pdf-light.png'
};

/**
 * Standardizes MeritOn branding for any jsPDF document
 * @param {jsPDF} doc - The jsPDF instance
 * @param {Object} options - Branding options { title, subtitle, documentType }
 */
async function addMeritOnPdfBranding(doc, options = {}) {
    const { title = "DOCUMENT", subtitle = "", documentType = "Report" } = options;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Add Header Background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // 2. Add Top-Left Logo (PNG)
    try {
        // Use dark logo for dark header
        doc.addImage(PDF_ASSETS.logoDark, 'PNG', 14, 6, 16, 16);
    } catch (e) {
        debugLog('WARN', 'PDF', 'PDF Logo failed to load', e);
    }

    // 3. Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(title.toUpperCase(), pageWidth / 2, 13, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, pageWidth / 2, 20, { align: "center" });

    // 4. Document Meta
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(`${documentType} | Generated: ${new Date().toLocaleString()}`, 14, 34);

    // 5. Watermark
    addPdfWatermark(doc);
    
    // 6. Initial Footer
    addPdfFooter(doc);
}

function addPdfWatermark(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    
    try {
        // Large centered watermark
        const size = 120;
        doc.addImage(PDF_ASSETS.logoLight, 'PNG', (pageWidth - size) / 2, (pageHeight - size) / 2, size, size);
    } catch (e) {}
    
    doc.restoreGraphicsState();
}

function addPdfFooter(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageCount = doc.internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        
        // Divider line
        doc.setDrawColor(226, 232, 240);
        doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

        // Footer Text
        doc.text("MeritOn • Secure Computer Based Testing", 14, pageHeight - 10);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: "right" });
        
        doc.setFont("helvetica", "italic");
        doc.text("Developed by MITHUN M P | © 2026 MeritOn. All rights reserved.", pageWidth / 2, pageHeight - 10, { align: "center" });
    }
}
function showAdminVerifyLoader() {
    document.body.insertAdjacentHTML("afterbegin", `
        <div id="adminVerifyLoader" style="
            position:fixed;
            inset:0;
            z-index:999999;
            background:
                radial-gradient(circle at top, rgba(37,99,235,.28), transparent 38%),
                radial-gradient(circle at bottom, rgba(20,184,166,.18), transparent 42%),
                #020617;
            display:flex;
            align-items:center;
            justify-content:center;
            font-family:Inter,Arial,sans-serif;
            overflow:hidden;
            color:white;
        ">
            <div class="verify-card">
                <div class="verify-ring">
                    <i class="fas fa-shield-halved"></i>
                </div>

                <h2 id="verifyTitle">Security Gateway</h2>
                <p id="verifyText">Unauthorized access detection active...</p>

                <div class="verify-bar">
                    <span id="verifyProgress"></span>
                </div>

                <div id="verifyPercent">0%</div>

                <div class="verify-steps">
                    <div id="step1">Scanning session identity</div>
                    <div id="step2">Checking administrator privilege</div>
                    <div id="step3">Preparing MeritOn dashboard</div>
                </div>

                <div id="meritonPhase" class="meriton-phase">
                    <img src="assets/logo.svg" alt="M">
                    <span>eritOn</span>
                </div>
            </div>

            <style>
                #adminVerifyLoader .verify-card {
                    width:min(92vw, 430px);
                    text-align:center;
                    transform:translateY(-38px);
                    padding:34px 26px;
                    border-radius:30px;
                    background:rgba(15,23,42,.72);
                    border:1px solid rgba(148,163,184,.18);
                    box-shadow:0 30px 90px rgba(0,0,0,.45);
                    backdrop-filter:blur(22px);
                }

                #adminVerifyLoader .verify-ring {
                    width:88px;
                    height:88px;
                    margin:0 auto 20px;
                    border-radius:28px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:38px;
                    background:linear-gradient(135deg,#2563eb,#14b8a6);
                    box-shadow:0 0 50px rgba(37,99,235,.65);
                    animation:verifyPulse 1.35s infinite ease-in-out;
                }

                #verifyTitle {
                    margin:0;
                    font-size:clamp(20px, 5vw, 25px);
                    font-weight:900;
                }

                #verifyText {
                    margin:10px 0 22px;
                    color:#94a3b8;
                    font-size:14px;
                    line-height:1.5;
                }

                .verify-bar {
                    width:100%;
                    height:9px;
                    background:rgba(148,163,184,.16);
                    border-radius:999px;
                    overflow:hidden;
                    margin-bottom:10px;
                }

                #verifyProgress {
                    display:block;
                    width:0%;
                    height:100%;
                    border-radius:999px;
                    background:linear-gradient(90deg,#2563eb,#22c55e,#14b8a6);
                    box-shadow:0 0 24px rgba(34,197,94,.55);
                    transition:width .45s ease;
                }

                #verifyPercent {
                    font-size:13px;
                    color:#cbd5e1;
                    font-weight:700;
                    margin-bottom:18px;
                }

                .verify-steps {
                    display:grid;
                    gap:9px;
                    color:#64748b;
                    font-size:13px;
                    text-align:left;
                    max-width:285px;
                    margin:0 auto;
                }

                .verify-steps div.active {
                    color:#e2e8f0;
                }

                .verify-steps div.done {
                    color:#22c55e;
                }

                .verify-steps div::before {
                    content:"○ ";
                }

                .verify-steps div.active::before {
                    content:"◉ ";
                }

                .verify-steps div.done::before {
                    content:"✓ ";
                }

                .meriton-phase {
                    display:none;
                    align-items:center;
                    justify-content:center;
                    margin-top:26px;
                    gap:4px;
                    animation:meritonReveal .8s ease forwards;
                }

                .meriton-phase img {
                    width:54px;
                    height:54px;
                    filter:drop-shadow(0 0 22px rgba(59,130,246,.7));
                }

                .meriton-phase span {
                    font-size:31px;
                    font-weight:900;
                    letter-spacing:-1px;
                }

                #adminVerifyLoader.granted .verify-ring {
                    background:linear-gradient(135deg,#22c55e,#14b8a6);
                }

                #adminVerifyLoader.denied .verify-ring {
                    background:linear-gradient(135deg,#ef4444,#f97316);
                    box-shadow:0 0 50px rgba(239,68,68,.6);
                }

                @keyframes verifyPulse {
                    0%,100% { transform:scale(1); }
                    50% { transform:scale(1.08); }
                }

                @keyframes meritonReveal {
                    from { opacity:0; transform:translateY(14px) scale(.95); }
                    to { opacity:1; transform:translateY(0) scale(1); }
                }

                @media (max-width:420px) {
                    #adminVerifyLoader .verify-card {
                        width:90vw;
                        padding:30px 20px;
                        transform:translateY(-24px);
                    }
                }
            </style>
        </div>
    `);

    const states = [
        [18, "Unauthorized Access Detection", "Scanning local session integrity...", "step1"],
        [42, "Verifying Identity", "Matching user identity with backend records...", "step1"],
        [68, "Checking Privileges", "Validating administrator role on secure backend...", "step2"],
        [88, "Loading Security Layer", "Preparing protected MeritOn dashboard modules...", "step3"]
    ];

    states.forEach(([percent, title, text, step], index) => {
        setTimeout(() => {
            const verifyTitle = document.getElementById("verifyTitle");
            const verifyText = document.getElementById("verifyText");
            const verifyProgress = document.getElementById("verifyProgress");
            const verifyPercent = document.getElementById("verifyPercent");
            if (verifyTitle) verifyTitle.innerText = title;
            if (verifyText) verifyText.innerText = text;
            if (verifyProgress) verifyProgress.style.width = percent + "%";
            if (verifyPercent) verifyPercent.innerText = percent + "%";

            ["step1", "step2", "step3"].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove("active");
                    if (id === step) el.classList.add("active");
                }
            });

            if (index > 0) {
                const prevStep = document.getElementById(states[index - 1][3]);
                if (prevStep) prevStep.classList.add("done");
            }
        }, 350 + index * 520);
    });
}

function completeAdminVerifyLoader() {
    const loader = document.getElementById("adminVerifyLoader");
    if (!loader) return;

    loader.classList.add("granted");
    const verifyTitle = document.getElementById("verifyTitle");
    const verifyText = document.getElementById("verifyText");
    const verifyProgress = document.getElementById("verifyProgress");
    const verifyPercent = document.getElementById("verifyPercent");
    const meritonPhase = document.getElementById("meritonPhase");
    if (verifyTitle) verifyTitle.innerText = "Access Granted";
    if (verifyText) verifyText.innerText = "Welcome to MeritOn Admin Control.";
    if (verifyProgress) verifyProgress.style.width = "100%";
    if (verifyPercent) verifyPercent.innerText = "100%";

    document.querySelectorAll(".verify-steps div").forEach(el => {
        el.classList.add("done");
        el.classList.remove("active");
    });

    if (meritonPhase) meritonPhase.style.display = "flex";

    setTimeout(() => {
        loader.style.opacity = "0";
        loader.style.transition = "opacity .55s ease";
        setTimeout(() => loader.remove(), 600);
    }, 1000);
}

function denyAdminVerifyLoader() {
    const loader = document.getElementById("adminVerifyLoader");
    if (!loader) return;

    loader.classList.add("denied");
    const verifyTitle = document.getElementById("verifyTitle");
    const verifyText = document.getElementById("verifyText");
    const verifyProgress = document.getElementById("verifyProgress");
    const verifyPercent = document.getElementById("verifyPercent");
    if (verifyTitle) verifyTitle.innerText = "Access Denied";
    if (verifyText) verifyText.innerText = "Administrator verification failed. Redirecting securely...";
    if (verifyProgress) verifyProgress.style.width = "100%";
    if (verifyPercent) verifyPercent.innerText = "BLOCKED";
}


if (window.location.href.includes("admin-dashboard.html")) {
    showAdminVerifyLoader();

    protectAdminPage().then(ok => {
        if (ok) {
            completeAdminVerifyLoader();
            initDashboard();
        }
    });
}

async function protectAdminPage() {
    const user = JSON.parse(
        localStorage.getItem("cbt_user") || "null"
    );

    if (!user || !user.userId) {
        window.location.href = "./admin.html";
        return false;
    }

    const res = await api.post({
        action: "verifyAdmin",
        sessionToken: user.sessionToken
    });

    if (!res.success || res.role !== "admin") {
        denyAdminVerifyLoader();
        localStorage.removeItem("cbt_user");

        setTimeout(() => {
            window.location.replace("./admin.html");
        }, 1200);

        return false;
    }

    return true;
}


let currentWizardData = {};
let isEditMode = false;
let editingTestId = null;
let allTests = []; // Store all tests for editing lookups

/* ================= LOGIN ================= */

document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    // Immediate UI Feedback
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Authorizing...';

    const username = document.getElementById('adminID').value.trim();
    const password = document.getElementById('adminPass').value.trim();

    console.log('[ADMIN LOGIN] payload:', { action: 'adminLogin', username, password: '***' });

    try {
        const response = await api.post({
            action: 'adminLogin',
            username,
            password
        });

        console.log('[ADMIN LOGIN] response:', response);

        if (response && response.success === true) {
            
            // Set MeritOn user session for consistency
            localStorage.setItem('cbt_user', JSON.stringify({
                userId: response.userId || 'ADMIN',
                univId: response.univId || 'ADMIN',
                fullName: response.fullName || 'Administrator',
                email: response.email || username,
                role: 'admin',
                status: 'active',

                sessionToken: response.sessionToken,

                loginTime: new Date().getTime()
            }));
            
            console.log('[ADMIN LOGIN] success redirect');
            window.location.href = './admin-dashboard.html';
        } else {
            console.log('[ADMIN LOGIN] failure reason:', response?.error);
            alert('Invalid Admin Credentials');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }

    } catch (err) {
        console.error("[ADMIN LOGIN] Error:", err.message);
        alert('Login Error: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

// Explicit Enter Key Support for Admin Login Fields
document.querySelectorAll('#adminLoginForm input').forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('adminLoginForm').requestSubmit();
        }
    });
});

// CONTENT CONSTANTS FOR PANELS
const privacyPanelHTML = `
    <div class="admin-inner-card">
        <h3>Privacy Policy</h3>
        <p style="margin-top: 15px; line-height: 1.6; color: var(--muted-text);">
            At MeritOn, we take data privacy and examination integrity seriously. As an administrator, you have access to sensitive candidate data.
        </p>
        <ul style="margin-top: 15px; color: var(--muted-text); padding-left: 20px;">
            <li>All administrative actions are logged for security auditing.</li>
            <li>Candidate personal information must be handled according to institutional guidelines.</li>
            <li>System access tokens are encrypted and stored securely in session context.</li>
        </ul>
        <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid var(--border-color);">
            <p><strong>Platform Contact:</strong> mastersofcomputerapplication@gmail.com</p>
            <p><strong>Security Lead:</strong> MITHUN M P</p>
        </div>
    </div>
`;

const analyticsPanelHTML = `
    <div class="analytics-wrapper" style="padding: 0;">
        <!-- Test Selector Section -->
        <header class="analytics-header" style="margin-bottom: 25px;">
            <div class="selector-container glass-card" style="padding: 20px; border-radius: 20px; display: flex; gap: 20px; align-items: flex-end; background: var(--bg-secondary);">
                <div class="selector-group" style="flex: 1;">
                    <label for="testSelector" style="display: block; margin-bottom: 8px; font-weight: 600;"><i class="fas fa-file-alt"></i> Select Test</label>
                    <select id="testSelector" style="width: 100%; padding: 12px; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-color);">
                        <option value="">Loading Tests...</option>
                    </select>
                </div>
                <div id="selectedAnalyticsTestLabel" class="selected-test-label" style="margin-bottom: 12px; font-weight: 600; color: var(--primary-color);">
                    No test selected
                </div>
                <div class="header-actions" style="display: flex; gap: 12px;">
                    <button id="refreshBtn" class="action-btn secondary" style="padding: 12px 20px; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-color); cursor: pointer;"><i class="fas fa-sync"></i> Refresh</button>
                    <button id="publishAnswerKeyBtn" class="action-btn info" disabled style="padding: 12px 20px; border-radius: 12px; background: var(--primary-color); color: white; border: none; cursor: pointer; opacity: 0.5;"><i class="fas fa-envelope"></i> Publish Answer Key</button>
                    <button id="publishAllBtn" class="action-btn success" disabled style="padding: 12px 20px; border-radius: 12px; background: #22c55e; color: white; border: none; cursor: pointer; opacity: 0.5;"><i class="fas fa-paper-plane"></i> Publish All Results</button>
                </div>
            </div>
        </header>

        <!-- Dashboard Content (Hidden until test selected) -->
        <main id="analyticsContent" class="hidden">
            
            <!-- Tab Navigation -->
            <div class="tab-container" style="display: flex; gap: 10px; margin-bottom: 25px;">
                <button class="tab-btn active" data-tab="testOverview">Test Overview</button>
                <button class="tab-btn" data-tab="sectionAnalytics">Section-wise</button>
                <button class="tab-btn" data-tab="questionAnalytics">Question Analysis</button>
                <button class="tab-btn" data-tab="candidatePerformance">Candidates</button>
                <button class="tab-btn" data-tab="overallPerformance">Global Search</button>
            </div>

            <!-- 1. Test Overview -->
            <section id="testOverview" class="tab-content active">
                <div class="stats-grid">
                    <div class="stat-card glass-card">
                        <div class="stat-icon primary"><i class="fas fa-users"></i></div>
                        <div class="stat-info">
                            <h3>Total Candidates</h3>
                            <p id="statTotalCandidates">0</p>
                        </div>
                    </div>
                    <div class="stat-card glass-card">
                        <div class="stat-icon secondary"><i class="fas fa-question-circle"></i></div>
                        <div class="stat-info">
                            <h3>Total Questions</h3>
                            <p id="statTotalQuestions">0</p>
                        </div>
                    </div>
                    <div class="stat-card glass-card">
                        <div class="stat-icon success"><i class="fas fa-star"></i></div>
                        <div class="stat-info">
                            <h3>Average Score</h3>
                            <p id="statAvgScore">0</p>
                        </div>
                    </div>
                    <div class="stat-card glass-card">
                        <div class="stat-icon warning"><i class="fas fa-trophy"></i></div>
                        <div class="stat-info">
                            <h3>Highest Score</h3>
                            <p id="statHighestScore">0</p>
                        </div>
                    </div>
                    <div class="stat-card glass-card">
                        <div class="stat-icon info"><i class="fas fa-percent"></i></div>
                        <div class="stat-info">
                            <h3>Avg Overall %</h3>
                            <p id="statAvgAccuracy">0%</p>
                        </div>
                    </div>
                </div>

                <div class="charts-row">
                    <div class="chart-container glass-card">
                        <h3>Overall % Distribution</h3>
                        <canvas id="scoreDistributionChart"></canvas>
                    </div>
                    <div class="chart-container glass-card">
                        <h3>Section Performance</h3>
                        <canvas id="sectionComparisonChart"></canvas>
                    </div>
                </div>
            </section>

            <!-- 2. Section Analytics -->
            <section id="sectionAnalytics" class="tab-content">
                <div class="table-card glass-card">
                    <div class="table-header">
                        <h2>Section-wise Performance</h2>
                        <button class="export-btn" onclick="exportTable('sectionTable', 'Section_Analytics')">Export CSV</button>
                    </div>
                    <div class="table-wrapper">
                        <table id="sectionTable">
                            <thead>
                                <tr>
                                    <th>Section Name</th>
                                    <th>Total Questions</th>
                                    <th>Total Correct</th>
                                    <th>Total Wrong</th>
                                    <th>Unanswered</th>
                                    <th>Section % (correct/total)</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="sectionTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </section>

            <!-- 3. Question Analytics -->
            <section id="questionAnalytics" class="tab-content">
                <div class="table-card glass-card">
                    <div class="table-header">
                        <h2>Advanced Question Analysis</h2>
                        <div class="filter-group">
                            <input type="text" id="qSearch" placeholder="Search question...">
                            <select id="qSectionFilter"><option value="">All Sections</option></select>
                            <select id="qDifficultyFilter">
                                <option value="">All Difficulties</option>
                                <option value="Easy">Easy</option>
                                <option value="Medium">Medium</option>
                                <option value="Hard">Hard</option>
                            </select>
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table id="questionTable">
                            <thead>
                                <tr>
                                    <th onclick="sortQuestions('QID')">QID <i class="fas fa-sort"></i></th>
                                    <th>Section</th>
                                    <th>Difficulty</th>
                                    <th>Question</th>
                                    <th>Correct</th>
                                    <th>Total Correct</th>
                                    <th>Total Wrong</th>
                                    <th>Unanswered</th>
                                    <th onclick="sortQuestions('accuracy')">Accuracy % <i class="fas fa-sort"></i></th>
                                </tr>
                            </thead>
                            <tbody id="questionTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </section>

            <!-- 4. Candidate Performance -->
            <section id="candidatePerformance" class="tab-content">
                <div class="table-card glass-card">
                    <div class="table-header">
                        <h2>Candidate Results</h2>
                        <div class="filter-group">
                            <input type="text" id="candidateSearch" placeholder="Name, email, Univ ID, or User ID...">
                            <button class="export-btn" id="exportCandidatePdf">Export PDF</button>
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table id="candidateTable">
                            <thead>
                                <tr>
                                    <th onclick="sortCandidates('Rank')">Rank <i class="fas fa-sort"></i></th>
                                    <th onclick="sortCandidates('Name')">Candidate <i class="fas fa-sort"></i></th>
                                    <th onclick="sortCandidates('NetScore')">Net Score <i class="fas fa-sort"></i></th>
                                    <th onclick="sortCandidates('OverallPct')">Overall % <i class="fas fa-sort"></i></th>
                                    <th>C / W / U</th>
                                    <th>Percentile</th>
                                    <th>Published</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="candidateTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </section>

            <!-- 5. Overall Performance (Global Search) -->
            <section id="overallPerformance" class="tab-content">
                <div class="search-container glass-card">
                    <div class="global-search-box">
                        <input type="text" id="globalCandidateSearch" placeholder="Name, email, Univ ID, or User ID...">
                        <button id="globalSearchBtn" class="action-btn primary">Search Candidate</button>
                    </div>
                </div>
                
                <div id="globalResultContainer" class="hidden">
                    <div class="global-summary-grid">
                        <div class="summary-card glass-card">
                            <h3>Exams Attended</h3>
                            <p id="globalTotalExams">0</p>
                        </div>
                        <div class="summary-card glass-card">
                            <h3>Avg Overall %</h3>
                            <p id="globalAvgScore">0%</p>
                        </div>
                        <div class="summary-card glass-card">
                            <h3>Strongest Section</h3>
                            <p id="globalStrongestSec">-</p>
                        </div>
                        <div class="summary-card glass-card">
                            <h3>Avg Percentile</h3>
                            <p id="globalAvgAccuracy">0 %ile</p>
                        </div>
                    </div>
                    
                    <div class="global-charts-row">
                        <div class="chart-container glass-card">
                            <h3>Score Progression</h3>
                            <canvas id="progressionChart"></canvas>
                        </div>
                    </div>
                </div>
            </section>

        </main>

        <!-- Loading Overlay -->
        <div id="loadingOverlay" class="hidden">
            <div class="loader"></div>
            <p>Fetching Analytics...</p>
        </div>

        <!-- Section Detail Modal -->
        <div id="sectionModal" class="modal hidden">
            <div class="modal-content glass-card">
                <div class="modal-header">
                    <h2 id="modalSectionName">Section Details</h2>
                    <span class="close-modal" onclick="closeSectionModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="section-stats-grid">
                        <div class="stat-card glass-card">
                            <h3>Section Percentage</h3>
                            <p id="modalSectionPercentage">0%</p>
                        </div>
                        <div class="stat-card glass-card">
                            <h3>Total Questions</h3>
                            <p id="modalSectionTotal">0</p>
                        </div>
                        <div class="stat-card glass-card">
                            <h3>Correct Answers</h3>
                            <p id="modalSectionCorrect">0</p>
                        </div>
                        <div class="stat-card glass-card">
                            <h3>Wrong Answers</h3>
                            <p id="modalSectionWrong">0</p>
                        </div>
                        <div class="stat-card glass-card">
                            <h3>Unanswered</h3>
                            <p id="modalSectionUnanswered">0</p>
                        </div>
                        <div class="stat-card glass-card">
                            <h3>Avg %ile in Section</h3>
                            <p id="modalSectionPercentile">0</p>
                        </div>
                    </div>
                    <div class="section-questions" style="margin-top: 30px;">
                        <h3>Question Performance in Section</h3>
                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>QID</th>
                                        <th>Question</th>
                                        <th>Accuracy %</th>
                                        <th>Correct</th>
                                        <th>Wrong</th>
                                        <th>Unanswered</th>
                                    </tr>
                                </thead>
                                <tbody id="modalSectionQuestionsBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="section-candidates">
                        <h3>Candidate Performance in Section</h3>
                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Candidate Name</th>
                                        <th>Section % </th>
                                        <th>Correct</th>
                                        <th>Wrong</th>
                                        <th>Unanswered</th>
                                    </tr>
                                </thead>
                                <tbody id="modalSectionCandidatesBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button onclick="closeSectionModal()" class="glass-btn">Close</button>
                </div>
            </div>
        </div>

        <!-- Candidate Detail Modal -->
        <div id="candidateModal" class="modal hidden">
            <div class="modal-content glass-card">
                <div class="modal-header">
                    <h2 id="modalCandidateName">Candidate Detail</h2>
                    <span class="close-modal" onclick="closeCandidateModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="candidate-meta">
                        <p id="modalCandidateEmail"></p>
                        <p id="modalCandidateId"></p>
                    </div>
                    <div id="modalScoreSummary"></div>
                    <div class="modal-responses">
                        <h3>Detailed Responses</h3>
                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>QID</th>
                                        <th>Section</th>
                                        <th>Question</th>
                                        <th>Your Ans</th>
                                        <th>Correct</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody id="modalResponsesBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="modalPublishBtn" class="action-btn success">Publish Result</button>
                    <button onclick="closeCandidateModal()" class="glass-btn">Close</button>
                </div>
            </div>
        </div>

    </div>
`;

const malpracticesPanelHTML = `
    <div class="admin-inner-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
            <div>
                <h3 style="margin: 0;">Integrity Monitoring Log</h3>
                <p style="color: var(--muted-text); margin-top: 5px;">Real-time tracking of examination violations and anti-cheat triggers.</p>
            </div>
            <button id="refreshMalBtn" class="action-btn secondary" style="padding: 10px 20px; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-color); cursor: pointer;"><i class="fas fa-sync"></i> Refresh Log</button>
        </div>

        <div style="margin-bottom:20px; display:flex; gap:15px; align-items:center;">
            <select id="testFilter" style="padding: 12px; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-color); min-width: 200px;">
                <option value="all">All Examinations</option>
            </select>
            <div style="flex: 1; position: relative;">
                <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--muted-text);"></i>
                <input id="searchInput" placeholder="Search by name, email or ID..." style="width: 100%; padding: 12px 12px 12px 45px; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-color);">
            </div>
        </div>

        <div class="table-wrapper" style="overflow-x: auto; border-radius: 16px; border: 1px solid var(--border-color);">
            <table style="width: 100%; border-collapse: collapse; min-width: 800px;">
                <thead style="background: rgba(255,255,255,0.02); text-align: left;">
                    <tr>
                        <th style="padding: 15px;">Candidate</th>
                        <th style="padding: 15px;">Test</th>
                        <th style="padding: 15px;">FS Violations</th>
                        <th style="padding: 15px;">Tab Switches</th>
                        <th style="padding: 15px;">Auto Submitted</th>
                        <th style="padding: 15px;">Timestamp</th>
                    </tr>
                </thead>
                <tbody id="malBody">
                    <tr><td colspan="6" style="text-align:center; padding:40px; color:var(--muted-text);">Initializing security log...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
`;

function initMalpractices() {
    debugLog('INFO', 'MALPRACTICE', 'Initializing internal panel');
    
    const refreshBtn = document.getElementById('refreshMalBtn');
    if (refreshBtn) refreshBtn.onclick = () => initMalpractices();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#malBody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(val) ? '' : 'none';
        });
    };

    // Load data
    api.get('getMalpracticeLogs').then(res => {
        const body = document.getElementById('malBody');
        if (!body) return;
        
        if (!res || !Array.isArray(res)) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">No violations found.</td></tr>';
            return;
        }

        body.innerHTML = res.map(log => `
            <tr>
                <td style="padding:15px;">
                    <strong>${log.name || 'Unknown'}</strong>
                    <div style="font-size:0.8rem; color:var(--muted-text);">${log.userID}</div>
                </td>
                <td style="padding:15px;">${log.testId}</td>
                <td style="padding:15px; color:#ef4444;">${log.fullscreenViolations || 0}</td>
                <td style="padding:15px; color:#f59e0b;">${log.tabSwitchCount || 0}</td>
                <td style="padding:15px;">${log.autoSubmitted ? 'Yes' : 'No'}</td>
                <td style="padding:15px; font-size:0.85rem;">${new Date(log.timestamp).toLocaleString()}</td>
            </tr>
        `).join('');
    });
}

function initAnalytics() {
    debugLog('INFO', 'ANALYTICS', 'Initializing internal panel');
    
    // Check if module is loaded, if not, it might need to wait for script injection or already be global
    if (typeof window.initAnalytics === 'function') {
        window.initAnalytics();
    } else {
        debugLog('WARN', 'ANALYTICS', 'Module not yet ready, searching for testSelector');
        const selector = document.getElementById('testSelector');
        if (selector) {
            api.get('getAllTests').then(tests => {
                const list = Array.isArray(tests) ? tests : (tests.data || []);
                selector.innerHTML = '<option value="">Select an Examination</option>' + 
                    list.map(t => `<option value="${t.TestID}">${t.Name} (${t.TestID})</option>`).join('');
                
                selector.onchange = (e) => {
                    const testId = e.target.value;
                    if (testId && typeof loadTestAnalytics === 'function') {
                        document.getElementById('analyticsContent')?.classList.remove('hidden');
                        loadTestAnalytics(testId);
                    }
                };
            });
        }
    }

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.onclick = () => {
        const testId = document.getElementById('testSelector')?.value;
        if (testId && typeof loadTestAnalytics === 'function') loadTestAnalytics(testId);
    };

    // Tab buttons in internal panel
    const tabBtns = document.querySelectorAll('.admin-inner-panel .tab-btn');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            const target = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.admin-inner-panel .tab-content').forEach(c => {
                c.classList.add('hidden');
                c.classList.remove('active');
            });
            
            const content = document.getElementById(target);
            if (content) {
                content.classList.remove('hidden');
                content.classList.add('active');
            }
        };
    });
}

function closeAdminInnerSection() {
    const panel = document.getElementById("adminInnerPanel");
    const content = document.getElementById("adminInnerContent");

    if (!panel || !content) return;

    panel.classList.remove("show");
    content.innerHTML = "";
    document.body.classList.remove("admin-inner-open");
}

function openAdminInnerSection(title, htmlContent) {
    const panel = document.getElementById("adminInnerPanel");
    const titleEl = document.getElementById("adminInnerTitle");
    const content = document.getElementById("adminInnerContent");

    if (!panel || !titleEl || !content) return;

    titleEl.textContent = title;
    content.innerHTML = htmlContent;
    panel.classList.add("show");
    document.body.classList.add("admin-inner-open");
    
    // Smooth scroll to top
    panel.scrollTop = 0;
}

// Global Event Listeners for Panel
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("closeAdminInnerPanel")?.addEventListener("click", closeAdminInnerSection);
});

async function adminLogout() {
    if (window.__adminLogoutInProgress) return;
    window.__adminLogoutInProgress = true;

    const confirmed = await showConfirm(
        "Are you sure you want to logout?",
        "Confirm Logout"
    );

    if (!confirmed) {
        window.__adminLogoutInProgress = false;
        return;
    }

    const user = JSON.parse(
        localStorage.getItem("cbt_user") || "null"
    );

    if (typeof showAdminExitLoader === 'function') {
        showAdminExitLoader();
    }

    try {
        const logoutRequest = user?.sessionToken
            ? api.post({
                action: "logoutSession",
                sessionToken: user.sessionToken
            })
            : Promise.resolve({ success: true });

        const timeout = new Promise(resolve =>
            setTimeout(() => resolve({ timeout: true }), 1200)
        );

        await Promise.race([
            logoutRequest,
            timeout
        ]);

    } catch (err) {
        console.warn(
            "Backend logout failed or timed out:",
            err
        );

    } finally {
        localStorage.removeItem("cbt_user");
        localStorage.removeItem("admin_token");
        sessionStorage.clear();

        setTimeout(() => {
            window.location.replace("./admin.html");
        }, 350);
    }
}

/* ================= AUTH ================= */

/**
 * Tab Indentation Support for Textareas (v3.0 Formatting Safe)
 */
function setupTabSupport(textarea) {
    if (!textarea) return;
    
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;

            // Set textarea value to: text before caret + tab + text after caret
            this.value = this.value.substring(0, start) + "    " + this.value.substring(end);

            // Put caret in right position
            this.selectionStart = this.selectionEnd = start + 4;
            
            // Trigger input event for change tracking
            this.dispatchEvent(new Event('input'));
        }
    });
}

/* ================= DASHBOARD ================= */

async function initDashboard() {
    const startTime = Date.now();
    try {
        setLoading(true);

        const res = await api.get('getAllTests');
        allTests = Array.isArray(res) ? res : (res.data || []);
        
        // Tests loaded

        document.getElementById('totalTests').innerText = allTests.length;
        renderTests(allTests);
        populateCSVSelect(allTests);

        const usersResponse = await api.get('getAllUsers');
        const allUsers = Array.isArray(usersResponse) ? usersResponse : (usersResponse.data || []);
        populateNotificationControls(allTests, allUsers);

        // Dashboard loaded
    } catch (err) {
        debugLog('ERROR', 'ADMIN', 'Dashboard Init Failed', err.message);
        document.getElementById('backendStatus').innerText = 'Offline';
    } finally {
        setLoading(false);
    }
}

function renderTests(tests) {
    const startTime = Date.now();
    const tbody = document.getElementById('adminTestList');

    tbody.innerHTML = tests.map(t => {
        const status = t.status; // Available (Active), Upcoming, Closed (Ended)
        const isActive = status === 'Available';

        return `
            <tr>
                <td>
                    <div style="font-weight:700;">${t.Name}</div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">ID: ${t.TestID}</div>
                </td>
                <td>${t.Date}</td>
                <td>
                    <div style="font-size:0.85rem;">${t.StartTimeDisplay || t.StartTime} - ${t.ExpiryTimeDisplay || t.ExpiryTime}</div>
                    <div style="font-size:0.7rem; color:#94a3b8; margin-top:2px;">(Duration: ${t.Duration}m)</div>
                </td>
                <td>
                    <span class="status-pill status-${status.toLowerCase()}">
                        <i class="fa-solid ${isActive ? 'fa-circle-check' : (status === 'Upcoming' ? 'fa-clock' : 'fa-circle-xmark')}"></i>
                        ${status}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="viewTestResults('${t.TestID}')" class="table-btn view-btn" title="View Results">
                            <i class="fa-solid fa-chart-simple"></i>
                        </button>
                        <button onclick="openQuestionManager('${t.TestID}')" class="table-btn" title="Manage Questions" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.2);">
                            <i class="fa-solid fa-list-check"></i>
                        </button>
                        <button onclick="toggleLiveLeaderboard(event, '${t.TestID}', ${t.liveLeaderboardEnabled !== false})" class="table-btn" title="${t.liveLeaderboardEnabled !== false ? 'Disable Live Leaderboard' : 'Enable Live Leaderboard'}" style="background: ${t.liveLeaderboardEnabled !== false ? 'rgba(34, 197, 94, 0.15)' : 'rgba(107, 114, 128, 0.15)'}; color: ${t.liveLeaderboardEnabled !== false ? '#22c55e' : '#9ca3af'}; border: 1px solid ${t.liveLeaderboardEnabled !== false ? 'rgba(34, 197, 94, 0.2)' : 'rgba(107, 114, 128, 0.2)'}; ">
                            <i class="fa-solid fa-trophy"></i>
                        </button>
                        <button onclick="editTest('${t.TestID}')" class="table-btn edit-btn" title="Full Test Editor" style="background: rgba(37, 99, 235, 0.15); color: #60a5fa; border: 1px solid rgba(37, 99, 235, 0.2);">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="deleteTest('${t.TestID}')" class="table-btn delete-btn" title="Delete Test" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2);">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    // Test table rendered
}

async function deleteTest(testId) {
    if (!(await showDeleteConfirm('Are you sure you want to delete this test? All related questions and results will be permanently removed.', 'Delete Test'))) return;

    if (typeof showAdminActionVerifyLoader === 'function') {
        showAdminActionVerifyLoader({
            title: "Verifying Delete Action",
            message: `Securing permanent removal for Test ID: ${testId}...`,
            steps: ["Authenticating administrator", "Verifying test dependency", "Deleting secure data"]
        });
    }

    try {
        const res = await api.post({
            action: 'deleteTest',
            testId
        });

        if (res.success) {
            if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();
            alert('✅ Test deleted successfully');
            initDashboard();
        } else {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            throw new Error(res.error || 'Failed to delete test');
        }
    } catch (err) {
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        alert('❌ Error: ' + err.message);
    }
}

async function toggleLiveLeaderboard(event, testId, currentEnabled) {
    const btn = event?.target || document.querySelector(`button[onclick*="toggleLiveLeaderboard('${testId}'"])`);
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        const newEnabled = !currentEnabled;
        const res = await api.post({
            action: 'toggleLiveLeaderboard',
            testId,
            enabled: newEnabled
        });
        if (res.success) {
            alert(`✅ Live leaderboard ${newEnabled ? 'enabled' : 'disabled'} successfully`);
            initDashboard();
        } else {
            throw new Error(res.error || 'Failed to toggle live leaderboard');
        }
    } catch (err) {
        alert('❌ Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/* ================= LOADING ================= */

function setLoading(state) {
    // Loading overlay toggled
    document.body.style.opacity = state ? "0.6" : "1";
    document.body.style.pointerEvents = state ? "none" : "auto";
}

/* ================= TEST WIZARD ================= */

/* ================= TEST WIZARD ================= */

async function openWizard() {
    debugLog('INFO', 'MODAL', 'Opening Test Wizard Check');
    
    // Check for drafts first
    try {
        const drafts = await api.post({ action: 'getTestDrafts' });
        if (drafts && drafts.length > 0) {
            showResumeModal(drafts);
            return;
        }
    } catch (e) {
        debugLog('WARN', 'DRAFTS', 'Failed to fetch drafts', e.message);
    }

    openWizardActual();
}

function openWizardActual() {
    debugLog('INFO', 'MODAL', 'Opening Test Wizard');
    isEditMode = false;
    editingTestId = null;
    currentDraftID = null;
    isDraftDirty = false;
    
    // Update UI titles
    const wizardTitle = document.querySelector('#step1 h2');
    if (wizardTitle) wizardTitle.innerText = 'Configure New Test';
    const nextBtn = document.querySelector('#formStep1 button[type="submit"]');
    if (nextBtn) nextBtn.innerHTML = 'Initialize Questions <i class="fa-solid fa-arrow-right" style="margin-left: 8px;"></i>';

    document.getElementById('testWizard').style.display = 'block';
    document.getElementById('step1').style.display = 'block';
    document.getElementById('step2').style.display = 'none';
    
    // Reset indicators
    document.getElementById('s1').className = 'step active';
    document.getElementById('s2').className = 'step';
    resetWizard();

    // Start autosave heartbeat
    startAutosaveHeartbeat();
}

function showResumeModal(drafts) {
    const modal = document.getElementById('resumeDraftModal');
    const area = document.getElementById('draftListArea');
    
    area.innerHTML = drafts.map(d => {
        const testData = d.TestData || {};
        const questions = d.Questions || [];
        const sections = testData.sections || [];
        
        return `
            <div class="draft-card" style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 16px; transition: 0.3s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <div style="font-weight: 800; color: #fff; font-size: 1.1rem;">${d.DraftName}</div>
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">
                            <i class="fa-solid fa-clock-rotate-left"></i> Saved ${new Date(d.UpdatedAt).toLocaleString()}
                        </div>
                    </div>
                    <span class="status-pill status-upcoming" style="font-size: 0.7rem; padding: 4px 10px;">DRAFT</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                    <div style="background: rgba(37,99,235,0.1); padding: 10px; border-radius: 12px; text-align: center;">
                        <div style="font-size: 0.7rem; color: #60a5fa; text-transform: uppercase; font-weight: 700;">Questions</div>
                        <div style="font-weight: 800; color: #fff;">${questions.length}</div>
                    </div>
                    <div style="background: rgba(16,185,129,0.1); padding: 10px; border-radius: 12px; text-align: center;">
                        <div style="font-size: 0.7rem; color: #4ade80; text-transform: uppercase; font-weight: 700;">Sections</div>
                        <div style="font-weight: 800; color: #fff;">${sections.length}</div>
                    </div>
                </div>

                <div style="display: flex; gap: 10px;">
                    <button onclick="resumeDraft('${d.DraftID}')" class="glass-btn primary" style="flex: 2; padding: 10px; font-size: 0.85rem;">
                        <i class="fa-solid fa-file-import"></i> Resume
                    </button>
                    <button onclick="deleteDraftFromModal('${d.DraftID}', this)" class="glass-btn" style="flex: 1; padding: 10px; font-size: 0.85rem; background: rgba(239, 68, 68, 0.1); color: #f87171; border-color: rgba(239, 68, 68, 0.2);">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    modal.style.display = 'block';
}

async function createNewDraftSafe() {
    if (isDraftDirty || currentDraftID) {
        const confirmed = await showConfirm(
            "Starting a new test will close your current draft. Any unsaved changes will be lost. Continue?",
            "Start New Test"
        );
        if (!confirmed) return;
    }
    
    closeResumeModal();
    openWizardActual();
}

function closeResumeModal() {
    document.getElementById('resumeDraftModal').style.display = 'none';
}

async function resumeDraft(draftId) {
    try {
        setLoading(true);
        const draft = await api.post({ action: 'getTestDraft', DraftID: draftId });
        closeResumeModal();
        
        // Populate Wizard Step 1
        currentDraftID = draft.DraftID;
        document.getElementById('wName').value = draft.TestData.name || '';
        document.getElementById('wDate').value = draft.TestData.date || '';
        document.getElementById('wStart').value = draft.TestData.startTime || '';
        document.getElementById('wExpiry').value = draft.TestData.expiryTime || '';
        document.getElementById('wDuration').value = draft.TestData.duration || '';
        
        const container = document.getElementById('sectionsContainer');
        container.innerHTML = '';
        if (draft.TestData.sections) {
            draft.TestData.sections.forEach(sec => {
                const div = document.createElement('div');
                div.className = 'section-input';
                div.style = 'display:flex; gap:15px; margin-bottom:15px; align-items: center; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.05);';
                div.innerHTML = `
                    <div style="flex: 2;">
                        <input type="text" placeholder="Section Name" class="s-name" value="${sec.name}" required style="margin-top:0;">
                    </div>
                    <div style="flex: 1;">
                        <input type="number" placeholder="Count" class="s-count" value="${sec.count}" required style="margin-top:0;">
                    </div>
                    <button type="button" onclick="this.parentElement.remove()" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1.2rem; padding: 5px;">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `;
                container.appendChild(div);
            });
        }

        // Open Wizard
        document.getElementById('testWizard').style.display = 'block';
        document.getElementById('step1').style.display = 'block';
        document.getElementById('step2').style.display = 'none';
        document.getElementById('s1').className = 'step active';
        document.getElementById('s2').className = 'step';

        // If it has questions, go to step 2
        if (draft.Questions && draft.Questions.length > 0) {
            renderQuestionWizard(draft.TestData.sections);
            // Populate questions
            const cards = document.querySelectorAll('.wizard-q-card');
            draft.Questions.forEach((q, idx) => {
                if (cards[idx]) {
                    cards[idx].querySelector('.q-text').value = q.question || '';
                    cards[idx].querySelector('.q-diff').value = q.difficulty || 'Medium';
                    cards[idx].querySelector('.q-correct').value = q.correct || '';
                    cards[idx].querySelector('.q-a').value = q.a || '';
                    cards[idx].querySelector('.q-b').value = q.b || '';
                    cards[idx].querySelector('.q-c').value = q.c || '';
                    cards[idx].querySelector('.q-d').value = q.d || '';
                }
            });
            updateWizardProgress(draft.Questions.length);
            
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            document.getElementById('s1').className = 'step completed';
            document.getElementById('s2').className = 'step active';
        }

        startAutosaveHeartbeat();
        setLoading(false);
    } catch (e) {
        setLoading(false);
        alert('Failed to resume draft: ' + e.message);
    }
}

async function deleteDraftFromModal(draftId, btn) {
    if (!confirm('Delete this draft permanently?')) return;
    try {
        await api.post({ action: 'deleteTestDraft', DraftID: draftId });
        btn.parentElement.parentElement.remove();
        if (document.getElementById('draftListArea').children.length === 0) {
            closeResumeModal();
            openWizardActual();
        }
    } catch (e) {
        alert('Delete failed');
    }
}

function startAutosaveHeartbeat() {
    if (autosaveInterval) clearInterval(autosaveInterval);
    
    // Mark dirty on any input change
    document.getElementById('testWizard').addEventListener('input', () => {
        isDraftDirty = true;
    }, { once: false });

    autosaveInterval = setInterval(() => {
        if (isDraftDirty) {
            saveDraftSilently();
        }
    }, 30000); // 30 seconds
}

async function saveDraftSilently() {
    if (!isDraftDirty) return;
    
    const statusEl = document.getElementById('draftStatus');
    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving draft...';

    try {
        const payload = collectDraftPayload();
        const res = await api.post({
            action: 'saveTestDraft',
            DraftID: currentDraftID,
            DraftName: payload.TestData.name || 'Untitled Test Draft',
            TestData: payload.TestData,
            Questions: payload.Questions
        });

        if (res.success) {
            currentDraftID = res.DraftID;
            isDraftDirty = false;
            if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-cloud-check"></i> Draft saved at ${new Date().toLocaleTimeString()}`;
            setTimeout(() => { if (!isDraftDirty && statusEl) statusEl.innerHTML = ''; }, 3000);
        } else {
            throw new Error(res.error || "Backend error");
        }
    } catch (e) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#f87171;"><i class="fa-solid fa-triangle-exclamation"></i> Save failed — retrying</span>';
    }
}

async function manualSaveDraft() {
    isDraftDirty = true;
    await saveDraftSilently();
    alert('✅ Draft saved successfully');
}

function collectDraftPayload() {
    const sections = [];
    document.querySelectorAll('.section-input').forEach(div => {
        sections.push({
            name: div.querySelector('.s-name').value,
            count: parseInt(div.querySelector('.s-count').value)
        });
    });

    const testData = {
        name: document.getElementById('wName').value,
        date: document.getElementById('wDate').value,
        startTime: document.getElementById('wStart').value,
        expiryTime: document.getElementById('wExpiry').value,
        duration: parseInt(document.getElementById('wDuration').value),
        sections,
        mode: 'scheduled'
    };

    const questions = [];
    document.querySelectorAll('.wizard-q-card').forEach(card => {
        questions.push({
            section: card.querySelector('.q-sec').value.trim(),
            qid: card.querySelector('.q-id').value.trim(),
            difficulty: card.querySelector('.q-diff').value.trim(),
            question: String(card.querySelector('.q-text').value || ''),
            a: String(card.querySelector('.q-a').value || ''),
            b: String(card.querySelector('.q-b').value || ''),
            c: String(card.querySelector('.q-c').value || ''),
            d: String(card.querySelector('.q-d').value || ''),
            correct: card.querySelector('.q-correct').value.trim().toUpperCase()
        });
    });

    return { TestData: testData, Questions: questions };
}

async function editTest(testId) {
    const test = allTests.find(t => t.TestID === testId);
    if (!test) {
        await showError('Test not found');
        return;
    }

    const status = test.status;

    if (status === 'Closed') {
        const confirmed = await showActionConfirm(
            'This exam has ENDED. Editing ended exams will affect historical results and reports. Are you sure you want to proceed?',
            'Edit Ended Exam',
            'Proceed'
        );
        if (!confirmed) return;
    }

    if (status === 'Available') {
        const confirmed = await showActionConfirm(
            'This exam is currently ACTIVE. Editing during a live exam may affect candidates. Proceed?',
            'Edit Active Exam',
            'Proceed'
        );
        if (!confirmed) return;
    }

    openTestConfigEditor(testId, test);
}

function openTestConfigEditor(testId, test) {
    editingTestId = testId;
    const modal = document.getElementById('testEditorModal');
    const badge = document.getElementById('editorStatusBadge');
    
    // Set Status Badge
    badge.className = `status-pill status-${test.status.toLowerCase()}`;
    badge.innerHTML = `<i class="fa-solid ${test.status === 'Available' ? 'fa-circle-check' : (test.status === 'Upcoming' ? 'fa-clock' : 'fa-circle-xmark')}"></i> ${test.status}`;

    // Fill Metadata
    document.getElementById('edName').value = test.Name;
    document.getElementById('edDate').value = test.Date;
    document.getElementById('edStart').value = test.StartTime;
    document.getElementById('edExpiry').value = test.ExpiryTime;
    document.getElementById('edDuration').value = test.Duration;
    // Set ExamType
    document.getElementById('edExamType').value = test.ExamType || 'standard';
    // Set QuickResult checkbox
    const quickResultValue = test.QuickResult === true || String(test.QuickResult).toLowerCase() === 'true';
    document.getElementById('edQuickResult').checked = quickResultValue;

    // Attach download paper logic
    document.getElementById('downloadPaperBtn').onclick = () => {
        if (typeof showAdminActionVerifyLoader === 'function') {
            showAdminActionVerifyLoader({
                title: "Preparing Question Paper",
                message: "Fetching secure question bank and generating PDF...",
                steps: ["Authenticating administrator", "Collecting exam questions", "Generating secure document"]
            });
        }
        
        // Download triggered
        downloadQuestionPaper(testId, test.Name);
    };
    
    // Attach delete logic
    document.getElementById('deleteTestBtn').onclick = () => {
        // Delete from editor
        closeFullEditor();
        deleteTest(testId);
    };

    modal.style.display = 'block';
}

function closeFullEditor() {
    debugLog('INFO', 'MODAL', 'Closing Test Editor');
    document.getElementById('testEditorModal').style.display = 'none';
    initDashboard(); // Refresh main table
}

// Metadata Update Listener
document.getElementById('editorMetadataForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Metadata update submitted
    
    const btn = document.getElementById('saveMetadataBtn');
    const originalText = btn.innerHTML;

    const testData = {
        name: document.getElementById('edName').value.trim(),
        date: document.getElementById('edDate').value,
        startTime: document.getElementById('edStart').value,
        expiryTime: document.getElementById('edExpiry').value,
        duration: parseInt(document.getElementById('edDuration').value),
        examType: document.getElementById('edExamType').value,
        quickResult: document.getElementById('edQuickResult').checked
    };

    try {
        if (typeof showAdminActionVerifyLoader === 'function') {
            showAdminActionVerifyLoader({
                title: "Verifying Configuration",
                message: `Securing metadata updates for Test ID: ${editingTestId}...`,
                steps: ["Authenticating administrator", "Validating schema integrity", "Updating secure records"]
            });
        }

        const res = await api.post({
            action: 'updateTest',
            testId: editingTestId,
            testData
        });

        if (res.success) {
            if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();
            // Metadata updated
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Configuration Updated';
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }, 2000);
        } else {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            throw new Error(res.error);
        }
    } catch (err) {
        debugLog('ERROR', 'ADMIN', 'Metadata Update Failed', err.message);
        alert("Update failed: " + err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

function closeWizard() {
    debugLog('INFO', 'MODAL', 'Closing Test Wizard');
    if (isDraftDirty) {
        saveDraftSilently();
    }
    if (autosaveInterval) clearInterval(autosaveInterval);
    document.getElementById('testWizard').style.display = 'none';
}

function resetWizard() {
    debugLog('INFO', 'STATE', 'Resetting Wizard State');
    currentWizardData = {};
    currentDraftID = null;
    isDraftDirty = false;
    document.getElementById('draftStatus').innerHTML = '';
    document.getElementById('formStep1')?.reset();
    document.getElementById('sectionsContainer').innerHTML = '';
    document.getElementById('questionWizardArea').innerHTML = '';

    document.getElementById('step1').style.display = 'block';
    document.getElementById('step2').style.display = 'none';
}

function addSectionRow() {
    debugLog('INFO', 'WIZARD', 'Adding Section Row');
    const container = document.getElementById('sectionsContainer');
    const div = document.createElement('div');
    div.className = 'section-input';
    div.style = 'display:flex; gap:15px; margin-bottom:15px; align-items: center; padding: 15px; border-radius: 14px;';

    div.innerHTML = `
        <div style="flex: 2;">
            <input type="text" placeholder="Section Name" class="s-name" required style="margin-top:0;">
        </div>
        <div style="flex: 1;">
            <input type="number" placeholder="Count" class="s-count" required style="margin-top:0;">
        </div>
        <button type="button" onclick="this.parentElement.remove(); debugLog('INFO', 'WIZARD', 'Section Row Removed');" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1.2rem; padding: 5px;">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;

    container.appendChild(div);
}

/* ================= STEP 1 SUBMIT ================= */

document.getElementById('formStep1')?.addEventListener('submit', (e) => {
    e.preventDefault();
    debugLog('INFO', 'WIZARD', 'Step 1 Submitted');

    const sections = [];

    document.querySelectorAll('.section-input').forEach(div => {
        sections.push({
            name: div.querySelector('.s-name').value,
            count: parseInt(div.querySelector('.s-count').value)
        });
    });

    if (sections.length === 0) {
        debugLog('WARN', 'WIZARD', 'Submission blocked: No sections added');
        return alert("Add at least one section");
    }

    currentWizardData = {
        name: document.getElementById('wName').value,
        date: document.getElementById('wDate').value,
        startTime: document.getElementById('wStart').value,
        expiryTime: document.getElementById('wExpiry').value,
        duration: parseInt(document.getElementById('wDuration').value),
        sections,
        mode: 'scheduled',
        examType: document.getElementById('wExamType').value,
        quickResult: document.getElementById('wQuickResult').checked
    };

    debugLog('STATE', 'WIZARD', 'Step 1 Config Data', currentWizardData);

    if (isEditMode) {
        // Handle Update immediately for metadata
        handleUpdateMetadata();
        return;
    }

    renderQuestionWizard(sections);

    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';

    // Update indicators
    document.getElementById('s1').className = 'step completed';
    document.getElementById('s2').className = 'step active';
});

// Explicit Enter Key Support for Wizard Step 1
document.querySelectorAll('#formStep1 input').forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('formStep1').requestSubmit();
        }
    });
});

async function handleUpdateMetadata() {
    try {
        if (typeof showAdminActionVerifyLoader === 'function') {
            showAdminActionVerifyLoader({
                title: "Verifying Test Update",
                message: `Securing metadata updates for Test ID: ${editingTestId}...`,
                steps: ["Authenticating administrator", "Validating schema integrity", "Updating secure records"]
            });
        }

        const expiry = new Date(currentWizardData.date + " " + currentWizardData.expiryTime);
        const systemEnd = new Date(expiry.getTime() + (currentWizardData.duration * 60000) + (5 * 60000));
        currentWizardData.endTime = systemEnd.toTimeString().slice(0, 5);

        const res = await api.post({
            action: 'updateTest',
            testId: editingTestId,
            testData: currentWizardData
        });

        if (res.success) {
            if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();
            alert("✅ Test Updated Successfully");
            closeWizard();
            initDashboard();
        } else {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            throw new Error(res.error || "Update failed");
        }
    } catch (err) {
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        // Error loading form
        alert("❌ Error: " + err.message);
    }
}

/* ================= QUESTION BUILDER ================= */

function renderQuestionWizard(sections) {
    const area = document.getElementById('questionWizardArea');
    area.innerHTML = '';

    let qCounter = 1;
    let totalQs = sections.reduce((acc, sec) => acc + parseInt(sec.count), 0);
    document.getElementById('wizardQProgress').innerText = `0 / ${totalQs} Questions`;

    sections.forEach(sec => {
        for (let i = 0; i < sec.count; i++) {

            const div = document.createElement('div');
            div.className = 'wizard-q-card';

            div.innerHTML = `
                <h4>
                    <span>Question ${qCounter}</span>
                    <span class="section-badge">${sec.name}</span>
                </h4>

                <input type="hidden" class="q-sec" value="${sec.name}">
                <input type="hidden" class="q-id" value="Q${qCounter}">

                <div class="q-grid">
                    
                    <div class="q-full">
                        <label>Question Text</label>
                        <textarea class="q-text" placeholder="Type your question here..." required style="min-height: 100px;" spellcheck="false" wrap="off"></textarea>
                    </div>

                    <div class="form-group">
                        <label>Difficulty</label>
                        <select class="q-diff">
                            <option>Easy</option>
                            <option selected>Medium</option>
                            <option>Hard</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Correct Answer</label>
                        <select class="q-correct">
                            <option value="">Select Correct Option</option>
                            <option value="A">Option A</option>
                            <option value="B">Option B</option>
                            <option value="C">Option C</option>
                            <option value="D">Option D</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Option A</label>
                        <textarea class="q-a format-safe" placeholder="Enter Option A" required spellcheck="false" wrap="off"></textarea>
                    </div>

                    <div class="form-group">
                        <label>Option B</label>
                        <textarea class="q-b format-safe" placeholder="Enter Option B" required spellcheck="false" wrap="off"></textarea>
                    </div>

                    <div class="form-group">
                        <label>Option C</label>
                        <textarea class="q-c format-safe" placeholder="Enter Option C" required spellcheck="false" wrap="off"></textarea>
                    </div>

                    <div class="form-group">
                        <label>Option D</label>
                        <textarea class="q-d format-safe" placeholder="Enter Option D" required spellcheck="false" wrap="off"></textarea>
                    </div>

                </div>
            `;

            // Apply Tab Support to all textareas in this card
            div.querySelectorAll('textarea').forEach(setupTabSupport);

            // Add change listener to update progress
            div.querySelectorAll('input, textarea, select').forEach(input => {
                input.addEventListener('change', () => updateWizardProgress(totalQs));
                
                // Add Enter key support for quick navigation/saving
                if (input.tagName !== 'TEXTAREA') {
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            // If it's the last question's last field, maybe trigger save?
                            // For now, just blur to trigger change
                            input.blur();
                        }
                    });
                }
            });

            area.appendChild(div);
            qCounter++;
        }
    });
}

function updateWizardProgress(total) {
    let completed = 0;
    document.querySelectorAll('.wizard-q-card').forEach(card => {
        const text = card.querySelector('.q-text').value;
        const a = card.querySelector('.q-a').value;
        const correct = card.querySelector('.q-correct').value;
        if (text && a && correct) completed++;
    });
    document.getElementById('wizardQProgress').innerText = `${completed} / ${total} Questions`;
    
    if (completed === total) {
        document.getElementById('wizardQProgress').style.background = 'rgba(22,163,74,0.2)';
        document.getElementById('wizardQProgress').style.color = '#4ade80';
    } else {
        document.getElementById('wizardQProgress').style.background = 'rgba(37,99,235,0.15)';
        document.getElementById('wizardQProgress').style.color = '#60a5fa';
    }
}

/* ================= SAVE TEST ================= */

let saveAllWizardInProgress = false;

// Helper to validate HH:mm time
function isValidTime(time) {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

// Helper to get end time string from date + time + duration
function calculateEndTime(dateStr, timeStr, durationMinutes) {
    try {
        const fullDateStr = `${dateStr}T${timeStr}`;
        const date = new Date(fullDateStr);
        date.setMinutes(date.getMinutes() + durationMinutes + 5); // Add 5 minutes buffer
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (err) {
        console.error('[MANUAL TEST] End time calculation error:', err);
        return timeStr;
    }
}

async function saveAllWizard() {
    if (saveAllWizardInProgress) {
        return; // Prevent double submission
    }
    saveAllWizardInProgress = true;

    try {
        console.log('[MANUAL TEST] Starting manual test creation...');

        // PART A + PART B: Build testData DIRECTLY from DOM
        const wName = document.getElementById('wName')?.value?.trim();
        const wDate = document.getElementById('wDate')?.value;
        const wStart = document.getElementById('wStart')?.value;
        const wExpiry = document.getElementById('wExpiry')?.value;
        const wDuration = parseInt(document.getElementById('wDuration')?.value) || 0;
        const wExamType = document.getElementById('wExamType')?.value || 'standard';
        const wQuickResult = document.getElementById('wQuickResult')?.checked || false;

        // Get sections
        const sections = [];
        document.querySelectorAll('.section-input').forEach(div => {
            const secName = div.querySelector('.s-name')?.value?.trim();
            const secCount = parseInt(div.querySelector('.s-count')?.value) || 0;
            if (secName) {
                sections.push({ name: secName, count: secCount });
            }
        });

        // Log raw form fields
        console.log('[MANUAL TEST] raw form fields:', {
            wName,
            wDate,
            wStart,
            wExpiry,
            wDuration,
            wExamType,
            wQuickResult,
            sections
        });

        // PART C: Validate testData
        if (!wName) throw new Error('Test Name is required');
        if (!wDate) throw new Error('Exam Date is required');
        if (!isValidTime(wStart)) throw new Error('Start Time must be valid HH:mm format');
        if (!isValidTime(wExpiry)) throw new Error('Expiry Time must be valid HH:mm format');
        if (isNaN(wDuration) || wDuration <= 0) throw new Error('Duration must be a positive number of minutes');
        if (sections.length === 0) throw new Error('At least one section is required');

        const wEndTime = calculateEndTime(wDate, wExpiry, wDuration);

        // Build testData in format backend expects
        const testData = {
            name: wName,
            date: wDate,
            startTime: wStart,
            expiryTime: wExpiry,
            duration: wDuration,
            sections: sections,
            mode: 'scheduled',
            examType: wExamType,
            quickResult: wQuickResult,
            endTime: wEndTime
        };

        console.log('[MANUAL TEST] normalized testData:', JSON.stringify(testData, null, 2));

        // Build and validate questions
        const questions = [];
        const questionCards = document.querySelectorAll('.wizard-q-card');

        if (questionCards.length === 0) {
            throw new Error('No questions found');
        }

        questionCards.forEach((card, index) => {
            const qSection = card.querySelector('.q-sec')?.value?.trim();
            let qQid = card.querySelector('.q-id')?.value?.trim();
            const qDiff = card.querySelector('.q-diff')?.value?.trim() || 'Medium';
            const qText = String(card.querySelector('.q-text')?.value || '').trim();
            const qA = String(card.querySelector('.q-a')?.value || '').trim();
            const qB = String(card.querySelector('.q-b')?.value || '').trim();
            const qC = String(card.querySelector('.q-c')?.value || '').trim();
            const qD = String(card.querySelector('.q-d')?.value || '').trim();
            const qCorrect = card.querySelector('.q-correct')?.value?.trim().toUpperCase();

            // Auto-generate QID if missing
            if (!qQid) {
                qQid = `Q${index + 1}`;
            }

            if (!qSection) throw new Error(`Question ${index + 1} (${qQid}): Missing Section`);
            if (!qText) throw new Error(`Question ${index + 1} (${qQid}): Missing Question text`);
            if (!qA) throw new Error(`Question ${index + 1} (${qQid}): Missing Option A`);
            if (!qB) throw new Error(`Question ${index + 1} (${qQid}): Missing Option B`);
            if (!qC) throw new Error(`Question ${index + 1} (${qQid}): Missing Option C`);
            if (!qD) throw new Error(`Question ${index + 1} (${qQid}): Missing Option D`);
            if (!['A','B','C','D'].includes(qCorrect)) throw new Error(`Question ${index + 1} (${qQid}): Invalid Correct Answer (must be A, B, C, or D)`);

            // Normalize question fields to what backend expects (lowercase for api)
            const q = {
                section: qSection,
                qid: qQid,
                difficulty: qDiff,
                question: qText,
                a: qA,
                b: qB,
                c: qC,
                d: qD,
                correct: qCorrect,
                marks: 1,
                negativeMarks: 0
            };
            questions.push(q);
        });

        console.log('[MANUAL TEST] normalized questions:', JSON.stringify(questions, null, 2));

        // PART D: Always use createTest + addQuestions, NO commitDraftToTest!
        console.log('[MANUAL TEST] Calling createTest...');
        const resTest = await api.post({
            action: 'createTest',
            testData: testData
        });
        console.log('[MANUAL TEST] createTest response:', JSON.stringify(resTest, null, 2));

        if (!resTest.success) {
            throw new Error(resTest.error || 'Failed to create test');
        }

        const createdTestId = resTest.testId;

        console.log('[MANUAL TEST] Calling addQuestions...');
        const resQs = await api.post({
            action: 'addQuestions',
            testId: createdTestId,
            questions: questions
        });
        console.log('[MANUAL TEST] addQuestions response:', JSON.stringify(resQs, null, 2));

        if (!resQs.success) {
            // Optional: rollback test if questions fail (needs deleteTest endpoint)
            // try {
            //   await api.post({ action: 'deleteTest', testId: createdTestId, permanent: true });
            // } catch (rollbackErr) {
            //   console.error('[MANUAL TEST] Rollback failed:', rollbackErr);
            // }
            throw new Error(resQs.error || 'Failed to add questions');
        }

        // Success!
        if (autosaveInterval) {
            clearInterval(autosaveInterval);
        }

        console.log('[MANUAL TEST] final success!');
        if (window.showSuccess) {
            await window.showSuccess("Test Created Successfully", "Success");
        } else {
            alert("✅ Test Created Successfully");
        }

        console.log('[MANUAL TEST] hiding wizard');
        closeWizard();
        console.log('[MANUAL TEST] resetting wizard state');
        resetWizard();
        console.log('[MANUAL TEST] refreshing dashboard');
        initDashboard();

    } catch (err) {
        console.error('[MANUAL TEST] final error:', err);
        if (window.showError) {
            await window.showError("❌ Error: " + err.message, "Error");
        } else {
            alert("❌ Error: " + err.message);
        }
        // Keep wizard open for corrections
    } finally {
        saveAllWizardInProgress = false;
    }
}

/* ================= CSV ================= */
function showCSVUpload(){
    const modal=document.getElementById('csvModal');
    if(modal)modal.style.display='block';
    toggleCsvOptions();
}

function toggleCsvOptions() {
    const action = document.getElementById('csvAction').value;
    const newTestGroup = document.getElementById('csvNewTestGroup');
    const existingTestGroup = document.getElementById('csvExistingTestGroup');
    const questionModeGroup = document.getElementById('csvQuestionModeGroup');
    if (action === 'new') {
        newTestGroup.style.display = 'block';
        existingTestGroup.style.display = 'none';
        questionModeGroup.style.display = 'none';
    } else {
        newTestGroup.style.display = 'none';
        existingTestGroup.style.display = 'block';
        questionModeGroup.style.display = 'block';
        // Set default and update warning
        document.getElementById('csvQuestionMode').value = 'replace_all_questions';
        updateQuestionModeWarning();
    }
}

function updateQuestionModeWarning() {
    const mode = document.getElementById('csvQuestionMode').value;
    const warningDiv = document.getElementById('csvQuestionModeWarning');
    
    // Hide all descriptions first
    document.getElementById('csvModeDescription_replace_all_questions').style.display = 'none';
    document.getElementById('csvModeDescription_append_questions').style.display = 'none';
    document.getElementById('csvModeDescription_upsert_by_qid').style.display = 'none';
    
    // Show corresponding description and warning
    switch(mode) {
        case 'replace_all_questions':
            warningDiv.textContent = 'Existing questions will be replaced.';
            warningDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            warningDiv.style.color = '#f87171';
            warningDiv.style.border = '1px solid rgba(239, 68, 68, 0.2)';
            document.getElementById('csvModeDescription_replace_all_questions').style.display = 'block';
            break;
        case 'append_questions':
            warningDiv.textContent = 'Uploaded questions will be added to existing questions.';
            warningDiv.style.background = 'rgba(34, 197, 94, 0.1)';
            warningDiv.style.color = '#4ade80';
            warningDiv.style.border = '1px solid rgba(34, 197, 94, 0.2)';
            document.getElementById('csvModeDescription_append_questions').style.display = 'block';
            break;
        case 'upsert_by_qid':
            warningDiv.textContent = 'Matching QIDs will be updated; new QIDs will be inserted.';
            warningDiv.style.background = 'rgba(245, 158, 11, 0.1)';
            warningDiv.style.color = '#fbbf24';
            warningDiv.style.border = '1px solid rgba(245, 158, 11, 0.2)';
            document.getElementById('csvModeDescription_upsert_by_qid').style.display = 'block';
            break;
    }
}

async function loadTestConfig() {
    const testId = document.getElementById('csvTestSelect')?.value;
    if (!testId) return;

    try {
        const response = await api.get('getTestConfig', { testId });
        if (!response || !response.test) {
            throw new Error('Failed to load test configuration');
        }

        const test = response.test;
        console.log('[CSV PREFILL] test data loaded:', test);

        // Auto-fill the config fields
        document.getElementById('csvTestName').value = test.Name || '';
        console.log('[CSV PREFILL] raw date:', test.Date);
        const dateValue = test.Date ? test.Date.split('T')[0] : '';
        console.log('[CSV PREFILL] converted date:', dateValue);
        document.getElementById('csvDate').value = dateValue;
        document.getElementById('csvStart').value = test.StartTime || '';
        document.getElementById('csvExpiry').value = test.ExpiryTime || '';
        document.getElementById('csvDuration').value = test.Duration || 60;
        document.getElementById('csvExamType').value = test.ExamType || 'standard';
        document.getElementById('csvQuickResult').checked = test.QuickResult || false;
        // ADD THESE MISSING FIELDS:
        document.getElementById('csvMode').value = test.Mode || 'scheduled';
        document.getElementById('csvLiveLeaderboardEnabled').checked = test.LiveLeaderboardEnabled !== false;
        document.getElementById('csvAnswerKeyPublished').checked = test.AnswerKeyPublished || false;
    } catch (err) {
        console.error('Failed to load test config:', err);
        alert('❌ Failed to load test configuration: ' + err.message);
    }
}

function populateCSVSelect(tests) {
    const select = document.getElementById('csvTestSelect');

    select.innerHTML = `
        <option value="">Select Test</option>
        ${tests.map(t => `<option value="${t.TestID}">${t.Name}</option>`).join('')}
    `;

    // Add Enter key support for CSV modal
    document.getElementById('csvTestSelect')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCSVUpload();
    });
}

function populateNotificationControls(tests, users) {
    const testSelect = document.getElementById('notifTestSelect');
    const collegeSelect = document.getElementById('notifCollegeSelect');
    const deptSelect = document.getElementById('notifDeptSelect');

    if (!testSelect || !collegeSelect || !deptSelect) return;

    const upcomingTests = tests.filter(t => String(t.status).toLowerCase() === 'upcoming');
    const availableTests = upcomingTests.length ? upcomingTests : tests;

    testSelect.innerHTML = `
        <option value="">Select Upcoming Test</option>
        ${availableTests.map(t => `<option value="${t.TestID}">${t.Name} (${t.Date})</option>`).join('')}
    `;

    const colleges = Array.from(new Set(users
        .map(u => u.College)
        .filter(Boolean)
        .map(c => c.trim())
        .sort((a,b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))));

    collegeSelect.innerHTML = `
        <option value="all">All Colleges</option>
        ${colleges.map(c => `<option value="${c}">${c}</option>`).join('')}
    `;

    const departments = Array.from(new Set(users
        .map(u => u.Department)
        .filter(Boolean)
        .map(d => d.trim())
        .sort((a,b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))));

    deptSelect.innerHTML = `
        <option value="all">All Departments</option>
        ${departments.map(d => `<option value="${d}">${d}</option>`).join('')}
    `;
}

async function triggerExamNotification() {
    const testId = document.getElementById('notifTestSelect')?.value;
    const college = document.getElementById('notifCollegeSelect')?.value;
    const department = document.getElementById('notifDeptSelect')?.value;
    const details = document.getElementById('notifDetails')?.value.trim();
    const statusEl = document.getElementById('notifStatus');

    if (!testId) {
        alert('Please select a test to notify.');
        return;
    }

    if (typeof showAdminActionVerifyLoader === 'function') {
        showAdminActionVerifyLoader({
            title: "Verifying Broadcast",
            message: "Securing examination notification dispatch...",
            steps: ["Validating recipient filters", "Authenticating administrator", "Dispatching secure alerts"]
        });
    }

    try {
        const response = await api.post({
            action: 'sendExamNotification',
            testId,
            details,
            filters: {
                College: college,
                Department: department
            }
        });

        if (!response || response.error) {
            throw new Error(response ? response.error : 'Notification failed');
        }

        if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();
        if (statusEl) {
            statusEl.textContent = `Notification sent to ${response.count || 0} candidates.`;
        }
        alert(`✅ Notification sent successfully to ${response.count || 0} candidates.`);
    } catch (err) {
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        if (statusEl) {
            statusEl.textContent = 'Failed to send notification. Check console for details.';
        }
        alert('❌ Error sending notification: ' + err.message);
    }
}


/* ================= CSV UPLOAD ================= */

async function handleCSVUpload() {

    const action = document.getElementById('csvAction').value;
    const testId = document.getElementById('csvTestSelect')?.value;
    const testName = document.getElementById('csvTestName')?.value;
    const examDate = document.getElementById('csvDate')?.value;
    const startTime = document.getElementById('csvStart')?.value;
    const expiryTime = document.getElementById('csvExpiry')?.value;
    const duration = parseInt(document.getElementById('csvDuration')?.value) || 60;
    const examType = document.getElementById('csvExamType')?.value;
    const quickResult = document.getElementById('csvQuickResult')?.checked || false;
    const questionMode = document.getElementById('csvQuestionMode')?.value || 'replace_all_questions';
    const file = document.getElementById('csvFile')?.files[0];

    if (action === 'new' && !testName) return alert('❌ Please enter test name');
    if (action === 'update' && !testId) return alert('❌ Please select existing test');
    if (!file) return alert('❌ Please select a CSV file');

    const reader = new FileReader();

    reader.onload = async (e) => {

        try {
            const text = e.target.result;

            // Split lines safely
            const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');

            if (lines.length < 2) {
                throw new Error("CSV must contain header + data");
            }

            // Remove BOM + parse header
            const headers = lines[0]
                .replace(/^\uFEFF/, '')
                .split(',')
                .map(h => h.trim());

            const required = ["Section","QID","Difficulty","Question","A","B","C","D","Correct"];

            // Validate headers
            const isValid = required.every(h => headers.includes(h));
            if (!isValid) {
                throw new Error(
                    "Invalid CSV format.\nRequired:\nSection,QID,Difficulty,Question,A,B,C,D,Correct,Marks (optional)"
                );
            }

            // Helper for dynamic column mapping
            const getIndex = (name) => headers.indexOf(name);

            const questions = [];
            const seenQIDs = new Set();

            for (let i = 1; i < lines.length; i++) {

                const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

                if (cols.length < headers.length) {
                    continue;
                }

                const q = {
                    section: cols[getIndex("Section")]?.trim(),
                    qid: cols[getIndex("QID")]?.trim(),
                    difficulty: cols[getIndex("Difficulty")]?.trim(),
                    question: cols[getIndex("Question")]?.replace(/^"|"$/g, ''),
                    a: cols[getIndex("A")]?.replace(/^"|"$/g, ''),
                    b: cols[getIndex("B")]?.replace(/^"|"$/g, ''),
                    c: cols[getIndex("C")]?.replace(/^"|"$/g, ''),
                    d: cols[getIndex("D")]?.replace(/^"|"$/g, ''),
                    correct: cols[getIndex("Correct")]?.trim().toUpperCase(),
                    marks: getIndex("Marks") !== -1 ? parseInt(cols[getIndex("Marks")]?.trim()) || 1 : 1,
                    negativeMarks: getIndex("NegativeMarks") !== -1 ? parseInt(cols[getIndex("NegativeMarks")]?.trim()) || 0 : 0
                };

                // Validation
                if (
                    !q.section ||
                    !q.qid ||
                    !q.question ||
                    !q.a || !q.b || !q.c || !q.d ||
                    !['A','B','C','D'].includes(q.correct)
                ) {
                    continue;
                }

                // Duplicate inside CSV
                if (seenQIDs.has(q.qid)) {
                    continue;
                }

                seenQIDs.add(q.qid);
                questions.push(q);
            }

            if (questions.length === 0) {
                throw new Error("No valid questions found after validation");
            }

            if (typeof showAdminActionVerifyLoader === 'function') {
                showAdminActionVerifyLoader({
                    title: "Verifying Data Import",
                    message: `Processing CSV record injection...`,
                    steps: ["Validating CSV schema", "Authenticating administrator", "Injecting secure question bank"]
                });
            }

            // Build sections array
            const sectionCounts = {};
            questions.forEach(q => {
                sectionCounts[q.section] = (sectionCounts[q.section] || 0) + 1;
            });
            const sections = Object.keys(sectionCounts).map(secName => ({
                name: secName,
                count: sectionCounts[secName]
            }));

            // Prepare test data
            const testData = {
                Name: action === 'new' ? testName : undefined,
                Date: examDate,
                StartTime: startTime,
                ExpiryTime: expiryTime,
                Duration: duration,
                Sections: sections,
                Mode: 'scheduled',
                ExamType: examType,
                QuickResult: quickResult
            };

            // Debug logs
            const importMode = action === 'new' ? 'create_new' : 'update_existing';
            const importQuestionMode = action === 'new' ? 'replace_all_questions' : questionMode;
            console.log('[CSV IMPORT] mode:', importMode);
            console.log('[CSV IMPORT] questionMode:', importQuestionMode);
            console.log('[CSV IMPORT] selected testId:', action === 'update' ? testId : 'N/A');
            console.log('[CSV IMPORT] testData:', testData);
            console.log('[CSV IMPORT] parsed question count:', questions.length);

            // Call importCsvQuestions endpoint
            const importRes = await api.post({
                action: 'importCsvQuestions',
                mode: importMode,
                questionMode: importQuestionMode,
                testId: action === 'update' ? testId : undefined,
                testData: testData,
                questions: questions
            });

            console.log('[CSV IMPORT] response:', importRes);

            if (importRes.error) throw new Error(importRes.error);

            if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();
            alert(`✅ ${questions.length} Questions ${action === 'new' ? 'Created' : 'Updated'} Successfully!`);

            document.getElementById('csvModal').style.display = 'none';

            initDashboard();

        } catch (err) {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            console.error('CSV Upload Failed:', err);
            alert("❌ CSV Upload Failed:\n" + err.message);
        }
    };

    reader.readAsText(file);
}

/* ================= RESULTS ================= */

/* =========================================
   QUESTION PAPER DOWNLOAD (PDF)
========================================= */

function normalizePdfTextForAdmin(value) {
    if (value === undefined || value === null) return '';
    let text = String(value);
    if (text.startsWith("'")) {
        text = text.slice(1);
    }
    return text;
}

async function downloadQuestionPaper(testId, testName) {

    try {

        setLoading(true);

        const questions = await api.get('getQuestions', {
            testId,
            includeAnswers: true
        });

        if (!questions || questions.length === 0) {
            alert("No questions found for this test.");
            return;
        }

        // GROUP BY SECTION
        const grouped = {};

        questions.forEach(q => {

            const sec = q.Section || 'Uncategorized';

            if (!grouped[sec]) grouped[sec] = [];

            grouped[sec].push(q);
        });

        const { jsPDF } = window.jspdf;

        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        // APPLY BRANDING
        await addMeritOnPdfBranding(doc, {
            title: "QUESTION PAPER",
            subtitle: testName,
            documentType: "Question Paper"
        });

        let y = 42;
        let globalQNo = 1;

        // SECTION LOOP
        Object.keys(grouped).forEach(sectionName => {

            // NEW PAGE IF NEEDED
            if (y > 250) {
                doc.addPage();
                addPdfWatermark(doc);
                y = 42;
            }

            // SECTION HEADER
            doc.setFillColor(37, 99, 235);
            doc.roundedRect(14, y, 182, 8, 2, 2, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);

            doc.text(
                `SECTION : ${sectionName.toUpperCase()}`,
                18,
                y + 5.5
            );

            y += 14;

            // QUESTION LOOP
            grouped[sectionName].forEach(q => {

                if (y > 255) {
                    doc.addPage();
                    addPdfWatermark(doc);
                    y = 42;
                }

                // CARD BACKGROUND
                doc.setFillColor(248, 250, 252);
                doc.roundedRect(12, y - 4, 186, 34, 3, 3, 'F');

                // QUESTION NUMBER BADGE
                doc.setFillColor(15, 23, 42);
                doc.circle(20, y + 2, 4, 'F');

                doc.setTextColor(255, 255, 255);
                doc.setFontSize(8);
                doc.setFont("helvetica", "bold");

                doc.text(
                    String(globalQNo),
                    20,
                    y + 3,
                    { align: "center" }
                );

                // QUESTION TEXT (Formatting Safe)
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(9);
                doc.setFont("helvetica", "bold");

                const qLines = normalizePdfTextForAdmin(q.Question || '').split('\n');
                qLines.forEach(line => {
                    const splitLine = doc.splitTextToSize(line, 160);
                    doc.text(splitLine, 28, y + 1);
                    y += (splitLine.length * 4.5);
                    
                    if (y > 275) {
                        doc.addPage();
                        addPdfWatermark(doc);
                        y = 42;
                    }
                });

                y += 2;

                // OPTIONS (Formatting Safe)
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8.5);
                doc.setTextColor(51, 65, 85);

                const options = [
                    ['A', q.A],
                    ['B', q.B],
                    ['C', q.C],
                    ['D', q.D]
                ];
                const correctAnswer = normalizePdfTextForAdmin(q.Correct || '').toUpperCase();

                options.forEach(opt => {
                    const optKey = opt[0];
                    const prefix = `${optKey}) `;
                    const optText = normalizePdfTextForAdmin(opt[1] || '');
                    const optLines = optText.split('\n');
                    
                    // Highlight correct answer
                    if (optKey === correctAnswer) {
                        doc.setTextColor(34, 197, 94); // bright green
                        doc.setFont("helvetica", "bold");
                        // Add highlight background for correct answer
                        doc.setFillColor(34, 197, 94, 0.2); // semi-transparent green
                    } else {
                        doc.setTextColor(51, 65, 85); // dark gray
                        doc.setFont("helvetica", "normal");
                    }
                    
                    optLines.forEach((line, lIdx) => {
                        const displayText = lIdx === 0 ? prefix + line : '   ' + line;
                        // Draw background highlight for correct answer lines
                        if (optKey === correctAnswer) {
                            const textWidth = doc.getTextWidth(displayText);
                            doc.roundedRect(32, y - 4, textWidth + 8, 6, 2, 2, 'F');
                        }
                        const splitOpt = doc.splitTextToSize(displayText, 150);
                        doc.text(splitOpt, 34, y);
                        y += (splitOpt.length * 4.2);

                        if (y > 275) {
                            doc.addPage();
                            addPdfWatermark(doc);
                            y = 42;
                        }
                    });
                });

                // META INFO
                doc.setTextColor(37, 99, 235);
                doc.setFont("helvetica", "italic");
                doc.setFontSize(7.5);

                doc.text(
                    `Correct: ${q.Correct || '-'}    |    Difficulty: ${q.Difficulty || '-'}    |    Marks: ${q.Marks || 1}`,
                    34,
                    y
                );

                y += 6;

                // DIVIDER
                doc.setDrawColor(220, 220, 220);
                doc.line(18, y, 190, y);

                y += 8;

                globalQNo++;
            });

            y += 4;
        });

        // FINAL FOOTER UPDATE
        addPdfFooter(doc);

        doc.save(`${testName}_QuestionPaper.pdf`);
        if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();

    } catch (err) {
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        // Error downloading question paper
        alert("Failed to download question paper.");

    }
}

/* =========================================
   PERFORMANCE ANALYSIS DASHBOARD
========================================= */

let currentPerfData = [];
let cachedAdminUsers = null;

async function ensureAdminUsers() {
    if (cachedAdminUsers) return cachedAdminUsers;
    try {
        const users = await api.get('getAllUsers');
        cachedAdminUsers = Array.isArray(users) ? users : (users?.data || []);
        // User directory loaded
    } catch (e) {
        debugLog('WARN', 'ADMIN', 'Failed to load users for search', e.message);
        cachedAdminUsers = [];
    }
    return cachedAdminUsers;
}
let perfSections = [];
let perfViewMode = 'single'; // 'single' | 'master'
let perfContextTestId = null;
let attendanceChart = null;
let timeTakenChart = null;

/** Parse Tests.Sections JSON ([{name,count},...]) or legacy strings */
function parseTestSectionsField(sectionsField) {
    if (!sectionsField) return [];
    if (typeof sectionsField === 'string') {
        try {
            const parsed = JSON.parse(sectionsField);
            if (Array.isArray(parsed)) {
                return parsed
                    .map(s => (typeof s === 'string' ? s : (s.name || s.section || s.Section || '')).trim())
                    .filter(Boolean);
            }
        } catch (e) {
            return sectionsField.split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    if (Array.isArray(sectionsField)) {
        return sectionsField
            .map(s => (typeof s === 'string' ? s : (s.name || s.section || '')).trim())
            .filter(Boolean);
    }
    return [];
}

/**
 * Union of section names from test definitions + performance analytics.
 * @param {object[]} perfRows
 * @param {object[]} tests - allTests
 * @param {{ testId?: string }} options - limit to one test when set
 */
function collectPerformanceSections(perfRows, tests, options = {}) {
    const { testId = null } = options;
    const sectionSet = new Set();

    (tests || []).forEach(t => {
        if (testId && String(t.TestID) !== String(testId)) return;
        parseTestSectionsField(t.Sections).forEach(s => sectionSet.add(s));
    });

    (perfRows || []).forEach(r => {
        if (testId && String(r.TestId) !== String(testId)) return;
        let analytics = {};
        try {
            analytics = window.parseSectionAnalytics
                ? window.parseSectionAnalytics(r.SectionAnalyticsJSON)
                : JSON.parse(r.SectionAnalyticsJSON || '{}');
        } catch (e) { /* ignore */ }
        Object.keys(analytics).forEach(s => sectionSet.add(s));
    });

    return Array.from(sectionSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function populatePerfSectionFilter(sections, selectedValue = 'all') {
    const filter = document.getElementById('perfSectionFilter');
    if (!filter) return;

    filter.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All Sections';
    filter.appendChild(allOpt);

    sections.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        filter.appendChild(opt);
    });

    filter.value = (selectedValue === 'all' || sections.includes(selectedValue)) ? selectedValue : 'all';
    filter.disabled = false;
}

function attachPerfFilterListeners() {
    const search = document.getElementById('perfSearchName');
    const sort = document.getElementById('perfSortScore');
    const section = document.getElementById('perfSectionFilter');
    if (search) search.oninput = applyPerfFilters;
    if (sort) sort.onchange = applyPerfFilters;
    if (section) section.onchange = applyPerfFilters;
}

function renderPerformanceAnalysisCharts(perfRows, test) {
    if (!perfRows || perfRows.length === 0) {
        if (attendanceChart && typeof attendanceChart.destroy === 'function') attendanceChart.destroy();
        if (timeTakenChart && typeof timeTakenChart.destroy === 'function') timeTakenChart.destroy();
        attendanceChart = null;
        timeTakenChart = null;
        return;
    }

    const dateCounts = perfRows.reduce((acc, row) => {
        const submitted = row.SubmittedAt || row.timestamp || new Date().toISOString();
        const dateKey = new Date(submitted).toLocaleDateString();
        acc[dateKey] = (acc[dateKey] || 0) + 1;
        return acc;
    }, {});

    const sortedDates = Object.keys(dateCounts).sort((a, b) => new Date(a) - new Date(b));
    const attendanceData = sortedDates.map(date => dateCounts[date]);

    const timeBuckets = {};
    perfRows.forEach(row => {
        const seconds = Number(row.TotalTimeTaken || row.timeTaken || 0);
        const minutes = Math.round(seconds / 60);
        const bucketSize = 5;
        const bucket = Math.floor(minutes / bucketSize) * bucketSize;
        const label = `${bucket}-${bucket + bucketSize} min`;
        timeBuckets[label] = (timeBuckets[label] || 0) + 1;
    });

    const sortedBucketLabels = Object.keys(timeBuckets).sort((a, b) => {
        const aVal = Number(a.split('-')[0]);
        const bVal = Number(b.split('-')[0]);
        return aVal - bVal;
    });
    const timeTakenData = sortedBucketLabels.map(label => timeBuckets[label]);

    const attendanceCtx = document.getElementById('attendanceChart');
    const timeTakenCtx = document.getElementById('timeTakenChart');

    if (attendanceChart) attendanceChart.destroy();
    if (timeTakenChart) timeTakenChart.destroy();

    if (attendanceCtx) {
        if (attendanceChart && typeof attendanceChart.destroy === 'function') attendanceChart.destroy();
        attendanceChart = new Chart(attendanceCtx, {
            type: 'bar',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: 'Candidates Submitted',
                    data: attendanceData,
                    backgroundColor: 'rgba(37, 99, 235, 0.75)',
                    borderRadius: 8,
                    barPercentage: 0.7
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
                    y: { beginAtZero: true, ticks: { color: '#cbd5e1' } }
                }
            }
        });
    }

    if (timeTakenCtx) {
        if (timeTakenChart && typeof timeTakenChart.destroy === 'function') timeTakenChart.destroy();
        timeTakenChart = new Chart(timeTakenCtx, {
            type: 'line',
            data: {
                labels: sortedBucketLabels,
                datasets: [{
                    label: 'Candidates by Time Taken',
                    data: timeTakenData,
                    borderColor: 'rgba(16, 185, 129, 0.85)',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
                    y: { beginAtZero: true, ticks: { color: '#cbd5e1' } }
                }
            }
        });
    }
}

async function publishAnswerKey(testId, testName) {
    if (!testId) return;
    if (!(await showConfirm(`Send answer key PDF to all candidates who attended ${testName || testId}?`, 'Publish Answer Key'))) return;

    setLoading(true);
    api.post({ action: 'publishAnswerKey', testId })
        .then(response => {
            if (!response || response.error) {
                throw new Error(response ? response.error : 'Unknown error');
            }
            alert(`Answer key sent to ${response.sentCount || 0} candidates.`);
        })
        .catch(err => {
            alert('Failed to publish answer key: ' + err.message);
        })
        .finally(() => setLoading(false));
}

function buildPerfTableHeaders(isMaster) {
    const headRow = document.getElementById('perfHeadRow');
    if (!headRow) return;

    const sectionHeaders = perfSections.map(s => {
        const filter = document.getElementById('perfSectionFilter');
        const active = filter && filter.value === s;
        const style = active
            ? 'padding: 20px; text-align: center; background: rgba(59,130,246,0.2);'
            : 'padding: 20px; text-align: center;';
        return `<th style="${style}">${s}</th>`;
    }).join('');

    if (isMaster) {
        headRow.innerHTML = `
            <th style="padding: 20px; text-align: left;">Candidate Info</th>
            <th style="padding: 20px; text-align: center;">Test</th>
            <th style="padding: 20px; text-align: center;">Net Score</th>
            <th style="padding: 20px; text-align: center;">Overall %</th>
            ${sectionHeaders}
            <th style="padding: 20px; text-align: center;">Submitted</th>
            <th style="padding: 20px; text-align: center;">Action</th>
        `;
    } else {
        headRow.innerHTML = `
            <th style="padding: 20px; text-align: left;">Candidate Info</th>
            <th style="padding: 20px; text-align: center;">Net Score</th>
            <th style="padding: 20px; text-align: center;">Overall %</th>
            ${sectionHeaders}
            <th style="padding: 20px; text-align: center;">Time</th>
            <th style="padding: 20px; text-align: center;">Violations</th>
            <th style="padding: 20px; text-align: center;">Action</th>
        `;
    }
}

let currentManagerQuestions = [];
let originalManagerQuestions = [];
let managerUnsavedChanges = false;
let currentManagerTestId = null;

/**
 * OPEN ADVANCED QUESTION MANAGER
 */
async function openQuestionManager(testId) {
    debugLog('INFO', 'MODAL', 'Opening Question Manager', { testId });
    currentManagerTestId = testId;
    const test = allTests.find(t => t.TestID === testId);
    
    const modal = document.getElementById('advancedQuestionManager');
    const area = document.getElementById('managerSectionsArea');
    const subTitle = document.getElementById('managerTestSub');
    
    modal.style.display = 'block';
    subTitle.innerText = `Managing questions for: ${test.Name} (${testId})`;
    area.innerHTML = '<div style="text-align:center; padding:100px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:3rem; color:#60a5fa;"></i><p style="margin-top:20px; color:#94a3b8; font-size:1.1rem;">Loading full question bank...</p></div>';

    try {
        const startTime = Date.now();
        const questions = await api.get('getQuestions', {
            testId,
            includeAnswers: true
        });
        // Questions loaded
        
        currentManagerQuestions = JSON.parse(JSON.stringify(questions)); // Deep clone
        originalManagerQuestions = JSON.parse(JSON.stringify(questions));
        managerUnsavedChanges = false;
        updateUnsavedBadge();
        
        renderQuestionManager();
        // Question bank loaded
    } catch (err) {
        debugLog('ERROR', 'ADMIN', 'Failed to load questions for manager', err.message);
        area.innerHTML = `<div style="text-align:center; padding:50px; color:#ef4444;"><h3>Failed to load questions</h3><p>${err.message}</p></div>`;
    }
}

/**
 * RENDER GROUPED QUESTIONS
 */
function renderQuestionManager() {
    const startTime = Date.now();
    const area = document.getElementById('managerSectionsArea');
    const search = (document.getElementById('qManagerSearch').value || '').toLowerCase();

    // Filter questions
    const filtered = currentManagerQuestions.filter(q => {
        return (q.Question || '').toLowerCase().includes(search) || (q.QID || '').toLowerCase().includes(search);
    });

    debugLog('INFO', 'ADMIN', 'Rendering Question Manager');

    // Group by section
    const sections = {};
    const sectionNamesOrder = [];

    // First pass: get all unique section names in order they appear in the full question list
    currentManagerQuestions.forEach(q => {
        const sec = q.Section || 'Uncategorized';
        if (!sectionNamesOrder.includes(sec)) sectionNamesOrder.push(sec);
    });

    // Second pass: group filtered questions
    filtered.forEach(q => {
        const sec = q.Section || 'Uncategorized';
        if (!sections[sec]) sections[sec] = [];
        sections[sec].push(q);
    });

    // Ensure all sections from the order are present (if not searching)
    if (!search) {
        sectionNamesOrder.forEach(sec => {
            if (!sections[sec]) sections[sec] = [];
        });
    }

    if (sectionNamesOrder.length === 0 && !search) {
        area.innerHTML = `
            <div style="text-align:center; padding:80px; color:#94a3b8; background: rgba(255,255,255,0.02); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.3;"></i>
                <h3>No sections found</h3>
                <p>Start by creating your first section below.</p>
            </div>`;
        return;
    }

    area.innerHTML = sectionNamesOrder.filter(name => sections[name]).map(secName => `
        <div class="manager-section-block" style="margin-bottom: 25px; background: rgba(255,255,255,0.03); border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; transition: 0.3s;">
            <div onclick="toggleSectionAccordion(this)" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:20px 30px; cursor:pointer; transition:0.3s;" class="sec-acc-header">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <i class="fa-solid fa-layer-group" style="color:#60a5fa; font-size: 1.2rem;"></i>
                    <h3 style="margin:0; font-size:1.2rem; color:#fff;">${secName}</h3>
                    <span class="section-badge" style="background: rgba(37,99,235,0.1); color: #60a5fa; padding: 4px 12px; border-radius: 8px; font-size: 0.85rem;">
                        ${sections[secName].length} Questions
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 20px;">
                    <button onclick="event.stopPropagation(); addNewQuestionToSection('${secName}')" class="glass-btn primary" style="padding: 8px 18px; font-size: 0.85rem; border-radius: 10px;">
                        <i class="fa-solid fa-plus"></i> Add Question
                    </button>
                    <i class="fa-solid fa-chevron-down acc-icon" style="color: #94a3b8; transition: 0.3s;"></i>
                </div>
            </div>
            <div class="sec-acc-content" style="padding: 25px; display: flex; flex-direction: column; gap: 20px;">
                ${sections[secName].length > 0 ? sections[secName].map(q => renderManagerQuestionCard(q)).join('') : `
                    <div style="text-align:center; color:#94a3b8; padding:30px; border: 1px dashed rgba(255,255,255,0.05); border-radius: 16px;">
                        No questions in this section yet.
                    </div>`}
            </div>
        </div>
    `).join('');

    // Apply Tab Support to all textareas in manager
    document.querySelectorAll('#advancedQuestionManager textarea').forEach(setupTabSupport);

    attachManagerListeners();
    // Question manager rendered
}

function renderManagerQuestionCard(q) {
    const isNew = q.isNew === true;
    return `
        <div class="wizard-q-card manager-q-card ${isNew ? 'new-q-card' : ''}" data-qid="${q.QID}" style="position:relative; ${isNew ? 'border-color: #16a34a; background: rgba(22,163,74,0.05);' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">
                <h4 style="margin:0; font-size:0.95rem; color:#94a3b8;">
                    ${isNew ? '<span style="color:#16a34a; margin-right:10px;"><i class="fa-solid fa-circle-plus"></i> NEW QUESTION</span>' : `ID: ${q.QID}`}
                </h4>
                <button onclick="deleteQuestionFromManager('${q.QID}', this)" class="glass-btn logout-btn" style="padding:6px 12px; font-size:0.75rem;">
                    <i class="fa-solid fa-trash-can"></i> Remove
                </button>
            </div>

            <div class="q-grid">
                <div class="q-full">
                    <label>Question Text</label>
                    <textarea class="mq-text" oninput="trackChange('${q.QID}', 'Question', this.value)" style="min-height:70px;" spellcheck="false" wrap="off">${q.Question || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Difficulty</label>
                    <select class="mq-diff" onchange="trackChange('${q.QID}', 'Difficulty', this.value)">
                        <option ${q.Difficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                        <option ${(q.Difficulty === 'Medium' || !q.Difficulty) ? 'selected' : ''}>Medium</option>
                        <option ${q.Difficulty === 'Hard' ? 'selected' : ''}>Hard</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Correct Answer</label>
                    <select class="mq-correct" onchange="trackChange('${q.QID}', 'Correct', this.value)">
                        <option value="">Select Correct</option>
                        <option value="A" ${q.Correct === 'A' ? 'selected' : ''}>Option A</option>
                        <option value="B" ${q.Correct === 'B' ? 'selected' : ''}>Option B</option>
                        <option value="C" ${q.Correct === 'C' ? 'selected' : ''}>Option C</option>
                        <option value="D" ${q.Correct === 'D' ? 'selected' : ''}>Option D</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Marks</label>
                    <input type="number" class="mq-marks" value="${q.Marks || 1}" oninput="trackChange('${q.QID}', 'Marks', this.value)">
                </div>
                <div class="form-group"><label>Option A</label><textarea class="mq-a format-safe" oninput="trackChange('${q.QID}', 'A', this.value)" spellcheck="false" wrap="off">${q.A || ''}</textarea></div>
                <div class="form-group"><label>Option B</label><textarea class="mq-b format-safe" oninput="trackChange('${q.QID}', 'B', this.value)" spellcheck="false" wrap="off">${q.B || ''}</textarea></div>
                <div class="form-group"><label>Option C</label><textarea class="mq-c format-safe" oninput="trackChange('${q.QID}', 'C', this.value)" spellcheck="false" wrap="off">${q.C || ''}</textarea></div>
                <div class="form-group"><label>Option D</label><textarea class="mq-d format-safe" oninput="trackChange('${q.QID}', 'D', this.value)" spellcheck="false" wrap="off">${q.D || ''}</textarea></div>
            </div>
        </div>
    `;
}

/**
 * SECTION-BASED ADDITION
 */
function addNewQuestionToSection(sectionName) {
    // Adding new question
    const newQid = 'NEW_' + Date.now();
    const newQ = {
        QID: newQid,
        TestID: currentManagerTestId,
        Section: sectionName,
        Question: '',
        A: '', B: '', C: '', D: '',
        Correct: '',
        Difficulty: 'Medium',
        Marks: 1,
        NegativeMarks: 0,
        isNew: true
    };

    currentManagerQuestions.push(newQ);
    managerUnsavedChanges = true;
    updateUnsavedBadge();
    
    renderQuestionManager();
    
    // Auto-scroll and expand if collapsed
    setTimeout(() => {
        const card = document.querySelector(`[data-qid="${newQid}"]`);
        if (card) {
            const sectionBlock = card.closest('.manager-section-block');
            const content = sectionBlock.querySelector('.sec-acc-content');
            if (!content.classList.contains('expanded')) toggleSectionAccordion(sectionBlock.querySelector('.sec-acc-header'));
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

async function createNewSectionInManager() {
    const name = await showPrompt('Enter new section name:', 'New Section', '', 'Section name');
    if (!name || !name.trim()) return;

    const trimmed = name.trim();
    const exists = currentManagerQuestions.some(q => (q.Section || '').toLowerCase() === trimmed.toLowerCase());
    if (exists) {
        await showWarning('Section already exists!');
        return;
    }

    // Creating section
    // Adding an empty question to 'create' the section visually
    addNewQuestionToSection(trimmed);
}

/**
 * CHANGE TRACKING
 */
function trackChange(qid, field, value) {
    const q = currentManagerQuestions.find(q => q.QID === qid);
    if (!q) return;

    // Field changed

    q[field] = value;
    managerUnsavedChanges = true;
    updateUnsavedBadge();
}

function updateUnsavedBadge() {
    const badge = document.getElementById('unsavedChangesBadge');
    if (badge) badge.style.display = managerUnsavedChanges ? 'inline-block' : 'none';
    // Unsaved changes badge updated
}

/**
 * ACCORDION TOGGLE
 */
function toggleSectionAccordion(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.acc-icon');
    const sectionName = header.querySelector('h3').innerText;
    
    const isExpanded = content.classList.contains('expanded');
    // Section accordion toggled

    if (!isExpanded) {
        content.classList.add('expanded');
        icon.classList.add('rotated');
        header.style.background = 'rgba(255,255,255,0.08)';
    } else {
        content.classList.remove('expanded');
        icon.classList.remove('rotated');
        header.style.background = 'rgba(255,255,255,0.04)';
    }
}

/**
 * DELETE FROM MANAGER
 */
async function deleteQuestionFromManager(qid, btn) {
    const q = currentManagerQuestions.find(q => q.QID === qid);
    if (!q) return;

    if (q.isNew) {
        // Removing unsaved question
        currentManagerQuestions = currentManagerQuestions.filter(item => item.QID !== qid);
        renderQuestionManager();
        return;
    }

    if (!(await showDeleteConfirm('Permanently delete this question from the database?', 'Delete Question'))) return;

    // Delete question initiated

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        const res = await api.post({
            action: 'deleteQuestion',
            testId: currentManagerTestId,
            qid: qid
        });

        if (res.success) {
            // Question deleted
            currentManagerQuestions = currentManagerQuestions.filter(item => item.QID !== qid);
            originalManagerQuestions = originalManagerQuestions.filter(item => item.QID !== qid);
            renderQuestionManager();
        } else {
            throw new Error(res.error);
        }
    } catch (err) {
        // Delete question failed
        alert("Delete failed: " + err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Remove';
    }
}

/**
 * SAVE ALL CHANGES
 */
async function saveAllManagerChanges() {
    if (!managerUnsavedChanges) return alert("No changes detected.");

    if (typeof showAdminActionVerifyLoader === 'function') {
        showAdminActionVerifyLoader({
            title: "Verifying Bank Updates",
            message: `Securing question bank synchronization for Test ID: ${currentManagerTestId}...`,
            steps: ["Analyzing modified records", "Authenticating administrator", "Updating secure bank"]
        });
    }

    // Validation
    for (const q of currentManagerQuestions) {

        const question = String(q.Question ?? '');
        const optionA = String(q.A ?? '');
        const optionB = String(q.B ?? '');
        const optionC = String(q.C ?? '');
        const optionD = String(q.D ?? '');
        const correct = String(q.Correct ?? '').trim();

        if (!question || !optionA || !optionB || !optionC || !optionD) {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            return alert(`Incomplete data for question in section: ${q.Section}`);
        }

        if (!['A', 'B', 'C', 'D'].includes(correct)) {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            return alert(`Select correct option for question in section: ${q.Section}`);
        }

        // Normalize values back into object
        q.Question = question;
        q.A = optionA;
        q.B = optionB;
        q.C = optionC;
        q.D = optionD;
        q.Correct = correct;
    }

    const saveBtn = document.getElementById('managerSaveBtn');
    const originalBtnHtml = saveBtn.innerHTML;

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const modifiedExisting = currentManagerQuestions.filter(q => {
            if (q.isNew) return false;
            const original = originalManagerQuestions.find(o => o.QID === q.QID);
            return JSON.stringify(q) !== JSON.stringify(original);
        });

        const newQuestions = currentManagerQuestions.filter(q => q.isNew === true).map((q, idx) => {
            const existingCount = originalManagerQuestions.length;
            return {
                qid: `Q${existingCount + idx + 1}`,
                section: q.Section,
                difficulty: q.Difficulty,
                question: q.Question,
                a: q.A, b: q.B, c: q.C, d: q.D,
                correct: q.Correct,
                marks: parseFloat(q.Marks || 1),
                negativeMarks: parseFloat(q.NegativeMarks || 0)
            };
        });

        // Update Existing (Batch optimized)
        if (modifiedExisting.length > 0) {
            const updates = modifiedExisting.map(q => ({
                qid: q.QID,
                updatedData: {
                    question: q.Question,
                    section: q.Section,
                    correct: q.Correct,
                    a: q.A, b: q.B, c: q.C, d: q.D,
                    difficulty: q.Difficulty,
                    marks: parseFloat(q.Marks || 1),
                    negativeMarks: parseFloat(q.NegativeMarks || 0)
                }
            }));

            await api.post({
                action: 'bulkUpdateQuestions',
                testId: currentManagerTestId,
                updates: updates
            });
        }

        // Add New
        if (newQuestions.length > 0) {
            await api.post({
                action: 'addQuestions',
                testId: currentManagerTestId,
                questions: newQuestions
            });
        }

        if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();

        // Show Success Indicator
        const indicator = document.getElementById('saveIndicator');
        if (indicator) {
            indicator.style.display = 'block';
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 3000);
        }

        managerUnsavedChanges = false;
        updateUnsavedBadge();
        openQuestionManager(currentManagerTestId);

    } catch (err) {
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        debugLog('ERROR', 'MANAGER', 'Save Changes Failed', err.message);
        alert("Save Error: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnHtml;
    }
}

async function closeQuestionManager() {
    if (managerUnsavedChanges) {
        if (!(await showConfirm('Discard unsaved changes?', 'Unsaved Changes'))) return;
    }
    debugLog('INFO', 'MODAL', 'Closing Question Manager');
    document.getElementById('advancedQuestionManager').style.display = 'none';
}

function attachManagerListeners() {
    const searchInput = document.getElementById('qManagerSearch');
    searchInput.oninput = () => renderQuestionManager();
}

/**
 * VIEW RESULTS
 */
async function viewTestResults(testId) {
    // Opening results analysis
    const test = allTests.find(t => String(t.TestID) === String(testId));
    const testName = test ? test.Name : 'Test';
    document.getElementById('perfTitle').innerText = `${testName} - Performance Analysis`;
    document.getElementById('perfModal').style.display = 'block';
    
    const body = document.getElementById('perfBody');
    body.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#60a5fa;"></i></td></tr>';

    try {
        const startTime = Date.now();
        const [rawResults, users] = await Promise.all([
            api.get('getResults', { testId }),
            ensureAdminUsers()
        ]);
        // Results loaded
        
        // SCHEMA-DRIVEN NORMALIZATION
        let perfRows = rawResults.map(r => {
            const normalized = window.normalizePayload ? window.normalizePayload(r) : r;
            return {
                ...normalized,
                // Ensure specific fields exist for UI
                totalScore: normalized.NetScore ?? normalized.TotalScore ?? 0,
                violations: (Number(normalized.TabSwitchCount || 0) + Number(normalized.FullScreenViolations || 0)),
                timeTaken: normalized.TotalTimeTaken || 0,
                timestamp: normalized.SubmittedAt || new Date().toISOString()
            };
        });
        currentPerfData = window.enrichRecordsWithUnivId
            ? window.enrichRecordsWithUnivId(perfRows, users)
            : perfRows;

        // Calculate Overview Stats
        const totalCandidates = currentPerfData.length;
        const avgScore = totalCandidates > 0 ? (currentPerfData.reduce((acc, curr) => acc + Number(curr.totalScore), 0) / totalCandidates).toFixed(2) : 0;
        const highestScore = totalCandidates > 0 ? Math.max(...currentPerfData.map(r => Number(r.totalScore))) : 0;
        const avgTimeTaken = totalCandidates > 0 ? (currentPerfData.reduce((acc, curr) => acc + Number(curr.timeTaken || 0), 0) / totalCandidates / 60).toFixed(1) : 0;
        
        debugLog('STATE', 'ADMIN', 'Results Summary Stats');

        // Render Summary Stats at the top of the body
        const summaryHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div class="dashboard-card" style="padding: 20px; background: rgba(37,99,235,0.1); border: 1px solid rgba(37,99,235,0.2);">
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 5px;">Total Candidates</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #fff;">${totalCandidates}</div>
                </div>
                <div class="dashboard-card" style="padding: 20px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2);">
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 5px;">Average Score</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #fff;">${avgScore}</div>
                </div>
                <div class="dashboard-card" style="padding: 20px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2);">
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 5px;">Highest Score</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #fff;">${highestScore}</div>
                </div>
                <div class="dashboard-card" style="padding: 20px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);">
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 5px;">Critical Violations</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #fff;">${currentPerfData.filter(r => r.violations > 5).length}</div>
                </div>
                <div class="dashboard-card" style="padding: 20px; background: rgba(14,165,233,0.1); border: 1px solid rgba(14,165,233,0.2);">
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 5px;">Average Time</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #fff;">${avgTimeTaken} min</div>
                </div>
            </div>
        `;
        
        // Insert summary before the filters or table
        const perfModalContent = document.querySelector('#perfModal .card');
        const existingSummary = document.getElementById('perfSummaryStats');
        if (existingSummary) existingSummary.remove();
        
        const summaryDiv = document.createElement('div');
        summaryDiv.id = 'perfSummaryStats';
        summaryDiv.innerHTML = summaryHtml;
        perfModalContent.insertBefore(summaryDiv, document.querySelector('#perfModal .card > div:nth-child(3)'));

        perfViewMode = 'single';
        perfContextTestId = testId;
        perfSections = collectPerformanceSections(currentPerfData, allTests, { testId });
        populatePerfSectionFilter(perfSections, 'all');
        buildPerfTableHeaders(false);

        renderPerformanceTable(currentPerfData);
        attachPerfFilterListeners();
        
        document.getElementById('downloadPerfPdfBtn').onclick = () => {
            downloadPerformancePDF(testId, testName);
        };

        const publishBtn = document.getElementById('publishAnswerKeyBtn');
        if (publishBtn) {
            publishBtn.style.display = 'inline-flex';
            publishBtn.disabled = false;
            publishBtn.onclick = () => publishAnswerKey(testId, testName);
        }

        renderPerformanceAnalysisCharts(currentPerfData, test);

        // Results analysis loaded
    } catch (err) {
        debugLog('ERROR', 'ADMIN', 'Results Analysis Failed', err.message);
        body.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#ef4444; padding:20px;">Failed to load results</td></tr>';
    }
}

/**
 * MASTER PERFORMANCE VIEW
 */
async function viewPerformance() {
    // Opening master performance
    perfViewMode = 'master';
    perfContextTestId = null;

    document.getElementById('perfTitle').innerText = `Master Performance - All Tests`;
    document.getElementById('perfModal').style.display = 'block';

    const existingSummary = document.getElementById('perfSummaryStats');
    if (existingSummary) existingSummary.remove();

    const body = document.getElementById('perfBody');
    body.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#60a5fa;"></i></td></tr>';

    document.getElementById('perfSearchName').value = '';
    document.getElementById('perfSortScore').value = 'desc';

    try {
        const [rawResults, users] = await Promise.all([
            api.get('getResults'),
            ensureAdminUsers()
        ]);

        let perfRows = (Array.isArray(rawResults) ? rawResults : []).map(r => {
            const normalized = window.normalizePayload ? window.normalizePayload(r) : r;
            return {
                ...normalized,
                totalScore: normalized.NetScore ?? normalized.TotalScore ?? 0,
                violations: (Number(normalized.TabSwitchCount || 0) + Number(normalized.FullScreenViolations || 0)),
                timeTaken: normalized.TotalTimeTaken || 0,
                timestamp: normalized.SubmittedAt || new Date().toISOString()
            };
        });
        currentPerfData = window.enrichRecordsWithUnivId
            ? window.enrichRecordsWithUnivId(perfRows, users)
            : perfRows;

        perfSections = collectPerformanceSections(currentPerfData, allTests);
        populatePerfSectionFilter(perfSections, 'all');
        buildPerfTableHeaders(true);

        renderPerformanceTable(currentPerfData);
        attachPerfFilterListeners();

        document.getElementById('downloadPerfPdfBtn').onclick = () => downloadPerformancePDF('Master', 'All Tests');
        const publishBtn = document.getElementById('publishAnswerKeyBtn');
        if (publishBtn) {
            publishBtn.style.display = 'none';
            publishBtn.disabled = true;
            publishBtn.onclick = null;
        }
        // Master performance loaded

    } catch (err) {
        debugLog('ERROR', 'ADMIN', 'Master performance failed');
        body.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#ef4444; padding:20px;">Failed to load results</td></tr>';
        populatePerfSectionFilter([], 'all');
    }
}

function applyPerfFilters() {
    const search = document.getElementById('perfSearchName').value.trim();
    const sort = document.getElementById('perfSortScore').value;
    const section = document.getElementById('perfSectionFilter').value;

    let filtered = currentPerfData.filter(r =>
        window.recordMatchesCandidateSearch
            ? window.recordMatchesCandidateSearch(r, search)
            : (
                (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
                (r.userID || '').toLowerCase().includes(search.toLowerCase()) ||
                (r.Email && r.Email.toLowerCase().includes(search.toLowerCase())) ||
                (r.univId || r.UnivID || '').toLowerCase().includes(search.toLowerCase())
            )
    );

    if (section !== 'all') {
        filtered = filtered.filter(r => {
            let analytics = {};
            try {
                analytics = window.parseSectionAnalytics
                    ? window.parseSectionAnalytics(r.SectionAnalyticsJSON)
                    : JSON.parse(r.SectionAnalyticsJSON || '{}');
            } catch (e) { /* ignore */ }

            if (analytics[section] !== undefined) return true;

            const test = (allTests || []).find(t => String(t.TestID) === String(r.TestId));
            return parseTestSectionsField(test?.Sections).includes(section);
        });
    }

    filtered.sort((a, b) => sort === 'desc' ? b.totalScore - a.totalScore : a.totalScore - b.totalScore);

    buildPerfTableHeaders(perfViewMode === 'master');
    renderPerformanceTable(filtered);
}

function renderPerformanceTable(data) {
    const body = document.getElementById('perfBody');
    if (data.length === 0) {
        body.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:#94a3b8;">No results found matching filters.</td></tr>';
        return;
    }

    body.innerHTML = data.map((r, idx) => {
        const analytics = window.parseSectionAnalytics ? window.parseSectionAnalytics(r.SectionAnalyticsJSON) : JSON.parse(r.SectionAnalyticsJSON || '{}');
        const timestamp = new Date(r.timestamp).toLocaleString();
        
        // Time Formatting
        const mins = Math.floor((r.TotalTimeTaken || 0) / 60);
        const secs = (r.TotalTimeTaken || 0) % 60;
        const timeStr = `${mins}m ${secs}s`;

        const accuracy = window.getOverallPercentage
            ? window.getOverallPercentage(r).toFixed(1)
            : (r.TotalQuestions > 0 ? ((r.CorrectCount / r.TotalQuestions) * 100).toFixed(1) : 0);

        const sectionFilter = document.getElementById('perfSectionFilter')?.value || 'all';
        const isMaster = perfViewMode === 'master';
        const detailColspan = isMaster ? (5 + perfSections.length) : (6 + perfSections.length);

        const sectionCols = perfSections.map(s => {
            const stat = analytics[s] || { correct: 0, total: 0 };
            const pct = window.getSectionPercentage
                ? window.getSectionPercentage(stat)
                : (stat.total > 0 ? ((stat.correct / stat.total) * 100) : 0);
            const highlight = sectionFilter !== 'all' && sectionFilter === s;
            const cellStyle = `padding: 15px; text-align: center;${highlight ? ' background: rgba(59,130,246,0.12);' : ''}`;
            const hasSection = stat.total > 0 || analytics[s] !== undefined;
            return `<td style="${cellStyle}">
                ${hasSection
                    ? `<div style="font-weight:700;color:${pct >= 70 ? '#4ade80' : (pct >= 40 ? '#fbbf24' : '#f87171')}">${pct.toFixed(0)}%</div>
                       <div style="color:#64748b;font-size:0.75rem;">${stat.correct}/${stat.total}</div>`
                    : `<span style="color:#64748b;">—</span>`}
            </td>`;
        }).join('');

        const testLabel = (allTests || []).find(t => String(t.TestID) === String(r.TestId))?.Name || r.TestId || '—';

        return `
            <tr class="perf-row" onclick="togglePerfRow('details-${idx}', '${r.userID}', '${r.TestId}')">
                <td style="padding: 20px;">
                    <div style="font-weight:700; color:white;">${r.name}</div>
                    <div style="font-size:0.75rem; color:#94a3b8;">Univ: ${r.univId || r.UnivID || '—'} | ${r.Email || 'No Email'}</div>
                </td>
                ${isMaster ? `<td style="padding: 20px; text-align: center; color:#cbd5e1; font-size:0.85rem;">${testLabel}</td>` : ''}
                <td style="padding: 20px; text-align: center;">
                    <div style="font-size:1.2rem; font-weight:800; color:#60a5fa;">${r.totalScore}</div>
                    ${r.Rank ? `<div style="font-size:0.7rem; color:#94a3b8;">Rank: ${r.Rank}</div>` : ''}
                </td>
                <td style="padding: 20px; text-align: center;">
                    <div style="font-weight:700; color:${accuracy > 70 ? '#4ade80' : (accuracy > 40 ? '#fbbf24' : '#f87171')}">${accuracy}%</div>
                    ${r.Percentile ? `<div style="font-size:0.7rem; color:#94a3b8;">${r.Percentile} %ile</div>` : ''}
                </td>
                ${sectionCols}
                <td style="padding: 20px; text-align: center; color:#cbd5e1; font-size:0.85rem;">
                    ${isMaster ? timestamp : timeStr}
                </td>
                ${isMaster ? '' : `<td style="padding: 20px; text-align: center;">
                    <span class="status-pill ${(r.violations || 0) > 5 ? 'status-closed' : ((r.violations || 0) > 0 ? 'status-upcoming' : 'status-available')}" style="padding: 4px 10px; font-size: 0.75rem;">
                        ${r.violations || 0}
                    </span>
                </td>`}
                <td style="padding: 20px; text-align: center;">
                    <i class="fa-solid fa-chevron-down" style="color:#64748b;"></i>
                </td>
            </tr>
            <tr id="details-${idx}" class="perf-details-row">
                <td colspan="${detailColspan}" style="padding: 0;">
                    <div class="perf-details-container">
                        <div>
                            <h4 style="color:#60a5fa; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                                <i class="fa-solid fa-circle-xmark" style="margin-right:8px;"></i> Incorrect Responses
                            </h4>
                            <div id="wrong-answers-${idx}" style="max-height:300px; overflow-y:auto; padding-right:10px;">
                                <div style="padding:20px; text-align:center; color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Loading details...</div>
                            </div>
                        </div>
                        <div>
                            <h4 style="color:#4ade80; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                                <i class="fa-solid fa-chart-pie" style="margin-right:8px;"></i> Section Breakdown
                            </h4>
                            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:15px;">
                                ${Object.keys(analytics).map(s => `
                                    <div class="section-stat-pill">
                                        <span style="font-size:0.7rem; color:#94a3b8; margin-bottom:5px;">${s}</span>
                                        <span style="font-weight:800; color:white;">${analytics[s].correct} / ${analytics[s].total}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderIncorrectAnswers(responses) {
    const wrong = responses.filter(r => r.IsCorrect === false && r.IsUnanswered === false);
    
    if (wrong.length === 0) return '<p style="color:#4ade80; padding:20px; text-align:center;">No incorrect answers! Candidate performed well in attempted questions.</p>';

    return wrong.map(r => `
        <div class="wrong-q-card">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span style="font-weight:700; color:#f87171;">QID: ${r.QID}</span>
                <span class="section-badge">${r.Section}</span>
            </div>
            <p style="font-size:0.9rem; color:#cbd5e1; margin-bottom:5px;">${r.Question}</p>
            <p style="font-size:0.85rem; color:#94a3b8;">
                Selected: <strong style="color:#f87171;">${r.SelectedAnswer || 'N/A'}</strong> | 
                Correct: <strong style="color:#4ade80;">${r.CorrectAnswer}</strong>
            </p>
        </div>
    `).join('');
}

async function togglePerfRow(id, userID, TestId) {
    const el = document.getElementById(id);
    const isVisible = el.style.display === 'table-row';
    
    // Close others
    document.querySelectorAll('.perf-details-row').forEach(row => row.style.display = 'none');
    
    if (!isVisible) {
        el.style.display = 'table-row';
        
        // Fetch detailed responses if not already loaded
        const idx = id.split('-')[1];
        const container = document.getElementById(`wrong-answers-${idx}`);
        
        try {
            const responses = await api.get('getResponses', { userID, TestId });
            const normalized = responses.map(r => window.normalizePayload ? window.normalizePayload(r) : r);
            container.innerHTML = renderIncorrectAnswers(normalized);
        } catch (err) {
            container.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">Failed to load responses</div>`;
        }
    } else {
        el.style.display = 'none';
    }
}

/* =========================================
   PERFORMANCE PDF DOWNLOAD
========================================= */

async function downloadPerformancePDF(TestId, testName) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

        // APPLY BRANDING
        await addMeritOnPdfBranding(doc, {
            title: "MASTER PERFORMANCE REPORT",
            subtitle: `${testName} (ID: ${TestId})`,
            documentType: "Analytics Export"
        });

        const tableData = currentPerfData.map(r => {
            const analytics = window.parseSectionAnalytics ? window.parseSectionAnalytics(r.SectionAnalyticsJSON) : JSON.parse(r.SectionAnalyticsJSON || '{}');
            const row = [
                r.name,
                r.Email || 'N/A',
                r.userID,
                r.totalScore,
                ...perfSections.map(s => {
                    const st = analytics[s] || { correct: 0, total: 0 };
                    return `${st.correct}/${st.total}`;
                }),
                new Date(r.timestamp).toLocaleString()
            ];
            return row;
        });

        doc.autoTable({
            startY: 42,
            head: [['Candidate Name', 'Email', 'User ID', 'Total', ...perfSections, 'Timestamp']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 4 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didDrawPage: (data) => {
                // Ensure watermark and footer on every page
                if (doc.internal.getNumberOfPages() > 1) {
                    addPdfWatermark(doc);
                }
            }
        });

        // FINAL FOOTER UPDATE
        addPdfFooter(doc);

        doc.save(`${testName}_Performance_Report.pdf`);

    } catch (err) {
        debugLog('ERROR', 'ADMIN', 'Performance PDF Generation Failed', err.message);
        alert("Failed to generate performance PDF.");
    }
}