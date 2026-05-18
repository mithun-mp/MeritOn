/**
 * =========================================================
 * MeritOn EXAM PANEL - ENTERPRISE STABILITY EDITION (v3.0)
 * =========================================================
 * Features:
 * ✔ Full Exam Recovery (Reload Safe)
 * ✔ Question & Option Shuffling (Per User)
 * ✔ Format Preservation (Exact Raw Text)
 * ✔ Safe Rendering (Displays tags as text)
 * ✔ Independent Scroll Zones
 * ✔ Sticky Footer Actions
 * ✔ Submission State Tracking & Retry
 * ✔ Mobile Optimized Action Bar
 * =========================================================
 */

let testData = null;
let rawQuestions = []; // Original order from backend
let displayQuestions = []; // Shuffled order for UI
let answers = {};
let currentIdx = 0;
let timeLeft = 0;
let timerInterval;

let reviewQuestions = new Set();
let visitedQuestions = new Set();

// Performance & Security Metrics
let startedAt = null;
let fullscreenViolations = 0;
let tabSwitchCount = 0;
let isSubmitting = false;
let submitClicked = false;
let submissionComplete = false;
let reenteringFullscreen = false;
let fullscreenWarningActive = false;
let lastFullscreenEnforceAt = 0;
let fullscreenReenterAttempts = 0;
const FULLSCREEN_ENFORCE_COOLDOWN_MS = 5000;
const MAX_FULLSCREEN_REENTER_ATTEMPTS = 4;

// Shuffling Maps
let questionOrder = []; // Array of indices
let optionShuffleMap = {}; // QID -> { A: "C", ... }

/* =========================================================
   SAFE RENDERING & UTILS
========================================================= */

function escapeHTML(text) {
    if (!text) return '';
    const p = document.createElement('p');
    p.textContent = text;
    return p.innerHTML;
}

function isCodeContent(text) {
    if (!text) return false;
    const codePatterns = ['{', '}', 'function', 'var ', 'const ', 'let ', '=>', 'import ', '<div', '<img', 'JSON', 'XML'];
    return codePatterns.some(p => text.includes(p));
}

function formatContent(text) {
    const escaped = escapeHTML(text);
    const isCode = isCodeContent(text);
    return `<div class="question-text-area ${isCode ? 'code-mode' : ''}">${escaped}</div>`;
}

/**
 * Durstenfeld shuffle algorithm
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/* =========================================================
   RECOVERY & SHUFFLING ENGINE
========================================================= */

function getSessionKey() {
    const user = getUser();
    const testId = localStorage.getItem('selectedTestID');
    return `cbt_exam_session_${user?.userId || 'anon'}_${testId || 'none'}`;
}

function saveToSession() {
    if (isSubmitting || !testData) return;
    
    const state = {
        currentIdx,
        answers,
        reviewQuestions: Array.from(reviewQuestions),
        visitedQuestions: Array.from(visitedQuestions),
        questionOrder,
        optionShuffleMap,
        startedAt,
        timeLeft,
        lastSavedAt: Date.now()
    };
    
    localStorage.setItem(getSessionKey(), JSON.stringify(state));
    debugLog('STATE', 'RECOVERY', 'Session autosaved');
}

function restoreFromSession() {
    const saved = localStorage.getItem(getSessionKey());
    if (!saved) return false;

    try {
        const state = JSON.parse(saved);
        // Verify session is for current test
        if (state.lastSavedAt && (Date.now() - state.lastSavedAt > 24 * 60 * 60 * 1000)) {
            debugLog('WARN', 'RECOVERY', 'Stale session found, ignoring');
            return false;
        }

        currentIdx = state.currentIdx || 0;
        reviewQuestions = new Set((state.reviewQuestions || []).map(qidKey));
        visitedQuestions = new Set((state.visitedQuestions || []).map(qidKey));
        questionOrder = state.questionOrder || [];
        optionShuffleMap = state.optionShuffleMap || {};
        answers = Object.fromEntries(
            Object.entries(state.answers || {}).map(([k, v]) => [qidKey(k), v])
        );
        startedAt = state.startedAt || null;
        timeLeft = state.timeLeft || timeLeft;
        
        debugLog('INFO', 'RECOVERY', 'Session restored successfully');
        return true;
    } catch (e) {
        debugLog('ERROR', 'RECOVERY', 'Failed to restore session', e);
        return false;
    }
}

