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
let sectionSort = 'default'; // stores the selected sort option value

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
    attachById('sectionSearch', 'input', () => renderSectionTable());
    attachById('sectionFilter', 'change', () => renderSectionTable());
    attachById('sectionDifficultyFilter', 'change', () => renderSectionTable());
    // Section Sort
    attachById('sectionSort', 'change', () => renderSectionTable());
    attachById('leaderboardSearch', 'input', () => renderLeaderboard());

    
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

        window.currentAnalyticsPerformance = currentTestPerformance;
        window.currentAnalyticsResponses = currentTestResponses;

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

function pickFirstValue(obj, keys, fallback = '') {
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
            return obj[key];
        }
    }
    return fallback;
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
    const normalizedSections = normalizeSectionAnalytics(currentTestPerformance, currentTestResponses);
    window.processedSections = normalizedSections; // Store normalized sections directly

    // Process Question-wise Data
    const qStats = {};

    if (!Array.isArray(currentTestResponses) || currentTestResponses.length === 0) {
        analyticsDebug("No responses found to process question-wise stats");
        window.processedQuestions = [];
        return;
    }

    currentTestResponses.forEach(r => {
        const rec = normalizeRecord(r);
        const qidVal = pickFirstValue(rec, ['qid', 'questionid', 'q_id'], '');
        if (!qidVal) return;

        if (!qStats[qidVal]) {
            const sectionVal = pickFirstValue(rec, ['section', 'sectionname', 'section_name'], 'General');
            const difficultyVal = pickFirstValue(rec, ['difficulty', 'hardness', 'level'], 'Medium');
            const questionTextVal = pickFirstValue(rec, ['question', 'questiontext', 'question_text'], 'Unknown Question');
            const correctAnswerVal = pickFirstValue(rec, [
                'correctanswer',
                'correct_answer',
                'correct',
                'answerkey',
                'answer_key',
                'correctans',
                'rightanswer',
                'right_answer'
            ], '-');

            qStats[qidVal] = {
                qid: qidVal,
                question: questionTextVal,
                section: sectionVal,
                difficulty: difficultyVal,
                correct: correctAnswerVal,
                totalCorrect: 0,
                totalWrong: 0,
                totalUnanswered: 0
            };
        }

        const isCorrect = rec.iscorrect === true || rec.iscorrect === 'true' || rec.iscorrect === 'TRUE';
        const isUnanswered = rec.isunanswered === true || rec.isunanswered === 'true' || rec.isunanswered === 'TRUE';

        if (isCorrect) {
            qStats[qidVal].totalCorrect++;
        } else if (isUnanswered) {
            qStats[qidVal].totalUnanswered++;
        } else {
            qStats[qidVal].totalWrong++;
        }
    });
    window.processedQuestions = Object.values(qStats);
    window.processedSections = normalizedSections;

    // Populate filter dropdowns with data from processed arrays
    populateQuestionSectionFilter();
    populateSectionFilter();

    // Expose additional aliases for external access
    window.analyticsQuestions = window.processedQuestions;
    window.questionData = window.processedQuestions;
    window.analyticsResponses = currentTestResponses;
    window.responseData = currentTestResponses;
    window.analyticsPerformance = currentTestPerformance;
    window.performanceData = currentTestPerformance;

    analyticsDebug(`Processed ${window.processedQuestions.length} unique questions`);
}

