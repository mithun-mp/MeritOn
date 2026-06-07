/**
 * Admin Analytics Module
 * Handles data fetching, processing, and visualization for the MeritOn platform
 */

let allTestsAnalytics = [];
let currentTestPerformance = [];
let currentTestResponses = [];
let allPerformance = []; // For global search
let allUsers = []; // For email / UnivID / name lookup
let progressionChart = null;

let currentTestId = '';
let scoreChart = null;
let sectionChart = null;

// Sorting states
let questionSort = { key: 'QID', asc: true };
let candidateSort = { key: 'Rank', asc: true };

/* =========================
   INITIALIZATION
========================= */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Check
    const user = JSON.parse(localStorage.getItem('cbt_user') || 'null');
    
    if (!user || user.role !== 'admin') {
        debugLog('WARN', 'AUTH', 'Unauthorized access to analytics');
        window.location.href = './admin.html';
        return;
    }

    // 2. Load Initial Data
    showLoading(true);
    try {
        const [tests, perf, users] = await Promise.all([
            api.get('getAllTests'),
            api.get('getPerformance'),
            api.get('getAllUsers')
        ]);
        allTestsAnalytics = Array.isArray(tests) ? tests : (tests?.data || []);
        allPerformance = Array.isArray(perf) ? perf.map(r => window.normalizePayload ? window.normalizePayload(r) : r) : [];
        allUsers = Array.isArray(users) ? users : (users?.data || []);
        
        populateTestSelector();
    } catch (err) {
        debugLog('ERROR', 'ANALYTICS', 'Initialization failed', err.message);
        if (typeof showAlert === 'function') {
            showAlert("Failed to load analytics data.");
        } else {
            alert("Failed to load analytics data.");
        }
    } finally {
        showLoading(false);
    }

    // 3. Event Listeners
    initEventListeners();
});

function initEventListeners() {
    const attachById = (id, event, handler) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(event, handler);
    };

    const attachBySelector = (selector, event, handler) => {
        const el = document.querySelector(selector);
        if (!el) return;
        el.addEventListener(event, handler);
    };

    // Test Selector
    attachById('testSelector', 'change', (e) => {
        loadTestAnalytics(e.target.value);
    });

    // Refresh
    attachById('refreshBtn', 'click', () => {
        if (currentTestId) loadTestAnalytics(currentTestId);
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Filters
    attachById('qSearch', 'input', () => renderQuestionTable());
    attachById('qSectionFilter', 'change', () => renderQuestionTable());
    attachById('qDifficultyFilter', 'change', () => renderQuestionTable());
    attachById('candidateSearch', 'input', () => renderCandidateTable());

    // Global Search
    attachById('globalSearchBtn', 'click', () => {
        debugLog('INFO', 'UI', 'Global Search Triggered');
        searchGlobalCandidate();
    });
    attachById('globalCandidateSearch', 'keypress', (e) => {
        if (e.key === 'Enter') {
            debugLog('INFO', 'UI', 'Global Search Enter Key');
            searchGlobalCandidate();
        }
    });

    // Modal Close
    attachBySelector('.close-modal', 'click', () => {
        debugLog('INFO', 'MODAL', 'Closing Candidate Modal');
        closeCandidateModal();
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            debugLog('INFO', 'MODAL', 'Closing Candidate Modal via Backdrop');
            closeCandidateModal();
        }
    });

    // Publish All and Answer Key
    const publishAllBtn = document.getElementById('publishAllBtn');
    const publishAnswerKeyBtn = document.getElementById('publishAnswerKeyBtn');
    if (publishAllBtn) {
        publishAllBtn.disabled = true;
        attachById('publishAllBtn', 'click', () => {
            publishAllResults();
        });
    }
    if (publishAnswerKeyBtn) {
        publishAnswerKeyBtn.disabled = true;
        attachById('publishAnswerKeyBtn', 'click', () => {
            publishAnswerKey();
        });
    }

    // Export PDF
    attachById('exportCandidatePdf', 'click', () => {
        debugLog('INFO', 'UI', 'Export Candidate PDF Triggered');
        exportCandidatePerformancePdf();
    });
}