/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    const urlParams = new URLSearchParams(window.location.search);
    let testId = urlParams.get('testId') || localStorage.getItem('selectedTestID');

    if (!testId) {
        window.location.href = './test-lobby.html';
        return;
    }

    localStorage.setItem('selectedTestID', testId);
    initExam(testId);
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('startBtn')?.addEventListener('click', startFullscreen);
    document.getElementById('prevBtn')?.addEventListener('click', () => navigate(-1));
    document.getElementById('nextBtn')?.addEventListener('click', () => navigate(1));
    document.getElementById('clearBtn')?.addEventListener('click', clearResponse);
    document.getElementById('markReviewBtn')?.addEventListener('click', toggleReview);
    document.getElementById('submitBtn')?.addEventListener('click', triggerSubmit);

    setupSecurityListeners();

    setStartButtonState(false);

    // Autosave triggers
    window.addEventListener('beforeunload', saveToSession);
    window.addEventListener('blur', saveToSession);
    document.addEventListener('visibilitychange', saveToSession);
    setInterval(saveToSession, 15000); // Heartbeat save
}

function setStartButtonState(isReady) {
    const button = document.getElementById('startBtn');
    if (!button) return;

    if (isReady) {
        button.disabled = false;
        button.classList.remove('btn-loading');
        button.innerHTML = `
            <span>I am ready to begin</span>
            <i class="fas fa-arrow-right"></i>
        `;
    } else {
        button.disabled = true;
        button.classList.add('btn-loading');
        button.innerHTML = `
            <span>Wait, loading test...</span>
            <i class="fas fa-spinner fa-spin"></i>
        `;
    }
}


/** Normalize GET responses (array or { data } or { error }) */
function parseApiList(payload, label) {
    if (!payload) return [];
    if (payload.error) throw new Error(payload.error);
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    throw new Error(`Invalid ${label} response from server.`);
}

function qidKey(qid) {
    return String(qid);
}

function isAlreadySubmittedMessage(msg) {
    if (!msg) return false;
    const s = String(msg).toLowerCase();
    return (s.includes('already') && (s.includes('submit') || s.includes('submitted') || s.includes('attempt')))
        || s.includes('already submitted')
        || s.includes('exam already');
}

async function fetchExistingSubmission(testId, userId) {
    try {
        const perfRes = await api.get('getPerformance', { userID: userId });
        const list = parseApiList(perfRes, 'performance');
        return list.find(p => String(p.TestId || p.testId) === String(testId)) || null;
    } catch (e) {
        debugLog('WARN', 'EXAM', 'Could not verify prior submission', e.message);
        return null;
    }
}

async function redirectToResultForSubmission(record, testId) {
    submissionComplete = true;
    localStorage.removeItem(getSessionKey());
    localStorage.setItem('lastResult', JSON.stringify({
        ...(record || {}),
        TestId: String(testId),
        testId: String(testId)
    }));
    await exitExamFullscreen();
    window.location.href = `result.html?testId=${encodeURIComponent(testId)}`;
}

function requestExamFullscreen() {
    const elem = document.documentElement;
    const request = elem.requestFullscreen
        || elem.webkitRequestFullscreen
        || elem.mozRequestFullScreen
        || elem.msRequestFullscreen;
    if (!request) return Promise.reject(new Error('Fullscreen not supported'));
    try {
        const result = request.call(elem);
        return result && typeof result.then === 'function' ? result : Promise.resolve();
    } catch (e) {
        return Promise.reject(e);
    }
}

function exitExamFullscreen() {
    const exit = document.exitFullscreen
        || document.webkitExitFullscreen
        || document.mozCancelFullScreen
        || document.msExitFullscreen;
    if (!exit || !getActiveFullscreenElement()) return Promise.resolve();
    try {
        const result = exit.call(document);
        return result && typeof result.then === 'function' ? result : Promise.resolve();
    } catch (e) {
        return Promise.resolve();
    }
}

