/**
 * Admin Analytics Module
 * Handles data fetching, processing, and visualization for the MeritOn platform
 */

// Focused Analytics Debug Mode
function analyticsDebug(step, data) {
    if (localStorage.getItem("meriton_analytics_debug") !== "true") return;
    const timestamp = new Date().toLocaleTimeString();
    // Do not log sensitive data objects to console even in debug mode if they contain visible payload
    const logData = (typeof data === 'object' && data !== null) ? '[Object Data]' : data;
    console.log(`%c[ANALYTICS DEBUG] ${timestamp} - ${step}`, "color: #7c3aed; font-weight: bold;", logData || "");
}

analyticsDebug("analytics script loaded");

let allTestsAnalytics = [];
let currentTestPerformance = [];
let currentTestResponses = [];
let currentLeaderboard = [];
let allPerformance = []; // For global search
let allUsers = []; // For email / Univ ID / name lookup
let progressionChart = null;

// Leaderboard sorting
let leaderboardSort = { key: 'leaderboardScore', asc: false };

// Global context for publish actions
window.currentAnalyticsTestId = "";
window.currentAnalyticsTestName = "";

let currentTestId = '';
let scoreChart = null;
let sectionChart = null;

// Sorting states
let questionSort = { key: 'QID', asc: true };
let candidateSort = { key: 'Rank', asc: true };

function normalizeApiArray(res) {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.tests)) return res.tests;
    return [];
}

function getAnalyticsAdminSessionToken() {
    try {
        const user = JSON.parse(localStorage.getItem("cbt_user") || "null");
        return user?.sessionToken || '';
    } catch (e) {
        return '';
    }
}

/* =========================
   INITIALIZATION
========================= */
async function initEmbeddedAnalytics() {
    analyticsDebug("initEmbeddedAnalytics called");

    const testSelector = document.getElementById("testSelector");
    if (!testSelector) {
        analyticsDebug("testSelector missing from DOM, possibly panel not open yet. Retrying in 150ms...");
        setTimeout(initEmbeddedAnalytics, 150);
        return;
    }

    analyticsDebug("DOM IDs check", {
        testSelector: !!document.getElementById("testSelector"),
        refreshBtn: !!document.getElementById("refreshBtn"),
        publishAnswerKeyBtn: !!document.getElementById("publishAnswerKeyBtn"),
        publishAllBtn: !!document.getElementById("publishAllBtn"),
        analyticsContent: !!document.getElementById("analyticsContent"),
        testOverview: !!document.getElementById("testOverview"),
        sectionAnalytics: !!document.getElementById("sectionAnalytics"),
        questionAnalytics: !!document.getElementById("questionAnalytics"),
        candidatePerformance: !!document.getElementById("candidatePerformance"),
        overallPerformance: !!document.getElementById("overallPerformance"),
        loadingOverlay: !!document.getElementById("loadingOverlay")
    });

    bindAnalyticsTabs();
    bindAnalyticsControls();
    loadAnalyticsTests();
}

// Expose initializer
window.initEmbeddedAnalytics = initEmbeddedAnalytics;

async function loadAnalyticsTests() {
    console.log('[ANALYTICS] loading tests');
    analyticsDebug("loadAnalyticsTests called");
    showLoading(true);
    try {
        analyticsDebug("Fetching tests, performance, and users...");
        const [testsRes, perfRes, usersRes] = await Promise.all([
            api.get('getAllTests'),
            api.get('getPerformance'),
            api.get('getAllUsers')
        ]);
        
        console.log('[ANALYTICS] getAllTests response:', testsRes);
        analyticsDebug("Raw tests response", testsRes);
        allTestsAnalytics = normalizeApiArray(testsRes);
        console.log('[ANALYTICS] normalized tests:', allTestsAnalytics);
        analyticsDebug(`Normalized tests count: ${allTestsAnalytics.length}`);

        analyticsDebug("Raw performance response", perfRes);
        allPerformance = Array.isArray(perfRes) ? perfRes.map(r => window.normalizePayload ? window.normalizePayload(r) : r) : [];
        
        analyticsDebug("Raw users response", usersRes);
        allUsers = Array.isArray(usersRes) ? usersRes : (usersRes?.data || []);
        
        populateTestSelector();
        
        if (allTestsAnalytics.length === 0) {
            analyticsDebug("No tests found");
            showAnalyticsStatus("No tests found in the system.");
        }
    } catch (err) {
        console.log('[ANALYTICS] error:', err);
        analyticsDebug("Initialization failed", err);
        showAnalyticsStatus("Could not fetch tests. Check session/API.");
    } finally {
        showLoading(false);
    }
}

function showAnalyticsStatus(message) {
    const selector = document.getElementById('testSelector');
    if (selector) {
        selector.innerHTML = `<option value="">-- ${message} --</option>`;
    }
}

function bindAnalyticsTabs() {
    analyticsDebug("Binding analytics tabs");
    document.querySelectorAll(".tab-btn").forEach(btn => {
        if (btn.dataset.tabsBound === "true") return;
        
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            analyticsDebug(`Switching to tab: ${tab}`);

            document.querySelectorAll(".tab-btn").forEach(b => 
                b.classList.remove("active")
            );

            document.querySelectorAll(".tab-content").forEach(sec => 
                sec.classList.remove("active")
            );

            btn.classList.add("active");
            const content = document.getElementById(tab);
            if (content) {
                content.classList.add("active");
                analyticsDebug(`Tab ${tab} activated`);
            } else {
                analyticsDebug(`Tab content #${tab} not found`);
            }
        });
        
        btn.dataset.tabsBound = "true";
    });
}