/* =========================
   CORE DATA FETCHING
========================= */
async function loadTestAnalytics(testId) {
    const startTime = Date.now();
    const publishAllBtn = document.getElementById('publishAllBtn');
    const publishAnswerKeyBtn = document.getElementById('publishAnswerKeyBtn');
    if (!testId) {
        document.getElementById('analyticsContent').classList.add('hidden');
        if (publishAllBtn) publishAllBtn.disabled = true;
        if (publishAnswerKeyBtn) publishAnswerKeyBtn.disabled = true;
        return;
    }

    currentTestId = testId;
    if (publishAllBtn) publishAllBtn.disabled = true;
    if (publishAnswerKeyBtn) publishAnswerKeyBtn.disabled = true;
    showLoading(true);

    try {
        const [perf, resp] = await Promise.all([
            api.get('getPerformance', { testId }),
            api.get('getResponses', { testId })
        ]);

        if (perf.error) throw new Error(perf.error);
        if (resp.error) throw new Error(resp.error);

        let perfRows = Array.isArray(perf) ? perf.map(r => window.normalizePayload ? window.normalizePayload(r) : r) : [];
        currentTestPerformance = window.enrichRecordsWithUnivId
            ? window.enrichRecordsWithUnivId(perfRows, allUsers)
            : perfRows;
        currentTestResponses = Array.isArray(resp) ? resp.map(r => window.normalizePayload ? window.normalizePayload(r) : r) : [];
        
        // Test data loaded

        document.getElementById('analyticsContent').classList.remove('hidden');
        if (publishAllBtn) publishAllBtn.disabled = false;
        if (publishAnswerKeyBtn) publishAnswerKeyBtn.disabled = false;
        
        processAnalytics();
        renderAll();
        
        // Analytics loaded
    } catch (err) {
        // Analytics load failed
        alert("Error loading test data.");
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

function processAnalytics() {
    // Processing test data
    
    const stats = {
        totalCandidates: currentTestPerformance.length,
        totalQuestions: currentTestPerformance[0]?.TotalQuestions || 0,
        avgScore: 0,
        highestScore: 0,
        avgAccuracy: 0
    };

    if (stats.totalCandidates > 0) {
        const totalScore = currentTestPerformance.reduce((acc, p) => acc + Number(p.NetScore ?? p.TotalScore ?? 0), 0);
        stats.avgScore = (totalScore / stats.totalCandidates).toFixed(1);
        stats.highestScore = Math.max(...currentTestPerformance.map(p => Number(p.NetScore ?? p.TotalScore ?? 0)));

        const totalAccuracy = currentTestPerformance.reduce((acc, p) => {
            return acc + (window.getOverallPercentage ? window.getOverallPercentage(p) : 0);
        }, 0);
        stats.avgAccuracy = (totalAccuracy / stats.totalCandidates).toFixed(1);

        const totalWrong = currentTestPerformance.reduce((acc, p) => acc + Number(p.WrongCount || 0), 0);
        const wrongEl = document.getElementById('statTotalWrong');
        if (wrongEl) wrongEl.textContent = totalWrong;
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

    // Process Section-wise Data
    window.processedSections = {};
    currentTestPerformance.forEach(p => {
        const sections = window.parseSectionAnalytics(p.SectionAnalyticsJSON);
        for (const s in sections) {
            if (!window.processedSections[s]) {
                window.processedSections[s] = { count: 0, correct: 0, wrong: 0, unanswered: 0, total: 0, score: 0, percentageSum: 0 };
            }
            const sec = sections[s];
            window.processedSections[s].count++;
            window.processedSections[s].correct += Number(sec.correct || 0);
            window.processedSections[s].wrong += Number(sec.wrong || 0);
            window.processedSections[s].unanswered += Number(sec.unanswered || 0);
            window.processedSections[s].total += Number(sec.total || 0);
            window.processedSections[s].score += Number(sec.score || 0);
            window.processedSections[s].percentageSum += window.getSectionPercentage
                ? window.getSectionPercentage(sec)
                : 0;
        }
    });

    // Process Question-wise Data
    const qStats = {};
    currentTestResponses.forEach(r => {
        if (!qStats[r.QID]) {
            qStats[r.QID] = { 
                qid: r.QID, 
                question: r.Question || 'Unknown Question', 
                section: r.Section || 'General', 
                difficulty: r.Difficulty || 'Medium', 
                correct: r.CorrectAnswer || '-',
                totalCorrect: 0, 
                totalWrong: 0, 
                totalUnanswered: 0 
            };
        }
        if (r.IsCorrect === true || r.IsCorrect === 'true') qStats[r.QID].totalCorrect++;
        else if (r.IsUnanswered === false || r.IsUnanswered === 'false') qStats[r.QID].totalWrong++;
        else qStats[r.QID].totalUnanswered++;
    });
    window.processedQuestions = Object.values(qStats);
}

function renderAll() {
    const startTime = Date.now();
    renderOverview();
    renderCharts();
    renderSectionTable();
    renderQuestionTable();
    renderCandidateTable();
    // UI rendered
}

function renderOverview() {
    // Already updated via DOM in processAnalytics()
    debugLog('INFO', 'UI', 'Overview stats rendered');
}

function renderCharts() {
    const ctxScore = document.getElementById('scoreDistributionChart').getContext('2d');
    const ctxSection = document.getElementById('sectionComparisonChart').getContext('2d');

    if (scoreChart) scoreChart.destroy();
    if (sectionChart) sectionChart.destroy();

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
    const body = document.getElementById('questionTableBody');
    if (!body) return;

    const qSearchEl = document.getElementById('qSearch');
    const qSecEl = document.getElementById('qSectionFilter');
    const qDiffEl = document.getElementById('qDifficultyFilter');

    const search = qSearchEl ? qSearchEl.value.toLowerCase() : '';
    const secFilter = qSecEl ? qSecEl.value : '';
    const diffFilter = qDiffEl ? qDiffEl.value : '';

    let filtered = (window.processedQuestions || []).filter(q => {
        const matchSearch = (q.question || '').toLowerCase().includes(search) || (q.qid || '').toString().includes(search);
        const matchSec = !secFilter || q.section === secFilter;
        const matchDiff = !diffFilter || q.difficulty === diffFilter;
        return matchSearch && matchSec && matchDiff;
    });

    // Sorting
    filtered.sort((a, b) => {
        let valA = a[questionSort.key];
        let valB = b[questionSort.key];
        
        if (questionSort.key === 'accuracy') {
            valA = (a.totalCorrect / (a.totalCorrect + a.totalWrong)) * 100;
            valB = (b.totalCorrect / (b.totalCorrect + b.totalWrong)) * 100;
        }

        if (valA < valB) return questionSort.asc ? -1 : 1;
        if (valA > valB) return questionSort.asc ? 1 : -1;
        return 0;
    });

    body.innerHTML = '';
    filtered.forEach(q => {
        const accuracy = (q.totalCorrect / (q.totalCorrect + q.totalWrong)) * 100 || 0;
        const row = `
            <tr>
                <td>${q.qid}</td>
                <td>${q.section}</td>
                <td><span class="status-badge ${q.difficulty === 'Hard' ? 'danger' : (q.difficulty === 'Medium' ? 'warning' : 'success')}">${q.difficulty}</span></td>
                <td title="${q.question}">${q.question.substring(0, 40)}...</td>
                <td><strong>${q.correct}</strong></td>
                <td>${q.totalCorrect}</td>
                <td>${q.totalWrong}</td>
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

    let candidates = currentTestPerformance.map(p => ({
        ...p,
        Rank: p.Rank || '-',
        OverallPct: window.getOverallPercentage ? window.getOverallPercentage(p) : 0,
        AvgSecPct: window.getAverageSectionPercentage ? window.getAverageSectionPercentage(p) : 0,
        PercentileVal: p.Percentile != null && p.Percentile !== '' ? Number(p.Percentile) : '-'
    }));

    if (search) {
        candidates = candidates.filter(c =>
            window.recordMatchesCandidateSearch ? window.recordMatchesCandidateSearch(c, search) : (
                (c.name || '').toLowerCase().includes(search) ||
                (c.Email || '').toLowerCase().includes(search) ||
                (c.userID || '').toString().toLowerCase().includes(search) ||
                (c.univId || c.UnivID || '').toLowerCase().includes(search)
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

/* =========================
   PUBLISH SYSTEM
========================= */
async function publishSingleResult(userId) {
    if (typeof showConfirm === 'function') {
        if (!(await showConfirm(`Publish result for User ID: ${userId}?`, 'Publish Result'))) return;
    } else {
        if (!confirm(`Publish result for User ID: ${userId}?`)) return;
    }
    
    if (typeof showAdminActionVerifyLoader === 'function') {
        showAdminActionVerifyLoader({
            title: "Verifying Result Publication",
            message: `Securing result release for User ID: ${userId}...`,
            steps: ["Authenticating administrator", "Preparing performance report", "Publishing secure result"]
        });
    }

    try {
        const res = await api.post({
            action: 'publishResult',
            testId: currentTestId,
            userID: userId
        });
        
        if (res.success) {
            if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();
            if (typeof showAlert === 'function') await showAlert("Result published successfully!");
            else alert("Result published successfully!");
            loadTestAnalytics(currentTestId); // Refresh
        } else {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        }
    } catch (err) {
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        if (typeof showAlert === 'function') await showAlert("Publish failed: " + err.message);
        else alert("Publish failed: " + err.message);
    }
}

async function publishAllResults() {
    if (!currentTestId) return;
    const pending = currentTestPerformance.filter(p => !p.ResultPublished).length;
    if (pending === 0) {
        if (typeof showInfo === 'function') await showInfo("All results already published.");
        else alert("All results already published.");
        return;
    }

    if (typeof showConfirm === 'function') {
        if (!(await showConfirm(`Publish results for all ${pending} pending candidates?`, 'Publish All Results'))) return;
    } else {
        if (!confirm(`Publish results for all ${pending} pending candidates?`)) return;
    }

    if (typeof showAdminActionVerifyLoader === 'function') {
        showAdminActionVerifyLoader({
            title: "Verifying Bulk Publication",
            message: `Securing mass result release for ${pending} candidates...`,
            steps: ["Validating batch integrity", "Processing performance records", "Publishing all results"]
        });
    }

    try {
        const res = await api.post({
            action: 'publishAllResults',
            TestId: currentTestId
        });
        
        if (res.success) {
            if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();
            if (typeof showAlert === 'function') await showAlert(`Successfully published ${res.publishedCount} results!`);
            else alert(`Successfully published ${res.publishedCount} results!`);
            loadTestAnalytics(currentTestId); // Refresh
        } else {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        }
    } catch (err) {
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        if (typeof showAlert === 'function') await showAlert("Bulk publish failed: " + err.message);
        else alert("Bulk publish failed: " + err.message);
    }
}

async function publishAnswerKey() {
    if (!currentTestId) return;
    
    if (typeof showConfirm === 'function') {
        if (!(await showConfirm(`Publish answer key for selected test?`, 'Publish Answer Key'))) return;
    } else {
        if (!confirm(`Publish answer key for selected test?`)) return;
    }

    showLoading(true);
    try {
        const res = await api.post({
            action: 'publishAnswerKey',
            testId: currentTestId
        });
        if (res.success) {
            const msg = `Answer key published to ${res.sentCount || 0} candidates.`;
            if (typeof showAlert === 'function') await showAlert(msg);
            else alert(msg);
        }
    } catch (err) {
        if (typeof showAlert === 'function') await showAlert("Publish answer key failed: " + err.message);
        else alert("Publish answer key failed: " + err.message);
    } finally {
        showLoading(false);
    }
}

/* =========================
   CANDIDATE MODAL
========================= */
function showCandidateDetail(userId) {
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
        publishBtn.onclick = () => currentTestId ? publishSingleResult(userId) : null;
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
async function searchGlobalCandidate() {
    const search = document.getElementById('globalCandidateSearch').value.trim();
    if (!search) return;

    // Searching candidate
    showLoading(true);

    try {
        const resolved = window.resolveCandidateUserId
            ? window.resolveCandidateUserId(search, allUsers, allPerformance)
            : search;

        if (!resolved) {
            if (typeof showAlert === 'function') await showAlert('No candidate found. Search by name, email, University ID, or User ID.');
            else alert('No candidate found. Search by name, email, University ID, or User ID.');
            return;
        }

        if (typeof resolved === 'object' && resolved.ambiguous) {
            const list = resolved.matches.map(m => `• ${m.label}`).join('\n');
            const msg = `Multiple candidates matched. Please refine your search:\n\n${list}`;
            if (typeof showAlert === 'function') await showAlert(msg);
            else alert(msg);
            return;
        }

        const userId = resolved;
        const stats = await api.get('getCandidateAnalytics', { userID: userId });
        
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