async function enforceExamFullscreen() {
    if (reenteringFullscreen || submissionComplete || isSubmitting || submitClicked || !startedAt) return;
    if (getActiveFullscreenElement()) {
        fullscreenReenterAttempts = 0;
        return;
    }
    const now = Date.now();
    if (now - lastFullscreenEnforceAt < FULLSCREEN_ENFORCE_COOLDOWN_MS) return;
    if (fullscreenReenterAttempts >= MAX_FULLSCREEN_REENTER_ATTEMPTS) return;

    reenteringFullscreen = true;
    lastFullscreenEnforceAt = now;
    fullscreenReenterAttempts += 1;
    try {
        await requestExamFullscreen();
        fullscreenReenterAttempts = 0;
    } catch (e) {
        debugLog('WARN', 'EXAM', 'Fullscreen re-entry declined', e.message);
    } finally {
        reenteringFullscreen = false;
    }
}

async function initExam(testId) {
    try {
        const testsRes = await api.get('getAllTests');
        const testList = parseApiList(testsRes, 'tests');
        testData = testList.find(t => String(t.TestID) === String(testId));

        if (!testData) throw new Error("Examination details not found.");

        const user = getUser();
        if (!user) {
            window.location.href = './index.html';
            return;
        }

        const userId = user.userId || user.userID;
        const existingSubmission = await fetchExistingSubmission(testId, userId);
        if (existingSubmission) {
            const viewResult = await showConfirm(
                'You have already submitted this examination. Would you like to view your results?',
                'Exam Already Submitted'
            );
            if (viewResult) {
                await redirectToResultForSubmission(existingSubmission, testId);
            } else {
                window.location.href = './test-lobby.html';
            }
            return;
        }

        const instName = document.getElementById('instTestName');
        const instDur = document.getElementById('instDuration');
        const testTitle = document.getElementById('testTitle');
        const candName = document.getElementById('candidateName');
        const candRoll = document.getElementById('candidateRoll');

        if (instName) instName.innerText = testData.Name;
        if (instDur) instDur.innerText = `${testData.Duration} mins`;
        if (testTitle) testTitle.innerText = testData.Name;
        if (candName) candName.innerText = user.fullName || user.name || 'Candidate';
        if (candRoll) candRoll.innerText = user.univId || user.UnivID || user.userId || 'N/A';

        const rawQsRes = await api.get('getQuestions', { testId });
        const rawQs = parseApiList(rawQsRes, 'questions');
        if (rawQs.length === 0) throw new Error("No questions found.");

        rawQuestions = rawQs.map(q => window.normalizePayload ? window.normalizePayload(q) : q);
        const instTotal = document.getElementById('instTotalQs');
        const totalQ = document.getElementById('totalQNum');

        if (instTotal) instTotal.innerText = `${rawQuestions.length} questions`;
        if (totalQ) totalQ.innerText = rawQuestions.length;

        const recovered = restoreFromSession();
        
        if (!recovered) {
            // New Session: Generate Shuffling
            questionOrder = shuffleArray([...Array(rawQuestions.length).keys()]);
            rawQuestions.forEach(q => {
                const key = qidKey(q.QID);
                const labels = ['A', 'B', 'C', 'D'];
                const shuffledLabels = shuffleArray([...labels]);
                optionShuffleMap[key] = {};
                labels.forEach((l, i) => {
                    optionShuffleMap[key][l] = shuffledLabels[i];
                });
            });
            timeLeft = (testData.Duration || 60) * 60;
        }

        // Apply Shuffling to Display Array
        displayQuestions = questionOrder.map(i => {
            const q = rawQuestions[i];
            const sMap = optionShuffleMap[qidKey(q.QID)] || {};
            const mappedOptions = {};
            // Reconstruct options based on shuffle map
            // If mapping says A -> C, then displayQuestions[x].A will be rawQuestions[i].C
            ['A', 'B', 'C', 'D'].forEach(l => {
                const originalKey = sMap[l] || l;
                mappedOptions[l] = q[originalKey];
            });
            return { ...q, ...mappedOptions };
        });

        renderNavGrid();
        updateStats();
        setStartButtonState(true);

    } catch (err) {
        debugLog('ERROR', 'INIT', err.message);
        await showError(err.message, 'Unable to Start Exam');
        window.location.href = './test-lobby.html';
    }
}

