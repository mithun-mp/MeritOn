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

            if (existingEntry && existingEntry.element && existingEntry.status === status) {
                // Update existing card without reanimating
                cardElement = existingEntry.element;
                console.log(`[LOBBY RENDER] Updated existing card for ${test.TestID}`);
            } else {
                // Create new card with animation
                cardElement = createCandidateTestCard(test, status);
                console.log(`[LOBBY RENDER] Inserted new card for ${test.TestID}`);
                container.appendChild(cardElement);
            }

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
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No leaderboard data available yet.</td></tr>';
        return;
    }

    const currentUserEntry = leaderboard.find(entry => entry.userID === currentUserId || String(entry.userID) === String(currentUserId));
    if (currentUserEntry) {
        const rankEl = document.getElementById('overallRank');
        if (rankEl) rankEl.innerText = `#${currentUserEntry.rank}`;
    }

    tableBody.innerHTML = leaderboard.map(entry => {
        const isCurrentUser = entry.isCurrentUser || entry.userID === currentUserId || String(entry.userID) === String(currentUserId);
        const rowClass = isCurrentUser ? 'style="background: rgba(37,99,235,0.15);"' : '';
        return `
            <tr ${rowClass}>
                <td style="padding:12px 15px;"><strong>#${entry.rank}${isCurrentUser ? ' <span class="badge" style="background:#10b981; color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;">You</span>' : ''}</strong></td>
                <td style="padding:12px 15px;"><strong>${entry.name}</strong></td>
                <td style="padding:12px 15px;">${entry.attendedTestCount}</td>
                <td style="padding:12px 15px;">${entry.avgScorePercentile.toFixed(1)}%</td>
                <td style="padding:12px 15px;">${entry.avgAccuracyPercent.toFixed(1)}%</td>
                <td style="padding:12px 15px;">${entry.avgAttemptPercent.toFixed(1)}%</td>
                <td style="padding:12px 15px;">${formatTimeMMSS(entry.avgTimeTakenMinutes, "minutes")}</td>
                <td style="padding:12px 15px;">${entry.totalCorrect}/${entry.totalWrong}/${entry.totalUnanswered}</td>
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

function renderLiveExamSessionLeaderboard(data, currentUserId) {
    const container = document.getElementById('liveLeaderboardContent');
    if (!container) return;
    const leaderboard = data.leaderboard || [];
    
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
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Time Taken</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Correct/Wrong/Unanswered</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Last Active</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Violations</th>
                    </tr>
                </thead>
                <tbody id="liveLeaderboardTbody">
                    ${rowsWithAnimations.map(entry => {
                        const rowClass = entry.isCurrentUser ? 'background: rgba(37,99,235,0.15);' : '';
                        let statusLabel = entry.status === 'in_progress' ? 'In Progress' : 
                                          entry.status === 'submitted' ? 'Submitted' : 
                                          entry.status === 'abandoned' ? 'Abandoned' : 'Expired';
                        let statusColor = entry.status === 'in_progress' ? '#3b82f6' : 
                                          entry.status === 'submitted' ? '#10b981' : 
                                          entry.status === 'abandoned' ? '#f59e0b' : '#ef4444';
                        
                        const lastActive = entry.lastHeartbeat ? new Date(entry.lastHeartbeat).toLocaleTimeString() : '';
                        const violations = ((entry.fullScreenViolations || 0) + (entry.tabSwitchCount || 0));
                        
                        return `
                            <tr data-user-id="${entry.userID}" data-rank="${entry.rank}" class="${entry.animationClass}" style="${rowClass} border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:12px 15px;">
                                    <strong>${entry.rank === '-' ? '-' : '#' + entry.rank}${entry.isCurrentUser ? ' <span class="badge" style="background:#10b981; color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;">You</span>' : ''}</strong>
                                </td>
                                <td style="padding:12px 15px;"><strong>${entry.name}</strong></td>
                                <td style="padding:12px 15px;"><span style="color:${statusColor}; font-weight:600;">${statusLabel}</span></td>
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
                                <td style="padding:12px 15px;">${entry.status === 'submitted' && entry.scorePercentile !== undefined ? (entry.scorePercentile || 0).toFixed(1) + '%' : '-'}</td>
                                <td style="padding:12px 15px;">${entry.status === 'submitted' && entry.netScore !== undefined ? (entry.netScore || 0) : '-'}</td>
                                <td style="padding:12px 15px;">${entry.status === 'submitted' && entry.totalTimeTakenSeconds !== undefined ? formatTimeMMSS(entry.totalTimeTakenSeconds, 'seconds') : '-'}</td>
                                <td style="padding:12px 15px;">${entry.status === 'submitted' ? (entry.correctCount || 0) + '/' + (entry.wrongCount || 0) + '/' + (entry.unansweredCount || 0) : '-'}</td>
                                <td style="padding:12px 15px; font-size:0.85rem; color:#94a3b8;">${lastActive}</td>
                                <td style="padding:12px 15px;">
                                    ${violations > 0 ? `
                                        <span style="color:#f59e0b; font-weight:600;">${violations} <i class="fa-solid fa-exclamation-triangle"></i></span>
                                    ` : (entry.fullScreenViolations !== undefined || entry.tabSwitchCount !== undefined) ? '0' : '-'}
                                </td>
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