function bindAnalyticsControls() {
    analyticsDebug("Binding analytics controls");
    
    const attachById = (id, event, handler) => {
        const el = document.getElementById(id);
        if (!el) {
            analyticsDebug(`Control element #${id} missing`);
            return;
        }
        
        // Prevent duplicate listeners using dataset
        if (el.dataset.bound === "true") {
            analyticsDebug(`Element #${id} already bound, skipping`);
            return;
        }

        analyticsDebug(`Binding ${event} to #${id}`);
        el.addEventListener(event, handler);
        el.dataset.bound = "true";
    };

    // Test Selector
    const testSelector = document.getElementById('testSelector');
    if (testSelector && testSelector.dataset.bound !== "true") {
        testSelector.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            const selectedName = e.target.options[e.target.selectedIndex]?.textContent || "";
            
            window.currentAnalyticsTestId = selectedId;
            window.currentAnalyticsTestName = selectedName;
            
            analyticsDebug(`Test changed: ${selectedName} (${selectedId})`);
            
            const label = document.getElementById("selectedAnalyticsTestLabel");
            if (label) {
                label.textContent = selectedId ? `Selected Test: ${selectedName}` : "No test selected";
            }
            
            loadTestAnalytics(selectedId);
        });
        testSelector.dataset.bound = "true";
    }

    // Refresh
    attachById('refreshBtn', 'click', () => {
        if (window.currentAnalyticsTestId) {
            analyticsDebug("Refreshing data for current test");
            loadTestAnalytics(window.currentAnalyticsTestId);
        }
    });

    // Filters
    attachById('qSearch', 'input', () => renderQuestionTable());
    attachById('qSectionFilter', 'change', () => renderQuestionTable());
    attachById('qDifficultyFilter', 'change', () => renderQuestionTable());
    attachById('candidateSearch', 'input', () => renderCandidateTable());
    attachById('leaderboardSearch', 'input', () => renderLeaderboard());

    // Global Search
    attachById('globalSearchBtn', 'click', () => {
        analyticsDebug("Global search clicked");
        searchGlobalCandidate();
    });
    
    const globSearch = document.getElementById('globalCandidateSearch');
    if (globSearch && globSearch.dataset.bound !== "true") {
        globSearch.onkeypress = (e) => {
            if (e.key === 'Enter') searchGlobalCandidate();
        };
        globSearch.dataset.bound = "true";
    }

    // Modal Close
    const closeBtn = document.querySelector('.close-modal');
    if (closeBtn && closeBtn.dataset.bound !== "true") {
        closeBtn.onclick = closeCandidateModal;
        closeBtn.dataset.bound = "true";
    }

    // Publish Action in Candidate Modal
    const modalPublishBtn = document.getElementById('modalPublishBtn');
    if (modalPublishBtn && modalPublishBtn.dataset.bound !== "true") {
        modalPublishBtn.addEventListener('click', () => {
            const userId = window.currentAnalyticsCandidateUserId;
            analyticsDebug("Modal publish clicked for userId:", userId);
            if (userId) publishSingleResult(userId);
        });
        modalPublishBtn.dataset.bound = "true";
    }

    // Publish Actions
    attachById('publishAllBtn', 'click', () => {
        analyticsDebug("Publish All Results clicked");
        publishAllResults();
    });
    attachById('publishAnswerKeyBtn', 'click', () => {
        analyticsDebug("Publish Answer Key clicked");
        publishAnswerKey();
    });

    // Export PDF
    attachById('exportCandidatePdf', 'click', () => {
        analyticsDebug("Export PDF clicked");
        exportCandidatePerformancePdf();
    });
}

/* =========================
   CORE DATA FETCHING
========================= */
async function loadTestAnalytics(testId) {
    analyticsDebug(`loadTestAnalytics called for ID: ${testId}`);
    
    const analyticsContent = document.getElementById('analyticsContent');
    const publishAllBtn = document.getElementById('publishAllBtn');
    const publishAnswerKeyBtn = document.getElementById('publishAnswerKeyBtn');
    
    if (!testId) {
        analyticsDebug("No testId provided, hiding analytics content");
        if (analyticsContent) analyticsContent.classList.add('hidden');
        if (publishAllBtn) publishAllBtn.disabled = true;
        if (publishAnswerKeyBtn) publishAnswerKeyBtn.disabled = true;
        return;
    }

    currentTestId = testId;
    window.currentAnalyticsTestId = testId;
    
    if (publishAllBtn) publishAllBtn.disabled = true;
    if (publishAnswerKeyBtn) publishAnswerKeyBtn.disabled = true;
    
    showLoading(true);

    try {
        analyticsDebug(`Fetching performance, responses, and leaderboard for test: ${testId}`);
        const [perf, resp, leaderboardRes] = await Promise.all([
            api.get('getPerformance', { testId }),
            api.get('getResponses', { testId }),
            api.get('getLeaderboard', { testId })
        ]);

        analyticsDebug("Raw API Response Check", { 
            perfType: typeof perf, 
            perfIsArray: Array.isArray(perf),
            respType: typeof resp, 
            respIsArray: Array.isArray(resp)
        });

        if (perf.error) {
            analyticsDebug("Performance API error", perf.error);
            throw new Error(perf.error);
        }
        if (resp.error) {
            analyticsDebug("Responses API error", resp.error);
            throw new Error(resp.error);
        }

        analyticsDebug("Data fetched successfully, normalizing...");
        let perfRows = Array.isArray(perf) ? perf.map(r => window.normalizePayload ? window.normalizePayload(r) : r) : [];
        currentTestPerformance = window.enrichRecordsWithUnivId
            ? window.enrichRecordsWithUnivId(perfRows, allUsers)
            : perfRows;
        
        currentTestResponses = Array.isArray(resp) ? resp.map(r => window.normalizePayload ? window.normalizePayload(r) : r) : [];
        
        analyticsDebug(`Candidates: ${currentTestPerformance.length}, Responses: ${currentTestResponses.length}`);

        if (analyticsContent) analyticsContent.classList.remove('hidden');
        if (publishAllBtn) publishAllBtn.disabled = false;
        if (publishAnswerKeyBtn) publishAnswerKeyBtn.disabled = false;
        
        if (leaderboardRes && leaderboardRes.success) {
            currentLeaderboard = leaderboardRes.leaderboard || [];
            analyticsDebug("Leaderboard data loaded", currentLeaderboard.length, "entries");
        }
        
        analyticsDebug("Processing analytics data...");
        processAnalytics();
        
        analyticsDebug("Rendering UI...");
        renderAll();
        
        analyticsDebug("loadTestAnalytics complete");
    } catch (err) {
        analyticsDebug("loadTestAnalytics failed", err);
        alert("Error loading test data. Please try again.");
    } finally {
        showLoading(false);
    }
}

function populateTestSelector() {
    const selector = document.getElementById('testSelector');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">-- Select a Test --</option>';
    
    const tests = Array.isArray(allTestsAnalytics) ? allTestsAnalytics : [];
    if (tests.length === 0) {
        selector.innerHTML = '<option value="">No tests available</option>';
        return;
    }

    tests.forEach(test => {
        const option = document.createElement('option');
        option.value = test.TestID;
        option.textContent = `${test.Name} (${test.Date})`;
        selector.appendChild(option);
    });
}

function normalizeRecord(obj) {
    if (!obj) return {};
    const normalized = {};
    for (const key in obj) {
        normalized[key.toLowerCase()] = obj[key];
    }
    return normalized;
}

