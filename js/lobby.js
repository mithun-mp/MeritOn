/**
 * Test Lobby Logic - Phase 25 Upgrade (URGENT LOOP FIX)
 */

let currentTests = null;
let overallLeaderboard = null;
let overallPollInterval = null;
let liveLeaderboardPollInterval = null;
let currentLiveTestId = null;
let liveLeaderboardPreviousState = new Map();
let liveLeaderboardVisibleUntil = null;
let liveLeaderboardTestEnded = false;
const LIVE_LEADERBOARD_POLL_MS = 10000;
let countdownIntervals = new Map(); // key: TestID, value: interval ID
let previousRenderedTests = new Map(); // key: TestID, value: { element, status }
let previousLiveLeaderboardEnabled = new Map(); // key: TestID, value: boolean (previous enabled state)
let candidateTestsPollInterval = null; // global refresh interval
let isLoadingCandidateTests = false; // request lock
let lastCandidateTestsFetchAt = 0; // last fetch timestamp for throttling
let countdownEndedTests = new Set(); // track tests that have already triggered a refresh
let isLoadingOverallLeaderboard = false;
let lastOverallLeaderboardFetchAt = 0;

function formatTimeMMSS(value, unit = "auto") {
    let seconds = 0;
    const n = Number(value || 0);

    if (unit === "minutes") {
        seconds = n * 60;
    } else if (unit === "seconds") {
        seconds = n;
    } else {
        seconds = n < 100 && String(value).includes(".") ? n * 60 : n;
    }

    seconds = Math.round(seconds);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function isLiveLeaderboardVisible(test) {
  // Check if live leaderboard is enabled
  if (test.liveLeaderboardEnabled === false) {
    return false;
  }
  // For completed/ended tests, always return true (show final scoreboard)
  if (test.status === "completed" || test.status === "ended") {
    return true;
  }
  // If server provided visibleUntil, use that
  if (test.liveLeaderboardVisibleUntilISO) {
    const now = Date.now();
    const visibleUntil = new Date(test.liveLeaderboardVisibleUntilISO).getTime();
    return now <= visibleUntil;
  }
  // Fallback to old calculation if server data not available
  const now = Date.now();
  const testDate = new Date(test.Date);
  const [endHour, endMin] = (test.ExpiryTime || test.EndTime || "23:59").split(":").map(Number);
  const testEndTime = new Date(testDate);
  testEndTime.setHours(endHour, endMin, 0, 0);
  const visibleUntil = testEndTime.getTime() + 24 * 60 * 60 * 1000;
  return now <= visibleUntil;
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    displayUserInfo();
    startCandidateTestsPoll();
    startOverallLeaderboardPoll();
    loadLobbyCareerPath().catch(err => console.error('[LOBBY CAREER PATH] init failed:', err));

    const refreshCareerPathBtn = document.getElementById('refreshCareerPathBtn');
    if (refreshCareerPathBtn) {
    refreshCareerPathBtn.addEventListener('click', loadLobbyCareerPath);
    }

    setupCareerHistoryToggle();
    setupOverallLeaderboardToggle();
});

function displayUserInfo() {
    const user = getUser();
    if (!user) {
        debugLog('WARN', 'LOBBY', 'No user found in localStorage');
        return;
    }

    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');

    const displayName = user.fullName || user.FullName || user.name || user.Name || 'Candidate';
    const displayId = user.univId || user.UnivID || user.userId || user.UserID || 'N/A';

    if (nameEl) nameEl.innerText = displayName;
    if (roleEl) roleEl.innerText = `ID: ${displayId}`;
}

