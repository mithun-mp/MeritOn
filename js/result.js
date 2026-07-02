/**
 * Result Page Logic - Refined Version
 * - Removed score/percentage display
 * - Added Download Question Paper functionality
 * - Added redirection to lobby
 */

// PDF Image Helpers
async function waitForImages(root) {
    if (!root) return;
    const images = Array.from(root.querySelectorAll('img'));
    return Promise.all(images.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
            // Timeout to prevent hanging
            setTimeout(resolve, 5000);
        });
    }));
}

async function imageToDataUrl(url) {
    if (!url) return null;
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        return new Promise((resolve) => {
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.92));
                } catch (e) {
                    console.warn('Image to DataURL conversion failed:', e);
                    resolve(null);
                }
            };
            img.onerror = () => {
                console.warn('Image failed to load for DataURL conversion:', url);
                resolve(null);
            };
            img.src = new URL(url, window.location.origin).href;
            // Timeout in case image never loads
            setTimeout(() => resolve(null), 8000);
        });
    } catch (e) {
        console.warn('Image to DataURL conversion failed:', e);
        return null;
    }
}

// PDF Branding Helpers
const PDF_ASSETS = {
    logoDark: 'assets/logo-pdf-dark.png',
    logoLight: 'assets/logo-pdf-light.png'
};

async function addMeritOnPdfBranding(doc, options = {}) {
    const { title = "DOCUMENT", subtitle = "", documentType = "Report" } = options;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Add Header Background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // 2. Add Top-Left Logo (PNG)
    try {
        // Use dark logo for dark header
        doc.addImage(PDF_ASSETS.logoDark, 'PNG', 14, 6, 16, 16);
    } catch (e) {
        console.warn('PDF Logo failed to load', e);
    }

    // 3. Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(title.toUpperCase(), pageWidth / 2, 13, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, pageWidth / 2, 20, { align: "center" });

    // 4. Document Meta
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(`${documentType} | Generated: ${new Date().toLocaleString()}`, 14, 34);

    // 5. Watermark
    addPdfWatermark(doc);

    // 6. Initial Footer
    addPdfFooter(doc);
}

function addPdfWatermark(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));

    try {
        // Large centered watermark
        const size = 120;
        doc.addImage(PDF_ASSETS.logoLight, 'PNG', (pageWidth - size) / 2, (pageHeight - size) / 2, size, size);
    } catch (e) {}

    doc.restoreGraphicsState();
}

function addPdfFooter(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageCount = doc.internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);

        // Divider line
        doc.setDrawColor(226, 232, 240);
        doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

        // Footer Text
        doc.text("MeritOn • Secure Computer Based Testing", 14, pageHeight - 10);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: "right" });

        doc.setFont("helvetica", "italic");
        doc.text("Developed by MITHUN M P | © 2026 MeritOn. All rights reserved.", pageWidth / 2, pageHeight - 10, { align: "center" });
    }
}

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

/* =========================================================
   MEDIA HELPER FUNCTIONS FOR RESULT/ANSWER KEY
========================================================= */

function getDefaultMediaObject() {
  return {
    type: 'none',
    url: '',
    publicId: '',
    alt: '',
    width: 0,
    height: 0,
    bytes: 0,
    format: '',
    provider: ''
  };
}

function hasMediaImage(media) {
  if (!media || typeof media !== 'object') {
    return false;
  }
  const url = media.url;
  if (!url || typeof url !== 'string') {
    return false;
  }
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return false;
  }
  // Reject dangerous schemes
  if (trimmedUrl.startsWith('data:image') ||
      trimmedUrl.startsWith('javascript:') ||
      trimmedUrl.startsWith('blob:')) {
    return false;
  }
  // Only allow http/https
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return false;
  }
  return true;
}

function getQuestionMedia(question) {
  if (!question || typeof question !== 'object') {
    return getDefaultMediaObject();
  }
  return question.questionMedia || question.question_media || getDefaultMediaObject();
}

function getOptionMedia(question, optionKey) {
  if (!question || typeof question !== 'object') {
    return getDefaultMediaObject();
  }
  const optionMedia = question.optionMedia || {};
  return optionMedia[optionKey] || getDefaultMediaObject();
}

