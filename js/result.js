/**
 * Result Page Logic - Refined Version
 * - Removed score/percentage display
 * - Added Download Question Paper functionality
 * - Added redirection to lobby
 */

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function escapeHTML(text) {
    if (!text && text !== 0) return '';
    const p = document.createElement('p');
    p.textContent = String(text);
    return p.innerHTML;
}
function normalizePdfText(value) {
    if (value === undefined || value === null) return '';
    let text = String(value);

    // Preserve line breaks while removing invisible or unsupported characters
    text = text.replace(/\r\n?/g, '\n');
    text = text.replace(/\u00A0/g, ' ');
    text = text.replace(/[\u200B-\u200F\uFEFF]/g, '');

    const replacements = {
        '–': '-',
        '—': '-',
        '“': '"',
        '”': '"',
        '‘': "'",
        '’': "'",
        '…': '...',
        '₹': 'Rs.',
        '¹': '1',
        '²': '2',
        '³': '3'
    };

    text = text.replace(/./g, c => replacements[c] || c);
    text = text.replace(/[\t\v\f\u000B]/g, ' ');
    return text;
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 5) {
    const wrapped = doc.splitTextToSize(text, maxWidth);
    if (Array.isArray(wrapped)) {
        doc.text(wrapped, x, y);
        return y + wrapped.length * lineHeight;
    }
    doc.text(String(wrapped), x, y);
    return y + lineHeight;
}

document.addEventListener('DOMContentLoaded', () => {
    debugLog('INFO', 'RESULT', 'Result page loaded');
    const raw = localStorage.getItem('lastResult');
    let result = null;

    if (raw) {
        result = window.normalizePayload ? window.normalizePayload(JSON.parse(raw)) : JSON.parse(raw);
        debugLog('STATE', 'RESULT', 'Result data loaded from localStorage');
    }

    const urlTestId = getQueryParam('testId');
    const testId = (urlTestId || result?.TestId || result?.testId || result?.TestID || '').toString().trim();
    const user = getUser();

    if (!testId || !user) {
        debugLog('WARN', 'RESULT', 'No testId or user found - Redirecting to lobby');
        window.location.href = './test-lobby.html';
        return;
    }

    if (!result) {
        result = { TestId: testId, testId };
    } else if (urlTestId && urlTestId !== (result.TestId || result.testId || result.TestID)) {
        debugLog('INFO', 'RESULT', 'Using testId from URL query over stored result data');
        result = { ...result, TestId: urlTestId, testId: urlTestId };
    }

    document.getElementById('downloadPaper').onclick = () => {
        debugLog('INFO', 'EVENT', 'Download Paper Triggered');
        generateQuestionPaper(result);
    };

    checkResultPublicationStatus(user.userId || user.userID, testId);
});

function createStatCard(label, value, subtext = '', showLabel = true) {
    return `
        <div class="stat-card">
            <h2>${escapeHTML(value)}</h2>
            ${showLabel ? `<small>${escapeHTML(label)}</small>` : ''}
            ${!showLabel && subtext ? `<div style="margin-top:6px; color:#cbd5e1; font-size:0.9rem;">${escapeHTML(subtext)}</div>` : ''}
        </div>
    `;
}

function formatDuration(seconds) {
    const secs = Number(seconds) || 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderResultMessage(title, subtitle, pending = false) {
    const titleEl = document.getElementById('resultTitle');
    const subtitleEl = document.getElementById('resultSubtitle');
    const statusEl = document.getElementById('resultStatus');
    const statsEl = document.getElementById('resultStats');
    const sectionsEl = document.getElementById('resultSections');

    titleEl.innerText = title;
    subtitleEl.innerText = subtitle;
    updateStatus('fa-solid fa-info-circle', subtitle);
    statsEl.style.display = pending ? 'none' : 'grid';
    sectionsEl.style.display = pending ? 'none' : sectionsEl.innerHTML ? 'block' : 'none';
}

function updateStatus(iconClass, text) {
    const statusEl = document.getElementById('resultStatus');
    const statusText = document.getElementById('resultStatusText');
    if (!statusEl) return;
    const iconEl = statusEl.querySelector('.status-icon');
    if (iconEl) {
        iconEl.className = `status-icon ${iconClass}`;
        iconEl.style.marginRight = '10px';
    }
    if (statusText) statusText.innerText = String(text || '');
    else statusEl.innerHTML = `<i class="${iconClass}" style="margin-right:10px;color:#60a5fa;"></i>${escapeHTML(text)} `;
}

function parseSectionAnalytics(value) {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value || '{}');
        } catch (err) {
            console.warn('Unable to parse section analytics', err);
            return {};
        }
    }
    return typeof value === 'object' ? value : {};
}