window.showProfileUpdate = function() {
    const user = getUser();
    const modalHtml = `
        <div id="profileModal" class="modal-overlay" style="position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index: 1000; display:flex; align-items:center; justify-content:center;">
            <div class="modal-content" style="background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:28px; padding:35px; width:100%; max-width:500px; box-shadow:0 25px 50px rgba(0,0,0,0.5);" data-aos="zoom-in">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
                    <h2 style="margin:0; font-size:1.5rem;"><i class="fa-solid fa-user-gear" style="margin-right:12px; color:#60a5fa;"></i>Update Profile</h2>
                    <button onclick="closeProfileModal()" style="background:none; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <form id="profileUpdateForm">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                        <div class="form-group">
                            <label style="display:block; font-size:0.8rem; color:#94a3b8; margin-bottom:8px;">Phone Number</label>
                            <input type="tel" id="updPhone" value="${user.phone || ''}" style="width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; color:#fff;">
                        </div>
                        <div class="form-group">
                            <label style="display:block; font-size:0.8rem; color:#94a3b8; margin-bottom:8px;">College</label>
                            <input type="text" id="updCollege" value="${user.college || 'GEC THRISSUR'}" style="width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; color:#fff;">
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:25px;">
                            <div class="form-group">
                                <label style="display:block; font-size:0.8rem; color:#94a3b8; margin-bottom:8px;">Department</label>
                                <input type="text" id="updDept" value="${user.department || ''}" style="width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; color:#fff;">
                            </div>
                            <div class="form-group">
                                <label style="display:block; font-size:0.8rem; color:#94a3b8; margin-bottom:8px;">Current Year</label>
                                <input type="number" id="updYear" value="${user.year || ''}" min="1" max="4" style="width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; color:#fff;">
                            </div>
                        </div>
                        <button type="submit" class="enter-btn btn-active" style="width:100%; padding:16px; border-radius:16px; font-weight:700;">Save Changes</button>
                    </form>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('profileUpdateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const originalText = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

            const updatedData = {
                Phone: document.getElementById('updPhone').value,
                College: document.getElementById('updCollege').value,
                Department: document.getElementById('updDept').value,
                Year: document.getElementById('updYear').value
            };

            const res = await api.post({
                action: 'updateUser',
                userId: user.userId || user.userID,
                userData: updatedData
            });

            if (res.success) {
                const newUser = { ...user, ...updatedData };
                localStorage.setItem('cbt_user', JSON.stringify(newUser));
                alert("Profile updated successfully!");
                closeProfileModal();
                displayUserInfo();
            } else {
                alert("Update failed: " + res.error);
            }
        } catch (err) {
            alert("Connection error.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
};

window.closeProfileModal = function() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.remove();
};

async function loadCandidateData(reason = "unknown") {
    const now = Date.now();
    console.log(`[LOBBY] loadCandidateTests called by: ${reason}`);

    if (isLoadingCandidateTests) {
        console.log("[LOBBY] skipped duplicate getCandidateTests: already loading");
        return;
    }

    if (now - lastCandidateTestsFetchAt < 5000) {
        console.log("[LOBBY] skipped duplicate getCandidateTests: throttled");
        return;
    }

    isLoadingCandidateTests = true;
    lastCandidateTestsFetchAt = now;
    const user = getUser();
    if (!user) {
        isLoadingCandidateTests = false;
        return;
    }
    try {
        const testsRes = await api.get('getCandidateTests', { userID: user.userId || user.userID });
        if (testsRes.success) {
            currentTests = testsRes;
            console.log('[LOBBY] getCandidateTests response:', currentTests);
            renderCandidateTests(currentTests);
            startCountdowns(currentTests);
        }
    } catch (err) {
        console.error('[LOBBY] Error loading candidate data:', err);
    } finally {
        isLoadingCandidateTests = false;
    }
}

function startCandidateTestsPoll() {
    if (candidateTestsPollInterval) {
        console.log("[LOBBY] cleared old refresh interval");
        clearInterval(candidateTestsPollInterval);
    }
    loadCandidateData("page-load");
    console.log("[LOBBY] started main refresh interval");
    candidateTestsPollInterval = setInterval(() => {
        loadCandidateData("30-second-poll");
    }, 30000);
}

async function loadOverallLeaderboard(reason = "unknown") {
    const now = Date.now();
    console.log(`[LOBBY] loadOverallLeaderboard called by: ${reason}`);

    if (isLoadingOverallLeaderboard) {
        console.log("[LOBBY] skipped duplicate getCandidateOverallLeaderboard: already loading");
        return;
    }
    if (now - lastOverallLeaderboardFetchAt < 10000) {
        console.log("[LOBBY] skipped duplicate getCandidateOverallLeaderboard: throttled");
        return;
    }
    isLoadingOverallLeaderboard = true;
    lastOverallLeaderboardFetchAt = now;

    const user = getUser();
    if (!user) {
        isLoadingOverallLeaderboard = false;
        return;
    }
    try {
        const res = await api.get('getCandidateOverallLeaderboard', { userID: user.userId || user.userID });
        if (res.success) {
            overallLeaderboard = res;
            renderOverallLeaderboard(overallLeaderboard, user.userId || user.userID);
        }
    } catch (err) {
        console.error('[LOBBY] Error loading overall leaderboard:', err);
    } finally {
        isLoadingOverallLeaderboard = false;
    }
}

function startOverallLeaderboardPoll() {
    if (overallPollInterval) {
        console.log("[LOBBY] cleared old overall leaderboard interval");
        clearInterval(overallPollInterval);
    }
    loadOverallLeaderboard("page-load");
    console.log("[LOBBY] started overall leaderboard interval");
    overallPollInterval = setInterval(() => {
        loadOverallLeaderboard("30-second-poll");
    }, 30000);
}

function renderCandidateTests(tests) {
    console.log('[LOBBY RENDER] Starting render');
    const containers = {
        active: document.getElementById('activeTests'),
        upcoming: document.getElementById('upcomingTests'),
        completed: document.getElementById('completedTests'),
        ended: document.getElementById('endedTests')
    };
    const counts = {
        active: (tests.active || []).length,
        upcoming: (tests.upcoming || []).length,
        completed: (tests.completed || []).length,
        ended: (tests.ended || []).length
    };
    const newRenderedTests = new Map();

    ['active', 'upcoming', 'completed', 'ended'].forEach(status => {
        const list = tests[status] || [];
        const container = containers[status];
        if (!container) return;

        // Remove existing tests that are no longer in this status
        const existingChildren = Array.from(container.children);
        existingChildren.forEach(child => {
            const testId = child.getAttribute('data-test-id');
            if (testId && !list.find(t => t.TestID === testId)) {
                child.remove();
                console.log(`[LOBBY RENDER] Removed test ${testId} from ${status}`);
            }
        });

        if (list.length === 0) {
            if (!container.querySelector('.empty-box')) {
                container.innerHTML = `<div class="empty-box">No ${status} tests found at the moment.</div>`;
            }
            return;
        }

        // Remove empty box if present
        const emptyBox = container.querySelector('.empty-box');
        if (emptyBox) emptyBox.remove();

        list.forEach(test => {
            const existingEntry = previousRenderedTests.get(test.TestID);
            let cardElement;
            const currentEnabled = test.liveLeaderboardEnabled !== false;
            const previousEnabled = previousLiveLeaderboardEnabled.get(test.TestID);

            // Log state change
            if (previousEnabled !== undefined && previousEnabled !== currentEnabled) {
                console.log(`[LIVE TOGGLE SYNC] testId: ${test.TestID}, previousValue: ${previousEnabled}, newValue: ${currentEnabled}`);
            }

            if (existingEntry && existingEntry.element && existingEntry.status === status) {
                // Update existing card
                cardElement = existingEntry.element;
                console.log(`[LOBBY RENDER] Updated existing card for ${test.TestID}`);

                // Update live leaderboard button
                updateLiveLeaderboardButton(cardElement, test, currentEnabled, previousEnabled);
            } else {
                // Create new card with animation
                cardElement = createCandidateTestCard(test, status);
                console.log(`[LOBBY RENDER] Inserted new card for ${test.TestID}`);
                container.appendChild(cardElement);
            }

            // Update previous state
            previousLiveLeaderboardEnabled.set(test.TestID, currentEnabled);

            newRenderedTests.set(test.TestID, {
                element: cardElement,
                status: status
            });
        });
    });

    previousRenderedTests = newRenderedTests;

    const activeCountEl = document.getElementById('activeCount');
    const completedCountEl = document.getElementById('completedCount');
    const upcomingCountEl = document.getElementById('upcomingCount');
    const totalExamsEl = document.getElementById('totalExams');
    const avgPercentileEl = document.getElementById('avgPercentile');

    if (activeCountEl) activeCountEl.innerText = counts.active;
    if (completedCountEl) completedCountEl.innerText = counts.completed;
    if (upcomingCountEl) upcomingCountEl.innerText = counts.upcoming;
    if (totalExamsEl) totalExamsEl.innerText = counts.completed;

    const submissions = tests.completed || [];
    if (submissions.length > 0) {
        const avgPercentile = (submissions.reduce((a, t) => a + (t.scorePercentile || 0), 0) / submissions.length).toFixed(1);
        if (avgPercentileEl) avgPercentileEl.innerText = `${avgPercentile}%`;
    }
}

function updateLiveLeaderboardButton(cardElement, test, currentEnabled, previousEnabled) {
    const footer = cardElement.querySelector('.card-footer');
    if (!footer) return;

    const showLiveLeaderboard = isLiveLeaderboardVisible(test);
    const existingBtn = footer.querySelector('button[onclick*="openLiveExamLeaderboard"]');
    const isCompletedOrEnded = test.status === 'completed' || test.status === 'ended';
    const buttonText = isCompletedOrEnded ? 'Final Scoreboard' : 'Live Leaderboard';
    const buttonHtml = `<i class="fa-solid fa-trophy" style="margin-right: 8px;"></i>${buttonText}`;

    if (showLiveLeaderboard) {
        if (!existingBtn) {
            // Button should exist, create it
            console.log(`[LIVE TOGGLE SYNC] showing button for ${test.TestID}`);
            const newBtn = document.createElement('button');
            newBtn.setAttribute('onclick', `openLiveExamLeaderboard('${test.TestID}', '${test.Name}')`);
            newBtn.className = 'enter-btn';
            newBtn.style.cssText = 'background: linear-gradient(135deg, #3b82f6, #2563eb); flex:1;';
            newBtn.innerHTML = buttonHtml;
            newBtn.style.transition = 'opacity 0.3s ease-in-out';
            newBtn.style.opacity = '0';
            footer.appendChild(newBtn);
            // Trigger fade in
            requestAnimationFrame(() => { newBtn.style.opacity = '1'; });
        } else {
            // Update button text if needed
            if (existingBtn.innerHTML !== buttonHtml) {
                existingBtn.innerHTML = buttonHtml;
            }
        }
    } else {
        if (existingBtn) {
            // Button should be removed
            console.log(`[LIVE TOGGLE SYNC] hiding button for ${test.TestID}`);
            existingBtn.style.transition = 'opacity 0.3s ease-in-out';
            existingBtn.style.opacity = '0';
            setTimeout(() => existingBtn.remove(), 300);

            // If modal is open for this test, show message
            if (currentLiveTestId === test.TestID) {
                console.log(`[LIVE TOGGLE SYNC] modal disabled by admin for ${test.TestID}`);
                const modalContent = document.querySelector('#liveLeaderboardModal .modal-content');
                if (modalContent) {
                    const contentDiv = document.getElementById('liveLeaderboardContent');
                    if (contentDiv) {
                        contentDiv.innerHTML = `
                            <div style="text-align:center; padding:60px 20px;">
                                <i class="fas fa-lock" style="font-size: 3rem; color: #ef4444;"></i>
                                <h3 style="color:#cbd5e1; margin-top:15px;">Live Leaderboard Disabled</h3>
                                <p style="color:#94a3b8; margin-top:8px;">The live leaderboard for this exam has been disabled by the administrator.</p>
                            </div>
                        `;
                    }
                    if (liveLeaderboardPollInterval) {
                        stopLiveLeaderboardPoll();
                        liveLeaderboardTestEnded = true;
                    }
                }
            }
        }
    }
}

function createCandidateTestCard(test, status, isNew = true) {
    const div = document.createElement('div');
    div.className = 'test-card';
    div.setAttribute('data-test-id', test.TestID);
    if (isNew) {
        div.setAttribute('data-aos', 'fade-up');
    }

    let actionHtml = '';
    let statusLabel = status.toUpperCase();
    let statusClass = `status-${status.toLowerCase()}`;
    let iconClass = 'fa-file-signature';
    const showLiveLeaderboard = isLiveLeaderboardVisible(test);
    const isCompletedOrEnded = status === 'completed' || status === 'ended';
    const buttonText = isCompletedOrEnded ? 'Final Scoreboard' : 'Live Leaderboard';

    if (status === 'completed') {
        iconClass = 'fa-circle-check';
        let actions = [];
        if (test.resultPublished || test.quickResult) {
            actions.push(`
                <button onclick="window.location.href='./result.html?testId=${test.TestID}'" class="enter-btn" style="background: linear-gradient(135deg, #10b981, #059669); flex:1;">
                    <i class="fa-solid fa-square-poll-vertical" style="margin-right: 8px;"></i>
                    View Result
                </button>
            `);
        } else {
            actions.push(`
                <button disabled class="enter-btn" style="opacity: 0.6; cursor: not-allowed; background: linear-gradient(135deg, #f59e0b, #d97706); flex:1;">
                    <i class="fa-solid fa-clock" style="margin-right: 8px;"></i>
                    Result Pending
                </button>
            `);
        }
        if (showLiveLeaderboard) {
            actions.push(`
                <button onclick="openLiveExamLeaderboard('${test.TestID}', '${test.Name}')" class="enter-btn" style="background: linear-gradient(135deg, #3b82f6, #2563eb); flex:1;">
                    <i class="fa-solid fa-trophy" style="margin-right: 8px;"></i>
                    ${buttonText}
                </button>
            `);
        }
        actionHtml = `
            <div class="card-footer" style="display:flex; gap:10px; flex-wrap:wrap;">
                ${actions.join('')}
            </div>
        `;
    } else if (status === 'active') {
        let actions = [];
        actions.push(`
            <button onclick="startTest('${test.TestID}')" class="enter-btn btn-active" style="flex:1;">
                <i class="fa-solid fa-play" style="margin-right: 8px;"></i>
                Start Exam
            </button>
        `);
        if (showLiveLeaderboard) {
            actions.push(`
                <button onclick="openLiveExamLeaderboard('${test.TestID}', '${test.Name}')" class="enter-btn" style="background: linear-gradient(135deg, #3b82f6, #2563eb); flex:1;">
                    <i class="fa-solid fa-trophy" style="margin-right: 8px;"></i>
                    ${buttonText}
                </button>
            `);
        }
        actionHtml = `
            <div class="card-footer" style="display:flex; gap:10px; flex-wrap:wrap;">
                ${actions.join('')}
            </div>
        `;
    } else if (status === 'upcoming') {
        actionHtml = `
            <div class="card-footer">
                <div class="enter-btn btn-upcoming" id="timer-${test.TestID}" style="text-align:center; display:flex; align-items:center; justify-content:center; gap:8px; cursor:default;">
                    <i class="fa-solid fa-clock"></i>
                    <span>Starts in: --:--:--</span>
                </div>
            </div>
        `;
    } else {
        let actions = [];
        if (showLiveLeaderboard) {
            actions.push(`
                <button onclick="openLiveExamLeaderboard('${test.TestID}', '${test.Name}')" class="enter-btn" style="background: linear-gradient(135deg, #3b82f6, #2563eb); flex:1;">
                    <i class="fa-solid fa-trophy" style="margin-right: 8px;"></i>
                    ${buttonText}
                </button>
            `);
        }
        actions.push(`
            <button disabled class="enter-btn btn-ended" style="opacity: 0.6; cursor: not-allowed; flex:1;">
                <i class="fa-solid fa-lock" style="margin-right: 8px;"></i>
                Access Closed
            </button>
        `);
        actionHtml = `
            <div class="card-footer" style="display:flex; gap:10px; flex-wrap:wrap;">
                ${actions.join('')}
            </div>
        `;
    }

    div.innerHTML = `
        ${status === 'completed' ? '<div class="verified-tick" style="position:absolute; top: -10px; right: -10px; background: #10b981; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; box-shadow:0 5px 15px rgba(16,185,129,0.4); z-index: 10; border: 4px solid #0f172a;"><i class="fa-solid fa-check"></i></div>' : ''}
        <div class="test-top">
            <div class="test-icon">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <span class="status-pill ${statusClass}">
                ${statusLabel}
            </span>
        </div>
        <h3>${test.Name}</h3>
        <div class="test-meta">
            <div class="meta-item">
                <i class="fa-solid fa-calendar-day"></i>
                <span><strong>Date:</strong> ${new Date(test.Date).toLocaleDateString()}</span>
            </div>
            <div class="meta-item">
                <i class="fa-solid fa-stopwatch"></i>
                <span><strong>Duration:</strong> ${test.Duration} Minutes</span>
            </div>
            ${status === 'completed' ? `
                <div class="meta-item">
                    <i class="fa-solid fa-percent"></i>
                    <span><strong>Score:</strong> ${test.scorePercentile ? test.scorePercentile.toFixed(1) : 0}%</span>
                </div>` : ''}
        </div>
        ${actionHtml}
    `;
    return div;
}

function startCountdowns(tests) {
    // Clear existing countdowns first
    countdownIntervals.forEach((intervalId) => {
        clearInterval(intervalId);
    });
    countdownIntervals.clear();

    const allTests = [
        ...(tests.active || []),
        ...(tests.upcoming || []),
        ...(tests.completed || []),
        ...(tests.ended || [])
    ];
    const upcomingTests = allTests.filter(t => t.status === 'upcoming');

    (upcomingTests || []).forEach(test => {
        console.log('[LOBBY COUNTDOWN] Starting countdown for', test.TestID);
        console.log('[LOBBY TIME] testId:', test.TestID, 'status:', test.status, 'startAtISO:', test.startAtISO, 'expiryAtISO:', test.expiryAtISO, 'serverNowISO:', test.serverNowISO);
        const timerElement = document.querySelector(`#timer-${test.TestID} span`);
        if (!timerElement) {
            console.log(`[LOBBY COUNTDOWN] Timer element not found for test ${test.TestID}`);
            return;
        }

        // Validate required fields
        if (!test.startAtISO || !test.serverNowISO) {
            const missingFields = [];
            if (!test.startAtISO) missingFields.push('startAtISO');
            if (!test.serverNowISO) missingFields.push('serverNowISO');
            console.error(`[LOBBY COUNTDOWN] Missing required fields for test ${test.TestID}: ${missingFields.join(', ')}`);
            timerElement.innerText = 'Countdown unavailable';
            return;
        }

        // If test already ended countdown, skip
        if (countdownEndedTests.has(test.TestID)) {
            console.log(`[LOBBY COUNTDOWN] ${test.TestID} already triggered refresh, skipping`);
            return;
        }

        // Calculate server offset
        const serverNow = new Date(test.serverNowISO);
        const localNow = Date.now();
        const serverOffset = serverNow.getTime() - localNow;
        console.log('[LOBBY TIME] serverOffset:', serverOffset);

        const targetDate = new Date(test.startAtISO);

        const updateTimer = () => {
            const adjustedNow = Date.now() + serverOffset;
            const diff = targetDate.getTime() - adjustedNow;
            console.log('[LOBBY COUNTDOWN]', test.TestID, 'remaining:', diff);

            if (diff <= 0) {
                if (!countdownEndedTests.has(test.TestID)) {
                    const intervalId = countdownIntervals.get(test.TestID);
                    if (intervalId) clearInterval(intervalId);
                    countdownIntervals.delete(test.TestID);
                    countdownEndedTests.add(test.TestID);
                    console.log("[LOBBY] countdown ended refresh once for", test.TestID);
                    loadCandidateData("countdown-ended");
                }
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);

            let label = 'Starts in:';
            if (days > 0) {
                label += ` ${days}d`;
            }
            label += ` ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            timerElement.innerText = label;
            console.log('[LOBBY COUNTDOWN]', test.TestID, 'display:', label);
        };

        updateTimer();
        const intervalId = setInterval(updateTimer, 1000);
        countdownIntervals.set(test.TestID, intervalId);
    });
}

function renderOverallLeaderboard(data, currentUserId) {
    const scopeEl = document.getElementById('leaderboardScope');
    const tableBody = document.getElementById('leaderboardTableBody');
    if (!tableBody) return;

    if (data.scope) {
        if (scopeEl) {
            scopeEl.innerText = `Ranking among candidates from ${data.scope.department}, Year ${data.scope.year}, ${data.scope.college}`;
        }
    }

    const leaderboard = data.leaderboard || [];
    if (leaderboard.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No leaderboard data available yet.</td></tr>';
        return;
    }

    const currentUserEntry = leaderboard.find(entry => entry.userID === currentUserId || String(entry.userID) === String(currentUserId));
    if (currentUserEntry) {
        const rankEl = document.getElementById('overallRank');
        if (rankEl) rankEl.innerText = `${currentUserEntry.rank}`;
    }

    tableBody.innerHTML = leaderboard.map(entry => {
        const isCurrentUser = entry.isCurrentUser || entry.userID === currentUserId || String(entry.userID) === String(currentUserId);
        const totalViolations = Number(entry.totalViolations || 0);
        const rowClass = isCurrentUser ? 'style="background: rgba(37,99,235,0.15);"' : '';
        return `
            <tr ${rowClass}>
                <td style="padding:12px 15px;"><strong>#${entry.rank}${isCurrentUser ? ' <span class="badge" style="background:#10b981; color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;">You</span>' : ''}</strong></td>
                <td style="padding:12px 15px;"><strong>${entry.name || '-'}</strong></td>
                <td style="padding:12px 15px;">${entry.attendedTestCount ?? 0}</td>
                <td style="padding:12px 15px;">${Number(!!entry.avgScorePercentile ? entry.avgScorePercentile : 0).toFixed(1)}%</td>
                <td style="padding:12px 15px;">${Number(!!entry.avgAccuracyPercent ? entry.avgAccuracyPercent : 0).toFixed(1)}%</td>
                <td style="padding:12px 15px;">${formatTimeMMSS(entry.avgTimeTakenMinutes ?? 0, "minutes")}</td>
                <td style="padding:12px 15px;">
                    <span class="${totalViolations > 0 ? 'overall-violations-bad' : 'overall-violations-good'}">
                        ${totalViolations}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function startOverallLeaderboardPoll() {
    loadOverallLeaderboard();
    if (overallPollInterval) clearInterval(overallPollInterval);
    overallPollInterval = setInterval(() => {
        loadOverallLeaderboard();
    }, 15000);
}

window.openLiveExamLeaderboard = async function(testId, testName) {
    console.log('[LOBBY] openLiveExamLeaderboard called:', testId, testName);
    if (currentLiveTestId) {
        closeLiveLeaderboard();
    }
    currentLiveTestId = testId;
    liveLeaderboardTestEnded = false;
    liveLeaderboardPreviousState.clear();

    const modalHtml = `
        <div id="liveLeaderboardModal" class="modal-overlay live-leaderboard-modal" style="position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index: 1000; display:flex; align-items:center; justify-content:center; padding:20px;">
            <div class="modal-content live-leaderboard-modal-content" style="background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:28px; padding:35px; width:100%; max-width:1400px; box-shadow:0 25px 50px rgba(0,0,0,0.5); max-height:90vh; overflow:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
                    <h2 style="margin:0; font-size:1.5rem;"><i class="fa-solid fa-trophy" style="margin-right:12px; color:#f59e0b;"></i><span id="liveLeaderboardTitle">${testName} - Live Exam Leaderboard</span></h2>
                    <button onclick="closeLiveLeaderboard()" style="background:none; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div id="liveLeaderboardStatusBanner" class="live-leaderboard-status-banner"></div>
                <p id="liveLeaderboardVisibleUntil" style="color:#94a3b8; margin:0 0 20px 0;"></p>
                <div id="liveLeaderboardContent">
                    <div style="text-align:center; padding:40px;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: #3b82f6;"></i>
                        <p style="color:#94a3b8; margin-top:15px;">Loading leaderboard...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    await loadLiveExamSessionLeaderboard();
    if (!liveLeaderboardTestEnded) {
        startLiveLeaderboardPoll();
    }
};

async function loadLiveExamSessionLeaderboard() {
    if (!currentLiveTestId) return;
    const user = getUser();
    try {
        const res = await api.get('getLiveExamSessionLeaderboard', { testId: currentLiveTestId });
        if (!res || res.success === false) {
            const errMsg = res?.error || 'Failed to load live scoreboard';
            console.error('[LOBBY] Live scoreboard API error:', errMsg);
            const container = document.getElementById('liveLeaderboardContent');
            if (container) {
                container.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">${errMsg}</div>`;
            }
            stopLiveLeaderboardPoll();
            return;
        }

        if (res.visibleUntil) {
            liveLeaderboardVisibleUntil = res.visibleUntil;
        }
        const visibleUntilEl = document.getElementById('liveLeaderboardVisibleUntil');
        if (visibleUntilEl) {
            const formattedVisibleUntil = liveLeaderboardVisibleUntil
                ? new Date(liveLeaderboardVisibleUntil).toLocaleString()
                : (res.testEndTime ? new Date(res.testEndTime).toLocaleString() : 'N/A');
            visibleUntilEl.textContent = res.isEnded
                ? `Test ended at: ${res.testEndTime ? new Date(res.testEndTime).toLocaleString() : formattedVisibleUntil}`
                : `Live until: ${formattedVisibleUntil}`;
        }

        if (res.isEnded || res.testStatus === 'ended') {
            liveLeaderboardTestEnded = true;
            stopLiveLeaderboardPoll();
        } else if (res.testStatus === 'ongoing' || res.isOngoing) {
            liveLeaderboardTestEnded = false;
        } else if (res.testStatus === 'not_started') {
            liveLeaderboardTestEnded = true;
            stopLiveLeaderboardPoll();
        }

        renderLiveExamSessionLeaderboard(res, user.userId || user.userID);
    } catch (err) {
        console.error('[LOBBY] Error loading live exam session leaderboard:', err);
        const container = document.getElementById('liveLeaderboardContent');
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">Failed to load scoreboard. Please try again.</div>`;
        }
    }
}

