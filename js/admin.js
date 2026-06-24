let currentManagerQuestions = [];
let originalManagerQuestions = [];
let managerUnsavedChanges = false;
let currentManagerTestId = null;
let isQuestionManagerSaving = false;

/**
 * Generate a unique QID for use in the question manager that does not conflict with existing IDs.
 * @returns {string} A unique QID in the format 'Q<number>'.
 */
function generateUniqueManagerQid() {
    // Collect all existing QIDs from currentManagerQuestions (both new and existing)
    const ids = currentManagerQuestions
        .map(q => String(q.qid || q.QID || q.originalQid || '').trim())
        .filter(Boolean);

    let maxNum = 0;
    // Extract numeric part from IDs that match 'Q<number>'
    for (const id of ids) {
        const match = id.toString().match(/^Q(\d+)$/i);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }
    let candidate = `Q${maxNum + 1}`;
    const used = new Set(ids);
    while (used.has(candidate)) {
        const num = parseInt(candidate.substring(1), 10) + 1;
        candidate = `Q${num}`;
    }
    return candidate;
}

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

        // Normalize questions to have consistent field names for tracking
        currentManagerQuestions = questions.map(q => ({
            ...q,
            // Ensure consistent field names for tracking
            qid: q.qid || q.QID || q.QuestionID || '',
            QID: q.qid || q.QID || q.QuestionID || '',
            originalQid: q.qid || q.QID || q.QuestionID || '',
            isNew: false
        }));

        originalManagerQuestions = JSON.parse(JSON.stringify(currentManagerQuestions));
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
        return (q.question || '').toLowerCase().includes(search) || (q.qid || '').toLowerCase().includes(search);
    });

    debugLog('INFO', 'ADMIN', 'Rendering Question Manager');

    // Group by section
    const sections = {};
    const sectionNamesOrder = [];

    // First pass: get all unique section names in order they appear in the full question list
    currentManagerQuestions.forEach(q => {
        const sec = q.section || q.Section || 'Uncategorized';
        if (!sectionNamesOrder.includes(sec)) sectionNamesOrder.push(sec);
    });

    // Second pass: group filtered questions
    filtered.forEach(q => {
        const sec = q.section || q.Section || 'Uncategorized';
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
        <div class="wizard-q-card manager-q-card ${isNew ? 'new-q-card' : ''}" data-qid="${q.qid || q.QID}" style="position:relative; ${isNew ? 'border-color: #16a34a; background: rgba(22,163,74,0.05);' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">
                <h4 style="margin:0; font-size:0.95rem; color:#94a3b8;">
                    ${isNew ? '<span style="color:#16a34a; margin-right:10px;"><i class="fa-solid fa-circle-plus"></i> NEW QUESTION</span>' : `ID: ${q.qid || q.QID}`}
                </h4>
                <button onclick="deleteQuestionFromManager('${q.qid || q.QID}', this)" class="glass-btn logout-btn" style="padding:6px 12px; font-size:0.75rem;">
                    <i class="fa-solid fa-trash-can"></i> Remove
                </button>
            </div>

            <div class="q-grid">
                <div class="q-full">
                    <label>Question Text</label>
                    <textarea class="mq-text" oninput="trackChange('${q.qid || q.QID}', 'question', this.value)" style="min-height:70px;" spellcheck="false" wrap="off">${q.question || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Difficulty</label>
                    <select class="mq-diff" onchange="trackChange('${q.qid || q.QID}', 'difficulty', this.value)">
                        <option ${q.difficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                        <option ${(q.difficulty === 'Medium' || !q.difficulty) ? 'selected' : ''}>Medium</option>
                        <option ${q.difficulty === 'Hard' ? 'selected' : ''}>Hard</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Correct Answer</label>
                    <select class="mq-correct" onchange="trackChange('${q.qid || q.QID}', 'correct', this.value)">
                        <option value="">Select Correct</option>
                        <option value="A" ${q.correct === 'A' ? 'selected' : ''}>Option A</option>
                        <option value="B" ${q.correct === 'B' ? 'selected' : ''}>Option B</option>
                        <option value="C" ${q.correct === 'C' ? 'selected' : ''}>Option C</option>
                        <option value="D" ${q.correct === 'D' ? 'selected' : ''}>Option D</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Marks</label>
                    <input type="number" class="mq-marks" value="${q.marks || 1}" oninput="trackChange('${q.qid || q.QID}', 'marks', this.value)">
                </div>
                <div class="form-group"><label>Option A</label><textarea class="mq-a format-safe" oninput="trackChange('${q.qid || q.QID}', 'a', this.value)" spellcheck="false" wrap="off">${q.a || ''}</textarea></div>
                <div class="form-group"><label>Option B</label><textarea class="mq-b format-safe" oninput="trackChange('${q.qid || q.QID}', 'b', this.value)" spellcheck="false" wrap="off">${q.b || ''}</textarea></div>
                <div class="form-group"><label>Option C</label><textarea class="mq-c format-safe" oninput="trackChange('${q.qid || q.QID}', 'c', this.value)" spellcheck="false" wrap="off">${q.c || ''}</textarea></div>
                <div class="form-group"><label>Option D</label><textarea class="mq-d format-safe" oninput="trackChange('${q.qid || q.QID}', 'd', this.value)" spellcheck="false" wrap="off">${q.d || ''}</textarea></div>
            </div>
        </div>
    `;
}

/**
 * SECTION-BASED ADDITION
 */
function addNewQuestionToSection(sectionName) {
    // Adding new question - generate a proper QID once
    const newQid = generateUniqueManagerQid();
    const newQ = {
        qid: newQid,
        QID: newQid,
        originalQid: null,
        question: '',
        section: sectionName,
        difficulty: 'Medium',
        a: '', b: '', c: '', d: '',
        correct: '',
        marks: 1,
        negativeMarks: 0,
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

/**
 * CHANGE TRACKING
 */
function trackChange(qid, field, value) {
    const q = currentManagerQuestions.find(q => q.qid === qid);
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
    const q = currentManagerQuestions.find(q => q.qid === qid);
    if (!q) return;

    if (q.isNew) {
        // Removing unsaved question
        currentManagerQuestions = currentManagerQuestions.filter(item => item.qid !== qid);
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
            currentManagerQuestions = currentManagerQuestions.filter(item => item.qid !== qid);
            originalManagerQuestions = originalManagerQuestions.filter(item => item.qid !== qid);
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

    if (typeof showAdminActionVerifyLoader === 'function') {
        showAdminActionVerifyLoader({
            title: "Verifying Bank Updates",
            message: `Securing question bank synchronization for Test ID: ${currentManagerTestId}...`,
            steps: ["Analyzing modified records", "Authenticating administrator", "Updating secure bank"]
        });
    }

    // Add debug log for start of save operation
    console.log('[QUESTION MANAGER SAVE]');

    // Prevent double save
    if (isQuestionManagerSaving) {
        console.warn('[QUESTION MANAGER SAVE] ignored duplicate save while already saving');
        return;
    }
    isQuestionManagerSaving = true;

    // Validation
    for (const q of currentManagerQuestions) {
        const question = String(q.question ?? '');
        const optionA = String(q.a ?? '');
        const optionB = String(q.b ?? '');
        const optionC = String(q.c ?? '');
        const optionD = String(q.d ?? '');
        const correct = String(q.correct ?? '').trim();

        if (!question || !optionA || !optionB || !optionC || !optionD) {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            isQuestionManagerSaving = false;
            return alert(`Incomplete data for question in section: ${q.section}`);
        }

        if (!['A', 'B', 'C', 'D'].includes(correct)) {
            if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
            isQuestionManagerSaving = false;
            return alert(`Select correct option for question in section: ${q.section}`);
        }

        // Normalize values back into object
        q.question = question;
        q.a = optionA;
        q.b = optionB;
        q.c = optionC;
        q.d = optionD;
        q.correct = correct;
    }

    const saveBtn = document.getElementById('managerSaveBtn');
    const originalBtnHtml = saveBtn.innerHTML;

    try {
        // Get session token from localStorage
        const user = JSON.parse(localStorage.getItem("cbt_user") || "null");
        const sessionToken = user?.sessionToken;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        // Build modifiedExisting using originalQid for stable matching
        const modifiedExisting = currentManagerQuestions.filter(q => {
            if (q.isNew === true) return false;
            const original = originalManagerQuestions.find(o => o.originalQid === q.originalQid);
            if (!original) return false;
            return JSON.stringify(q) !== JSON.stringify(original);
        });

        // Build a set of existing QIDs from originalManagerQuestions (using originalQid)
        const existingIds = new Set();
        for (const q of originalManagerQuestions) {
            const id = q.originalQid;
            if (id) {
                existingIds.add(String(id).trim());
            }
        }

        // Build newQuestions from currentManagerQuestions where isNew is true
        // Use the QID that was already generated (don't regenerate)
        const newQuestions = currentManagerQuestions
            .filter(q => q.isNew === true)
            .map(q => ({
                qid: q.qid, // sending lowercase qid for the backend's addQuestions
                section: q.section,
                difficulty: q.difficulty,
                question: q.question,
                a: q.a,
                b: q.b,
                c: q.c,
                d: q.d,
                correct: q.correct,
                marks: q.marks,
                negativeMarks: q.negativeMarks
            }));

        // Log counts as requested
        console.log('[QUESTION MANAGER SAVE COUNTS]', {
            loadedCount: currentManagerQuestions.length,
            modifiedExistingCount: modifiedExisting.length,
            newQuestionsCount: newQuestions.length
        });

        // SAFETY CHECK: overlap between modifiedExisting and newQuestions
        const updateIds = new Set(modifiedExisting.map(u => String(u.qid).trim()));
        const newIds = new Set(newQuestions.map(q => String(q.qid).trim()));
        const overlap = [...updateIds].filter(id => newIds.has(id));
        if (overlap.length) {
            console.error('[QUESTION MANAGER SAVE] SAFETY ABORT duplicate ids in update and add:', overlap);
            isQuestionManagerSaving = false;
            throw new Error(`Safety abort: same question id in update and add: ${overlap.join(', ')}`);
        }

        // SAFETY CHECK: duplicate qids inside newQuestions
        const seenNew = new Set();
        for (const q of newQuestions) {
            const id = String(q.qid || '').trim();
            if (!id) {
                isQuestionManagerSaving = false;
                throw new Error('New question missing qid');
            }
            if (seenNew.has(id)) {
                isQuestionManagerSaving = false;
                throw new Error(`Duplicate new question id: ${id}`);
            }
            seenNew.add(id);
        }

        // SAFETY CHECK: new qid does not already exist among loaded existing questions
        for (const q of newQuestions) {
            const id = String(q.qid || '').trim();
            if (existingIds.has(id)) {
                isQuestionManagerSaving = false;
                throw new Error(`Safety abort: new question id already exists: ${id}`);
            }
        }

        // Update Existing (Batch optimized)
        if (modifiedExisting.length > 0) {
            const updates = modifiedExisting.map(q => ({
                qid: q.qid, // sending lowercase qid for backend's bulkUpdateQuestions
                updatedData: {
                    question: q.question,
                    section: q.section,
                    correct: q.correct,
                    a: q.a, b: q.b, c: q.c, d: q.d,
                    difficulty: q.difficulty,
                    marks: parseFloat(q.marks || 1),
                    negativeMarks: parseFloat(q.negativeMarks || 0)
                }
            }));

            console.log('[QUESTION MANAGER SAVE] existing updates:', updates);
            console.log('[QUESTION MANAGER SAVE] new questions:', newQuestions);

            const result = await api.post({
                action: 'bulkUpdateQuestions',
                testId: currentManagerTestId,
                updates: updates,
                sessionToken: sessionToken
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to update questions');
            }
        }

        // Add New
        if (newQuestions.length > 0) {
            const result = await api.post({
                action: 'addQuestions',
                testId: currentManagerTestId,
                questions: newQuestions,
                sessionToken: sessionToken
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to add questions');
            }
        }

        if (typeof completeAdminActionVerifyLoader === 'function') completeAdminActionVerifyLoader();

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
        if (typeof denyAdminActionVerifyLoader === 'function') denyAdminActionVerifyLoader();
        debugLog('ERROR', 'MANAGER', 'Save Changes Failed', err.message);
        alert("Save Error: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnHtml;
        isQuestionManagerSaving = false;
    }
}