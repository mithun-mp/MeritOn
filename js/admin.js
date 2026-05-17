/**
 * Admin Logic - FINAL STABLE VERSION (Production Ready)
 */

const ADMIN_TOKEN_KEY = 'admin_token';

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

    try {
        const response = await api.post({
            action: 'adminLogin',
            username,
            password
        });

        if (response && response.success === true) {
            localStorage.setItem(ADMIN_TOKEN_KEY, Date.now().toString());
            
            // Set MeritOn user session for consistency
            localStorage.setItem('cbt_user', JSON.stringify({
                userId: response.userId || 'ADMIN',
                univId: response.univId || 'ADMIN',
                fullName: response.fullName || 'Administrator',
                email: response.email || username,
                role: 'admin',
                status: 'active',
                loginTime: new Date().getTime()
            }));
            
            window.location.href = './admin-dashboard.html';
        } else {
            alert('Invalid Admin Credentials');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }

    } catch (err) {
        console.error("Login Error: ", err.message);
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

async function adminLogout() {
    const confirmed = await showConfirm('Are you sure you want to logout?', 'Confirm Logout');
    if (confirmed) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        window.location.href = './admin.html';
    }
}

/* ================= AUTH ================= */

if (window.location.href.includes('admin-dashboard.html')) {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);

    if (!token) {
        window.location.href = './admin.html';
    } else {
        initDashboard();
    }
}

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

    // Delete initiated

    try {
        setLoading(true);
        const res = await api.post({
            action: 'deleteTest',
            testId
        });

        if (res.success) {
            // Test deleted
            alert('✅ Test deleted successfully');
            initDashboard();
        } else {
            throw new Error(res.error || 'Failed to delete test');
        }
    } catch (err) {
        // Delete failed
        alert('❌ Error: ' + err.message);
    } finally {
        setLoading(false);
    }
}

/* ================= LOADING ================= */

function setLoading(state) {
    // Loading overlay toggled
    document.body.style.opacity = state ? "0.6" : "1";
    document.body.style.pointerEvents = state ? "none" : "auto";
}

/* ================= TEST WIZARD ================= */

function openWizard() {
    debugLog('INFO', 'MODAL', 'Opening Test Wizard');
    isEditMode = false;
    editingTestId = null;
    
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

    // Attach download paper logic
    document.getElementById('downloadPaperBtn').onclick = () => {
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
        duration: parseInt(document.getElementById('edDuration').value)
    };

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

        const res = await api.post({
            action: 'updateTest',
            testId: editingTestId,
            testData
        });

        if (res.success) {
            // Metadata updated
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Configuration Updated';
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }, 2000);
        } else {
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
    document.getElementById('testWizard').style.display = 'none';
}