function getCandidateMergeKey(row) {
  const email = row?.candidate?.email || row?.email;
  const univId = row?.candidate?.univId || row?.univId;
  const userID = row?.userID || row?.UserID || row?.userId;

  if (email) return `email:${String(email).trim().toLowerCase()}`;
  if (univId) return `univ:${String(univId).trim().toLowerCase()}`;
  return `user:${String(userID).trim()}`;
}

function getLiveLeaderboardRowKey(entry) {
    const key = getCandidateMergeKey(entry);
    return key || `user:${String(entry.userID || 'unknown')}`;
}

function getLiveLeaderboardDisplayScore(entry) {
    if (entry.status !== 'submitted') return null;
    if (entry.scoreAfterDeduction !== undefined && entry.scoreAfterDeduction !== null && entry.scoreAfterDeduction !== '') {
        return Number(entry.scoreAfterDeduction);
    }
    if (entry.adjustedScore !== undefined && entry.adjustedScore !== null && entry.adjustedScore !== '') {
        return Number(entry.adjustedScore);
    }
    if (window.getFinalDisplayScore) {
        return window.getFinalDisplayScore(entry);
    }
    return Number(entry.netScore ?? 0);
}

function updateLiveLeaderboardBanner(data) {
    const banner = document.getElementById('liveLeaderboardStatusBanner');
    if (!banner) return;
    const status = data.testStatus || (data.isEnded ? 'ended' : 'ongoing');
    if (status === 'ended' || data.isEnded) {
        banner.innerHTML = '<span><i class="fa-solid fa-flag-checkered"></i> Test ended — final scoreboard</span>';
        banner.className = 'live-leaderboard-status-banner live-lb-banner-ended';
    } else if (status === 'ongoing' || data.isOngoing) {
        banner.innerHTML = '<span><i class="fa-solid fa-signal"></i> Live scoreboard — updates every 10 seconds</span>';
        banner.className = 'live-leaderboard-status-banner live-lb-banner-live';
    } else {
        banner.innerHTML = '<span><i class="fa-solid fa-clock"></i> Test has not started</span>';
        banner.className = 'live-leaderboard-status-banner live-lb-banner-upcoming';
    }
}