function createMediaImageHtml(media, fallbackAlt) {
  if (!hasMediaImage(media)) {
    return '';
  }

  const alt = media.alt || fallbackAlt || 'Image';
  return `<img src="${media.url}" alt="${escapeHTML(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="result-media-img" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\\'media-fallback\\'>Image failed to load</div>');">`;
}

function getImageAspectClass(media) {
  if (!media || !media.width || !media.height || media.width === 0 || media.height === 0) {
    return 'aspect-unknown';
  }

  const aspectRatio = media.width / media.height;

  if (aspectRatio >= 2.0) {
    return 'aspect-ultrawide';
  } else if (aspectRatio >= 1.45) {
    return 'aspect-wide';
  } else if (aspectRatio >= 0.8) {
    return 'aspect-square';
  } else if (aspectRatio >= 0.45) {
    return 'aspect-portrait';
  } else {
    return 'aspect-tall';
  }
}

function questionHasAnyMedia(question) {
  return hasMediaImage(getQuestionMedia(question));
}

function optionHasAnyMedia(question, optionKey) {
  return hasMediaImage(getOptionMedia(question, optionKey));
}

function questionHasAnyOptionMedia(question) {
  if (!question || typeof question !== 'object') {
    return false;
  }
  const optionMedia = question.optionMedia || {};
  return ['A', 'B', 'C', 'D'].some(key => hasMediaImage(optionMedia[key]));
}
function normalizePdfText(value) {
    if (value === undefined || value === null) return '';
    let text = String(value);

    // Remove leading apostrophe added by backend to prevent Google Sheets auto-formatting
    if (text.startsWith("'")) {
        text = text.slice(1);
    }

    // Preserve line breaks while removing invisible or unsupported characters
    text = text.replace(/\r\n?/g, '\n');
    text = text.replace(/ /g, ' ');
    text = text.replace(/[​-‏﻿]/g, '');

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
    text = text.replace(/[\t\v\f]/g, ' ');
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

let storedSubmissionResult = null; // To store the submission result for score adjustment

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

function formatDuration(seconds) {
    return formatTimeMMSS(seconds, "seconds");
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

    // Try to get score percentile from new fields if available
    let accuracyPercent = performance.OverallPercentage;
    if (performance.scorePercentile !== undefined && performance.scorePercentile !== null) {
        accuracyPercent = performance.scorePercentile;
    } else if (performance.summary?.scorePercentile !== undefined) {
        accuracyPercent = performance.summary.scorePercentile;
    }

    // Calculate adjusted score from API performance fields (with optional submissionResult fallback)
    let submissionResult = null;
    const submissionResultStr = localStorage.getItem('lastSubmissionResult');
    if (submissionResultStr) {
        try {
            submissionResult = JSON.parse(submissionResultStr);
        } catch (e) {
            console.error('Failed to parse submissionResult from localStorage', e);
        }
    }

    const scoreSource = {
        ...performance,
        violations: submissionResult?.violations || {
            fullScreenDeduction: performance.FullScreenDeduction,
            tabSwitchDeduction: performance.TabSwitchDeduction,
            deductionReason: performance.DeductionReason
        },
        scoreBeforeDeduction: performance.scoreBeforeDeduction,
        adjustedScore: performance.adjustedScore,
        scoreAfterDeduction: performance.scoreAfterDeduction
    };

    const adj = window.getViolationAdjustedScore
        ? window.getViolationAdjustedScore(scoreSource)
        : {
            rawScore: Number(performance.NetScore || 0),
            adjustedScore: Number(performance.NetScore || 0),
            violationDeduction: 0,
            hasDeduction: false,
            fullScreenDeduction: 0,
            tabSwitchDeduction: 0,
            deductionReason: ''
        };

    const netScore = adj.adjustedScore;
    const deductionSummary = adj.hasDeduction
        ? `<div style="grid-column:1 / -1; margin-top:8px; padding:14px; border-radius:12px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); color:#fecaca; font-size:0.9rem;">
            Violation deduction applied: fullscreen ${adj.fullScreenDeduction}, tab switch ${adj.tabSwitchDeduction}, total ${adj.violationDeduction}.
            Raw score ${adj.rawScore} → final ${adj.adjustedScore}.
            ${adj.deductionReason ? `Reason: ${adj.deductionReason}` : ''}
           </div>`
        : '';

    statsEl.innerHTML = [
        createStatCard('Net Score', netScore, adj.hasDeduction ? `Adjusted from raw ${adj.rawScore}` : 'Your final marks', false),
        createStatCard('Correct', performance.CorrectCount || 0, 'Correct answers', false),
        createStatCard('Wrong', performance.WrongCount || 0, 'Incorrect answers', false),
        createStatCard('Unanswered', performance.UnansweredCount || 0, 'Not attempted', false),
        createStatCard('Accuracy', `${Number(accuracyPercent || 0).toFixed(1)}%`, 'Overall performance', false),
        createStatCard('Time Taken', formatDuration(performance.TotalTimeTaken), '', true),
        deductionSummary
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
            const apiResponse = await api.get('getPerformance', { userID: userId, TestId: testId });

            // Check for explicit error from backend
            if (apiResponse && apiResponse.success === false && apiResponse.resultPublished === false) {
                if (apiResponse.quickResult) {
                    // Wait should not happen for quickResult
                    console.error('QuickResult=true but resultPublished=false');
                }
                if (attempt < maxAttempts) {
                    updateStatus('fa-solid fa-clock', `Waiting for administrator to publish your result... (${attempt}/${maxAttempts})`);
                    await delay(4000);
                    continue;
                }
                renderResultMessage('Result Pending', 'Your submission is received and is awaiting administrator publication. Check back shortly.', true);
                return;
            }

            if (apiResponse && apiResponse.error && !apiResponse.submitted) {
                throw new Error(apiResponse.error);
            }

            let performance = null;
            let published = false;

            // Check if response has submissionResult (new format)
            if (apiResponse && apiResponse.submissionResult) {
                performance = normalizeSubmissionResultToPerformance(apiResponse.submissionResult);
                published = apiResponse.resultPublished || apiResponse.quickResult;
                // Store the submissionResult for later use in score adjustment
                localStorage.setItem('lastSubmissionResult', JSON.stringify(apiResponse.submissionResult));
            }
            // Check if response is an array (admin endpoint case)
            else if (Array.isArray(apiResponse)) {
                performance = apiResponse[0];
                if (performance) {
                    published = String(performance.ResultPublished).toLowerCase() === 'true';
                }
            }
            // Check if response has a Performance property (single user case)
            else if (apiResponse && apiResponse.Performance) {
                performance = apiResponse.Performance;
                published = String(performance.ResultPublished).toLowerCase() === 'true' || apiResponse.quickResult;
            }

            if (!performance) {
                debugLog('WARN', 'RESULT', 'No performance record returned', { attempt, userId, testId, response: apiResponse });
                if (attempt < maxAttempts) {
                    updateStatus('fa-solid fa-clock', `Waiting for administrator to publish your result... (${attempt}/${maxAttempts})`);
                    await delay(4000);
                    continue;
                }
                renderResultMessage('Result Pending', 'Your submission is received and is awaiting administrator publication. Check back shortly.', true);
                return;
            }

            debugLog('INFO', 'RESULT', `Publish status fetched`, { published, attempt, resultId: performance.userID, performance });

            if (published) {
                renderResultMessage('Result Published', 'Your exam result is now available. See your performance below.');
                renderResultStats(performance);
                return;
            } else {
                if (attempt < maxAttempts) {
                    updateStatus('fa-solid fa-clock', `Waiting for administrator to publish your result... (${attempt}/${maxAttempts})`);
                    await delay(4000);
                    continue;
                }
                renderResultMessage('Result Pending', 'Your submission is received and is awaiting administrator publication. Check back shortly.', true);
                return;
            }
        } catch (err) {
            debugLog('ERROR', 'RESULT', 'Result publication check failed', { message: err.message, attempt, userId, testId });
            console.error('[RESULT] Error checking publication status', err);
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

function normalizeSubmissionResultToPerformance(submissionResult) {
    if (!submissionResult) return null;
    const summary = submissionResult.summary || {};
    const timing = submissionResult.timing || {};
    const sections = submissionResult.sections || {};

    // Convert sections map to SectionAnalyticsJSON format
    const sectionAnalytics = {};
    Object.entries(sections).forEach(([name, data]) => {
        sectionAnalytics[name] = {
            ...data,
            score: data.netScore || 0,
            percentage: data.scorePercentile || 0
        };
    });

    return {
        userID: submissionResult.userID,
        TestId: submissionResult.TestId,
        NetScore: summary.netScore || 0,
        FullScreenDeduction: submissionResult.violations?.fullScreenDeduction || 0,
        TabSwitchDeduction: submissionResult.violations?.tabSwitchDeduction || 0,
        DeductionReason: submissionResult.violations?.deductionReason || '',
        scoreBeforeDeduction: summary.netScore || 0,
        adjustedScore: Math.max(
            0,
            Number(summary.netScore || 0) -
            Number(submissionResult.violations?.fullScreenDeduction || 0) -
            Number(submissionResult.violations?.tabSwitchDeduction || 0)
        ),
        CorrectCount: summary.correctCount || 0,
        WrongCount: summary.wrongCount || 0,
        UnansweredCount: summary.unansweredCount || 0,
        scorePercentile: summary.scorePercentile || 0,
        OverallPercentage: summary.scorePercentile || 0,
        TotalTimeTaken: timing.totalTimeTakenSeconds || 0,
        StartedAt: timing.startedAt,
        SubmittedAt: timing.submittedAt,
        ResultPublished: submissionResult.result?.published || false,
        PublishedAt: submissionResult.result?.publishedAt,
        SectionAnalyticsJSON: sectionAnalytics
    };
}

function getCorrectAnswerKey(q) {
    const raw = String(
        q.CorrectAnswer ??
        q.correctAnswer ??
        q.Answer ??
        q.answer ??
        q.correct ??
        q.Correct ??
        q.correct_option ??
        q.correctOption ??
        ''
    ).trim().toUpperCase();

    if (!raw) return '';

    if (['A', 'B', 'C', 'D'].includes(raw)) return raw;

    if (raw.includes('OPTION A')) return 'A';
    if (raw.includes('OPTION B')) return 'B';
    if (raw.includes('OPTION C')) return 'C';
    if (raw.includes('OPTION D')) return 'D';

    if (raw === '1') return 'A';
    if (raw === '2') return 'B';
    if (raw === '3') return 'C';
    if (raw === '4') return 'D';

    return raw.charAt(0);
}

function getContainedImageSize(naturalWidth, naturalHeight, maxWidth, maxHeight) {
    const width = Number(naturalWidth || 1);
    const height = Number(naturalHeight || 1);

    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);

    return {
        width: Math.max(1, width * ratio),
        height: Math.max(1, height * ratio)
    };
}

async function generateQuestionPaper(result) {
    const startTime = Date.now();
    try {
        const testId = result.TestId || result.testId || result.TestID;
        const user = getUser();

        if (!testId) {
            debugLog('ERROR', 'RESULT', 'Test ID missing for paper generation');
            if (typeof showError === 'function') await showError("Test Reference ID not found.");
            else alert("Test Reference ID not found.");
            return;
        }

        debugLog('INFO', 'RESULT', 'Generating paper for test');

        const userId = user.userId || user.userID;
        let performanceSummary = null;
        try {
            const perfRes = await api.get('getPerformance', { userID: userId, TestId: testId });
            if (perfRes?.submissionResult) {
                performanceSummary = normalizeSubmissionResultToPerformance(perfRes.submissionResult);
            } else if (perfRes?.Performance) {
                performanceSummary = perfRes.Performance;
            }
        } catch (perfErr) {
            debugLog('WARN', 'RESULT', 'Performance summary unavailable for PDF', perfErr.message);
        }

        const [tests, questions, responses] = await Promise.all([
            api.get('getAllTests'),
            api.get('getQuestions', { testId, includeAnswers: true }),
            api.get('getResponses', { testId })
        ]);

        if (tests.error) throw new Error(tests.error);
        if (questions.error) throw new Error(questions.error);
        // Responses might error if result not published yet, which is okay

        const testList = Array.isArray(tests) ? tests : (tests.data || []);
        const testData = testList.find(t => t.TestID == testId);
        const testName = testData ? testData.Name : "MeritOn Examination";

        // Pre-convert all question/option images to Data URLs
        debugLog('INFO', 'RESULT', 'Pre-converting images to Data URLs');
        const qList = Array.isArray(questions) ? questions : (questions.data || []);
        for (const q of qList) {
            const qMedia = getQuestionMedia(q);
            if (hasMediaImage(qMedia)) {
                const dataUrl = await imageToDataUrl(qMedia.url);
                if (dataUrl) {
                    q._dataUrl = dataUrl;
                    q._naturalWidth = qMedia.width || 0;
                    q._naturalHeight = qMedia.height || 0;
                }
            }
            for (const optKey of ['A', 'B', 'C', 'D']) {
                const optMedia = getOptionMedia(q, optKey);
                if (hasMediaImage(optMedia)) {
                    const dataUrl = await imageToDataUrl(optMedia.url);
                    if (dataUrl) {
                        q._optDataUrls = q._optDataUrls || {};
                        q._optDataUrls[optKey] = dataUrl;
                        q._optNaturalWidths = q._optNaturalWidths || {};
                        q._optNaturalHeights = q._optNaturalHeights || {};
                        q._optNaturalWidths[optKey] = optMedia.width || 0;
                        q._optNaturalHeights[optKey] = optMedia.height || 0;
                    }
                }
            }
        }

        if (!qList || qList.length === 0) {
            debugLog('ERROR', 'RESULT', 'No questions found for paper generation');
            if (typeof showError === 'function') await showError("No questions found for this test.");
            else alert("No questions found for this test.");
            return;
        }

        // Map responses by QID for quick lookup
        const responseMap = {};
        const respList = Array.isArray(responses) ? responses : (responses.data || []);
        respList.forEach(r => {
            if (r.QID) responseMap[r.QID] = r;
        });

        debugLog('INFO', 'RESULT', 'Processing Questions for PDF');

        if (!window.jspdf) {
            throw new Error("PDF library (jsPDF) not loaded.");
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        // APPLY BRANDING
        await addMeritOnPdfBranding(doc, {
            title: "QUESTION PAPER & ANSWERS",
            subtitle: testName,
            documentType: "Result Document"
        });

        let y = 42;
        let globalQNo = 1;
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const topMargin = 42;
        const marginBottom = 30;

        // PDF Layout Constants
        const PDF_OPTION_GRID_MAX_PAGE_RATIO = 0.33;
        const PDF_OPTION_GRID_MAX_HEIGHT = Math.floor((pageHeight - topMargin - marginBottom) * PDF_OPTION_GRID_MAX_PAGE_RATIO);
        const OPTION_GRID_LEFT = 22;
        const OPTION_GRID_RIGHT = pageWidth - 22;
        const OPTION_GRID_WIDTH = OPTION_GRID_RIGHT - OPTION_GRID_LEFT;
        const OPTION_COLUMN_GAP = 8;
        const OPTION_ROW_GAP = 6;
        const OPTION_CELL_WIDTH = (OPTION_GRID_WIDTH - OPTION_COLUMN_GAP) / 2;
        const OPTION_CELL_HEIGHT = Math.min(58, Math.floor((PDF_OPTION_GRID_MAX_HEIGHT - OPTION_ROW_GAP) / 2));
        const OPTION_IMAGE_MAX_WIDTH = OPTION_CELL_WIDTH - 14;
        const OPTION_IMAGE_MAX_HEIGHT = OPTION_CELL_HEIGHT - 24;

        const QUESTION_IMAGE_MAX_WIDTH = 140;
        const QUESTION_IMAGE_MAX_HEIGHT = 60;

        if (performanceSummary) {
            const adj = window.getViolationAdjustedScore
                ? window.getViolationAdjustedScore(performanceSummary)
                : {
                    rawScore: Number(performanceSummary.NetScore || 0),
                    adjustedScore: Number(performanceSummary.NetScore || 0),
                    violationDeduction: 0,
                    hasDeduction: false,
                    fullScreenDeduction: 0,
                    tabSwitchDeduction: 0,
                    deductionReason: ''
                };

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text(`Final Score: ${adj.adjustedScore}`, 14, y);
            y += 6;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            if (adj.hasDeduction) {
                doc.text(`Raw Score: ${adj.rawScore}`, 14, y);
                y += 5;
                doc.text(`Violation Deduction: fullscreen ${adj.fullScreenDeduction}, tab switch ${adj.tabSwitchDeduction}, total ${adj.violationDeduction}`, 14, y);
                y += 5;
                if (adj.deductionReason) {
                    const reasonLines = doc.splitTextToSize(`Reason: ${adj.deductionReason}`, 180);
                    doc.text(reasonLines, 14, y);
                    y += reasonLines.length * 5;
                }
            } else {
                doc.text('No violation deduction applied.', 14, y);
                y += 5;
            }
            y += 6;
        }

        // GROUP BY SECTION
        const grouped = {};
        qList.forEach(q => {
            const sec = q.Section || 'General';
            if (!grouped[sec]) grouped[sec] = [];
            grouped[sec].push(q);
        });

        // SECTION LOOP
        Object.keys(grouped).forEach(sectionName => {
            if (y + 20 > pageHeight - marginBottom) {
                doc.addPage();
                addPdfWatermark(doc);
                y = topMargin;
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
                if (y + 40 > pageHeight - marginBottom) {
                    doc.addPage();
                    addPdfWatermark(doc);
                    y = topMargin;
                }
                
                // QUESTION NUMBER & TEXT (Formatting Safe)
                doc.setTextColor(15, 23, 42);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(`${globalQNo}.`, 14, y);

                // Render question image if available
                if (q._dataUrl) {
                    if (y + QUESTION_IMAGE_MAX_HEIGHT + 10 > pageHeight - marginBottom) {
                        doc.addPage();
                        addPdfWatermark(doc);
                        y = topMargin;
                    }

                    try {
                        const imgSize = getContainedImageSize(
                            q._naturalWidth,
                            q._naturalHeight,
                            QUESTION_IMAGE_MAX_WIDTH,
                            QUESTION_IMAGE_MAX_HEIGHT
                        );
                        const x = 22;
                        
                        doc.addImage(q._dataUrl, 'JPEG', x, y, imgSize.width, imgSize.height);
                        y += imgSize.height + 5;
                    } catch (imgErr) {
                        // Image failed to load, show fallback
                        console.warn('PDF image load failed:', imgErr);
                        doc.setTextColor(100, 116, 139);
                        doc.setFont('helvetica', 'italic');
                        doc.text('[Image unavailable]', 22, y);
                        y += 5;
                        doc.setFont('helvetica', 'normal');
                    }
                }

                const qLines = normalizePdfText(q.Question || '').split('\n');
                qLines.forEach(line => {
                    y = addWrappedText(doc, line, 22, y, 160, 5);
                    if (y + 10 > pageHeight - marginBottom) {
                        doc.addPage();
                        addPdfWatermark(doc);
                        y = topMargin;
                    }
                });

                y += 2;

                const optionKeys = ['A', 'B', 'C', 'D'];
                const hasAnyOptionImage = optionKeys.some(optKey => {
                    const optMedia = getOptionMedia(q, optKey);
                    return hasMediaImage(optMedia) || Boolean(q._optDataUrls?.[optKey]);
                });

                const correctAnswer = getCorrectAnswerKey(q);
                const userResponse = responseMap[q.QID];
                const selectedAnswer = userResponse ? String(userResponse.SelectedAnswer || '').toUpperCase() : '';

                if (hasAnyOptionImage) {
                    const requiredGridHeight = (2 * OPTION_CELL_HEIGHT) + OPTION_ROW_GAP + 8;
                    if (y + requiredGridHeight > pageHeight - marginBottom) {
                        doc.addPage();
                        addPdfWatermark(doc);
                        y = topMargin;
                    }

                    const gridTop = y;

                    for (const optKey of optionKeys) {
                        const optionIndex = optionKeys.indexOf(optKey);
                        const col = optionIndex % 2;
                        const row = Math.floor(optionIndex / 2);

                        const cellX = OPTION_GRID_LEFT + col * (OPTION_CELL_WIDTH + OPTION_COLUMN_GAP);
                        const cellY = gridTop + row * (OPTION_CELL_HEIGHT + OPTION_ROW_GAP);

                        const isCorrect = optKey.toUpperCase() === correctAnswer;

                        if (isCorrect) {
                            doc.setFillColor(220, 252, 231);
                            doc.setDrawColor(22, 163, 74);
                            doc.setLineWidth(0.8);
                        } else {
                            doc.setFillColor(255, 255, 255);
                            doc.setDrawColor(203, 213, 225);
                            doc.setLineWidth(0.3);
                        }

                        doc.roundedRect(cellX, cellY, OPTION_CELL_WIDTH, OPTION_CELL_HEIGHT, 2, 2, 'FD');

                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(9);
                        doc.setTextColor(15, 23, 42);
                        doc.text(`${optKey}.`, cellX + 4, cellY + 7);

                        if (isCorrect) {
                            doc.setTextColor(22, 163, 74);
                            doc.setFontSize(8);
                            doc.text('[CORRECT]', cellX + 13, cellY + 7);
                        }

                        doc.setTextColor(51, 65, 85);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);

                        const optText = normalizePdfText(q[optKey] || '');
                        if (optText) {
                            const wrappedOptText = doc.splitTextToSize(optText, OPTION_CELL_WIDTH - 8);
                            let textY = cellY + 13;
                            for (let t of wrappedOptText) {
                                if (textY + 4 < cellY + OPTION_CELL_HEIGHT - 4) {
                                    doc.text(t, cellX + 4, textY);
                                    textY += 4;
                                }
                            }
                        }

                        const imageData = q._optDataUrls?.[optKey];
                        if (imageData) {
                            try {
                                const optMedia = getOptionMedia(q, optKey);
                                const size = getContainedImageSize(
                                    optMedia?.width || 800,
                                    optMedia?.height || 600,
                                    OPTION_IMAGE_MAX_WIDTH,
                                    OPTION_IMAGE_MAX_HEIGHT
                                );

                                const imageX = cellX + (OPTION_CELL_WIDTH - size.width) / 2;
                                const imageY = cellY + 15;

                                if (imageY + size.height < cellY + OPTION_CELL_HEIGHT - 2) {
                                    doc.addImage(imageData, 'JPEG', imageX, imageY, size.width, size.height);
                                }
                            } catch (imgErr) {
                                console.warn('PDF option image load failed:', imgErr);
                                doc.setTextColor(100, 116, 139);
                                doc.setFont('helvetica', 'italic');
                                doc.setFontSize(8);
                                doc.text('[Image unavailable]', cellX + 4, cellY + 18);
                            }
                        }
                    }

                    y = gridTop + (2 * OPTION_CELL_HEIGHT) + OPTION_ROW_GAP + 6;
                } else {
                    // Vertical layout for text-only options
                    if (y + 60 > pageHeight - marginBottom) {
                        doc.addPage();
                        addPdfWatermark(doc);
                        y = topMargin;
                    }

                    const options = [
                        ['A', q.A],
                        ['B', q.B],
                        ['C', q.C],
                        ['D', q.D]
                    ];

                    const isUserCorrect = selectedAnswer === correctAnswer;

                    options.forEach(opt => {
                        const optKey = opt[0];
                        const optText = normalizePdfText(opt[1] || '');
                        const prefix = `${optKey}. `;
                        const optLines = optText.split('\n');

                        let textColor = [51, 65, 85];
                        let isBold = false;

                        if (optKey === correctAnswer) {
                            textColor = [22, 163, 74];
                            isBold = true;
                        }
                        if (optKey === selectedAnswer && !isUserCorrect) {
                            textColor = [239, 68, 68];
                            isBold = true;
                        }

                        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                        doc.setFont("helvetica", isBold ? "bold" : "normal");

                        let firstLine = true;
                        optLines.forEach(line => {
                            let displayText;
                            if (firstLine) {
                                if (optKey === correctAnswer) {
                                    displayText = `${prefix}${line} [CORRECT]`;
                                } else {
                                    displayText = `${prefix}${line}`;
                                }
                                firstLine = false;
                            } else {
                                displayText = `   ${line}`;
                            }
                            y = addWrappedText(doc, displayText, 22, y, 160, 4.5);
                            if (y + 10 > pageHeight - marginBottom) {
                                doc.addPage();
                                addPdfWatermark(doc);
                                y = topMargin;
                            }
                        });
                    });
                }

                y += 8;
                globalQNo++;
            });

            y += 5;
        });

        addPdfFooter(doc);

        doc.save(`Result_${testId}.pdf`);
        debugLog('PERF', 'RESULT', 'PDF Generated Successfully', { duration: Date.now() - startTime });
    } catch (err) {
        debugLog('ERROR', 'RESULT', 'PDF Generation Failed', err.message);
        alert("Failed to generate PDF. Check console for details.");
    }
}