function renderSectionBreakdown(performance) {
    const sectionsEl = document.getElementById('resultSections');
    const rawSections = performance.SectionAnalyticsJSON || performance.sectionAnalyticsJSON || performance.SectionAnalytics || performance.sectionAnalytics || performance.sections;
    const sections = parseSectionAnalytics(rawSections);
    const sectionKeys = Object.keys(sections || {});

    if (!sectionKeys.length) {
        sectionsEl.style.display = 'none';
        sectionsEl.innerHTML = '';
        return;
    }

    const cards = sectionKeys.map(name => {
        const data = sections[name] || {};
        const score = Number(data.score || 0).toFixed(1);
        const percentage = Number(data.percentage ?? (data.total ? (Number(data.correct || 0) / Number(data.total || 1)) * 100 : 0)).toFixed(1);
        const correct = Number(data.correct || 0);
        const total = Number(data.total || 0);
        const wrong = Number(data.wrong || 0);

        return `
            <div class="section-card">
                <strong>${escapeHTML(name)}</strong>
                <div class="section-score">${escapeHTML(score)} pts</div>
                <div class="section-metric"><span>Accuracy</span><span class="section-percentage">${escapeHTML(percentage)}%</span></div>
                <div class="section-metric"><span>Correct</span><span>${escapeHTML(correct)}/${escapeHTML(total)}</span></div>
                <div class="section-metric"><span>Wrong</span><span>${escapeHTML(wrong)}</span></div>
            </div>
        `;
    }).join('');

    sectionsEl.innerHTML = `
        <h3>Section Scores</h3>
        <div class="section-grid">${cards}</div>
    `;
    sectionsEl.style.display = 'block';
}