function updateLiveLeaderboardFooter(data) {
    const footer = document.getElementById('liveLeaderboardFooter');
    if (!footer) return;
    if (data.isEnded || data.testStatus === 'ended') {
        footer.innerHTML = '<i class="fa-solid fa-flag-checkered" style="margin-right:5px;"></i>Final scoreboard — auto-refresh stopped';
    } else if (data.testStatus === 'ongoing' || data.isOngoing) {
        footer.innerHTML = '<i class="fa-solid fa-sync-alt" style="margin-right:5px;"></i>Auto-updates every 10 seconds';
    } else {
        footer.innerHTML = '<i class="fa-solid fa-clock" style="margin-right:5px;"></i>Waiting for test to start';
    }
}

function buildLiveLeaderboardShell() {
    return `
        <div class="live-leaderboard-table-wrap">
            <table class="live-leaderboard-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                        <th class="live-lb-col-rank" style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Rank</th>
                        <th class="live-lb-col-name" style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Candidate</th>
                        <th class="live-lb-col-status" style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Status</th>
                        <th class="live-lb-col-progress" style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Progress</th>
                        <th class="live-lb-col-percentile" style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Percentile</th>
                        <th class="live-lb-col-score" style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Score</th>
                        <th class="live-lb-col-time" style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Time</th>
                        <th class="live-lb-col-cwu" style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">C/W/U</th>
                        <th class="live-lb-col-active" style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Last Active</th>
                        <th class="live-lb-col-violations" style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Violations</th>
                    </tr>
                </thead>
                <tbody id="liveLeaderboardTbody"></tbody>
            </table>
        </div>
        <div id="liveLeaderboardFooter" style="margin-top:20px; text-align:right; color:#94a3b8; font-size:0.8rem;"></div>
    `;
}

