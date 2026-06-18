/**
 * Test Lobby Logic - Upgraded
 */

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    displayUserInfo();
    fetchTests();
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

    // Fix activeCount/upcomingCount/endedCount potentially missing on some pages using lobby.js
    ['activeCount', 'upcomingCount', 'endedCount'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.innerText) el.innerText = '0';
    });
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
                // Update local storage
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

function parseSections(sections) {
    if (Array.isArray(sections)) return sections;
    if (typeof sections === 'string') {
        try {
            const parsed = JSON.parse(sections);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

function normalizeTest(raw) {
    console.log('[LOBBY] normalizing test:', raw);
    return {
        testId: raw.TestID || raw.testId || raw.TestId,
        TestID: raw.TestID || raw.testId || raw.TestId,
        name: raw.Name || raw.name,
        Name: raw.Name || raw.name,
        date: raw.Date || raw.date,
        Date: raw.Date || raw.date,
        startTime: raw.StartTime || raw.startTime,
        StartTime: raw.StartTime || raw.startTime,
        expiryTime: raw.ExpiryTime || raw.expiryTime,
        ExpiryTime: raw.ExpiryTime || raw.expiryTime,
        duration: raw.Duration || raw.duration,
        Duration: raw.Duration || raw.duration,
        sections: parseSections(raw.Sections || raw.sections),
        Sections: parseSections(raw.Sections || raw.sections),
        status: raw.status,
        canLogin: raw.canLogin,
        StartTimeDisplay: raw.StartTimeDisplay,
        ExpiryTimeDisplay: raw.ExpiryTimeDisplay,
        EndTime: raw.EndTime
    };
}

async function fetchTests() {
    const startTime = Date.now();
    try {
        console.log('[LOBBY] loading tests');
        const user = getUser();
        
        // Fetch tests FIRST, don't wait for performance
        const testsRes = await api.get('getAllTests');
        console.log('[LOBBY] getAllTests response:', testsRes);
        
        let tests = parseApiList(testsRes, 'tests');
        // Normalize each test
        tests = tests.map(t => normalizeTest(t));
        console.log('[LOBBY] normalized tests:', tests);
        
        // Fetch performance separately, don't let it fail the whole thing
        let submittedTestIds = new Set();
        try {
            const performanceRes = await api.get('getPerformance', { userID: user.userId || user.userID });
            const performance = parseApiList(performanceRes, 'performance');
            const normalizedPerf = performance.map(r => window.normalizePayload ? window.normalizePayload(r) : r);
            submittedTestIds = new Set(normalizedPerf.map(p => String(p.TestId || p.testId)));
        } catch (perfErr) {
            console.log('[LOBBY] performance fetch failed (non-critical):', perfErr);
        }
        
        // Mark submitted tests
        tests.forEach(t => {
            t.isSubmitted = submittedTestIds.has(String(t.TestID));
        });
        
        debugLog('INFO', 'LOBBY', 'Tests Processed');

        renderTests(tests);
        startCountdowns(tests);
        console.log('[LOBBY] render complete');
        debugLog('PERF', 'LOBBY', 'Data Loaded');
    } catch (error) {
        console.log('[LOBBY] render error:', error);
        debugLog('ERROR', 'LOBBY', 'Fetch tests failed', error.message);
        const activeTestsEl = document.getElementById('activeTests');
        if (activeTestsEl) activeTestsEl.innerHTML = '<div class="empty-box">Error loading tests. Please refresh.</div>';
    }
}

/** Normalize GET responses (borrowed from exam.js for consistency) */
function parseApiList(res, preferredKey = "tests") {
    if (Array.isArray(res)) return res;

    if (res && res.success === false) {
        throw new Error(res.error || "API request failed");
    }

    if (res && Array.isArray(res[preferredKey])) return res[preferredKey];
    if (res && Array.isArray(res.tests)) return res.tests;
    if (res && Array.isArray(res.data)) return res.data;
    if (res && Array.isArray(res.result)) return res.result;

    return [];
}

function renderTests(tests) {
    const startTime = Date.now();
    
    const containers = {
        Active: document.getElementById('activeTests'),
        Upcoming: document.getElementById('upcomingTests'),
        Completed: document.getElementById('completedTests'),
        Ended: document.getElementById('endedTests')
    };

    const counts = { Active: 0, Upcoming: 0, Completed: 0, Ended: 0 };

    Object.values(containers).forEach(c => {
        if (c) c.innerHTML = '';
    });

    tests.forEach(test => {
        const card = createTestCard(test);
        
        let targetSection = 'Ended';
        if (test.isSubmitted) {
            targetSection = 'Completed';
        } else if (test.status === 'Available') {
            targetSection = 'Active';
        } else if (test.status === 'Upcoming') {
            targetSection = 'Upcoming';
        } else {
            targetSection = 'Ended';
        }

        const container = containers[targetSection];
        if (container) {
            container.appendChild(card);
            counts[targetSection]++;
        }
    });

    // Update Stats Panel
    const activeCountEl = document.getElementById('activeCount');
    const upcomingCountEl = document.getElementById('upcomingCount');
    const endedCountEl = document.getElementById('endedCount');

    if (activeCountEl) activeCountEl.innerText = counts.Active;
    if (upcomingCountEl) upcomingCountEl.innerText = counts.Upcoming;
    if (endedCountEl) endedCountEl.innerText = counts.Completed; // Stats card shows "Completed Exams"

    // Show empty states
    Object.keys(containers).forEach(status => {
        const container = containers[status];
        if (container && container.children.length === 0) {
            container.innerHTML = `<div class="empty-box">No ${status.toLowerCase()} tests found at the moment.</div>`;
        }
    });

    debugLog('PERF', 'LOBBY', 'UI Rendered');
}

function createTestCard(test) {
    console.log('[LOBBY] rendering test card for test:', test);
    const div = document.createElement('div');
    div.className = 'test-card';
    div.setAttribute('data-aos', 'fade-up');
    
    let actionHtml = '';
    let statusLabel = test.status;
    let statusClass = `status-${test.status.toLowerCase()}`;
    let iconClass = 'fa-file-signature';

    if (test.isSubmitted) {
        statusLabel = 'ATTENDED';
        statusClass = 'status-active';
        iconClass = 'fa-circle-check';
        actionHtml = `
            <div class="card-footer">
                <button onclick="window.location.href='./result.html?testId=${test.TestID}'" class="enter-btn" style="background: linear-gradient(135deg, #10b981, #059669);">
                    <i class="fa-solid fa-square-poll-vertical" style="margin-right: 8px;"></i>
                    View Result
                </button>
            </div>`;
    } else if (test.status === 'Available' && test.canLogin) {
        actionHtml = `
            <div class="card-footer">
                <button onclick="startTest('${test.TestID}')" class="enter-btn btn-active">
                    <i class="fa-solid fa-play" style="margin-right: 8px;"></i>
                    Start Exam
                </button>
            </div>`;
    } else if (test.status === 'Upcoming') {
        actionHtml = `
            <div class="card-footer">
                <div class="enter-btn btn-upcoming" id="timer-${test.TestID}" style="text-align:center; display:flex; align-items:center; justify-content:center; gap:8px; cursor:default;">
                    <i class="fa-solid fa-clock"></i>
                    <span>Starts in: --:--:--</span>
                </div>
            </div>`;
    } else if (test.status === 'Closed') {
        actionHtml = `
            <div class="card-footer">
                <button disabled class="enter-btn btn-ended" style="opacity: 0.6; cursor: not-allowed;">
                    <i class="fa-solid fa-lock" style="margin-right: 8px;"></i>
                    Access Closed
                </button>
            </div>`;
    } else {
        actionHtml = `
            <div class="card-footer">
                <button disabled class="enter-btn btn-ended" style="opacity: 0.6; cursor: not-allowed;">
                    Unavailable
                </button>
            </div>`;
    }

    div.innerHTML = `
        ${test.isSubmitted ? '<div class="verified-tick" style="position:absolute; top: -10px; right: -10px; background: #10b981; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; box-shadow: 0 5px 15px rgba(16,185,129,0.4); z-index: 10; border: 4px solid #0f172a;"><i class="fa-solid fa-check"></i></div>' : ''}
        <div class="test-top">
            <div class="test-icon">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <span class="status-pill ${statusClass}">
                ${test.isSubmitted ? '<i class="fa-solid fa-check-double" style="margin-right:5px;"></i>' : ''}
                ${statusLabel}
            </span>
        </div>
        <h3>${test.Name}</h3>
        <div class="test-meta">
            <div class="meta-item">
                <i class="fa-solid fa-calendar-day"></i>
                <span><strong>Date:</strong> ${test.Date}</span>
            </div>
            <div class="meta-item">
                <i class="fa-solid fa-stopwatch"></i>
                <span><strong>Duration:</strong> ${test.Duration} Minutes</span>
            </div>
            <div class="meta-item">
                <i class="fa-solid fa-door-open"></i>
                <span><strong>Entry:</strong> ${test.StartTimeDisplay || test.StartTime} - ${test.ExpiryTimeDisplay || test.ExpiryTime}</span>
            </div>
        </div>
        ${actionHtml}
    `;
    return div;
}

function startCountdowns(tests) {
    tests.filter(t => t.status === 'Upcoming').forEach(test => {
        const timerElement = document.querySelector(`#timer-${test.TestID} span`);
        if (!timerElement) return;

        const updateTimer = () => {
            // Target is in IST (+05:30)
            const targetIST = new Date(`${test.Date}T${test.StartTime}:00+05:30`);
            const now = new Date();
            
            const diff = targetIST - now;

            if (diff <= 0) {
                clearInterval(interval);
                fetchTests(); 
                return;
            }

            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            
            timerElement.innerText = `Starts in: ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
    });
}

function startTest(testId) {
    debugLog('INFO', 'LOBBY', 'Starting Test');
    localStorage.setItem('selectedTestID', testId); // Set for exam.js
    window.location.href = `./exam.html?testId=${testId}`;
}
