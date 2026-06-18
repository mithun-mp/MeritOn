/**
 * Test Lobby Logic - Phase 19 Upgrade
 */

let currentTests = null;
let overallLeaderboard = null;
let overallPollInterval = null;
let liveLeaderboardPollInterval = null;
let currentLiveTestId = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    displayUserInfo();
    loadCandidateData();
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

async function loadCandidateData() {
    const user = getUser();
    if (!user) return;
    try {
        const testsRes = await api.get('getCandidateTests', { userID: user.userId || user.userID });
        if (testsRes.success) {
            currentTests = testsRes;
            renderCandidateTests(currentTests);
            startCountdowns(currentTests.upcoming);
        }
    } catch (err) {
        console.error('[LOBBY] Error loading candidate data:', err);
    }
}

async function loadOverallLeaderboard() {
    const user = getUser();
    if (!user) return;
    try {
        const res = await api.get('getCandidateOverallLeaderboard', { userID: user.userId || user.userID });
        if (res.success) {
            overallLeaderboard = res;
            renderOverallLeaderboard(overallLeaderboard, user.userId || user.userID);
        }
    } catch (err) {
        console.error('[LOBBY] Error loading overall leaderboard:', err);
    }
}

function renderCandidateTests(tests) {
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
    Object.values(containers).forEach(container => {
        if (container) container.innerHTML = '';
    });
    ['active', 'upcoming', 'completed', 'ended'].forEach(status => {
        const list = tests[status] || [];
        const container = containers[status];
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = `<div class="empty-box">No ${status} tests found at the moment.</div>`;
            return;
        }
        list.forEach(test => {
            container.appendChild(createCandidateTestCard(test, status));
        });
    });
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