function buildLiveLeaderboardRowMarkup(entry) {
    const stateGetter = 
        window.getViolationState || 
        window.getViolationAdjustedScore || 
        function fallbackViolationState() { return {}; }; 
 
    const state = stateGetter(entry);

    // Explicit "field exists" checks for backend current values
    const currentFsValue = 
        entry.currentFullScreenViolations ?? 
        entry.currentFs ?? 
        entry.currentFullscreenViolations; 

    const currentTsValue = 
        entry.currentTabSwitchCount ?? 
        entry.currentTs; 

    const currentViolationsValue = 
        entry.currentSuspiciousScore ?? 
        entry.currentViolationCount ?? 
        entry.currentViolations; 

    const currentFs = Number(currentFsValue); 
    const currentTs = Number(currentTsValue); 
    const totalCurrentViolations = Number(currentViolationsValue); 

    const hasBackendCurrentFs = 
        currentFsValue !== undefined && 
        currentFsValue !== null && 
        currentFsValue !== ''; 

    const hasBackendCurrentTs = 
        currentTsValue !== undefined && 
        currentTsValue !== null && 
        currentTsValue !== ''; 

    const hasBackendCurrentViolations = 
        currentViolationsValue !== undefined && 
        currentViolationsValue !== null && 
        currentViolationsValue !== '';

    // Fallback calculation if backend didn't send current values
    const originalFs = Number(
        entry.originalFullScreenViolations ?? 
        entry.fullScreenViolations ?? 
        entry.violations?.fullScreenViolations ?? 
        state.originalFullScreenViolations ?? 
        0 
    ); 

    const originalTs = Number(
        entry.originalTabSwitchCount ?? 
        entry.tabSwitchCount ?? 
        entry.violations?.tabSwitchCount ?? 
        state.originalTabSwitchCount ?? 
        0 
    ); 

    const fsDeduction = Number(
        entry.fullScreenDeduction ?? 
        entry.violations?.fullScreenDeduction ?? 
        state.fullScreenDeduction ?? 
        0 
    ); 

    const tsDeduction = Number(
        entry.tabSwitchDeduction ?? 
        entry.violations?.tabSwitchDeduction ?? 
        state.tabSwitchDeduction ?? 
        0 
    ); 

    const fallbackCurrentFs = Math.max(0, originalFs - fsDeduction); 
    const fallbackCurrentTs = Math.max(0, originalTs - tsDeduction); 
    const fallbackCurrentViolations = fallbackCurrentFs + fallbackCurrentTs; 

    // Use backend current values if available, else fallback
    const displayFs = 
        hasBackendCurrentFs && Number.isFinite(currentFs) 
            ? currentFs 
            : fallbackCurrentFs; 

    const displayTs = 
        hasBackendCurrentTs && Number.isFinite(currentTs) 
            ? currentTs 
            : fallbackCurrentTs; 

    const displayViolations = 
        hasBackendCurrentViolations && Number.isFinite(totalCurrentViolations) 
            ? totalCurrentViolations 
            : displayFs + displayTs;

    const isCurrentlyMalpracticed = displayViolations > 0; 
    const malpracticeStatus = isCurrentlyMalpracticed ? "Malpracticed" : "Good";
    
    // Other variables
    const totalDeduction = Number(state.violationDeduction ?? (fsDeduction + tsDeduction));
    const deductionPercent = Number(entry.deductionPercent ?? (displayViolations * 3));
    const originalPercentile = entry.originalPercentile !== null && entry.originalPercentile !== undefined
        ? Number(entry.originalPercentile)
        : Number(entry.scorePercentile || 0);
    const adjustedPercentile = entry.adjustedPercentile !== null && entry.adjustedPercentile !== undefined
        ? Number(entry.adjustedPercentile)
        : Math.max(0, originalPercentile - deductionPercent);
    const originalStatusLabel = entry.status === 'in_progress' ? 'In Progress' :
        entry.status === 'submitted' ? 'Submitted' :
        entry.status === 'abandoned' ? 'Abandoned' : 'Expired';
    const isGood = malpracticeStatus === 'Good';
    const malpracticePillColor = isGood ? '#4ade80' : '#f87171';
    const malpracticePillBg = isGood ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.14)';
    const lastActive = entry.lastHeartbeat ? new Date(entry.lastHeartbeat).toLocaleTimeString() : '';
    const displayScore = getLiveLeaderboardDisplayScore(entry);
    const rawScore = Number.isFinite(Number(state.rawScore))
  ? Number(state.rawScore)
  : Number(
      entry.scoreBeforeDeduction ??
      entry.rawScore ??
      entry.netScore ??
      entry.NetScore ??
      entry.result?.netScore ??
      entry.result?.score ??
      entry.Score ??
      entry.score ??
      0
    );
    const finalScore = Number(displayScore);
    const shouldShowDeductionNote = 
        Number.isFinite(rawScore) && 
        Number.isFinite(finalScore) && 
        rawScore > finalScore && 
        totalDeduction > 0;

    let rowStyle = '';
    if (entry.isCurrentUser) rowStyle += 'background: rgba(37,99,235,0.15);';
    if (isCurrentlyMalpracticed) rowStyle += 'background: linear-gradient(90deg, rgba(239,68,68,0.18), rgba(127,29,29,0.08)); border-left: 4px solid #ef4444;';

    const percentileCell = entry.status === 'submitted'
        ? (isCurrentlyMalpracticed
            ? `<div style="display:flex; flex-direction:column; gap:2px;">
                <span>Original: ${originalPercentile.toFixed(1)}%</span>
                <span>Adjusted: ${adjustedPercentile.toFixed(1)}%</span>
               </div>`
            : `<div style="display:flex; flex-direction:column; gap:2px;">
                <span>${originalPercentile.toFixed(1)}%</span>
                <span style="color:#94a3b8; font-size:0.8rem;">No deduction</span>
               </div>`)
        : '-';

    const scoreCell = entry.status === 'submitted'
        ? (shouldShowDeductionNote
            ? `<div><strong>${displayScore}</strong></div><div class="live-lb-score-note" style="color:#94a3b8;font-size:0.75rem;">Raw: ${rawScore} (-${totalDeduction})</div>`
            : `<strong>${displayScore}</strong>`)
        : '-';

    const violationsCell = (entry.fullScreenViolations !== undefined || entry.tabSwitchCount !== undefined || entry.totalViolations !== undefined)
        ? `<div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:700; font-size:1rem;">${displayViolations}</span>
            <span style="color:#94a3b8; font-size:0.8rem;">FS: ${displayFs} | TS: ${displayTs}</span>
           </div>`
        : '-';

    const rowClasses = ['live-leaderboard-row', entry.animationClass].filter(Boolean).join(' ');
    const candidateKey = getLiveLeaderboardRowKey(entry);

    return `
        <tr data-candidate-key="${candidateKey}" data-user-id="${entry.userID}" data-rank="${entry.rank}" class="${rowClasses}" style="${rowStyle} border-bottom:1px solid rgba(255,255,255,0.05);">
            <td class="live-lb-col-rank" style="padding:12px 15px;">
                <strong>${entry.rank === '-' ? '-' : '#' + entry.rank}${entry.isCurrentUser ? ' <span class="badge" style="background:#10b981; color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;">You</span>' : ''}</strong>
            </td>
            <td class="live-lb-col-name" style="padding:12px 15px;"><strong>${entry.name}</strong></td>
            <td class="live-lb-col-status" style="padding:12px 15px;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span style="display:inline-block; padding:3px 10px; border-radius:12px; color:${malpracticePillColor}; background:${malpracticePillBg}; font-weight:600; font-size:0.85rem;">${malpracticeStatus}</span>
                    <span style="color:#94a3b8; font-size:0.75rem;">${originalStatusLabel}</span>
                </div>
            </td>
            <td class="live-lb-col-progress" style="padding:12px 15px;">
                ${entry.status === 'in_progress' ? `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span>${entry.answeredCount || 0}/${entry.totalQuestions || 0} answered</span>
                        <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                            <div style="height:100%; background:linear-gradient(90deg, #3b82f6, #8b5cf6); width:${entry.progressPercent || 0}%;"></div>
                        </div>
                    </div>
                ` : '-'}
            </td>
            <td class="live-lb-col-percentile" style="padding:12px 15px;">${percentileCell}</td>
            <td class="live-lb-col-score" style="padding:12px 15px;">${scoreCell}</td>
            <td class="live-lb-col-time" style="padding:12px 15px;">${entry.status === 'submitted' && entry.totalTimeTakenSeconds !== undefined ? formatTimeMMSS(entry.totalTimeTakenSeconds, 'seconds') : '-'}</td>
            <td class="live-lb-col-cwu" style="padding:12px 15px;">${entry.status === 'submitted' ? (entry.correctCount || 0) + '/' + (entry.wrongCount || 0) + '/' + (entry.unansweredCount || 0) : '-'}</td>
            <td class="live-lb-col-active" style="padding:12px 15px; font-size:0.85rem; color:#94a3b8;">${lastActive}</td>
            <td class="live-lb-col-violations" style="padding:12px 15px;">${violationsCell}</td>
        </tr>
    `;
}