function processAnalytics() {
    // Processing test data
    analyticsDebug("processAnalytics called");
    
    const stats = {
        totalCandidates: currentTestPerformance.length,
        totalQuestions: 0,
        avgScore: 0,
        highestScore: 0,
        avgAccuracy: 0
    };

    if (stats.totalCandidates > 0) {
        // Try to get total questions from first record
        const firstRec = normalizeRecord(currentTestPerformance[0]);
        stats.totalQuestions = firstRec.totalquestions || 0;

        const totalScore = currentTestPerformance.reduce((acc, p) => {
            const rec = normalizeRecord(p);
            return acc + Number(rec.netscore ?? rec.totalscore ?? 0);
        }, 0);
        stats.avgScore = (totalScore / stats.totalCandidates).toFixed(1);
        
        stats.highestScore = Math.max(...currentTestPerformance.map(p => {
            const rec = normalizeRecord(p);
            return Number(rec.netscore ?? rec.totalscore ?? 0);
        }));

        const totalAccuracy = currentTestPerformance.reduce((acc, p) => {
            return acc + (window.getOverallPercentage ? window.getOverallPercentage(p) : 0);
        }, 0);
        stats.avgAccuracy = (totalAccuracy / stats.totalCandidates).toFixed(1);
    }

    // Update UI
    const totalCandEl = document.getElementById('statTotalCandidates');
    const totalQsEl = document.getElementById('statTotalQuestions');
    const avgScoreEl = document.getElementById('statAvgScore');
    const highSubEl = document.getElementById('statHighestScore');
    const avgAccEl = document.getElementById('statAvgAccuracy');

    if (totalCandEl) totalCandEl.textContent = stats.totalCandidates;
    if (totalQsEl) totalQsEl.textContent = stats.totalQuestions;
    if (avgScoreEl) avgScoreEl.textContent = stats.avgScore;
    if (highSubEl) highSubEl.textContent = stats.highestScore;
    if (avgAccEl) avgAccEl.textContent = stats.avgAccuracy + '%';

    // Process Section-wise Data using normalized helper
    const normalizedSections = normalizeSectionAnalyticsFromPerformance(currentTestPerformance, currentTestResponses);
    window.processedSections = {};
    normalizedSections.forEach(sec => {
        window.processedSections[sec.section] = {
            count: sec.attempts,
            correct: sec.correct,
            wrong: sec.wrong,
            unanswered: sec.unanswered,
            total: sec.totalQuestions,
            score: sec.score,
            percentageSum: sec.percentage * sec.attempts
        };
    });

    // Process Question-wise Data
    const qStats = {};
    
    if (!Array.isArray(currentTestResponses) || currentTestResponses.length === 0) {
        analyticsDebug("No responses found to process question-wise stats");
        window.processedQuestions = [];
        return;
    }

    currentTestResponses.forEach(r => {
        const rec = normalizeRecord(r);
        const qid = rec.qid;
        if (!qid) return;
        
        if (!qStats[qid]) {
            qStats[qid] = { 
                qid: qid, 
                question: rec.question || 'Unknown Question', 
                section: rec.section || 'General', 
                difficulty: rec.difficulty || 'Medium', 
                correct: rec.correctanswer || '-',
                totalCorrect: 0, 
                totalWrong: 0, 
                totalUnanswered: 0 
            };
        }
        
        const isCorrect = rec.iscorrect === true || rec.iscorrect === 'true' || rec.iscorrect === 'TRUE';
        const isUnanswered = rec.isunanswered === true || rec.isunanswered === 'true' || rec.isunanswered === 'TRUE';

        if (isCorrect) {
            qStats[qid].totalCorrect++;
        } else if (isUnanswered) {
            qStats[qid].totalUnanswered++;
        } else {
            qStats[qid].totalWrong++;
        }
    });
    window.processedQuestions = Object.values(qStats);
    analyticsDebug(`Processed ${window.processedQuestions.length} unique questions`);
}

function renderAll() {
    const startTime = Date.now();
    renderOverview();
    renderCharts();
    renderSectionTable();
    renderQuestionTable();
    renderCandidateTable();
    renderLeaderboard();
    // UI rendered
}

function renderOverview() {
    // Already updated via DOM in processAnalytics()
    debugLog('INFO', 'UI', 'Overview stats rendered');
}

function renderCharts() {
    analyticsDebug("renderCharts called");
    
    const scoreCanvas = document.getElementById('scoreDistributionChart');
    const sectionCanvas = document.getElementById('sectionComparisonChart');
    
    if (!scoreCanvas || !sectionCanvas) {
        analyticsDebug("Chart canvases missing from DOM");
        return;
    }

    if (typeof Chart === 'undefined') {
        analyticsDebug("Chart.js dependency missing, skipping chart rendering");
        scoreCanvas.parentElement.innerHTML = '<div class="chart-error">Chart.js not loaded</div>';
        sectionCanvas.parentElement.innerHTML = '<div class="chart-error">Chart.js not loaded</div>';
        return;
    }

    const ctxScore = scoreCanvas.getContext('2d');
    const ctxSection = sectionCanvas.getContext('2d');

    if (scoreChart) scoreChart.destroy();
    if (sectionChart) sectionChart.destroy();

    analyticsDebug("Calculating chart data buckets");
    // Overall percentage distribution (correct/total — not marks)
    const pctBuckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    currentTestPerformance.forEach(p => {
        const pct = window.getOverallPercentage ? window.getOverallPercentage(p) : 0;
        if (pct <= 20) pctBuckets['0-20']++;
        else if (pct <= 40) pctBuckets['21-40']++;
        else if (pct <= 60) pctBuckets['41-60']++;
        else if (pct <= 80) pctBuckets['61-80']++;
        else pctBuckets['81-100']++;
    });

    analyticsDebug("Creating score distribution chart");
    scoreChart = new Chart(ctxScore, {
        type: 'bar',
        data: {
            labels: Object.keys(pctBuckets),
            datasets: [{
                label: 'Candidates by Overall %',
                data: Object.values(pctBuckets),
                backgroundColor: 'rgba(37, 99, 235, 0.6)',
                borderColor: '#3b82f6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { title: { display: true, text: 'Overall % Range' } }
            }
        }
    });

    const secLabels = Object.keys(window.processedSections);
    const secAccuracies = secLabels.map(s => {
        const data = window.processedSections[s];
        if (data.count > 0 && data.percentageSum != null) {
            return data.percentageSum / data.count;
        }
        return window.calcAccuracyPercentage
            ? window.calcAccuracyPercentage(data.correct, data.total)
            : 0;
    });

    analyticsDebug("Creating section comparison chart");
    sectionChart = new Chart(ctxSection, {
        type: 'radar',
        data: {
            labels: secLabels,
            datasets: [{
                label: 'Accuracy %',
                data: secAccuracies,
                backgroundColor: 'rgba(124, 58, 237, 0.2)',
                borderColor: '#7c3aed',
                pointBackgroundColor: '#7c3aed'
            }]
        },
        options: {
            responsive: true,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    suggestedMin: 0,
                    suggestedMax: 100
                }
            }
        }
    });
}