function populateQuestionSectionFilter() {
    const qSecFilter = document.getElementById('qSectionFilter');
    if (!qSecFilter) return;

    const currentValue = qSecFilter.value || '';

    const sections = [...new Set(
        (window.processedQuestions || [])
            .map(q => String(q.section || '').trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    qSecFilter.innerHTML = '<option value="">All Sections</option>';

    sections.forEach(section => {
        const option = document.createElement('option');
        option.value = section;
        option.textContent = section;
        qSecFilter.appendChild(option);
    });

    if (sections.includes(currentValue)) {
        qSecFilter.value = currentValue;
    }
}

function populateSectionFilter() {
    const sectionFilter = document.getElementById('sectionFilter');
    if (!sectionFilter) return;

    const currentValue = sectionFilter.value || '';

    const sections = [...new Set(
        (window.processedSections || [])
            .map(s => String(s.section || s.Section || '').trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    sectionFilter.innerHTML = '<option value="">All Sections</option>';

    sections.forEach(section => {
        const option = document.createElement('option');
        option.value = section;
        option.textContent = section;
        sectionFilter.appendChild(option);
    });

    if (sections.includes(currentValue)) {
        sectionFilter.value = currentValue;
    }
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
        else if (pct <= 60) pctBudgets['41-60']++;
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

    const secLabels = Object.keys(window.processedSections).length > 0
        ? window.processedSections.map(s => s.section)
        : [];
    const secAccuracies = secLabels.map(s => {
        const section = window.processedSections.find(sec => sec.section === s);
        if (section) {
            return section.accuracy || 0;
        }
        return 0;
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

/**
 * FEATURE: Section-wise sorting and difficulty filter
 * Handles filtering by section name, difficulty, and search, plus sorting by various criteria.
 */
function renderSectionTable() {
    const body = document.getElementById('sectionTableBody');
    body.innerHTML = '';

    // Use normalized sections directly
    const sections = window.processedSections || [];
    if (sections.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;">No section data available</td></tr>';
        return;
    }

    // Get filter values
    const sectionSearch = String(document.getElementById('sectionSearch')?.value || '').toLowerCase().trim();
    const sectionFilter = String(document.getElementById('sectionFilter')?.value || '').toLowerCase().trim();
    const difficultyFilter = String(document.getElementById('sectionDifficultyFilter')?.value || '').toLowerCase().trim();
    const sectionSort = String(document.getElementById('sectionSort')?.value || 'default').trim();

    // Enrich each section with difficulty and difficultyScore
    const enrichedSections = sections.map(section => {
        const derived = deriveSectionDifficulty(
            section.section ?? section.Section,
            window.processedQuestions || [],
            window.currentTestResponses || []
        );

        return {
            ...section,
            difficulty: section.difficulty ?? section.Difficulty ?? derived.difficulty,
            difficultyScore: section.difficultyScore ?? derived.difficultyScore
        };
    });

    // Filter sections based on search and filters
    const filteredSections = enrichedSections.filter(section => {
        const name = String(section.section ?? section.Section ?? '').trim();
        const nameLower = name.toLowerCase();

        const sectionDifficulty = String(section.difficulty ?? section.Difficulty ?? '').trim().toLowerCase();
        const selectedDifficulty = difficultyFilter;

        const matchesSearch = !sectionSearch || nameLower.includes(sectionSearch);
        const matchesSection = !sectionFilter || nameLower === sectionFilter;
        const matchesDifficulty = !selectedDifficulty || sectionDifficulty === selectedDifficulty;

        return matchesSearch && matchesSection && matchesDifficulty;
    });

    // Define difficulty ranking for sorting
    const difficultyRank = {
        easy: 1,
        medium: 2,
        hard: 3,
        mixed: 2
    };

    // Sort filtered sections based on selected sort option
    filteredSections.sort((a, b) => {
        const aName = String(a.section ?? a.Section ?? '');
        const bName = String(b.section ?? b.Section ?? '');
        const aPct = Number(a.percentage ?? a.Percentage ?? 0);
        const bPct = Number(b.percentage ?? b.Percentage ?? 0);
        const aDiff = Number(a.difficultyScore ?? difficultyRank[String(a.difficulty || '').toLowerCase()] ?? 2);
        const bDiff = Number(b.difficultyScore ?? difficultyRank[String(b.difficulty || '').toLowerCase()] ?? 2);

        switch (sectionSort) {
            case 'section_az':
                return aName.localeCompare(bName);
            case 'section_za':
                return bName.localeCompare(aName);
            case 'percentage_high':
                return bPct - aPct;
            case 'percentage_low':
                return aPct - bPct;
            case 'difficulty_easy':
                return aDiff - bDiff;
            case 'difficulty_hard':
                return bDiff - aDiff;
            default:
                return 0;
        }
    });

    // Render each section
    filteredSections.forEach(section => {
        // Calculate percentage and status using helper functions
        const percentage = calculateSectionPercentage(section);
        const status = getSectionStatusFromPercentage(percentage);
        const progressStyle = getSectionProgressStyle(percentage);

        const row = `
            <tr onclick="showSectionDetail('${section.section}')" style="cursor: pointer; transition: background 0.2s;">
                <td><strong>${section.section} (${section.difficulty || 'Mixed'})</strong></td>
                <td>${section.totalQuestions || 0}</td>
                <td>${section.correct}</td>
                <td>${section.wrong}</td>
                <td>${section.unanswered}</td>
                <td>
                    <div class="accuracy-bar">
                        <div class="accuracy-fill ${status.className} ${progressStyle.className}" style="${progressStyle.style}"></div>
                    </div>
                    ${percentage.toFixed(1)}%
                </td>
                <td><span class="status-badge ${status.className}">${status.text}</span></td>
            </tr>
        `;
        body.innerHTML += row;
    });

    // Populate section filter for questions (keeping existing functionality)
    const qSecFilter = document.getElementById('qSectionFilter');
    if (qSecFilter) {
        qSecFilter.innerHTML = '<option value="">All Sections</option>';
        // Use original sections (not enriched) for the dropdown to avoid duplication
        const sectionNames = [...new Set(sections.map(s => s.section))];
        sectionNames.forEach(sectionName => {
            const option = document.createElement('option');
            option.value = sectionName;
            option.textContent = sectionName;
            qSecFilter.appendChild(option);
        });
    }
}

/**
 * FEATURE: Question-wise filters
 * Keeps section and difficulty filters stable across mixed-case backend fields.
 */
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
    const secFilter = qSecEl ? qSecEl.value.toLowerCase() : '';
    const diffFilter = qDiffEl ? qDiffEl.value.toLowerCase() : '';

    analyticsDebug("Filtering questions", { search, secFilter, diffFilter });

    if (!window.processedQuestions || window.processedQuestions.length === 0) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;">No question data available for this test.</td></tr>';
        return;
    }

    let filtered = [...window.processedQuestions].filter(q => {
        const matchSearch = !search ||
            (q.question || '').toLowerCase().includes(search) ||
            (q.qid || '').toString().includes(search);
        const matchSec = !secFilter || (q.section || '').toLowerCase() === secFilter;
        const matchDiff = !diffFilter || (q.difficulty || '').toLowerCase() === diffFilter;
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
            AvgSecPct: window.getAverageSectionPercentage ? window.getAverageSectionPercentage(p) : 0
            // Percentile will be added later
        };
    });

    // Add percentile to each candidate
    const totalCandidates = candidates.length;
    candidates = candidates.map(c => ({
        ...c,
        PercentileVal: getCandidatePercentile(c, totalCandidates)
    }));

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
                <td>${c.PercentileVal !== '-' ? `${c.PercentileVal}%ile` : '-'}</td>
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
 * Converts mixed backend section shapes into one table/chart format.
 */
function normalizeSectionAnalytics(performanceRecords = [], responseRecords = []) {
    const sections = new Map();

    function ensureSection(name) {
        const key = String(name || 'Unknown Section').trim() || 'Unknown Section';

        if (!sections.has(key)) {
            sections.set(key, {
                section: key,
                totalQuestions: 0,
                correct: 0,
                wrong: 0,
                unanswered: 0,
                score: 0,
                maxMarks: 0,
                attempts: 0
            });
        }

        return sections.get(key);
    }

    function addSectionStats(sectionName, raw) {
        const target = ensureSection(sectionName);

        target.correct += Number(raw.correct ?? raw.Correct ?? raw.correctCount ?? raw.CorrectCount ?? 0);
        target.wrong += Number(raw.wrong ?? raw.Wrong ?? raw.wrongCount ?? raw.WrongCount ?? 0);
        target.unanswered += Number(raw.unanswered ?? raw.Unanswered ?? raw.unansweredCount ?? raw.UnansweredCount ?? 0);
        target.score += Number(raw.score ?? raw.Score ?? raw.netScore ?? raw.NetScore ?? raw.marksAwarded ?? raw.MarksAwarded ?? 0);
        target.maxMarks += Number(raw.maxMarks ?? raw.MaxMarks ?? raw.totalMarks ?? raw.TotalMarks ?? raw.possibleMarks ?? 0);
        target.totalQuestions += Number(raw.totalQuestions ?? raw.TotalQuestions ?? raw.questionCount ?? raw.QuestionCount ?? 0);
        target.attempts += 1;
    }

    for (const record of performanceRecords || []) {
        let rawSections =
            record.sections ??
            record.Sections ??
            record.sectionAnalytics ??
            record.SectionAnalytics ??
            record.SectionWise ??
            record.sectionWise ??
            record.SectionAnalyticsJSON;

        if (typeof rawSections === 'string') {
            try {
                rawSections = JSON.parse(rawSections);
            } catch (e) {
                rawSections = null;
            }
        }

        if (Array.isArray(rawSections)) {
            rawSections.forEach(sec => {
                const name = sec.section ?? sec.Section ?? sec.name ?? sec.Name;
                addSectionStats(name, sec);
            });
        } else if (rawSections && typeof rawSections === 'object') {
            Object.entries(rawSections).forEach(([name, sec]) => {
                addSectionStats(name, sec || {});
            });
        }
    }

    // Fallback: rebuild from response records if no valid section stats found
    if (sections.size === 0 && Array.isArray(responseRecords)) {
        for (const response of responseRecords) {
            const sectionName = response.section ?? response.Section ?? 'Unknown Section';
            const sec = ensureSection(sectionName);

            const selected = String(response.selectedAnswer ?? response.SelectedAnswer ?? '').trim();
            const isUnanswered = Boolean(response.isUnanswered ?? response.IsUnanswered) || !selected;
            const isCorrect = Boolean(response.isCorrect ?? response.IsCorrect);

            const marksAwarded = Number(
                response.marksAwarded ??
                response.MarksAwarded ??
                response.scoreAwarded ??
                response.ScoreAwarded ??
                0
            );

            const maxMarks = Number(response.marks ?? response.Marks ?? 0);

            if (isUnanswered) sec.unanswered += 1;
            else if (isCorrect) sec.correct += 1;
            else sec.wrong += 1;

            sec.score += marksAwarded;
            sec.maxMarks += maxMarks;
            sec.totalQuestions += 1;
        }
    }

    const result = Array.from(sections.values()).map(sec => {
        if (!sec.totalQuestions) {
            sec.totalQuestions = sec.correct + sec.wrong + sec.unanswered;
        }

        const percentage = calculateSectionPercentage(sec);
        const accuracy = sec.totalQuestions > 0 ? (sec.correct / sec.totalQuestions) * 100 : 0;
        const status = getSectionStatusFromPercentage(percentage);

        return {
            ...sec,
            percentage: Number(percentage.toFixed(2)),
            accuracy: Number(accuracy.toFixed(2)),
            status
        };
    });

    return result;
}

/**
 * FEATURE: Section details drill-down
 * Filters response/candidate analytics to the clicked section only.
 */
function getSectionSpecificDetails(sectionName, responseRecords = [], performanceRecords = []) {
    const target = String(sectionName || '').trim().toLowerCase();

    const responses = (responseRecords || []).filter(r => {
        const sec = String(r.section ?? r.Section ?? '').trim().toLowerCase();
        return sec === target;
    });

    const candidates = (performanceRecords || []).filter(record => {
        let rawSections =
            record.sections ??
            record.Sections ??
            record.SectionAnalyticsJSON ??
            record.sectionAnalytics;

        if (typeof rawSections === 'string') {
            try {
                rawSections = JSON.parse(rawSections);
            } catch (e) {
                rawSections = null;
            }
        }

        if (!rawSections) return false;

        if (Array.isArray(rawSections)) {
            return rawSections.some(sec =>
                String(sec.section ?? sec.Section ?? sec.name ?? '').trim().toLowerCase() === target
            );
        }

        if (typeof rawSections === 'object') {
            return Object.keys(rawSections).some(k => String(k).trim().toLowerCase() === target);
        }

        return false;
    });

    return { responses, candidates };
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

    const publishBtn = document.getElementByid('modalPublishBtn');
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
 * Accepts UserID, email, name, or university ID and renders cross-test history.
 */
async function searchGlobalCandidate() {
    const searchInput = document.getElementById('globalCandidateSearch');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    if (!searchTerm) return;

    // Searching candidate
    showLoading(true);

    try {
        // Send all possible search fields for flexible backend lookup
        const stats = await api.get('getCandidateAnalytics', {
            query: searchTerm,
            userID: searchTerm,
            UserID: searchTerm,
            email: searchTerm,
            Email: searchTerm,
            name: searchTerm,
            Name: searchTerm,
            univId: searchTerm,
            universityID: searchTerm,
            UniversityID: searchTerm
        });

        if (!stats || stats.success === false) {
            if (typeof showAlert === 'function') await showAlert(stats?.error || "No performance data found for this candidate.");
            else alert(stats?.error || "No performance data found for this candidate.");
            return;
        }

        // Handle no records found
        if (Number(stats.totalExams || 0) === 0 || !Array.isArray(stats.examHistory) || stats.examHistory.length === 0) {
            if (typeof showAlert === 'function') await showAlert(`No candidate records found for: "${searchTerm}"`);
            else alert(`No candidate records found for: "${searchTerm}"`);
            return;
        }

        // Global stats loaded
        const globExamsEl = document.getElementById('globalTotalExams');
        const globAvgEl = document.getElementById('globalAvgScore');
        const globStrongEl = document.getElementById('globalStrongestSec');
        const globResCont = document.getElementById('globalResultContainer');
        const globNameEl = document.getElementById('globalCandidateName');
        const globEmailEl = document.getElementById('globalCandidateEmail');
        const globIdEl = document.getElementById('globalCandidateID');

        if (globExamsEl) globExamsEl.textContent = stats.totalExams;
        if (globAvgEl) globAvgEl.textContent = stats.avgOverallPercentage != null ? stats.avgOverallPercentage + '%' : '0%';
        if (globStrongEl) globStrongEl.textContent = stats.strongestSections ? stats.strongestSections.join(', ') : '-';
        const avgAccEl = document.getElementById('globalAvgAccuracy');
        if (avgAccEl) avgAccEl.textContent = stats.avgPercentile + ' %ile';

        // Candidate info
        if (globNameEl) globNameEl.textContent = stats.candidate?.name || '-';
        if (globEmailEl) globEmailEl.textContent = stats.candidate?.Email || stats.candidate?.email || '-';
        if (globIdEl) globIdEl.textContent = stats.candidate?.userID || stats.candidate?.UserID || '-';

        // Render History Table
        const historyBody = document.getElementById('globalHistoryBody') || createHistoryTable();
        if (historyBody) {
            historyBody.innerHTML = stats.examHistory.map(ex => `
                <tr>
                    <td>${ex.testId}</td>
                    <td>${ex.date ? new Date(ex.date).toLocaleDateString() : '-'}</td>
                    <td>${ex.overallPercentage != null ? ex.overallPercentage + '%' : '-'}</td>
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
/**
 * FEATURE: Section-wise analytics percentage
 * Calculates a safe section percentage from score/maxMarks or correct/total fallback.
 */
function calculateSectionPercentage(section) {
    const score = Number(
        section.score ??
        section.Score ??
        section.netScore ??
        section.NetScore ??
        section.marksAwarded ??
        section.MarksAwarded ??
        section.totalScore ??
        0
    );

    const maxMarks = Number(
        section.maxMarks ??
        section.MaxMarks ??
        section.totalMarks ??
        section.TotalMarks ??
        section.possibleMarks ??
        section.PossibleMarks ??
        0
    );

    const correct = Number(section.correct ?? section.Correct ?? section.correctCount ?? section.CorrectCount ?? 0);
    const wrong = Number(section.wrong ?? section.Wrong ?? section.wrongCount ?? section.WrongCount ?? 0);
    const unanswered = Number(section.unanswered ?? section.Unanswered ?? section.unansweredCount ?? section.UnansweredCount ?? 0);

    if (maxMarks > 0) {
        return Math.max(0, Math.min(100, (score / maxMarks) * 100));
    }

    const total = correct + wrong + unanswered;

    if (total > 0) {
        return Math.max(0, Math.min(100, (correct / total) * 100));
    }

    return 0;
}

/**
 * FEATURE: Section-wise analytics status
 * Converts section percentage into dashboard status text and class.
 */
function getSectionStatusFromPercentage(percentage) {
    const pct = Number(percentage || 0);

    if (pct >= 80) return { text: 'Excellent', className: 'excellent' };
    if (pct >= 60) return { text: 'Good', className: 'good' };
    if (pct >= 40) return { text: 'Average', className: 'average' };

    return { text: 'Needs Improvement', className: 'weak' };
}

/**
 * FEATURE: Section progress visual style
 * Maps percentage to red/orange/yellow/green intensity and glow.
 */
function getSectionProgressStyle(percentage) {
    const pct = Math.max(0, Math.min(100, Number(percentage || 0)));

    if (pct === 0) {
        return {
            className: 'section-progress-zero',
            style: `width:${pct}%; background:rgba(239,68,68,0.25); box-shadow:none;`
        };
    }

    if (pct < 20) {
        return {
            className: 'section-progress-very-low',
            style: `width:${pct}%; background:linear-gradient(90deg,#7f1d1d,#ea580c); box-shadow:0 0 8px rgba(234,88,12,.35);`
        };
    }

    if (pct < 40) {
        return {
            className: 'section-progress-low',
            style: `width:${pct}%; background:linear-gradient(90deg,#ea580c,#f97316); box-shadow:0 0 10px rgba(249,115,22,.45);`
        };
    }

    if (pct < 55) {
        return {
            className: 'section-progress-mid-low',
            style: `width:${pct}%; background:linear-gradient(90deg,#ca8a04,#eab308); box-shadow:0 0 10px rgba(234,179,8,.45);`
        };
    }

    if (pct < 70) {
        return {
            className: 'section-progress-mid',
            style: `width:${pct}%; background:linear-gradient(90deg,#eab308,#fde047); box-shadow:0 0 12px rgba(253,224,71,.45);`
        };
    }

    if (pct < 85) {
        return {
            className: 'section-progress-mid-high',
            style: `width:${pct}%; background:linear-gradient(90deg,#fde047,#84cc16); box-shadow:0 0 14px rgba(132,204,22,.5);`
        };
    }

    if (pct < 100) {
        return {
            className: 'section-progress-high',
            style: `width:${pct}%; background:linear-gradient(90deg,#84cc16,#22c55e); box-shadow:0 0 16px rgba(34,197,94,.55);`
        };
    }

    return {
        className: 'section-progress-perfect',
        style: `width:100%; background:linear-gradient(90deg,#86efac,#22c55e,#bbf7d0); box-shadow:0 0 22px rgba(34,197,94,.85);`
    };
}

/**
 * FEATURE: Section difficulty derivation
 * Derives a section-level difficulty from question/response rows when section stats do not include it.
 */
function deriveSectionDifficulty(sectionName, questionRows = [], responseRows = []) {
    const target = String(sectionName || '').trim().toLowerCase();

    const difficultyWeight = {
        easy: 1,
        medium: 2,
        hard: 3
    };

    const values = [];

    function collect(row) {
        const rowSection = String(row.section ?? row.Section ?? '').trim().toLowerCase();
        if (rowSection !== target) return;

        const diff = String(row.difficulty ?? row.Difficulty ?? row.hardness ?? row.Hardness ?? '').trim();

        if (diff) values.push(diff);
    }

    (questionRows || []).forEach(collect);
    (responseRows || []).forEach(collect);

    if (!values.length) {
        return {
            difficulty: 'Mixed',
            difficultyScore: 2
        };
    }

    const counts = values.reduce((acc, diff) => {
        const key = String(diff || 'Medium').trim();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed';

    const avgScore = values.reduce((sum, diff) => {
        return sum + (difficultyWeight[String(diff).toLowerCase()] || 2);
    }, 0) / values.length;

    return {
        difficulty: dominant,
        difficultyScore: avgScore
    };
}

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

/**
 * FEATURE: Candidate percentile normalization
 * Reads percentile from multiple backend shapes or computes from rank/total candidates.
 * Returns a number (to one decimal place) or '-' if not available.
 */
function getCandidatePercentile(record, totalCandidates = null) {
    const raw =
        record.Percentile ??
        record.percentile ??
        record.RankPercentile ??
        record.rankPercentile ??
        record.ranking?.rankPercentile ??
        record.ScorePercentile ??
        record.scorePercentile ??
        record.summary?.scorePercentile ??
        record.OverallPercentile ??
        record.overallPercentile ??
        null;

    if (raw !== null && raw !== undefined && raw !== '') {
        const cleaned = String(raw).replace('%', '').trim();
        const num = Number(cleaned);
        if (!Number.isNaN(num)) {
            return Number(num.toFixed(1));
        }
    }

    const rank = Number(record.Rank ?? record.rank ?? record.ranking?.rank ?? 0);
    const total =
        Number(
            totalCandidates ??
            record.TotalCandidates ??
            record.totalCandidates ??
            record.ranking?.totalCandidates ??
            0
        );

    if (rank > 0 && total > 0) {
        const computed = ((total - rank + 1) / total) * 100;
        return Number(computed.toFixed(1));
    }

    return '-';
}

function showSectionDetail(sectionName) {
    analyticsDebug("showSectionDetail called for:", sectionName);

    if (!window.processedSections || window.processedSections.length === 0) {
        analyticsDebug("No section data available");
        showUiDialog("No Data", "No section data available to display details.");
        return;
    }

    // Find the section data (case-insensitive match)
    const sectionData = window.processedSections.find(sec =>
        String(sec.section).trim().toLowerCase() === String(sectionName).trim().toLowerCase()
    );

    if (!sectionData) {
        analyticsDebug("Section data not found for:", sectionName);
        showUiDialog("Data Not Found", `No data found for section: ${sectionName}`);
        return;
    }

    // Update modal header
    const modalSectionName = document.getElementById('modalSectionName');
    if (modalSectionName) {
        modalSectionName.textContent = sectionData.section || 'Unknown Section';
    }

    // Update section stats
    const sectionPercentage = sectionData.percentage !== null && sectionData.percentage !== undefined
        ? sectionData.percentage.toFixed(1) + '%'
        : '0%';
    const modalSectionPercentage = document.getElementById('modalSectionPercentage');
    if (modalSectionPercentage) {
        modalSectionPercentage.textContent = sectionPercentage;
    }

    const modalSectionTotal = document.getElementById('modalSectionTotal');
    if (modalSectionTotal) {
        modalSectionTotal.textContent = sectionData.totalQuestions !== null && sectionData.totalQuestions !== undefined
            ? sectionData.totalQuestions.toString()
            : '0';
    }

    const modalSectionCorrect = document.getElementById('modalSectionCorrect');
    if (modalSectionCorrect) {
        modalSectionCorrect.textContent = sectionData.correctAnswers !== null && sectionData.correctAnswers !== undefined
            ? sectionData.correctAnswers.toString()
            : '0';
    }

    const modalSectionWrong = document.getElementById('modalSectionWrong');
    if (modalSectionWrong) {
        modalSectionWrong.textContent = sectionData.wrongAnswers !== null && sectionData.wrongAnswers !== undefined
            ? sectionData.wrongAnswers.toString()
            : '0';
    }

    const modalSectionUnanswered = document.getElementById('modalSectionUnanswered');
    if (modalSectionUnanswered) {
        modalSectionUnanswered.textContent = sectionData.unanswered !== null && sectionData.unanswered !== undefined
            ? sectionData.unanswered.toString()
            : '0';
    }

    const modalSectionPercentile = document.getElementById('modalSectionPercentile');
    if (modalSectionPercentile) {
        modalSectionPercentile.textContent = sectionData.averagePercentile !== null && sectionData.averagePercentile !== undefined
            ? sectionData.averagePercentile.toFixed(1)
            : '0';
    }

    // Populate candidate performance table
    const tbody = document.getElementById('modalSectionCandidatesBody');
    if (tbody) {
        tbody.innerHTML = ''; // Clear existing rows

        // Get candidates who attempted this section, sorted by section percentage descending
        const candidatesInSection = (currentTestPerformance || []).filter(candidate => {
            const candidateSections = candidate.sections || [];
            return candidateSections.some(sec =>
                String(sec.section).trim().toLowerCase() === String(sectionName).trim().toLowerCase()
            );
        });

        // Sort by section percentage (highest first)
        candidatesInSection.sort((a, b) => {
            const aSection = (a.sections || []).find(sec =>
                String(sec.section).trim().toLowerCase() === String(sectionName).trim().toLowerCase()
            );
            const bSection = (b.sections || []).find(sec =>
                String(sec.section).trim().toLowerCase() === String(sectionName).trim().toLowerCase()
            );

            const aPct = aSection ? (aSection.percentage || 0) : 0;
            const bPct = bSection ? (bSection.percentage || 0) : 0;
            return bPct - aPct; // Descending order
        });

        if (candidatesInSection.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No candidates found for this section</td></tr>';
        } else {
            candidatesInSection.forEach((candidate, index) => {
                const candidateSections = candidate.sections || [];
                const sectionInfo = candidateSections.find(sec =>
                    String(sec.section).trim().toLowerCase() === String(sectionName).trim().toLowerCase()
                ) || {};

                const rank = index + 1;
                const name = candidate.name || 'Unknown';
                const sectionPct = sectionInfo.percentage !== null && sectionInfo.percentage !== undefined
                    ? sectionInfo.percentage.toFixed(1) + '%'
                    : '0%';
                const correct = sectionInfo.correctAnswers !== null && sectionInfo.correctAnswers !== undefined
                    ? sectionInfo.correctAnswers.toString()
                    : '0';
                const wrong = sectionInfo.wrongAnswers !== null && sectionInfo.wrongAnswers !== undefined
                    ? sectionInfo.wrongAnswers.toString()
                    : '0';
                const unanswered = sectionInfo.unanswered !== null && sectionInfo.unanswered !== undefined
                    ? sectionInfo.unanswered.toString()
                    : '0';

                const row = `
                    <tr>
                        <td>${rank}</td>
                        <td>${name}</td>
                        <td>${sectionPct}</td>
                        <td>${correct}</td>
                        <td>${wrong}</td>
                        <td>${unanswered}</td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', row);
            });
        }
    }

    // Show the modal
    const sectionModal = document.getElementById('sectionModal');
    if (sectionModal) {
        sectionModal.classList.remove('hidden');
    }
}

// Close section modal
function closeSectionModal() {
    const modal = document.getElementById('sectionModal');
    if (modal) modal.classList.add('hidden');
}
// Expose functions
window.showSectionDetail = showSectionDetail;
window.closeSectionModal = closeSectionModal;

// Standalone support
if (window.location.href.includes('analytics.html')) {
    document.addEventListener('DOMContentLoaded', initEmbeddedAnalytics);
}