/* =========================================================
   RENDERING & NAVIGATION
========================================================= */

function showQuestion(idx) {
    if (idx < 0 || idx >= displayQuestions.length) return;
    
    currentIdx = idx;
    const q = displayQuestions[idx];
    const qKey = qidKey(q.QID);
    visitedQuestions.add(qKey);

    const currentQ = document.getElementById('currentQNum');
    const sectionN = document.getElementById('sectionName');
    const qText = document.getElementById('questionText');
    const badge = document.getElementById('difficultyBadge');

    if (currentQ) currentQ.innerText = idx + 1;
    if (sectionN) sectionN.innerText = q.Section || 'General';
    if (qText) qText.innerHTML = formatContent(q.Question);

    const diff = (q.Difficulty || 'Medium').toLowerCase();
    if (badge) {
        badge.innerText = q.Difficulty || 'Medium';
        badge.className = `diff-badge ${diff}`;
    }

    const optionsList = document.getElementById('optionsList');
    const currentAns = answers[qKey];

    optionsList.innerHTML = ['A', 'B', 'C', 'D'].map(label => `
        <div class="option-card ${currentAns === label ? 'selected' : ''}" 
             onclick="selectOption('${qKey}', '${label}')">
            <div class="opt-prefix">${label}</div>
            <div class="option-text">${escapeHTML(q[label])}</div>
        </div>
    `).join('');

    updatePalette();
    updateStats();
    saveToSession();
    
    document.getElementById('questionCard').scrollTop = 0;
}

function selectOption(qid, label) {
    answers[qid] = label;
    showQuestion(currentIdx);
}

function clearResponse() {
    delete answers[qidKey(displayQuestions[currentIdx].QID)];
    showQuestion(currentIdx);
}

function toggleReview() {
    const qid = qidKey(displayQuestions[currentIdx].QID);
    if (reviewQuestions.has(qid)) reviewQuestions.delete(qid);
    else reviewQuestions.add(qid);
    showQuestion(currentIdx);
}

function navigate(dir) {
    const next = currentIdx + dir;
    if (next >= 0 && next < displayQuestions.length) showQuestion(next);
}

/* =========================================================
   SUBMISSION ENGINE
========================================================= */

async function triggerSubmit() {
    const count = Object.keys(answers).length;
    const confirmed = await showActionConfirm(
        `You have answered ${count} of ${displayQuestions.length} questions. Submit your exam now?`,
        'Submit Examination',
        'Submit'
    );
    if (confirmed) {
        submitClicked = true;
        submitExam();
    }
}

async function submitExam() {
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    clearInterval(timerInterval);

    // Merge current state with session to be 100% safe
    saveToSession();
    const finalState = JSON.parse(localStorage.getItem(getSessionKey()));
    const finalAnswers = finalState.answers || answers;

    // REMAP SHUFFLED ANSWERS TO ORIGINAL KEYS
    const remappedAnswers = {};
    for (const qid in finalAnswers) {
        const key = qidKey(qid);
        const displayedLabel = finalAnswers[qid];
        const map = optionShuffleMap[key];
        if (map && map[displayedLabel]) {
            remappedAnswers[key] = map[displayedLabel];
        } else {
            remappedAnswers[key] = displayedLabel;
        }
    }

    const user = getUser();
    if (!startedAt) {
        startedAt = new Date().toISOString();
    }

    const payload = {
        action: 'submitTest',
        userID: user.userId || user.userID,
        name: user.fullName || user.name,
        Email: user.email || user.Email,
        TestId: String(testData.TestID),
        answers: remappedAnswers,
        StartedAt: startedAt,
        FullScreenViolations: fullscreenViolations,
        TabSwitchCount: tabSwitchCount,
        autoSubmitted: timeLeft <= 0
    };

    try {
        // Show MeritOn submission loader
        const submitLoader = document.getElementById('meritonSubmitLoader');
        if (submitLoader) {
            submitLoader.classList.add('active');
        }

        const res = await api.post(payload);
        if (res.success) {
            submissionComplete = true;
            localStorage.removeItem(getSessionKey());
            localStorage.setItem('lastResult', JSON.stringify({
                ...res,
                TestId: String(testData.TestID),
                testId: String(testData.TestID)
            }));
            await exitExamFullscreen();
            window.location.href = 'result.html';
        } else throw new Error(res.error);
    } catch (err) {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerText = 'Retry Submit';
        document.getElementById('submitOverlay')?.remove();

        const user = getUser();
        const existing = user
            ? await fetchExistingSubmission(testData.TestID, user.userId || user.userID)
            : null;

        if (existing || isAlreadySubmittedMessage(err.message)) {
            const viewResult = await showConfirm(
                'Your answers may already be saved on the server (for example after a network error). Would you like to view your results now?',
                'Already Submitted'
            );
            if (viewResult) {
                await redirectToResultForSubmission(existing || { TestId: testData.TestID }, testData.TestID);
                return;
            }
            submitClicked = false;
            return;
        }

        submitClicked = false;
        await showError('Submission Failed: ' + err.message, 'Submission Failed');
    }
}