function renderSectionTable() {
    const body = document.getElementById('sectionTableBody');
    body.innerHTML = '';

    for (const s in window.processedSections) {
        const data = window.processedSections[s];
        const accuracy = data.count > 0
            ? (data.percentageSum / data.count)
            : (window.calcAccuracyPercentage ? window.calcAccuracyPercentage(data.correct, data.total) : 0);
        
        let statusClass = 'success';
        if (accuracy < 40) statusClass = 'danger';
        else if (accuracy < 70) statusClass = 'warning';

        const row = `
            <tr onclick="showSectionDetail('${s}')" style="cursor: pointer; transition: background 0.2s;">
                <td><strong>${s}</strong></td>
                <td>${data.total / data.count}</td>
                <td>${data.correct}</td>
                <td>${data.wrong}</td>
                <td>${data.unanswered}</td>
                <td>
                    <div class="accuracy-bar">
                        <div class="accuracy-fill ${statusClass}" style="width: ${accuracy}%"></div>
                    </div>
                    ${accuracy.toFixed(1)}%
                </td>
                <td><span class="status-badge ${statusClass}">${accuracy > 70 ? 'Strong' : (accuracy > 40 ? 'Average' : 'Weak')}</span></td>
            </tr>
        `;
        body.innerHTML += row;
    }

    // Populate section filter for questions
    const qSecFilter = document.getElementById('qSectionFilter');
    if (qSecFilter) {
        qSecFilter.innerHTML = '<option value="">All Sections</option>';
        Object.keys(window.processedSections || {}).forEach(s => {
            qSecFilter.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }
}

function renderQuestionTable() {
    analyticsDebug("renderQuestionTable called");
    const body = document.getElementById('questionTableBody');
    if (!body) {
        analyticsDebug("questionTableBody missing from DOM");
        return;
    }

    const qSearchEl = document.getElementById('qSearch');
    const qSecEl = document.getElementById('qSectionFilter');
    const qDiffEl = document.getElementById('qDifficultyFilter');

    const search = qSearchEl ? qSearchEl.value.toLowerCase() : '';
    const secFilter = qSecEl ? qSecEl.value : '';
    const diffFilter = qDiffEl ? qDiffEl.value : '';

    analyticsDebug("Filtering questions", { search, secFilter, diffFilter });

    if (!window.processedQuestions || window.processedQuestions.length === 0) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;">No question data available for this test.</td></tr>';
        return;
    }

    let filtered = [...window.processedQuestions].filter(q => {
        const matchSearch = !search || 
            (q.question || '').toLowerCase().includes(search) || 
            (q.qid || '').toString().includes(search);
        const matchSec = !secFilter || q.section === secFilter;
        const matchDiff = !diffFilter || q.difficulty === diffFilter;
        return matchSearch && matchSec && matchDiff;
    });

    analyticsDebug(`Filtered ${filtered.length} questions`);

    // Sorting
    filtered.sort((a, b) => {
        let valA = a[questionSort.key];
        let valB = b[questionSort.key];
        
        if (questionSort.key === 'accuracy') {
            valA = (a.totalCorrect / (a.totalCorrect + a.totalWrong + a.totalUnanswered)) * 100 || 0;
            valB = (b.totalCorrect / (b.totalCorrect + b.totalWrong + b.totalUnanswered)) * 100 || 0;
        }

        if (valA < valB) return questionSort.asc ? -1 : 1;
        if (valA > valB) return questionSort.asc ? 1 : -1;
        return 0;
    });

    body.innerHTML = '';
    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;">No questions match the current filters.</td></tr>';
        return;
    }

    filtered.forEach(q => {
        const total = (q.totalCorrect + q.totalWrong + q.totalUnanswered);
        const accuracy = total > 0 ? (q.totalCorrect / total) * 100 : 0;
        const row = `
            <tr>
                <td>${q.qid}</td>
                <td>${q.section}</td>
                <td><span class="status-badge ${q.difficulty === 'Hard' ? 'danger' : (q.difficulty === 'Medium' ? 'warning' : 'success')}">${q.difficulty}</span></td>
                <td title="${q.question}">${q.question.length > 40 ? q.question.substring(0, 40) + '...' : q.question}</td>
                <td><strong>${q.correct}</strong></td>
                <td>${q.totalCorrect}</td>
                <td>${q.totalWrong}</td>
                <td>${q.totalUnanswered}</td>
                <td>${accuracy.toFixed(1)}%</td>
            </tr>
        `;
        body.innerHTML += row;
    });
}

