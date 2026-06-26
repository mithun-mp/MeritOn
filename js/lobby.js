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

    if (showLiveLeaderboard) {
        if (!existingBtn) {
            // Button should exist, create it
            console.log(`[LIVE TOGGLE SYNC] showing button for ${test.TestID}`);
            const newBtn = document.createElement('button');
            newBtn.setAttribute('onclick', `openLiveExamLeaderboard('${test.TestID}', '${test.Name}')`);
            newBtn.className = 'enter-btn';
            newBtn.style.cssText = 'background: linear-gradient(135deg, #3b82f6, #2563eb); flex:1;';
            newBtn.innerHTML = '<i class="fa-solid fa-trophy" style="margin-right: 8px;"></i>Live Leaderboard';
            newBtn.style.transition = 'opacity 0.3s ease-in-out';
            newBtn.style.opacity = '0';
            footer.appendChild(newBtn);
            // Trigger fade in
            requestAnimationFrame(() => { newBtn.style.opacity = '1'; });
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
                        clearInterval(liveLeaderboardPollInterval);
                        liveLeaderboardPollInterval = null;
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
                    Live Leaderboard
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
                    Live Leaderboard
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
                    Live Leaderboard
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
    if (currentLiveTestId) {
        // Cleanup previous modal if any
        closeLiveLeaderboard();
    }
    currentLiveTestId = testId;
    liveLeaderboardPreviousState.clear();

    // First fetch to get visibleUntil
    try {
        const initialRes = await api.get('getLiveExamSessionLeaderboard', { testId });
        if (initialRes.success) {
            liveLeaderboardVisibleUntil = initialRes.visibleUntil;
        }
    } catch (e) {
        console.error('Error fetching initial leaderboard:', e);
    }

    const formattedVisibleUntil = liveLeaderboardVisibleUntil ? new Date(liveLeaderboardVisibleUntil).toLocaleString() : 'N/A';

    const modalHtml = `
        <div id="liveLeaderboardModal" class="modal-overlay" style="position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index: 1000; display:flex; align-items:center; justify-content:center; padding:20px;">
            <div class="modal-content" style="background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:28px; padding:35px; width:100%; max-width:1400px; box-shadow:0 25px 50px rgba(0,0,0,0.5); max-height:90vh; overflow:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h2 style="margin:0; font-size:1.5rem;"><i class="fa-solid fa-trophy" style="margin-right:12px; color:#f59e0b;"></i>${testName} - Live Exam Leaderboard</h2>
                    <button onclick="closeLiveLeaderboard()" style="background:none; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <p style="color:#94a3b8; margin:0 0 20px 0;">Live until: ${formattedVisibleUntil}</p>
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
    startLiveLeaderboardPoll();
};

async function loadLiveExamSessionLeaderboard() {
    if (!currentLiveTestId) return;
    const user = getUser();
    try {
        const res = await api.get('getLiveExamSessionLeaderboard', { testId: currentLiveTestId });
        if (res.success) {
            renderLiveExamSessionLeaderboard(res, user.userId || user.userID);
        }
    } catch (err) {
        console.error('[LOBBY] Error loading live exam session leaderboard:', err);
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

function renderLiveExamSessionLeaderboard(data, currentUserId) {
    const container = document.getElementById('liveLeaderboardContent');
    if (!container) return;
    let leaderboard = data.leaderboard || [];

    // Defensive frontend deduplication
    const rowMap = new Map();
    leaderboard.forEach(entry => {
        const key = getCandidateMergeKey(entry);
        if (rowMap.has(key)) {
            const existing = rowMap.get(key);
            // Submitted wins over in_progress
            if (entry.status === 'submitted' && existing.status !== 'submitted') {
                rowMap.set(key, entry);
            }
        } else {
            rowMap.set(key, entry);
        }
    });
    leaderboard = Array.from(rowMap.values());

    if (leaderboard.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <i class="fas fa-clock" style="font-size: 3rem; color: #94a3b8;"></i>
                <h3 style="color:#cbd5e1; margin-top:15px;">No candidates have started this exam yet</h3>
                <p style="color:#94a3b8; margin-top:8px;">Leaderboard updates automatically as candidates start and submit the exam.</p>
            </div>
        `;
        return;
    }

    // Compute animation classes for each row
    const rowsWithAnimations = leaderboard.map(entry => {
        const isCurrentUser = entry.isCurrentUser || entry.userID === currentUserId || String(entry.userID) === String(currentUserId);
        const previous = liveLeaderboardPreviousState.get(entry.userID);
        let animationClass = '';
        if (!previous) {
            animationClass = 'live-new-row';
        } else if (entry.status === 'submitted' && previous.status !== 'submitted') {
            animationClass = 'live-submitted-update';
        } else if (entry.rank !== previous.rank) {
            animationClass = entry.rank < previous.rank ? 'live-rank-up' : 'live-rank-down';
        } else if (entry.answeredCount !== previous.answeredCount) {
            animationClass = 'live-progress-update';
        }
        return { ...entry, isCurrentUser, animationClass };
    });

    // Update previous state
    liveLeaderboardPreviousState.clear();
    leaderboard.forEach(entry => {
        liveLeaderboardPreviousState.set(entry.userID, {
            rank: entry.rank,
            status: entry.status,
            answeredCount: entry.answeredCount,
            totalQuestions: entry.totalQuestions,
            scorePercentile: entry.scorePercentile,
            netScore: entry.netScore
        });
    });

    container.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Rank</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Candidate</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Status</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Progress</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Percentile</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Score</th>
                        <th style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Time Taken</th>
                        <th style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Correct/Wrong/Unanswered</th>
                        <th style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Last Active</th>
                        <th style="padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Violations</th>
                    </tr>
                </thead>
                <tbody id="liveLeaderboardTbody">
                    ${rowsWithAnimations.map(entry => {
                        const fullScreenViolations = Number(entry.fullScreenViolations || 0);
                        const tabSwitchCount = Number(entry.tabSwitchCount || 0);
                        const totalViolations = Number(entry.totalViolations ?? (fullScreenViolations + tabSwitchCount));
                        const deductionPercent = Number(entry.deductionPercent ?? (totalViolations * 3));
                        const originalPercentile = entry.originalPercentile !== null && entry.originalPercentile !== undefined
                            ? Number(entry.originalPercentile)
                            : Number(entry.scorePercentile || 0);
                        const adjustedPercentile = entry.adjustedPercentile !== null && entry.adjustedPercentile !== undefined
                            ? Number(entry.adjustedPercentile)
                            : Math.max(0, originalPercentile - deductionPercent);
                        const hasMalpractice = Boolean(entry.hasMalpractice || totalViolations > 0);
                        const malpracticeStatus = entry.malpracticeStatus || (hasMalpractice ? "Malpracticed" : "Good");

                        const originalStatusLabel = entry.status === 'in_progress' ? 'In Progress' :
                                          entry.status === 'submitted' ? 'Submitted' :
                                          entry.status === 'abandoned' ? 'Abandoned' : 'Expired';
                        const isGood = malpracticeStatus === 'Good';
                        const malpracticePillColor = isGood ? '#4ade80' : '#f87171';
                        const malpracticePillBg = isGood ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.14)';

                        const lastActive = entry.lastHeartbeat ? new Date(entry.lastHeartbeat).toLocaleTimeString() : '';

                        let rowStyle = '';
                        if (entry.isCurrentUser) rowStyle += 'background: rgba(37,99,235,0.15);';
                        if (hasMalpractice) rowStyle += 'background: linear-gradient(90deg, rgba(239,68,68,0.18), rgba(127,29,29,0.08)); border-left: 4px solid #ef4444;';

                        const percentileCell = entry.status === 'submitted'
                            ? (hasMalpractice
                                ? `<div style="display:flex; flex-direction:column; gap:2px;">
                                    <span>Original: ${originalPercentile.toFixed(1)}%</span>
                                    <span>Adjusted: ${adjustedPercentile.toFixed(1)}%</span>
                                    <span style="color:#f87171; font-size:0.8rem;">-${deductionPercent.toFixed(1)}% penalty</span>
                                   </div>`
                                : `<div style="display:flex; flex-direction:column; gap:2px;">
                                    <span>${originalPercentile.toFixed(1)}%</span>
                                    <span style="color:#94a3b8; font-size:0.8rem;">No deduction</span>
                                   </div>`)
                            : '-';

                        const violationsCell = (entry.fullScreenViolations !== undefined || entry.tabSwitchCount !== undefined || entry.totalViolations !== undefined)
                            ? `<div style="display:flex; flex-direction:column; gap:2px;">
                                <span style="font-weight:700; font-size:1rem;">${totalViolations}</span>
                                <span style="color:#94a3b8; font-size:0.8rem;">FS: ${fullScreenViolations} | TS: ${tabSwitchCount}</span>
                               </div>`
                            : '-';

                        return `
                            <tr data-user-id="${entry.userID}" data-rank="${entry.rank}" class="${entry.animationClass}" style="${rowStyle} border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:12px 15px;">
                                    <strong>${entry.rank === '-' ? '-' : '#' + entry.rank}${entry.isCurrentUser ? ' <span class="badge" style="background:#10b981; color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;">You</span>' : ''}</strong>
                                </td>
                                <td style="padding:12px 15px;"><strong>${entry.name}</strong></td>
                                <td style="padding:12px 15px;">
                                    <div style="display:flex; flex-direction:column; gap:4px;">
                                        <span style="display:inline-block; padding:3px 10px; border-radius:12px; color:${malpracticePillColor}; background:${malpracticePillBg}; font-weight:600; font-size:0.85rem;">${malpracticeStatus}</span>
                                        <span style="color:#94a3b8; font-size:0.75rem;">${originalStatusLabel}</span>
                                    </div>
                                </td>
                                <td style="padding:12px 15px;">
                                    ${entry.status === 'in_progress' ? `
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <div style="display:flex; align-items:center; gap:8px;">
                                                <span>${entry.answeredCount || 0}/${entry.totalQuestions || 0} answered</span>
                                            </div>
                                            <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                                                <div style="height:100%; background:linear-gradient(90deg, #3b82f6, #8b5cf6); width:${entry.progressPercent || 0}%;"></div>
                                            </div>
                                        </div>
                                    ` : '-'}
                                </td>
                                <td style="padding:12px 15px;">${percentileCell}</td>
                                <td style="padding:12px 15px;">${entry.status === 'submitted' && entry.netScore !== undefined ? (entry.netScore || 0) : '-'}</td>
                                <td style="padding:12px 15px;">${entry.status === 'submitted' && entry.totalTimeTakenSeconds !== undefined ? formatTimeMMSS(entry.totalTimeTakenSeconds, 'seconds') : '-'}</td>
                                <td style="padding:12px 15px;">${entry.status === 'submitted' ? (entry.correctCount || 0) + '/' + (entry.wrongCount || 0) + '/' + (entry.unansweredCount || 0) : '-'}</td>
                                <td style="padding:12px 15px; font-size:0.85rem; color:#94a3b8;">${lastActive}</td>
                                <td style="padding:12px 15px;">${violationsCell}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:20px; text-align:right; color:#94a3b8; font-size:0.8rem;">
            <i class="fa-solid fa-sync-alt" style="margin-right:5px;"></i>Auto-updates every 5 seconds
        </div>
    `;

    // Remove animation classes after 1.5 seconds
    setTimeout(() => {
        const animatedRows = document.querySelectorAll('#liveLeaderboardTbody tr');
        animatedRows.forEach(row => {
            row.classList.remove('live-new-row', 'live-rank-up', 'live-rank-down', 'live-submitted-update', 'live-progress-update');
        });
    }, 1500);
}

function startLiveLeaderboardPoll() {
    if (liveLeaderboardPollInterval) clearInterval(liveLeaderboardPollInterval);
    liveLeaderboardPollInterval = setInterval(() => {
        loadLiveExamSessionLeaderboard();
    }, 5000);
}

window.closeLiveLeaderboard = function() {
    if (liveLeaderboardPollInterval) {
        clearInterval(liveLeaderboardPollInterval);
        liveLeaderboardPollInterval = null;
    }
    currentLiveTestId = null;
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