function resetWizard() {
    debugLog('INFO', 'STATE', 'Resetting Wizard State');
    currentWizardData = {};
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
    div.style = 'display:flex; gap:15px; margin-bottom:15px; align-items: center; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.05);';

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
        mode: 'scheduled'
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
        setLoading(true);

        const expiry = new Date(currentWizardData.date + " " + currentWizardData.expiryTime);
        const systemEnd = new Date(expiry.getTime() + (currentWizardData.duration * 60000) + (5 * 60000));
        currentWizardData.endTime = systemEnd.toTimeString().slice(0, 5);

        const res = await api.post({
            action: 'updateTest',
            testId: editingTestId,
            testData: currentWizardData
        });

        if (res.success) {
            alert("✅ Test Updated Successfully");
            closeWizard();
            initDashboard();
        } else {
            throw new Error(res.error || "Update failed");
        }
    } catch (err) {
        // Error loading form
        alert("❌ Error: " + err.message);
    } finally {
        setLoading(false);
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

async function saveAllWizard() {

    const questions = [];

    document.querySelectorAll('.wizard-q-card').forEach(card => {

        const q = {
            section: card.querySelector('.q-sec').value.trim(),
            qid: card.querySelector('.q-id').value.trim(),
            difficulty: card.querySelector('.q-diff').value.trim(),
            question: String(card.querySelector('.q-text').value || ''),
            a: String(card.querySelector('.q-a').value || ''),
            b: String(card.querySelector('.q-b').value || ''),
            c: String(card.querySelector('.q-c').value || ''),
            d: String(card.querySelector('.q-d').value || ''),
            correct: card.querySelector('.q-correct').value.trim().toUpperCase()
        };

        if (!q.question || !q.a || !q.b || !q.c || !q.d || !['A','B','C','D'].includes(q.correct)) {
            throw new Error(`Invalid question: ${q.qid}`);
        }

        questions.push(q);
    });

    try {
        setLoading(true);
        
        // Immediate UI feedback for the specific button
        const saveBtn = document.querySelector('button[onclick="saveAllWizard()"]');
        const originalText = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing Test...';
        }

        // Logic for system end time: Expiry Time + Duration + 5 minutes
        const expiry = new Date(currentWizardData.date + " " + currentWizardData.expiryTime);
        const systemEnd = new Date(expiry.getTime() + (currentWizardData.duration * 60000) + (5 * 60000));
        
        currentWizardData.endTime = systemEnd.toTimeString().slice(0, 5);

        const resTest = await api.post({
            action: 'createTest',
            testData: currentWizardData
        });

        if (!resTest.success) throw new Error(resTest.error);

        const resQs = await api.post({
            action: 'addQuestions',
            testId: resTest.testId,
            questions
        });

        if (!resQs.success) throw new Error(resQs.error);

        alert("✅ Test Created Successfully");

        // Success animation
        document.getElementById('testWizard').style.opacity = '0';
        setTimeout(() => {
            closeWizard();
            initDashboard();
            document.getElementById('testWizard').style.opacity = '1';
        }, 500);

    } catch (err) {
        // Error during test creation
        alert("❌ Error: " + err.message);
        // Keep wizard open for corrections
    } finally {
        setLoading(false);
    }
}

/* ================= CSV ================= */
function showCSVUpload(){
    const modal=document.getElementById('csvModal');
    if(modal)modal.style.display='block';
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

    if (statusEl) {
        statusEl.textContent = 'Sending notification emails. Please wait...';
    }

    try {
        setLoading(true);
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

        if (statusEl) {
            statusEl.textContent = `Notification sent to ${response.count || 0} candidates.`;
        }
        alert(`✅ Notification sent successfully to ${response.count || 0} candidates.`);
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = 'Failed to send notification. Check console for details.';
        }
        alert('❌ Error sending notification: ' + err.message);
    } finally {
        setLoading(false);
    }
}


/* ================= CSV UPLOAD ================= */

async function handleCSVUpload() {

    const testId = document.getElementById('csvTestSelect')?.value;
    const file = document.getElementById('csvFile')?.files[0];

    if (!testId) return alert('❌ Please select a test');
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
                    "Invalid CSV format.\nRequired:\nSection,QID,Difficulty,Question,A,B,C,D,Correct"
                );
            }

            // Helper for dynamic column mapping
            const getIndex = (name) => headers.indexOf(name);

            // Fetch existing questions to avoid duplicates
            let existingQIDs = new Set();
            try {
                const existing = await api.get('getQuestions', { testId });
                existingQIDs = new Set(existing.map(q => q.QID));
            } catch (err) {
        // Could not fetch questions
            }

            const questions = [];
            const seenQIDs = new Set();

            for (let i = 1; i < lines.length; i++) {

                const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

                if (cols.length < headers.length) {
        // Error saving changes
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
                    correct: cols[getIndex("Correct")]?.trim().toUpperCase()
                };

                // Validation
                if (
                    !q.section ||
                    !q.qid ||
                    !q.question ||
                    !q.a || !q.b || !q.c || !q.d ||
                    !['A','B','C','D'].includes(q.correct)
                ) {
                    // Invalid row skipped
                    continue;
                }

                // Duplicate inside CSV
                if (seenQIDs.has(q.qid)) {
                    // Duplicate QID skipped
                    continue;
                }

                // Duplicate in database
                if (existingQIDs.has(q.qid)) {
                    // Already exists skipped
                    continue;
                }

                seenQIDs.add(q.qid);
                questions.push(q);
            }

            if (questions.length === 0) {
                throw new Error("No valid questions found after validation");
            }

            // Questions parsed

            setLoading(true);

            const res = await api.post({
                action: 'uploadQuestions',
                testId,
                questions
            });

            if (!res.success) throw new Error(res.error);

            alert(`✅ ${questions.length} Questions Uploaded Successfully`);

            document.getElementById('csvModal').style.display = 'none';

            initDashboard();

        } catch (err) {
            // CSV parsing error
            alert("❌ CSV Upload Failed:\n" + err.message);
        } finally {
            setLoading(false);
        }
    };

    reader.readAsText(file);
}