function renderCandidateTable() {
    const body = document.getElementById('candidateTableBody');
    if (!body) return;

    const candSearchEl = document.getElementById('candidateSearch');
    const search = candSearchEl ? candSearchEl.value.toLowerCase() : '';

    let candidates = currentTestPerformance.map(p => {
        const rec = normalizeRecord(p);
        return {
            ...p,
            userID: rec.userid,
            name: rec.name || rec.fullname,
            Email: rec.email,
            Rank: rec.rank || '-',
            NetScore: rec.netscore ?? rec.totalscore,
            CorrectCount: rec.correctcount || 0,
            WrongCount: rec.wrongcount || 0,
            UnansweredCount: rec.unansweredcount || 0,
            ResultPublished: rec.resultpublished === true || rec.resultpublished === 'TRUE',
            OverallPct: window.getOverallPercentage ? window.getOverallPercentage(p) : 0,
            AvgSecPct: window.getAverageSectionPercentage ? window.getAverageSectionPercentage(p) : 0,
            PercentileVal: rec.percentile != null && rec.percentile !== '' ? Number(rec.percentile) : '-'
        };
    });

    if (search) {
        candidates = candidates.filter(c =>
            window.recordMatchesCandidateSearch ? window.recordMatchesCandidateSearch(c, search) : (
                (c.name || '').toLowerCase().includes(search) ||
                (c.Email || '').toLowerCase().includes(search) ||
                (c.userID || '').toString().toLowerCase().includes(search)
            )
        );
    }

    // Apply Sorting
    candidates.sort((a, b) => {
        let valA = a[candidateSort.key];
        let valB = b[candidateSort.key];
        if (candidateSort.key === 'OverallPct' || candidateSort.key === 'NetScore') {
            valA = Number(valA) || 0;
            valB = Number(valB) || 0;
        }
        if (valA < valB) return candidateSort.asc ? -1 : 1;
        if (valA > valB) return candidateSort.asc ? 1 : -1;
        return 0;
    });

    body.innerHTML = '';
    candidates.forEach(c => {
        const row = `
            <tr onclick="showCandidateDetail('${c.userID}')" style="cursor: pointer;">
                <td><strong>#${c.Rank || '-'}</strong></td>
                <td>
                    <div style="font-weight: 600;">${c.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${c.Email}</div>
                </td>
                <td>${c.NetScore ?? c.TotalScore} <span style="font-size:0.75rem;color:var(--text-muted)">(marks)</span></td>
                <td>
                    <div><strong>${Number(c.OverallPct).toFixed(1)}%</strong> overall</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">Avg sec: ${Number(c.AvgSecPct).toFixed(1)}%</div>
                </td>
                <td>${c.CorrectCount} / ${c.WrongCount} / ${c.UnansweredCount}</td>
                <td>${c.PercentileVal !== '-' ? c.PercentileVal + ' %ile' : '-'}</td>
                <td>
                    <span class="status-badge ${c.ResultPublished ? 'success' : 'warning'}">
                        ${c.ResultPublished ? 'Published' : 'Pending'}
                    </span>
                </td>
                <td>
                    <button class="action-btn primary" onclick="event.stopPropagation(); showCandidateDetail('${c.userID}')"><i class="fas fa-eye"></i></button>
                    <button class="action-btn success" onclick="event.stopPropagation(); publishSingleResult('${c.userID}')" ${c.ResultPublished ? 'disabled' : ''}><i class="fas fa-paper-plane"></i></button>
                </td>
            </tr>
        `;
        body.innerHTML += row;
    });
}

/**
 * FEATURE: Leaderboard rendering
 * Handles both preformatted time and numeric seconds from backend.
 */