function renderResultStats(performance) {
    const statsEl = document.getElementById('resultStats');
    statsEl.style.display = 'grid';
    statsEl.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
    statsEl.style.gap = '20px';

    const publishedAtValue = performance.PublishedAt ? String(performance.PublishedAt).replace(/^'/, '') : '';
    const startedAtValue = performance.StartedAt ? String(performance.StartedAt).replace(/^'/, '') : '';
    const publishedAt = publishedAtValue ? new Date(publishedAtValue) : null;
    const startedAt = startedAtValue ? new Date(startedAtValue) : null;

    statsEl.innerHTML = [
        createStatCard('Net Score', performance.NetScore || 0, 'Your final marks', false),
        createStatCard('Correct', performance.CorrectCount || 0, 'Correct answers', false),
        createStatCard('Wrong', performance.WrongCount || 0, 'Incorrect answers', false),
        createStatCard('Unanswered', performance.UnansweredCount || 0, 'Not attempted', false),
        createStatCard('Accuracy', `${performance.OverallPercentage || 0}%`, 'Overall performance', false),
        createStatCard('Time Taken', formatDuration(performance.TotalTimeTaken), '', true)
    ].join('');

    const metaRow = document.createElement('div');
    metaRow.style.gridColumn = '1 / -1';
    metaRow.style.textAlign = 'center';
    metaRow.style.color = '#cbd5e1';
    metaRow.style.fontSize = '0.95rem';
    metaRow.style.paddingTop = '10px';
    metaRow.innerText = publishedAt ? `Published on ${publishedAt.toLocaleString()}` : 'Result details are available now.';
    statsEl.appendChild(metaRow);
    renderSectionBreakdown(performance);
}

async function checkResultPublicationStatus(userId, testId) {
    const statusEl = document.getElementById('resultStatus');
    const statsEl = document.getElementById('resultStats');
    if (!statusEl || !statsEl) {
        console.error('Result page DOM missing expected elements', { statusEl, statsEl });
        return;
    }

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const maxAttempts = 6;
    let attempt = 0;

    statsEl.style.display = 'none';

    while (attempt < maxAttempts) {
        attempt += 1;
        updateStatus('fa-solid fa-spinner fa-spin', `Checking publication status (${attempt}/${maxAttempts})...`);

        try {
            const apiResponse = await api.get('getPerformance', { testId, userID: userId });
            let resultData = apiResponse;

            if (apiResponse && typeof apiResponse === 'object' && apiResponse.error) {
                throw new Error(apiResponse.error);
            }
            if (apiResponse && typeof apiResponse === 'object' && Array.isArray(apiResponse.data)) {
                resultData = apiResponse.data;
            }

            if (!Array.isArray(resultData)) {
                throw new Error('Unexpected API response format for getPerformance');
            }

            if (resultData.length > 0) {
                const performance = resultData[0];
                const published = String(performance.ResultPublished).toLowerCase() === 'true';
                debugLog('INFO', 'RESULT', `Publish status fetched`, { published, attempt, resultId: performance.userID, performance });

                if (published) {
                    renderResultMessage('Result Published', 'Your exam result is now available. See your performance below.');
                    renderResultStats(performance);
                    return;
                }
            } else {
                debugLog('WARN', 'RESULT', 'No performance record returned', { attempt, userId, testId, response: apiResponse });
            }

            if (attempt < maxAttempts) {
                updateStatus('fa-solid fa-clock', `Waiting for administrator to publish your result... (${attempt}/${maxAttempts})`);
                await delay(4000);
                continue;
            }

            renderResultMessage('Result Pending', 'Your submission is received and is awaiting administrator publication. Check back shortly.', true);
            return;
        } catch (err) {
            console.error('Result publication check failed', err, { attempt, userId, testId });
            debugLog('ERROR', 'RESULT', 'Failed to load performance data', { message: err.message, attempt, userId, testId });
            if (attempt < maxAttempts) {
                updateStatus('fa-solid fa-exclamation-triangle', `Temporary error checking publication status (${attempt}/${maxAttempts}). Retrying...`);
                await delay(4000);
                continue;
            }

            renderResultMessage('Result Unavailable', 'Unable to verify publication status right now. Please try again later.', true);
            return;
        }
    }
}

async function generateQuestionPaper(result) {
    const startTime = Date.now();
    try {
        const testId = result.TestId || result.testId || result.TestID;
        
        if (!testId) {
            debugLog('ERROR', 'RESULT', 'Test ID missing for paper generation');
            await showError("Test Reference ID not found.");
            return;
        }

        debugLog('INFO', 'RESULT', 'Generating paper for test');

        const [tests, questions] = await Promise.all([
            api.get('getAllTests'),
            api.get('getQuestions', { testId })
        ]);

        if (tests.error) throw new Error(tests.error);
        if (questions.error) throw new Error(questions.error);

        const testList = Array.isArray(tests) ? tests : (tests.data || []);
        const testData = testList.find(t => t.TestID == testId);
        const testName = testData ? testData.Name : "CBT Examination";
        
        if (!questions || questions.length === 0) {
            debugLog('ERROR', 'RESULT', 'No questions found for paper generation');
            await showError("No questions found for this test.");
            return;
        }

        debugLog('INFO', 'RESULT', 'Processing Questions for PDF');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        const pageWidth = 210;
        const marginX = 14;

        // HEADER (Admin Style)
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
        doc.text(`Reference ID: ${testId} | Generated: ${new Date().toLocaleString()}`, 14, 34);

        let y = 42;
        let globalQNo = 1;

        // GROUP BY SECTION
        const grouped = {};
        questions.forEach(q => {
            const sec = q.Section || 'General';
            if (!grouped[sec]) grouped[sec] = [];
            grouped[sec].push(q);
        });

        // SECTION LOOP
        Object.keys(grouped).forEach(sectionName => {
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
            doc.text(`SECTION : ${sectionName.toUpperCase()}`, 18, y + 5.5);

            y += 14;

            // QUESTION LOOP
            grouped[sectionName].forEach(q => {
                // QUESTION NUMBER & TEXT (Formatting Safe)
                doc.setTextColor(15, 23, 42);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(`${globalQNo}.`, 14, y);

                const qLines = normalizePdfText(q.Question || '').split('\n');
                qLines.forEach(line => {
                    y = addWrappedText(doc, line, 22, y, 160, 5);
                    if (y > 275) {
                        doc.addPage();
                        y = 20;
                    }
                });

                y += 2;

                // OPTIONS (Formatting Safe)
                doc.setFont("helvetica", "normal");
                doc.setFontSize(9);
                doc.setTextColor(51, 65, 85);

                const options = [
                    ['A', q.A],
                    ['B', q.B],
                    ['C', q.C],
                    ['D', q.D]
                ];

                options.forEach(opt => {
                    const prefix = `${opt[0]}) `;
                    const optText = normalizePdfText(opt[1] || '');
                    const optLines = optText.split('\n');
                    
                    optLines.forEach((line, lIdx) => {
                        const displayText = lIdx === 0 ? prefix + line : '   ' + line;
                        y = addWrappedText(doc, displayText, 30, y, 150, 4.5);
                        if (y > 275) {
                            doc.addPage();
                            y = 20;
                        }
                    });
                });

                y += 5; // spacing between questions
                globalQNo++;
            });

            y += 5;
        });

        // PAGE NUMBERS
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text(`Page ${i} of ${pageCount}`, 105, 285, { align: "center" });
        }

        doc.save(`QuestionPaper_${testId}.pdf`);
        debugLog('PERF', 'RESULT', 'PDF Generated Successfully', { duration: Date.now() - startTime });
    } catch (err) {
        debugLog('ERROR', 'RESULT', 'PDF Generation Failed', err.message);
        alert("Failed to generate PDF. Check console for details.");
    }
}