function updateLiveLeaderboardRows(rowsWithAnimations) {
    const tbody = document.getElementById('liveLeaderboardTbody');
    if (!tbody) return;

    const scrollParent = tbody.closest('.live-leaderboard-table-wrap') || tbody.closest('.modal-content');
    const prevScrollTop = scrollParent ? scrollParent.scrollTop : 0;

    const existingRows = new Map();
    tbody.querySelectorAll('tr[data-candidate-key]').forEach(tr => {
        existingRows.set(tr.dataset.candidateKey, tr);
    });

    const nextKeys = new Set();

    rowsWithAnimations.forEach(entry => {
        const key = getLiveLeaderboardRowKey(entry);
        nextKeys.add(key);
        const rowSignature = JSON.stringify({
            rank: entry.rank,
            status: entry.status,
            score: getLiveLeaderboardDisplayScore(entry),
            answeredCount: entry.answeredCount,
            progressPercent: entry.progressPercent,
            violationDeduction: entry.violationDeduction
        });
        const markup = buildLiveLeaderboardRowMarkup(entry).trim();
        const temp = document.createElement('tbody');
        temp.innerHTML = markup;
        const newRow = temp.firstElementChild;
        if (!newRow) return;

        const existing = existingRows.get(key);
        if (existing) {
            const signatureChanged = existing.dataset.rowSignature !== rowSignature;
            const oldRank = existing.dataset.rank;
            const newRank = newRow.dataset.rank;
            existing.innerHTML = newRow.innerHTML;
            existing.className = newRow.className;
            existing.style.cssText = newRow.style.cssText;
            existing.dataset.rank = newRow.dataset.rank;
            existing.dataset.userId = newRow.dataset.userId;
            existing.dataset.rowSignature = rowSignature;
            if (signatureChanged || oldRank !== newRank) {
                existing.classList.add('leaderboard-row-updated');
            }
            tbody.appendChild(existing);
        } else {
            newRow.dataset.rowSignature = rowSignature;
            newRow.classList.add('leaderboard-row-updated', 'live-new-row');
            tbody.appendChild(newRow);
        }
    });

    existingRows.forEach((tr, key) => {
        if (!nextKeys.has(key)) tr.remove();
    });

    if (scrollParent) scrollParent.scrollTop = prevScrollTop;

    setTimeout(() => {
        tbody.querySelectorAll('tr.leaderboard-row-updated, tr.live-new-row, tr.live-rank-up, tr.live-rank-down, tr.live-submitted-update, tr.live-progress-update').forEach(row => {
            row.classList.remove('leaderboard-row-updated', 'live-new-row', 'live-rank-up', 'live-rank-down', 'live-submitted-update', 'live-progress-update');
        });
    }, 500);
}