function formatLeaderboardTime(row) {
    if (row.totalTimeTakenDisplay) return row.totalTimeTakenDisplay;

    const seconds = Number(
        row.totalTimeTakenSeconds ??
        row.TotalTimeTakenSeconds ??
        row.timeTakenSeconds ??
        0
    );

    if (!seconds || Number.isNaN(seconds)) return '-';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * FEATURE: Section-wise analytics normalization
 * Normalizes mixed backend shapes from SubmissionResult and legacy Performance.
 * Always returns a safe array for tables/charts.
 */
function normalizeSectionAnalyticsFromPerformance(performanceRecords, responseRecords = []) {
    if (!Array.isArray(performanceRecords) || performanceRecords.length === 0) {
        return [];
    }

    const aggregated = {};

    performanceRecords.forEach(record => {
        let sectionData = null;

        // Try multiple field sources
        const sources = [
            record.sections,
            record.Sections,
            record.SectionAnalyticsJSON,
            record.sectionAnalytics,
            record.SectionWise
        ];

        for (const source of sources) {
            if (!source) continue;

            try {
                // Parse if string
                const parsed = typeof source === 'string' ? JSON.parse(source) : source;
                if (parsed && typeof parsed === 'object') {
                    sectionData = parsed;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        // If no section data found, skip this record
        if (!sectionData) return;

        // Convert object map to array format
        const sections = Array.isArray(sectionData) ? sectionData : Object.entries(sectionData).map(([name, data]) => ({
            section: name,
            ...data
        }));

        sections.forEach(sec => {
            const sectionName = sec.section || sec.Section || 'Uncategorized';
            if (!aggregated[sectionName]) {
                aggregated[sectionName] = {
                    section: sectionName,
                    totalQuestions: 0,
                    correct: 0,
                    wrong: 0,
                    unanswered: 0,
                    score: 0,
                    maxMarks: 0,
                    attempts: 0
                };
            }

            aggregated[sectionName].totalQuestions += Number(sec.totalQuestions || sec.total || sec.TotalQuestions || 0);
            aggregated[sectionName].correct += Number(sec.correctCount || sec.correct || sec.CorrectCount || 0);
            aggregated[sectionName].wrong += Number(sec.wrongCount || sec.wrong || sec.WrongCount || 0);
            aggregated[sectionName].unanswered += Number(sec.unansweredCount || sec.unanswered || sec.UnansweredCount || 0);
            aggregated[sectionName].score += Number(sec.score || sec.netScore || sec.Score || 0);
            aggregated[sectionName].maxMarks += Number(sec.maxMarks || sec.maxPossibleScore || sec.MaxMarks || 0);
            aggregated[sectionName].attempts += 1;
        });
    });

    // Fallback from responses if no section data found
    if (Object.keys(aggregated).length === 0 && Array.isArray(responseRecords) && responseRecords.length > 0) {
        const responseAggregated = {};

        responseRecords.forEach(resp => {
            const sectionName = resp.section || resp.Section || 'Uncategorized';
            if (!responseAggregated[sectionName]) {
                responseAggregated[sectionName] = {
                    section: sectionName,
                    totalQuestions: 0,
                    correct: 0,
                    wrong: 0,
                    unanswered: 0,
                    score: 0,
                    maxMarks: 0,
                    attempts: 0
                };
            }

            responseAggregated[sectionName].totalQuestions += 1;
            if (resp.IsCorrect || resp.isCorrect) {
                responseAggregated[sectionName].correct += 1;
                responseAggregated[sectionName].score += Number(resp.MarksAwarded || resp.marksAwarded || resp.Marks || resp.marks || 0);
            } else if (!resp.IsUnanswered && !resp.isUnanswered) {
                responseAggregated[sectionName].wrong += 1;
                responseAggregated[sectionName].score -= Number(resp.NegativeMarks || resp.negativeMarks || 0);
            } else {
                responseAggregated[sectionName].unanswered += 1;
            }
            responseAggregated[sectionName].attempts += 1;
        });

        Object.assign(aggregated, responseAggregated);
    }

    // Calculate derived metrics
    return Object.values(aggregated).map(sec => {
        const accuracy = (sec.correct + sec.wrong + sec.unanswered) > 0
            ? (sec.correct / (sec.correct + sec.wrong + sec.unanswered)) * 100
            : 0;
        const percentage = sec.maxMarks > 0 ? (sec.score / sec.maxMarks) * 100 : 0;

        return {
            ...sec,
            accuracy: Number(accuracy.toFixed(2)),
            percentage: Number(percentage.toFixed(2))
        };
    });
}

function renderLeaderboard() {
    const body = document.getElementById('leaderboardTableBody');
    if (!body) return;

    const searchEl = document.getElementById('leaderboardSearch');
    const search = searchEl ? searchEl.value.toLowerCase() : '';

    let filtered = [...currentLeaderboard].filter(c =>
        !search ||
        (c.name || '').toLowerCase().includes(search) ||
        (c.emailMasked || '').toLowerCase().includes(search)
    );

    filtered.sort((a, b) => {
        let valA = a[leaderboardSort.key];
        let valB = b[leaderboardSort.key];

        if (leaderboardSort.key === 'submittedAt') {
            valA = new Date(valA);
            valB = new Date(valB);
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
            return leaderboardSort.asc ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
            return leaderboardSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });

    body.innerHTML = '';
    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="14" style="text-align:center;">No leaderboard data available.</td></tr>';
        return;
    }

    filtered.forEach(row => {
        const html = `
            <tr>
                <td><strong>#${row.rank}</strong></td>
                <td>
                    <div style="font-weight:600">${row.name}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted)">${row.emailMasked}</div>
                </td>
                <td><strong>${Number(row.leaderboardScore).toFixed(2)}</strong></td>
                <td>${Number(row.scorePercentile).toFixed(2)}%</td>
                <td>${row.netScore} / ${row.maxPossibleScore}</td>
                <td>${Number(row.accuracyPercent).toFixed(2)}%</td>
                <td>${Number(row.attemptPercent).toFixed(2)}%</td>
                <td>${Number(row.sectionGradePoint).toFixed(2)}</td>
                <td>${Number(row.difficultyGradePoint).toFixed(2)}</td>
                <td>${formatLeaderboardTime(row)}</td>
                <td>${row.correctCount}</td>
                <td>${row.wrongCount}</td>
                <td>${row.unansweredCount}</td>
                <td>${row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '-'}</td>
            </tr>
        `;
        body.innerHTML += html;
    });
}

function sortLeaderboard(key) {
    if (leaderboardSort.key === key) {
        leaderboardSort.asc = !leaderboardSort.asc;
    } else {
        leaderboardSort.key = key;
        leaderboardSort.asc = (key === 'totalTimeTakenSeconds' || key === 'wrongCount' || key === 'unansweredCount');
    }
    renderLeaderboard();
}

/* =========================
   PUBLISH SYSTEM
========================= */
async function publishAllResults() {
    const testId = window.currentAnalyticsTestId || currentTestId;
    analyticsDebug("publishAllResults called for testId:", testId);

    if (!testId) {
        if (typeof showWarning === 'function') showWarning("Please select a test first.");
        else alert("Please select a test first.");
        return;
    }

    const sessionToken = getAnalyticsAdminSessionToken();
    if (!sessionToken) {
        alert('Admin session expired. Please login again.');
        return;
    }

    const confirmed = confirm(`Are you sure you want to publish results for ALL candidates in test ${window.currentAnalyticsTestName || testId}? This will make their scores visible in their dashboards.`);
    if (!confirmed) return;

    showLoading(true);
    try {
        analyticsDebug("Sending publishAllResults request");
        const res = await api.post({
            action: 'publishAllResults',
            testId: testId,
            sessionToken: sessionToken
        });
        analyticsDebug("publishAllResults response:", res);

        if (!res || res.success !== true) {
            alert('Publish failed: ' + (res?.error || 'Unknown error'));
            return;
        }

        const msg = `Results published successfully to ${res.publishedCount || 0} candidates.`;
        alert(msg);
        loadTestAnalytics(testId); // Refresh to show published status
    } catch (err) {
        analyticsDebug("publishAllResults failed", err);
        alert("Publishing failed: " + err.message);
    } finally {
        showLoading(false);
    }
}

async function publishSingleResult(userId) {
    const testId = window.currentAnalyticsTestId || currentTestId;
    analyticsDebug("publishSingleResult called", { testId, userId });

    if (!testId) return;

    const sessionToken = getAnalyticsAdminSessionToken();
    if (!sessionToken) {
        alert('Admin session expired. Please login again.');
        return;
    }

    showLoading(true);
    try {
        analyticsDebug("Sending publishResult request");
        const res = await api.post({
            action: 'publishResult',
            testId: testId,
            userId: userId,
            sessionToken: sessionToken
        });
        analyticsDebug("publishResult response:", res);

        if (!res || res.success !== true) {
            alert('Publish failed: ' + (res?.error || 'Unknown error'));
            return;
        }

        alert("Result published successfully.");
        loadTestAnalytics(testId);
        closeCandidateModal();
    } catch (err) {
        analyticsDebug("publishSingleResult failed", err);
        alert("Publishing failed: " + err.message);
    } finally {
        showLoading(false);
    }
}

async function publishAnswerKey() {
    const testId = window.currentAnalyticsTestId || currentTestId;
    analyticsDebug("publishAnswerKey called for testId:", testId);

    if (!testId) {
        if (typeof showWarning === 'function') showWarning("Please select a test first.");
        else alert("Please select a test first.");
        return;
    }

    const sessionToken = getAnalyticsAdminSessionToken();
    if (!sessionToken) {
        alert('Admin session expired. Please login again.');
        return;
    }

    const confirmed = confirm(`Are you sure you want to publish the Answer Key for test ${window.currentAnalyticsTestName || testId}?`);
    if (!confirmed) return;

    showLoading(true);
    try {
        analyticsDebug("Sending publishAnswerKey request");
        const res = await api.post({
            action: 'publishAnswerKey',
            testId: testId,
            sessionToken: sessionToken
        });
        analyticsDebug("publishAnswerKey response:", res);

        if (!res || res.success !== true) {
            alert('Publish failed: ' + (res?.error || 'Unknown error'));
            return;
        }

        const msg = `Answer key published to ${res.sentCount || 0} candidates.`;
        alert(msg);
    } catch (err) {
        analyticsDebug("publishAnswerKey failed", err);
        alert("Publish answer key failed: " + err.message);
    } finally {
        showLoading(false);
    }
}

/* =========================
   CANDIDATE MODAL
========================= */
function showCandidateDetail(userId) {
    analyticsDebug(`showCandidateDetail called for userId: ${userId}`);
    window.currentAnalyticsCandidateUserId = userId;
    
    const candidate = currentTestPerformance.find(p => p.userID == userId);
    const responses = currentTestResponses.filter(r => r.userID == userId);

    if (!candidate) return;

    const nameEl = document.getElementById('modalCandidateName');
    const emailEl = document.getElementById('modalCandidateEmail');
    const idEl = document.getElementById('modalCandidateId');
    const scoreEl = document.getElementById('modalScoreSummary');

    if (nameEl) nameEl.textContent = candidate.name;
    if (emailEl) emailEl.textContent = candidate.Email;
    if (idEl) idEl.textContent = `User ID: ${candidate.userID}`;
    
    if (scoreEl) {
        scoreEl.innerHTML = `
            <div class="stats-grid" style="margin-top: 20px;">
                <div class="stat-card glass-card">
                    <div class="stat-info">
                        <h3>Net Score / Questions</h3>
                        <p>${candidate.NetScore ?? candidate.TotalScore} marks · ${candidate.CorrectCount}/${candidate.TotalQuestions} correct</p>
                    </div>
                </div>
                <div class="stat-card glass-card">
                    <div class="stat-info">
                        <h3>Overall %</h3>
                        <p>${(window.getOverallPercentage ? window.getOverallPercentage(candidate) : 0).toFixed(1)}%</p>
                    </div>
                </div>
            </div>
        `;
    }

    const body = document.getElementById('modalResponsesBody');
    if (body) {
        body.innerHTML = '';
        responses.forEach(r => {
            let statusClass = 'res-unanswered';
            let statusText = 'Unanswered';
            if (r.IsCorrect === true) { statusClass = 'res-correct'; statusText = 'Correct'; }
            else if (r.IsUnanswered === false) { statusClass = 'res-wrong'; statusText = 'Wrong'; }

            const row = `
                <tr>
                    <td>${r.QID}</td>
                    <td>${r.Section}</td>
                    <td>${r.Question}</td>
                    <td>${r.SelectedAnswer || '-'}</td>
                    <td>${r.CorrectAnswer}</td>
                    <td class="${statusClass}"><strong>${statusText}</strong></td>
                </tr>
            `;
            body.innerHTML += row;
        });
    }

    const publishBtn = document.getElementById('modalPublishBtn');
    if (publishBtn) {
        publishBtn.disabled = candidate.ResultPublished || !currentTestId;
    }

    const modal = document.getElementById('candidateModal');
    if (modal) modal.classList.remove('hidden');
}

function closeCandidateModal() {
    const modal = document.getElementById('candidateModal');
    if (modal) modal.classList.add('hidden');
}

/* =========================
   GLOBAL SEARCH (OVERALL)
========================= */
/**
 * FEATURE: Global candidate search
 * Accepts UserID, email, or name and renders cross-test performance history.
 */
async function searchGlobalCandidate() {
    const search = document.getElementById('globalCandidateSearch').value.trim();
    if (!search) return;

    // Searching candidate
    showLoading(true);

    try {
        // Send multiple search fields for flexible backend lookup
        const stats = await api.get('getCandidateAnalytics', {
            query: search,
            userID: search,
            email: search,
            name: search
        });

        if (!stats || stats.error) {
            if (typeof showAlert === 'function') await showAlert("No performance data found for this candidate.");
            else alert("No performance data found for this candidate.");
            return;
        }

        // Global stats loaded

        const globExamsEl = document.getElementById('globalTotalExams');
        const globAvgEl = document.getElementById('globalAvgScore');
        const globStrongEl = document.getElementById('globalStrongestSec');
        const globResCont = document.getElementById('globalResultContainer');

        if (globExamsEl) globExamsEl.textContent = stats.totalExams;
        if (globAvgEl) globAvgEl.textContent = stats.avgOverallPercentage != null ? stats.avgOverallPercentage + '%' : '0%';
        if (globStrongEl) globStrongEl.textContent = stats.strongestSections ? stats.strongestSections.join(', ') : '-';
        const avgAccEl = document.getElementById('globalAvgAccuracy');
        if (avgAccEl) avgAccEl.textContent = stats.avgPercentile + ' %ile';

        // Render History Table
        const historyBody = document.getElementById('globalHistoryBody') || createHistoryTable();
        if (historyBody) {
            historyBody.innerHTML = stats.examHistory.map(ex => `
                <tr>
                    <td>${ex.testId}</td>
                    <td>${ex.date ? new Date(ex.date).toLocaleDateString() : '-'}</td>
                    <td><strong>${ex.overallPercentage != null ? ex.overallPercentage + '%' : '-'}</strong></td>
                    <td>${ex.percentile != null ? ex.percentile + ' %ile' : '-'}</td>
                    <td>#${ex.rank || '-'}</td>
                    <td><span class="status-badge success">${ex.state || 'Completed'}</span></td>
                </tr>
            `).join('');
        }

        // Progression Chart
        renderProgressionChart(stats.examHistory);

        if (globResCont) globResCont.classList.remove('hidden');
    } catch (err) {
        debugLog('ERROR', 'ANALYTICS', 'Global search failed', err.message);
        if (typeof showAlert === 'function') await showAlert("Search failed. Please try again.");
        else alert("Search failed. Please try again.");
    } finally {
        showLoading(false);
    }
}

function createHistoryTable() {
    const container = document.getElementById('globalResultContainer');
    const tableDiv = document.createElement('div');
    tableDiv.className = 'table-wrapper glass-card';
    tableDiv.style.marginTop = '30px';
    tableDiv.innerHTML = `
        <h3 style="padding: 20px;">Examination History</h3>
        <table>
            <thead>
                <tr>
                    <th>Test ID</th>
                    <th>Date</th>
                    <th>Overall %</th>
                    <th>Percentile</th>
                    <th>Rank</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody id="globalHistoryBody"></tbody>
        </table>
    `;
    container.appendChild(tableDiv);
    return document.getElementById('globalHistoryBody');
}

function renderProgressionChart(examHistory) {
    const ctx = document.getElementById('progressionChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (progressionChart) {
        progressionChart.destroy();
        progressionChart = null;
    }

    const history = (examHistory || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    if (history.length === 0) return;

    progressionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(ex => ex.testId || 'Test'),
            datasets: [{
                label: 'Overall %',
                data: history.map(ex => Number(ex.overallPercentage ?? ex.score) || 0),
                borderColor: '#2563eb',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(37, 99, 235, 0.1)'
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

/* =========================
   HELPERS
========================= */
function switchTab(tabId) {
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    const content = document.getElementById(tabId);
    
    if (!btn || !content) return;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    content.classList.add('active');
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !show);
}

function sortQuestions(key) {
    if (questionSort.key === key) questionSort.asc = !questionSort.asc;
    else { questionSort.key = key; questionSort.asc = true; }
    renderQuestionTable();
}

function sortCandidates(key) {
    if (candidateSort.key === key) candidateSort.asc = !candidateSort.asc;
    else { candidateSort.key = key; candidateSort.asc = true; }
    renderCandidateTable();
}

function exportTable(tableId, filename) {
    const table = document.getElementById(tableId);
    let csv = [];
    const rows = table.querySelectorAll("tr");
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll("td, th");
        for (let j = 0; j < cols.length; j++) 
            row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
        csv.push(row.join(","));
    }

    const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportCandidatePerformancePdf() {
    analyticsDebug("exportCandidatePerformancePdf called");
    
    if (typeof jspdf === 'undefined') {
        analyticsDebug("jsPDF dependency missing");
        alert("PDF Export library (jsPDF) is not loaded. Please refresh or contact support.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.text(`Candidate Performance Report - ${currentTestId}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableData = currentTestPerformance.map((p, i) => [
        p.Rank || (i + 1),
        p.name,
        p.Email,
        p.NetScore ?? p.TotalScore,
        (window.getOverallPercentage ? window.getOverallPercentage(p) : 0).toFixed(1) + '%',
        p.Percentile != null ? p.Percentile : '-',
        p.CorrectCount,
        p.WrongCount,
        p.UnansweredCount
    ]);

    doc.autoTable({
        startY: 30,
        head: [['Rank', 'Name', 'Email', 'Net', 'Overall %', 'Percentile', 'C', 'W', 'U']],
        body: tableData,
        theme: 'striped'
    });

    doc.save(`Candidates_${currentTestId}.pdf`);
}

// Standalone support
if (window.location.href.includes('analytics.html')) {
    document.addEventListener('DOMContentLoaded', initEmbeddedAnalytics);
}

/* =========================
   SECTION DETAIL MODAL
========================= */
function showSectionDetail(sectionName) {
    const sectionData = (window.processedSections || {})[sectionName];
    if (!sectionData) return;

    // Calculate section-specific statistics
    const avgPercentage = sectionData.count > 0 
        ? (sectionData.percentageSum / sectionData.count)
        : (window.calcAccuracyPercentage ? window.calcAccuracyPercentage(sectionData.correct, sectionData.total) : 0);
    
    const nameEl = document.getElementById('modalSectionName');
    const pctEl = document.getElementById('modalSectionPercentage');
    const totalEl = document.getElementById('modalSectionTotal');
    const corrEl = document.getElementById('modalSectionCorrect');
    const wrngEl = document.getElementById('modalSectionWrong');
    const unansEl = document.getElementById('modalSectionUnanswered');
    const prcEl = document.getElementById('modalSectionPercentile');

    if (nameEl) nameEl.textContent = `${sectionName} - Detailed Analysis`;
    if (pctEl) pctEl.textContent = avgPercentage.toFixed(1) + '%';
    if (totalEl) totalEl.textContent = (sectionData.total / sectionData.count).toFixed(0);
    if (corrEl) corrEl.textContent = sectionData.correct;
    if (wrngEl) wrngEl.textContent = sectionData.wrong;
    if (unansEl) unansEl.textContent = sectionData.unanswered;
    if (prcEl) prcEl.textContent = avgPercentage.toFixed(1) + '%';

    // Build candidate-wise section performance
    const candidateSectionStats = [];
    
    currentTestPerformance.forEach((candidate, idx) => {
        const sections = window.parseSectionAnalytics(candidate.SectionAnalyticsJSON);
        if (sections[sectionName]) {
            const sec = sections[sectionName];
            const secPercentage = window.getSectionPercentage 
                ? window.getSectionPercentage(sec)
                : (window.calcAccuracyPercentage ? window.calcAccuracyPercentage(sec.correct, sec.total) : 0);
            
            candidateSectionStats.push({
                rank: candidate.Rank || (idx + 1),
                name: candidate.name,
                email: candidate.Email,
                percentage: secPercentage,
                correct: sec.correct,
                wrong: sec.wrong,
                unanswered: sec.unanswered
            });
        }
    });

    // Sort by percentage (descending)
    candidateSectionStats.sort((a, b) => b.percentage - a.percentage);

    // Section Questions
    const questionBody = document.getElementById('modalSectionQuestionsBody');
    if (questionBody) {
        questionBody.innerHTML = '';
        const sectionQuestions = (window.processedQuestions || []).filter(q => q.section === sectionName);
        sectionQuestions.sort((a, b) => {
            const accA = (a.totalCorrect / (a.totalCorrect + a.totalWrong + a.totalUnanswered)) || 0;
            const accB = (b.totalCorrect / (b.totalCorrect + b.totalWrong + b.totalUnanswered)) || 0;
            return accA - accB; // Show toughest questions first
        });

        sectionQuestions.forEach(q => {
            const accuracy = (q.totalCorrect / (q.totalCorrect + q.totalWrong + q.totalUnanswered)) * 100 || 0;
            questionBody.innerHTML += `
                <tr>
                    <td>${q.qid}</td>
                    <td title="${q.question}">${q.question.substring(0, 30)}...</td>
                    <td>${accuracy.toFixed(1)}%</td>
                    <td>${q.totalCorrect}</td>
                    <td>${q.totalWrong}</td>
                    <td>${q.totalUnanswered}</td>
                </tr>
            `;
        });
    }

    // Render candidate section performance table
    const tableBody = document.getElementById('modalSectionCandidatesBody');
    if (tableBody) {
        tableBody.innerHTML = '';
        
        candidateSectionStats.forEach((stat, idx) => {
            const row = `
                <tr>
                    <td><strong>#${stat.rank}</strong></td>
                    <td>
                        <div style="font-weight: 600;">${stat.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${stat.email}</div>
                    </td>
                    <td><strong>${stat.percentage.toFixed(1)}%</strong></td>
                    <td>${stat.correct}</td>
                    <td>${stat.wrong}</td>
                    <td>${stat.unanswered}</td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });
    }

    const modal = document.getElementById('sectionModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSectionModal() {
    const modal = document.getElementById('sectionModal');
    if (modal) modal.classList.add('hidden');
}