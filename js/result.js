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

    if (!testId) {
        debugLog('WARN', 'RESULT', 'No testId found in URL or storage - Redirecting to lobby');
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
});

async function generateQuestionPaper(result) {
    const startTime = Date.now();
    try {
        const testId = result.TestId || result.testId || result.TestID;
        
        if (!testId) {
            debugLog('ERROR', 'RESULT', 'Test ID missing for paper generation');
            alert("Test Reference ID not found.");
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
            alert("No questions found for this test.");
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