/* ================= RESULTS ================= */

/* =========================================
   QUESTION PAPER DOWNLOAD (PDF)
========================================= */

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

        const pageWidth = 210;
        const marginX = 14;
        const contentWidth = 180;

        // HEADER
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 210, 28, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text("QUESTION PAPER", 105, 13, { align: "center" });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(testName, 105, 20, { align: "center" });

        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

        let y = 42;
        let globalQNo = 1;

        // SECTION LOOP
        Object.keys(grouped).forEach(sectionName => {

            // NEW PAGE IF NEEDED
            if (y > 250) {
                doc.addPage();
                y = 20;
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
                    y = 20;
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

                const qLines = String(q.Question || '').split('\n');
                qLines.forEach(line => {
                    const splitLine = doc.splitTextToSize(line, 160);
                    doc.text(splitLine, 28, y + 1);
                    y += (splitLine.length * 4.5);
                    
                    if (y > 275) {
                        doc.addPage();
                        y = 20;
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

                options.forEach(opt => {
                    const prefix = `${opt[0]}) `;
                    const optText = String(opt[1] || '');
                    const optLines = optText.split('\n');
                    
                    optLines.forEach((line, lIdx) => {
                        const displayText = lIdx === 0 ? prefix + line : '   ' + line;
                        const splitOpt = doc.splitTextToSize(displayText, 150);
                        doc.text(splitOpt, 34, y);
                        y += (splitOpt.length * 4.2);

                        if (y > 275) {
                            doc.addPage();
                            y = 20;
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

        // FOOTER PAGE NUMBERS
        const pageCount = doc.internal.getNumberOfPages();

        for (let i = 1; i <= pageCount; i++) {

            doc.setPage(i);

            doc.setFontSize(8);
            doc.setTextColor(120);

            doc.text(
                `Page ${i} of ${pageCount}`,
                105,
                292,
                { align: "center" }
            );
        }

        doc.save(`${testName}_QuestionPaper.pdf`);

    } catch (err) {
        // Error downloading question paper
        alert("Failed to download question paper.");

    } finally {

        setLoading(false);
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

    // Saving changes

    // Validation
    for (const q of currentManagerQuestions) {

        const question = String(q.Question ?? '');
        const optionA = String(q.A ?? '');
        const optionB = String(q.B ?? '');
        const optionC = String(q.C ?? '');
        const optionD = String(q.D ?? '');
        const correct = String(q.Correct ?? '').trim();

        if (!question || !optionA || !optionB || !optionC || !optionD) {
            // Validation failed
            return alert(`Incomplete data for question in section: ${q.Section}`);
        }

        if (!['A', 'B', 'C', 'D'].includes(correct)) {
            // Missing correct option
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

        debugLog('INFO', 'MANAGER', 'Change Summary');

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

        // Changes saved

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

        doc.setFontSize(22);
        doc.setTextColor(37, 99, 235);
        doc.text("MASTER PERFORMANCE REPORT", 148, 20, { align: "center" });
        
        doc.setFontSize(14);
        doc.setTextColor(100, 116, 139);
        doc.text(`Test: ${testName} | ID: ${TestId}`, 148, 30, { align: "center" });

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
            startY: 40,
            head: [['Candidate Name', 'Email', 'User ID', 'Total', ...perfSections, 'Timestamp']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 4 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        doc.save(`${testName}_Performance_Report.pdf`);

    } catch (err) {
        debugLog('ERROR', 'ADMIN', 'Performance PDF Generation Failed', err.message);
        alert("Failed to generate performance PDF.");
    }
}