/* =========================================================
   TIMER & SECURITY
========================================================= */

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    const timerDisplay = document.getElementById('timer');

    const update = () => {
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitClicked = true; // Mark as submitted to stop malpractice counting
            submitExam();
            return;
        }
        timeLeft--;
        const h = Math.floor(timeLeft / 3600);
        const m = Math.floor((timeLeft % 3600) / 60);
        const s = timeLeft % 60;
        timerDisplay.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    update();
    timerInterval = setInterval(update, 1000);
}

function startFullscreen() {
    requestExamFullscreen().then(() => {
        document.getElementById('fullscreenOverlay').style.display = 'none';
        document.getElementById('examContent').style.display = 'flex';
        if (!startedAt) startedAt = new Date().toISOString();
        startTimer();
        showQuestion(currentIdx);
    }).catch(() => {
        showWarning('Fullscreen is required to start the exam. Please allow fullscreen and try again.', 'Fullscreen Required');
    });
}

function getActiveFullscreenElement() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.msFullscreenElement
        || null;
}

function setupSecurityListeners() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !submissionComplete && !isSubmitting && !submitClicked) {
            tabSwitchCount++;
            saveToSession();
        }
    });

    const handleFullscreenChange = () => {
        if (getActiveFullscreenElement()) {
            fullscreenReenterAttempts = 0;
            return;
        }
        if (!startedAt || submissionComplete || isSubmitting || submitClicked) return;
        if (fullscreenWarningActive) return;

        fullscreenViolations++;
        saveToSession();
        fullscreenWarningActive = true;
        showWarning(
            'Exiting fullscreen is recorded for exam integrity. Please return to fullscreen to continue.',
            'Security Notice'
        ).finally(() => {
            fullscreenWarningActive = false;
            enforceExamFullscreen();
        });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
}

/* =========================================================
   UI HELPERS
========================================================= */

function renderNavGrid() {
    const grid = document.getElementById('navGrid');
    grid.innerHTML = displayQuestions.map((q, i) => `
        <button class="q-btn" id="nav-${i}" onclick="showQuestion(${i})">${i + 1}</button>
    `).join('');
    updatePalette();
}

function updatePalette() {
    const btns = document.querySelectorAll('.q-btn');
    btns.forEach((btn, i) => {
        const qid = qidKey(displayQuestions[i].QID);
        btn.className = 'q-btn';
        if (i === currentIdx) btn.classList.add('current');
        else if (answers[qid]) btn.classList.add('answered');
        else if (reviewQuestions.has(qid)) btn.classList.add('review');
        else if (visitedQuestions.has(qid)) btn.classList.add('visited');
    });
}

function updateStats() {
    const answeredEl = document.getElementById('answeredCount');
    const reviewEl = document.getElementById('reviewCount');
    if (answeredEl) answeredEl.innerText = Object.keys(answers).length;
    if (reviewEl) reviewEl.innerText = reviewQuestions.size;
}

// Expose for inline handlers (nav grid, option cards)
window.showQuestion = showQuestion;
window.selectOption = selectOption;