function createCandidateTestCard(test, status) {
    const div = document.createElement('div');
    div.className = 'test-card';
    div.setAttribute('data-aos', 'fade-up');

    let actionHtml = '';
    let statusLabel = status.toUpperCase();
    let statusClass = `status-${status.toLowerCase()}`;
    let iconClass = 'fa-file-signature';

    if (status === 'completed') {
        iconClass = 'fa-circle-check';
        if (test.resultPublished || test.quickResult) {
            actionHtml = `
                <div class="card-footer">
                    <button onclick="window.location.href='./result.html?testId=${test.TestID}'" class="enter-btn" style="background: linear-gradient(135deg, #10b981, #059669);">
                        <i class="fa-solid fa-square-poll-vertical" style="margin-right: 8px;"></i>
                        View Result
                    </button>
                </div>`;
        } else {
            actionHtml = `
                <div class="card-footer">
                    <button disabled class="enter-btn" style="opacity: 0.6; cursor: not-allowed; background: linear-gradient(135deg, #f59e0b, #d97706);">
                        <i class="fa-solid fa-clock" style="margin-right: 8px;"></i>
                        Result Pending
                    </button>
                </div>`;
        }
    } else if (status === 'active') {
        actionHtml = `
            <div class="card-footer" style="display:flex; gap:10px;">
                <button onclick="startTest('${test.TestID}')" class="enter-btn btn-active" style="flex:1;">
                    <i class="fa-solid fa-play" style="margin-right: 8px;"></i>
                    Start Exam
                </button>
                <button onclick="openLiveLeaderboard('${test.TestID}', '${test.Name}')" class="enter-btn" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
                    <i class="fa-solid fa-trophy" style="margin-right: 8px;"></i>
                    Live Leaderboard
                </button>
            </div>`;
    } else if (status === 'upcoming') {
        actionHtml = `
            <div class="card-footer">
                <div class="enter-btn btn-upcoming" id="timer-${test.TestID}" style="text-align:center; display:flex; align-items:center; justify-content:center; gap:8px; cursor:default;">
                    <i class="fa-solid fa-clock"></i>
                    <span>Starts in: --:--:--</span>
                </div>
            </div>`;
    } else {
        actionHtml = `
            <div class="card-footer">
                <button disabled class="enter-btn btn-ended" style="opacity: 0.6; cursor: not-allowed;">
                    <i class="fa-solid fa-lock" style="margin-right: 8px;"></i>
                    Access Closed
                </button>
            </div>`;
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

function startCountdowns(upcomingTests) {
    (upcomingTests || []).forEach(test => {
        const timerElement = document.querySelector(`#timer-${test.TestID} span`);
        if (!timerElement) return;

        const testDate = new Date(test.Date);
        const [startHour, startMin] = test.StartTime.split(':').map(Number);
        const targetDate = new Date(testDate);
        targetDate.setHours(startHour, startMin, 0, 0);

        const updateTimer = () => {
            const now = new Date();
            const diff = targetDate - now;

            if (diff <= 0) {
                clearInterval(timerElement._interval);
                loadCandidateData();
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
            label += ` ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            timerElement.innerText = label;
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        timerElement._interval = interval;
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
                <td style="padding:12px 15px;">${entry.avgTimeTakenMinutes.toFixed(1)} mins</td>
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

window.openLiveLeaderboard = async function(testId, testName) {
    currentLiveTestId = testId;
    const modalHtml = `
        <div id="liveLeaderboardModal" class="modal-overlay" style="position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index: 1000; display:flex; align-items:center; justify-content:center; padding:20px;">
            <div class="modal-content" style="background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:28px; padding:35px; width:100%; max-width:1100px; box-shadow:0 25px 50px rgba(0,0,0,0.5); max-height:90vh; overflow:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
                    <h2 style="margin:0; font-size:1.5rem;"><i class="fa-solid fa-trophy" style="margin-right:12px; color:#f59e0b;"></i>${testName} - Live Leaderboard</h2>
                    <button onclick="closeLiveLeaderboard()" style="background:none; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
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
    await loadLiveLeaderboard();
    startLiveLeaderboardPoll();
};

async function loadLiveLeaderboard() {
    if (!currentLiveTestId) return;
    const user = getUser();
    try {
        const res = await api.get('getLiveTestLeaderboard', { testId: currentLiveTestId });
        if (res.success) {
            renderLiveLeaderboard(res, user.userId || user.userID);
        }
    } catch (err) {
        console.error('[LOBBY] Error loading live leaderboard:', err);
    }
}

function renderLiveLeaderboard(data, currentUserId) {
    const container = document.getElementById('liveLeaderboardContent');
    if (!container) return;
    const leaderboard = data.leaderboard || [];
    if (leaderboard.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <i class="fas fa-clock" style="font-size: 3rem; color: #94a3b8;"></i>
                <h3 style="color:#cbd5e1; margin-top:15px;">No submissions yet</h3>
                <p style="color:#94a3b8; margin-top:8px;">Leaderboard will update automatically as submissions come in.</p>
            </div>
        `;
        return;
    }
    container.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Rank</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Candidate</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Percentile</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Score</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Time</th>
                        <th style="text-align:left; padding:12px 15px; color:#94a3b8; font-size:0.85rem;">Correct/Wrong/Unanswered</th>
                    </tr>
                </thead>
                <tbody>
                    ${leaderboard.map(entry => {
                        const isCurrentUser = entry.isCurrentUser || entry.userID === currentUserId || String(entry.userID) === String(currentUserId);
                        const rowStyle = isCurrentUser ? 'background: rgba(37,99,235,0.15);' : '';
                        return `
                            <tr style="${rowStyle} border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:12px 15px;">
                                    <strong>#${entry.rank}${isCurrentUser ? ' <span class="badge" style="background:#10b981; color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;">You</span>' : ''}</strong>
                                </td>
                                <td style="padding:12px 15px;"><strong>${entry.name}</strong></td>
                                <td style="padding:12px 15px;">${entry.scorePercentile.toFixed(1)}%</td>
                                <td style="padding:12px 15px;">${entry.netScore} / ${entry.maxPossibleScore}</td>
                                <td style="padding:12px 15px;">${entry.totalTimeTakenDisplay}</td>
                                <td style="padding:12px 15px;">${entry.correctCount}/${entry.wrongCount}/${entry.unansweredCount}</td>
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
}

function startLiveLeaderboardPoll() {
    if (liveLeaderboardPollInterval) clearInterval(liveLeaderboardPollInterval);
    liveLeaderboardPollInterval = setInterval(() => {
        loadLiveLeaderboard();
    }, 5000);
}

window.closeLiveLeaderboard = function() {
    if (liveLeaderboardPollInterval) {
        clearInterval(liveLeaderboardPollInterval);
        liveLeaderboardPollInterval = null;
    }
    currentLiveTestId = null;
    const modal = document.getElementById('liveLeaderboardModal');
    if (modal) modal.remove();
};

function startTest(testId) {
    debugLog('INFO', 'LOBBY', 'Starting Test');
    localStorage.setItem('selectedTestID', testId);
    window.location.href = `./exam.html?testId=${testId}`;
}