function renderLiveExamSessionLeaderboard(data, currentUserId) {
    const container = document.getElementById('liveLeaderboardContent');
    if (!container) return;

    updateLiveLeaderboardBanner(data);

    let leaderboard = data.leaderboard || [];
    const rowMap = new Map();
    leaderboard.forEach(entry => {
        const key = getCandidateMergeKey(entry);
        if (rowMap.has(key)) {
            const existing = rowMap.get(key);
            if (entry.status === 'submitted' && existing.status !== 'submitted') {
                rowMap.set(key, entry);
            }
        } else {
            rowMap.set(key, entry);
        }
    });
    leaderboard = Array.from(rowMap.values());

    if (leaderboard.length === 0) {
        const emptyMessage = data.isEnded || data.testStatus === 'ended'
            ? 'No submitted candidates found for this test yet.'
            : 'No candidates have started this exam yet.';
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <i class="fas fa-clock" style="font-size: 3rem; color: #94a3b8;"></i>
                <h3 style="color:#cbd5e1; margin-top:15px;">${emptyMessage}</h3>
                <p style="color:#94a3b8; margin-top:8px;">${data.isEnded ? 'Final scoreboard is based on submitted exam results.' : 'Leaderboard updates automatically as candidates start and submit the exam.'}</p>
            </div>
        `;
        updateLiveLeaderboardFooter(data);
        return;
    }

    const rowsWithAnimations = leaderboard.map(entry => {
        const isCurrentUser = entry.isCurrentUser || entry.userID === currentUserId || String(entry.userID) === String(currentUserId);
        const rowKey = getLiveLeaderboardRowKey(entry);
        const previous = liveLeaderboardPreviousState.get(rowKey) || liveLeaderboardPreviousState.get(entry.userID);
        let animationClass = '';
        if (!previous) {
            animationClass = 'live-new-row';
        } else if (entry.status === 'submitted' && previous.status !== 'submitted') {
            animationClass = 'live-submitted-update';
        } else if (entry.rank !== previous.rank && entry.rank !== '-' && previous.rank !== '-') {
            animationClass = entry.rank < previous.rank ? 'live-rank-up' : 'live-rank-down';
        } else if (entry.answeredCount !== previous.answeredCount) {
            animationClass = 'live-progress-update';
        } else if (getLiveLeaderboardDisplayScore(entry) !== previous.displayScore) {
            animationClass = 'leaderboard-row-updated';
        }
        return { ...entry, isCurrentUser, animationClass };
    });

    liveLeaderboardPreviousState.clear();
    leaderboard.forEach(entry => {
        const rowKey = getLiveLeaderboardRowKey(entry);
        liveLeaderboardPreviousState.set(rowKey, {
            rank: entry.rank,
            status: entry.status,
            answeredCount: entry.answeredCount,
            totalQuestions: entry.totalQuestions,
            scorePercentile: entry.scorePercentile,
            netScore: entry.netScore,
            displayScore: getLiveLeaderboardDisplayScore(entry)
        });
    });

    if (!document.getElementById('liveLeaderboardTbody')) {
        container.innerHTML = buildLiveLeaderboardShell();
    }

    updateLiveLeaderboardRows(rowsWithAnimations);
    updateLiveLeaderboardFooter(data);
}

function stopLiveLeaderboardPoll() {
    if (liveLeaderboardPollInterval) {
        clearInterval(liveLeaderboardPollInterval);
        liveLeaderboardPollInterval = null;
    }
}

function startLiveLeaderboardPoll() {
    stopLiveLeaderboardPoll();
    if (liveLeaderboardTestEnded) return;
    liveLeaderboardPollInterval = setInterval(() => {
        if (!liveLeaderboardTestEnded && currentLiveTestId) {
            loadLiveExamSessionLeaderboard();
        }
    }, LIVE_LEADERBOARD_POLL_MS);
}

window.closeLiveLeaderboard = function() {
    stopLiveLeaderboardPoll();
    currentLiveTestId = null;
    liveLeaderboardTestEnded = false;
    liveLeaderboardPreviousState.clear();
    const modal = document.getElementById('liveLeaderboardModal');
    if (modal) modal.remove();
};

function startTest(testId) {
    debugLog('INFO', 'LOBBY', 'Starting Test');
    localStorage.setItem('selectedTestID', testId);
    window.location.href = `./exam.html?testId=${testId}`;
}

// CAREER PATH FUNCTIONS
function getLobbyStudentSession() {
const raw = localStorage.getItem('cbt_user') || sessionStorage.getItem('cbt_user');

if (!raw) {
    return {
        sessionToken: '',
        studentId: '',
        name: '',
        email: ''
    };
}

try {
    const parsed = JSON.parse(raw);

    return {
        sessionToken: parsed.sessionToken || parsed.SessionToken || parsed.token || '',
        studentId: String(parsed.userId || parsed.userID || parsed.UserID || parsed.univId || parsed.email || '').trim(),
        name: parsed.fullName || parsed.name || parsed.Name || '',
        email: parsed.email || parsed.Email || ''
    };
} catch (err) {
    console.warn('[LOBBY CAREER PATH] invalid cbt_user storage:', err);
    return {
        sessionToken: '',
        studentId: '',
        name: '',
        email: ''
    };
}
}

async function loadLobbyCareerPath() {
const state = document.getElementById('careerPathState');
const content = document.getElementById('careerPathContent');

if (!state || !content) return;

try {
    state.style.display = 'block';
    state.className = 'career-path-state career-loading';
    state.textContent = 'Loading career path...';
    content.style.display = 'none';

    const session = getLobbyStudentSession();

    if (!session.sessionToken) {
        state.className = 'career-path-state career-error';
        state.textContent = 'Login session missing. Please login again.';
        return;
    }

    const res = await api.post({
        action: 'getMyCareerPath',
        sessionToken: session.sessionToken
    });

    console.log('[LOBBY CAREER PATH] response:', res);

    if (!res || res.success !== true) {
        state.className = 'career-path-state career-error';
        state.textContent = res?.error || 'Could not load career path.';
        return;
    }

    const attempts = Array.isArray(res.attempts) ? res.attempts : [];

    if (attempts.length === 0) {
        state.className = 'career-path-state career-empty-state';
        state.textContent = 'No previous exam history yet. Complete exams to build your career path.';
        return;
    }

    renderCareerPath(res);

    state.style.display = 'none';
    content.style.display = 'block';

} catch (err) {
    console.error('[LOBBY CAREER PATH] error:', err);
    state.className = 'career-path-state career-error';
    state.textContent = 'Could not load career path.';
}
}

function getTrendIndicator(current, previous, higherIsBetter, suffix = '') {
if (previous === null || previous === undefined) {
return {
    text: 'First exam',
    className: 'trend-neutral',
    improved: null
};
}

const c = Number(current || 0);
const p = Number(previous || 0);
const delta = Number((c - p).toFixed(2));

if (delta === 0) {
    return {
        text: `0${suffix}`,
        className: 'trend-neutral',
        improved: false
    };
}

const improved = higherIsBetter ? delta > 0 : delta < 0;

return {
    text: `${delta > 0 ? '+' : ''}${delta}${suffix} ${delta > 0 ? '↑' : '↓'}`,
    className: improved ? 'trend-good' : 'trend-bad',
    improved
};
}

function escapeCareerHtml(value) {
return String(value ?? '')
.replaceAll('&', '&')
.replaceAll('<', '<')
.replaceAll('>', '>')
.replaceAll('"', '"')
.replaceAll("'", "'");
}

function formatCareerDate(value) {
if (!value) return '-';

const date = new Date(value);
if (Number.isNaN(date.getTime())) return '-';

return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
});
}

function renderCareerPath(data) {
const attempts = Array.isArray(data.attempts) ? data.attempts : [];

renderCareerSummary(data.summary || {}, attempts);
renderMiniLineChart('scoreTrendChart', attempts, 'percentageScore', 'Score', '%');
renderMiniLineChart('gradeTrendChart', attempts, 'gradePoint', 'Grade', '');
renderMiniLineChart('timeTrendChart', attempts, 'timeTakenMinutes', 'Time', 'm');
renderMiniLineChart('violationTrendChart', attempts, 'violationsCount', 'Violations', '');
renderCareerHistoryTable(attempts);
}

function renderCareerSummary(summary, attempts) {
const grid = document.getElementById('careerSummaryGrid');
if (!grid) return;

const latest = attempts[attempts.length - 1] || null;
const previous = attempts.length > 1 ? attempts[attempts.length - 2] : null;

const score = latest ? Number(latest.percentageScore || 0) : Number(summary.latestPercentage || 0);
const grade = latest ? Number(latest.gradePoint || 0) : Number(summary.latestGradePoint || 0);
const time = latest ? Number(latest.timeTakenMinutes || 0) : Number(summary.latestTimeTakenMinutes || 0);
const violations = latest ? Number(latest.violationsCount || 0) : Number(summary.latestViolations || 0);

const prevScore = previous ? Number(previous.percentageScore || 0) : null;
const prevGrade = previous ? Number(previous.gradePoint || 0) : null;
const prevTime = previous ? Number(previous.timeTakenMinutes || 0) : null;
const prevViolations = previous ? Number(previous.violationsCount || 0) : null;

const cards = [
    {
        label: 'Latest Score',
        value: `${score.toFixed(1)}%`,
        icon: 'fa-percent',
        trend: getTrendIndicator(score, prevScore, true, '%')
    },
    {
        label: 'Grade Point',
        value: grade.toFixed(2),
        icon: 'fa-star',
        trend: getTrendIndicator(grade, prevGrade, true, '')
    },
    {
        label: 'Time Taken',
        value: `${time}m`,
        icon: 'fa-clock',
        trend: getTrendIndicator(time, prevTime, false, 'm')
    },
    {
        label: 'Violations',
        value: violations,
        icon: 'fa-shield-halved',
        trend: getTrendIndicator(violations, prevViolations, false, '')
    }
];

grid.innerHTML = cards.map(card => `
    <div class="career-stat-card">
        <div class="career-stat-label">
            <i class="fa-solid ${card.icon}"></i>
            ${escapeCareerHtml(card.label)}
        </div>
        <div class="career-stat-value">${escapeCareerHtml(card.value)}</div>
        <div class="career-trend ${card.trend.className}">
            ${escapeCareerHtml(card.trend.text)}
        </div>
    </div>
`).join('');
}

function renderMiniLineChart(containerId, attempts, metricKey, label, suffix = '') {
const container = document.getElementById(containerId);
if (!container) return;

if (!Array.isArray(attempts) || attempts.length < 2) {
    container.innerHTML = `<div class="career-chart-empty">Need 2+ exams for trend</div>`;
    return;
}

const width = 520;
const height = 170;
const padX = 34;
const padY = 24;

const values = attempts.map(a => Number(a[metricKey] || 0));
let min = Math.min(...values);
let max = Math.max(...values);

if (min === max) {
    min = Math.max(0, min - 1);
    max = max + 1;
}

const xStep = (width - padX * 2) / Math.max(1, attempts.length - 1);

const points = attempts.map((attempt, index) => {
    const value = Number(attempt[metricKey] || 0);
    const x = padX + index * xStep;
    const y = height - padY - ((value - min) / (max - min)) * (height - padY * 2);

    return { x, y, value, attempt };
});

const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

const metricClass = metricKey === 'percentageScore'
    ? 'score'
    : metricKey === 'gradePoint'
        ? 'grade'
        : metricKey === 'timeTakenMinutes'
            ? 'time'
            : 'violations';

const circles = points.map((p, index) => {
    const examName = p.attempt.testName || `Exam ${index + 1}`;
    const tooltip = `${examName}: ${p.value}${suffix}`;

    return `
        <circle cx="${p.x}" cy="${p.y}" r="5" class="career-dot career-dot-${metricClass}">
            <title>${escapeCareerHtml(tooltip)}</title>
        </circle>
    `;
}).join('');

const labels = points.map((p, index) => `
    <text x="${p.x}" y="${height - 5}" text-anchor="middle" class="career-axis-label">
        ${index + 1}
    </text>
`).join('');

container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeCareerHtml(label)} trend chart">
        <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" class="career-axis"></line>
        <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" class="career-axis"></line>

        <text x="${padX}" y="${padY - 7}" class="career-axis-label">${escapeCareerHtml(`${max.toFixed(1)}${suffix}`)}</text>
        <text x="${padX}" y="${height - padY - 7}" class="career-axis-label">${escapeCareerHtml(`${min.toFixed(1)}${suffix}`)}</text>

        <polyline points="${polyline}" fill="none" class="career-line career-line-${metricClass}"></polyline>
        ${circles}
        ${labels}
    </svg>
`;
}

function renderCareerHistoryTable(attempts) {
const container = document.getElementById('careerHistoryTable');
if (!container) return;

if (!Array.isArray(attempts) || attempts.length === 0) {
    container.innerHTML = `<div class="career-chart-empty">No exam history yet</div>`;
    return;
}

const rows = attempts.slice(-8).reverse().map(a => `
    <tr>
        <td>${escapeCareerHtml(a.testName || a.testId || '-')}</td>
        <td>${escapeCareerHtml(formatCareerDate(a.testDate || a.submittedAt))}</td>
        <td>${Number(a.percentageScore || 0).toFixed(1)}%</td>
        <td>${Number(a.gradePoint || 0).toFixed(2)}</td>
        <td>${Number(a.timeTakenMinutes || 0)}m</td>
        <td>${Number(a.violationsCount || 0)}</td>
        <td>${a.rank ? `#${escapeCareerHtml(a.rank)}` : '-'}</td>
    </tr>
`).join('');

container.innerHTML = `
    <div class="career-history-table-wrap">
        <table class="career-history-table">
            <thead>
                <tr>
                    <th>Exam</th>
                    <th>Date</th>
                    <th>Score</th>
                    <th>Grade</th>
                    <th>Time</th>
                    <th>Violations</th>
                    <th>Rank</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
`;
}

function setupCareerHistoryToggle() {
    const header = document.querySelector('.career-history-header');
    const btn = document.getElementById('toggleCareerHistoryBtn');
    const collapse = document.getElementById('careerHistoryCollapse');

    if (!header || !btn || !collapse) return;

    btn.addEventListener('click', () => {
        const isExpanded = collapse.classList.contains('expanded');
        if (isExpanded) {
            collapse.classList.remove('expanded');
            collapse.classList.add('collapsed');
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Show history';
        } else {
            collapse.classList.remove('collapsed');
            collapse.classList.add('expanded');
            btn.setAttribute('aria-expanded', 'true');
            btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide history';
        }
    });
}

// NEW FUNCTION FOR OVERALL LEADERBOARD TOGGLE
function setupOverallLeaderboardToggle() {
    const btn = document.getElementById('toggleOverallLeaderboardBtn');
    const panel = document.getElementById('overallLeaderboardCollapse');

    if (!btn || !panel) {
        console.warn('[OVERALL LEADERBOARD] Toggle elements missing');
        return;
    }

    btn.addEventListener('click', () => {
        const shouldOpen = panel.classList.contains('collapsed');

        if (shouldOpen) {
            panel.classList.remove('collapsed');
            btn.setAttribute('aria-expanded', 'true');
            btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide leaderboard';
        } else {
            panel.classList.add('collapsed');
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Show leaderboard';
        }
    });
}