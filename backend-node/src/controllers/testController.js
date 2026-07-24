const Test = require('../models/Test');
const TestPaper = require('../models/TestPaper');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const Question = require('../models/Question');
const testPaperUtils = require('../utils/testPaperUtils');
const examTimeUtils = require('../utils/examTimeUtils');
const { sendExamNotificationEmail } = require('../services/emailService');

// Helper to format time like Code.gs
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Helper to format time display with AM/PM
function formatTimeDisplay(date) {
  return date.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
}

// Verify admin session
async function verifyAdminSession(sessionToken) {
  if (!sessionToken) return false;
  const session = await Session.findOne({ sessionToken });
  if (!session || session.role !== 'admin' || new Date() > session.expiresAt) {
    return false;
  }
  return true;
}

async function getAllTests(params = {}) {
  try {
    const includeDeleted = params.includeDeleted === 'true';
    let tests = await testPaperUtils.getAllTests();

    if (!includeDeleted) {
      tests = tests.filter(t => !t.IsDeleted);
    }

    // Process each test using examTimeUtils
    const processedTests = tests.map(testObj => {
      // Get exam window using examTimeUtils
      const examWindow = examTimeUtils.getExamWindowFromPaper(testObj);
      const { startAt, expiryAt, visibleUntil, now } = examWindow;
      const status = examWindow.status === "Active" ? "Available" : (examWindow.status === "Ended" ? "Closed" : examWindow.status);
      const canLogin = examWindow.canLogin;

      // Format times for display
      const startStr = formatTime(startAt);
      const expiryStr = formatTime(expiryAt);
      const endStr = formatTime(expiryAt);
      const startDisplay = formatTimeDisplay(startAt);
      const expiryDisplay = formatTimeDisplay(expiryAt);

      return {
        ...testObj,
        status,
        canLogin,
        StartTime: startStr,
        ExpiryTime: expiryStr,
        StartTimeDisplay: startDisplay,
        ExpiryTimeDisplay: expiryDisplay,
        EndTime: endStr,
        Date: startAt.toISOString().split('T')[0],
        liveLeaderboardEnabled: testObj.LiveLeaderboardEnabled !== false,
        startAtISO: examWindow.startAtISO,
        expiryAtISO: examWindow.expiryAtISO,
        serverNowISO: examWindow.serverNowISO,
        countdownData: examWindow.countdownData,
        liveLeaderboardVisibleUntilISO: examWindow.visibleUntilISO
      };
    });

    return processedTests;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getAllTests',
      Error: err.message
    });
    throw new Error('Failed to get tests');
  }
}

async function createTest(testData, sessionToken) {
    try {
        const isAdmin = await verifyAdminSession(sessionToken);
        if (!isAdmin) {
            return { success: false, error: 'Unauthorized' };
        }

        const testId = 'T' + uuidv4().slice(0, 8);
        const mode = testPaperUtils.getStorageMode();

        if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
            await Test.create({
                TestID: testId,
                Name: testData.name,
                Date: testData.date,
                StartTime: testData.startTime,
                EndTime: testData.endTime,
                Duration: testData.duration,
                Sections: JSON.stringify(testData.sections || []),
                Mode: testData.mode,
                ExpiryTime: testData.expiryTime,
                ExamType: testData.examType || 'standard',
                QuickResult: testData.quickResult || false,
                IsDeleted: false
            });
        }

        if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
            const sectionNames = (testData.sections || []).map(s => s.name || s);
            await TestPaper.create({
                TestID: testId,
                meta: {
                    name: testData.name,
                    date: testData.date,
                    startTime: testData.startTime,
                    expiryTime: testData.expiryTime,
                    duration: testData.duration,
                    mode: testData.mode,
                    examType: testData.examType || 'standard',
                    quickResult: testData.quickResult || false,
                    liveLeaderboardEnabled: true,
                    answerKeyPublished: false,
                    answerKeyPublishedAt: null,
                    isDeleted: false,
                    deletedAt: null
                },
                sections: sectionNames.map(name => ({ name, count: 0, totalMarks: 0 })),
                questions: [],
                stats: {
                    totalQuestions: 0,
                    totalMarks: 0,
                    difficultyCount: { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 },
                    sectionCount: {}
                }
            });
        }

        await AuditLog.create({
            Timestamp: new Date(),
            Action: 'createTest',
            UserID: 'admin',
            TestID: testId,
            Details: 'Test created'
        });

        return { success: true, testId };
    } catch (err) {
        await ErrorLog.create({
            Timestamp: new Date(),
            Function: 'createTest',
            Error: err.message
        });
        return { success: false, error: 'Failed to create test' };
    }
}

async function updateTest(testId, updatedData, sessionToken) {
    try {
        const isAdmin = await verifyAdminSession(sessionToken);
        if (!isAdmin) {
            return { success: false, error: 'Unauthorized' };
        }

        const mode = testPaperUtils.getStorageMode();

        if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
            const test = await Test.findOne({ TestID: testId });
            if (test) {
                const fieldMap = {
                    name: 'Name',
                    date: 'Date',
                    startTime: 'StartTime',
                    endTime: 'EndTime',
                    duration: 'Duration',
                    sections: 'Sections',
                    mode: 'Mode',
                    expiryTime: 'ExpiryTime',
                    examType: 'ExamType',
                    quickResult: 'QuickResult'
                };

                for (const key in updatedData) {
                    const fieldName = fieldMap[key];
                    if (fieldName) {
                        if (key === 'sections') {
                            test[fieldName] = JSON.stringify(updatedData[key] || []);
                        } else {
                            test[fieldName] = updatedData[key];
                        }
                    }
                }

                await test.save();
            }
        }

        if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
            const testPaper = await TestPaper.findOne({ TestID: testId });
            if (testPaper) {
                if (updatedData.name) testPaper.meta.name = updatedData.name;
                if (updatedData.date) testPaper.meta.date = updatedData.date;
                if (updatedData.startTime) testPaper.meta.startTime = updatedData.startTime;
                if (updatedData.expiryTime) testPaper.meta.expiryTime = updatedData.expiryTime;
                if (updatedData.duration) testPaper.meta.duration = updatedData.duration;
                if (updatedData.mode) testPaper.meta.mode = updatedData.mode;
                if (updatedData.examType) testPaper.meta.examType = updatedData.examType;
                if (updatedData.quickResult !== undefined) testPaper.meta.quickResult = updatedData.quickResult;
                if (updatedData.sections) {
                    const sectionNames = (updatedData.sections || []).map(s => s.name || s);
                    const { stats, sections } = testPaperUtils.calculateStatsAndSections(testPaper.questions, sectionNames);
                    testPaper.sections = sections;
                    testPaper.stats = stats;
                }
                await testPaper.save();
            }
        }

        await AuditLog.create({
            Timestamp: new Date(),
            Action: 'updateTest',
            UserID: 'admin',
            TestID: testId,
            Details: 'Test updated'
        });

        return { success: true };
    } catch (err) {
        await ErrorLog.create({
            Timestamp: new Date(),
            Function: 'updateTest',
            Error: err.message
        });
        return { success: false, error: 'Failed to update test' };
    }
}

async function deleteTest(testId, sessionToken, permanent = false) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const mode = testPaperUtils.getStorageMode();

    if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
      if (permanent) {
        await Test.deleteOne({ TestID: testId });
      } else {
        const test = await Test.findOne({ TestID: testId });
        if (test) {
          test.IsDeleted = true;
          test.DeletedAt = new Date();
          await test.save();
        }
      }
    }

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      if (permanent) {
        await TestPaper.deleteOne({ TestID: testId });
      } else {
        const testPaper = await TestPaper.findOne({ TestID: testId });
        if (testPaper) {
          testPaper.meta.isDeleted = true;
          testPaper.meta.deletedAt = new Date();
          await testPaper.save();
        }
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'deleteTest',
      UserID: 'admin',
      TestID: testId,
      Details: `Test deleted (permanent: ${permanent})`
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'deleteTest',
      Error: err.message
    });
    return { success: false, error: 'Failed to delete test' };
  }
}

async function publishAnswerKey(testId, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const mode = testPaperUtils.getStorageMode();

    if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
      const test = await Test.findOne({ TestID: testId });
      if (test && !test.AnswerKeyPublished) {
        test.AnswerKeyPublished = true;
        test.AnswerKeyPublishedAt = new Date();
        await test.save();
      }
    }

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      const testPaper = await TestPaper.findOne({ TestID: testId });
      if (testPaper && !testPaper.meta.answerKeyPublished) {
        testPaper.meta.answerKeyPublished = true;
        testPaper.meta.answerKeyPublishedAt = new Date();
        await testPaper.save();
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'publishAnswerKey',
      UserID: 'admin',
      TestID: testId,
      Details: 'Answer key published'
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'publishAnswerKey',
      Error: err.message
    });
    return { success: false, error: 'Failed to publish answer key' };
  }
}

async function getTestConfig(testId, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const mode = testPaperUtils.getStorageMode();
    let testPaper = await TestPaper.findOne({ TestID: testId }).lean();
    if (!testPaper) {
      const converted = await testPaperUtils.convertLegacyToTestPaper(testId);
      if (converted) testPaper = converted;
    }

    if (!testPaper) {
      return { success: false, error: 'Test not found' };
    }

    const legacyTest = testPaperUtils.convertTestPaperToLegacyTest(testPaper);
    const questionsCount = testPaper.questions.filter(q => !q.isDeleted).length;

    return {
      success: true,
      test: {
        TestID: testPaper.TestID,
        Name: legacyTest.Name,
        Date: legacyTest.Date,
        StartTime: legacyTest.StartTime,
        ExpiryTime: legacyTest.ExpiryTime,
        EndTime: legacyTest.EndTime,
        Duration: legacyTest.Duration,
        Sections: testPaper.sections.map(s => ({ name: s.name, count: s.count })),
        Mode: legacyTest.Mode,
        ExamType: legacyTest.ExamType,
        QuickResult: legacyTest.QuickResult,
        LiveLeaderboardEnabled: legacyTest.LiveLeaderboardEnabled,
        AnswerKeyPublished: legacyTest.AnswerKeyPublished
      },
      questionsCount,
      stats: testPaper.stats
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getTestConfig',
      Error: err.message
    });
    return { success: false, error: 'Failed to get test config' };
  }
}

// =========================================================================
// ENTERPRISE CSV IMPORT & AUTOMATIC NORMALIZATION PIPELINE
// =========================================================================

class ImportReportTracker {
  constructor() {
    this.startTimeMs = Date.now();
    this.executionTimeMs = 0;
    this.rowsProcessed = 0;
    this.rowsImported = 0;
    this.rowsSkipped = 0;
    this.autoFixedCount = 0;

    this.duplicateSummary = {
      duplicateQIDsSkipped: 0,
      duplicateQuestionsFlagged: 0
    };

    this.normalizationSummary = {
      unicodeCharsCleaned: 0,
      wordCharsReplaced: 0,
      difficultiesCorrected: 0,
      sectionsFormatted: 0,
      qidsAutoGenerated: 0,
      formulasSanitized: 0,
      answersParsed: 0
    };

    this.validationSummary = {
      missingQuestionsSkipped: 0,
      missingOptionsSkipped: 0,
      invalidCorrectAnswersSkipped: 0,
      duplicateOptionsFlagged: 0
    };

    this.warnings = [];
    this.errors = [];
  }

  addWarning(row, field, originalValue, fixedValue, message) {
    this.autoFixedCount++;
    this.warnings.push({
      row,
      field,
      originalValue: String(originalValue || ''),
      fixedValue: String(fixedValue || ''),
      message
    });
  }

  addError(row, field, value, reason) {
    this.rowsSkipped++;
    this.errors.push({
      row,
      field,
      value: String(value || ''),
      reason
    });
  }

  toReportObject(statusMessage = 'Import Completed') {
    this.executionTimeMs = Date.now() - this.startTimeMs;
    return {
      status: statusMessage,
      executionTimeMs: this.executionTimeMs,
      rowsProcessed: this.rowsProcessed,
      rowsImported: this.rowsImported,
      rowsSkipped: this.rowsSkipped,
      autoFixedCount: this.autoFixedCount,
      duplicateSummary: this.duplicateSummary,
      normalizationSummary: this.normalizationSummary,
      validationSummary: this.validationSummary,
      warnings: this.warnings,
      errors: this.errors
    };
  }
}

// 1. Encoding & Unicode Sanitization (BOM, Zero-Width, Control Characters)
function decodeCsvInput(input) {
  if (Buffer.isBuffer(input)) {
    if (input.length >= 2 && input[0] === 0xFF && input[1] === 0xFE) {
      return input.toString('utf16le');
    }
    if (input.length >= 2 && input[0] === 0xFE && input[1] === 0xFF) {
      const swapped = Buffer.allocUnsafe(input.length);
      for (let i = 0; i < input.length - 1; i += 2) {
        swapped[i] = input[i + 1];
        swapped[i + 1] = input[i];
      }
      return swapped.toString('utf16le');
    }
    return input.toString('utf8');
  }
  if (typeof input === 'string') {
    return input.replace(/^[\uFEFF\uFFFE]/, '');
  }
  return '';
}

function cleanUnicode(str, reportTracker) {
  if (str == null) return '';
  const original = String(str);
  const cleaned = original
    .replace(/[\uFEFF\uFFFE]/g, '') // BOM
    .replace(/\u200B/g, '') // Zero Width Space
    .replace(/\u00A0/g, ' ') // Non-breaking Space -> regular space
    .replace(/[\u200C\u200D\u200E\u200F\u202A-\u202E\u2060]/g, '') // Formatting & Directional
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ''); // Control characters except \t, \n, \r

  if (reportTracker && original !== cleaned) {
    reportTracker.normalizationSummary.unicodeCharsCleaned++;
  }
  return cleaned;
}

// 2. Replace Microsoft Word / Publisher special characters
function replaceWordChars(str, reportTracker) {
  if (str == null) return '';
  const original = String(str);
  const cleaned = original
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-') // Bullets -> -
    .replace(/[\u2013\u2014\u2015]/g, '-') // En-dash, Em-dash -> -
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"') // Smart double quotes -> "
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // Smart single quotes -> '
    .replace(/\u2026/g, '...'); // Ellipsis -> ...

  if (reportTracker && original !== cleaned) {
    reportTracker.normalizationSummary.wordCharsReplaced++;
  }
  return cleaned;
}

// 3. Security Sanitizers: CSV Formula Injection & XSS Payload Defense
function sanitizeCsvFormula(str, reportTracker) {
  if (typeof str !== 'string' || !str) return str;
  // If string starts with spreadsheet formula triggers (=, +, -, @, \t, \r)
  if (/^[=\+@\t\r]/.test(str)) {
    if (reportTracker) reportTracker.normalizationSummary.formulasSanitized++;
    return "'" + str;
  }
  return str;
}

function sanitizeXss(str) {
  if (typeof str !== 'string' || !str) return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript\s*:/gi, 'javascript_disabled:')
    .replace(/\bon\w+\s*=/gi, 'data-disabled-attr=');
}

function sanitizeTextCell(val, reportTracker) {
  if (val == null) return '';
  let str = String(val);
  str = cleanUnicode(str, reportTracker);
  str = replaceWordChars(str, reportTracker);
  str = sanitizeXss(str);
  str = sanitizeCsvFormula(str, reportTracker);
  // Restrict extreme field lengths to 50,000 characters to prevent DoS memory spikes
  if (str.length > 50000) {
    str = str.substring(0, 50000);
  }
  return str.trim();
}

// 4. Enterprise Header Canonicalization & Alias Resolver (Supports Moodle, Canvas LMS, Excel, ERP)
const CANONICAL_HEADERS = {
  section: 'Section',
  qid: 'QID',
  difficulty: 'Difficulty',
  question: 'Question',
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  correct: 'Correct',
  marks: 'Marks',
  negativemarks: 'NegativeMarks'
};

const HEADER_ALIASES_MAP = {
  qid: ['qid', 'q_id', 'question id', 'question_id', 'questionid', 'id', 'item id', 'question_number', 'qno', 'sr_no', 'sno'],
  section: ['section', 'section name', 'section_name', 'sec', 'category', 'group', 'subject', 'module'],
  difficulty: ['difficulty', 'level', 'diff', 'complexity', 'tier'],
  question: ['question', 'question text', 'question_text', 'questiontext', 'stmt', 'statement', 'question body', 'prompt', 'item_text'],
  a: ['a', 'option a', 'option_a', 'opt_a', 'opta', 'option1', 'option 1', 'choice a', 'choice 1', 'opt 1'],
  b: ['b', 'option b', 'option_b', 'opt_b', 'optb', 'option2', 'option 2', 'choice b', 'choice 2', 'opt 2'],
  c: ['c', 'option c', 'option_c', 'opt_c', 'optc', 'option3', 'option 3', 'choice c', 'choice 3', 'opt 3'],
  d: ['d', 'option d', 'option_d', 'opt_d', 'optd', 'option4', 'option 4', 'choice d', 'choice 4', 'opt 4'],
  correct: ['correct', 'correct answer', 'correct_answer', 'answer', 'ans', 'key', 'correct_option', 'right_answer', 'correct_key'],
  marks: ['marks', 'mark', 'score', 'weight', 'points', 'max_marks', 'positive_marks'],
  negativemarks: ['negativemarks', 'negative marks', 'negative_marks', 'neg_marks', 'negmarks', 'negative mark', 'penalty', 'minus_marks']
};

function normalizeHeaderName(rawHeader) {
  if (!rawHeader) return '';
  const cleaned = sanitizeTextCell(rawHeader, null);
  const normalizedKey = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [key, aliases] of Object.entries(HEADER_ALIASES_MAP)) {
    if (aliases.some(alias => alias.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey)) {
      return CANONICAL_HEADERS[key];
    }
  }
  return cleaned;
}

// 5. Difficulty normalizer (easy/medium/hard, difficult -> Hard)
function normalizeDifficulty(diffVal, rowNum, reportTracker) {
  const rawClean = sanitizeTextCell(diffVal, reportTracker);
  const clean = rawClean.toLowerCase();

  if (['easy', 'ez', '1', 'low'].includes(clean)) {
    if (rawClean !== 'Easy' && rawClean !== '') {
      reportTracker.addWarning(rowNum, 'Difficulty', rawClean, 'Easy', `Auto-corrected '${rawClean}' to 'Easy'`);
      reportTracker.normalizationSummary.difficultiesCorrected++;
    }
    return 'Easy';
  }
  if (['medium', 'med', 'normal', '2', 'moderate'].includes(clean)) {
    if (rawClean !== 'Medium' && rawClean !== '') {
      reportTracker.addWarning(rowNum, 'Difficulty', rawClean, 'Medium', `Auto-corrected '${rawClean}' to 'Medium'`);
      reportTracker.normalizationSummary.difficultiesCorrected++;
    }
    return 'Medium';
  }
  if (['hard', 'difficult', 'diff', 'complex', '3', 'high'].includes(clean)) {
    if (rawClean !== 'Hard') {
      reportTracker.addWarning(rowNum, 'Difficulty', rawClean, 'Hard', `Auto-corrected '${rawClean}' to 'Hard'`);
      reportTracker.normalizationSummary.difficultiesCorrected++;
    }
    return 'Hard';
  }

  reportTracker.addWarning(rowNum, 'Difficulty', rawClean, 'Medium', `Unrecognized difficulty '${rawClean}'. Defaulted to 'Medium'`);
  reportTracker.normalizationSummary.difficultiesCorrected++;
  return 'Medium';
}

// 6. Section name normalizer
function normalizeSection(secVal, rowNum, reportTracker) {
  const rawClean = sanitizeTextCell(secVal, reportTracker);
  if (!rawClean) {
    reportTracker.addWarning(rowNum, 'Section', secVal, 'General', "Section name empty. Defaulted to 'General'");
    reportTracker.normalizationSummary.sectionsFormatted++;
    return 'General';
  }

  let clean = rawClean.replace(/([a-zA-Z0-9])\(/g, '$1 (');
  clean = clean.replace(/\s+/g, ' ');

  if (rawClean !== clean) {
    reportTracker.addWarning(rowNum, 'Section', rawClean, clean, `Normalized section name formatting to '${clean}'`);
    reportTracker.normalizationSummary.sectionsFormatted++;
  }
  return clean;
}

// 7. Robust Multiline CSV Parser (CRLF, LF, CR, quotes, escaped quotes, multiline fields)
function parseCsvText(csvInput) {
  const str = decodeCsvInput(csvInput);
  if (!str) return [];

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      if (currentRow.some(cell => String(cell).trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(cell => String(cell).trim() !== '')) {
      rows.push(currentRow);
    }
  }
  return rows;
}

// 8. Row Normalization & Correct Answer Flexible Parsing
function parseCorrectAnswer(rawCorrect, reportTracker) {
  let clean = sanitizeTextCell(rawCorrect, reportTracker).toUpperCase();
  clean = clean.replace(/^OPTION\s+/, '').replace(/^CHOICE\s+/, '').replace(/^ANS:\s*/, '').replace(/^KEY:\s*/, '').trim();

  if (['1', 'A'].includes(clean)) {
    if (clean !== 'A' && reportTracker) reportTracker.normalizationSummary.answersParsed++;
    return 'A';
  }
  if (['2', 'B'].includes(clean)) {
    if (clean !== 'B' && reportTracker) reportTracker.normalizationSummary.answersParsed++;
    return 'B';
  }
  if (['3', 'C'].includes(clean)) {
    if (clean !== 'C' && reportTracker) reportTracker.normalizationSummary.answersParsed++;
    return 'C';
  }
  if (['4', 'D'].includes(clean)) {
    if (clean !== 'D' && reportTracker) reportTracker.normalizationSummary.answersParsed++;
    return 'D';
  }
  return clean;
}

function normalizeRow(rowObj, rowNum, headerMap, reportTracker) {
  const getCell = (canonicalField) => {
    for (const [rawKey, val] of Object.entries(rowObj)) {
      const mapped = headerMap[rawKey] || normalizeHeaderName(rawKey);
      if (mapped === canonicalField) {
        return val;
      }
    }
    return '';
  };

  const rawSection = getCell('Section');
  const rawQid = getCell('QID');
  const rawDifficulty = getCell('Difficulty');
  const rawQuestion = getCell('Question');
  const rawA = getCell('A');
  const rawB = getCell('B');
  const rawC = getCell('C');
  const rawD = getCell('D');
  const rawCorrect = getCell('Correct');
  const rawMarks = getCell('Marks');
  const rawNegativeMarks = getCell('NegativeMarks');

  const question = sanitizeTextCell(rawQuestion, reportTracker);
  const optA = sanitizeTextCell(rawA, reportTracker);
  const optB = sanitizeTextCell(rawB, reportTracker);
  const optC = sanitizeTextCell(rawC, reportTracker);
  const optD = sanitizeTextCell(rawD, reportTracker);
  const correct = parseCorrectAnswer(rawCorrect, reportTracker);

  if (rawQuestion && String(rawQuestion).trim() !== question) {
    reportTracker.addWarning(rowNum, 'Question', rawQuestion, question, 'Trimmed whitespace and cleaned formatting characters');
  }

  const section = normalizeSection(rawSection, rowNum, reportTracker);
  const difficulty = normalizeDifficulty(rawDifficulty, rowNum, reportTracker);

  let qid = sanitizeTextCell(rawQid, reportTracker);
  if (!qid) {
    qid = 'Q_' + rowNum + '_' + Math.random().toString(36).substring(2, 7);
    reportTracker.addWarning(rowNum, 'QID', '', qid, `Missing QID. Auto-generated QID '${qid}'`);
    reportTracker.normalizationSummary.qidsAutoGenerated++;
  }

  let marks = 1;
  if (rawMarks !== undefined && rawMarks !== null && String(rawMarks).trim() !== '') {
    const parsed = Number(String(rawMarks).trim());
    if (!isNaN(parsed) && parsed >= 0) {
      marks = parsed;
    } else {
      reportTracker.addWarning(rowNum, 'Marks', rawMarks, 1, `Invalid Marks value '${rawMarks}'. Defaulted to 1`);
    }
  }

  let negativeMarks = 0;
  if (rawNegativeMarks !== undefined && rawNegativeMarks !== null && String(rawNegativeMarks).trim() !== '') {
    const parsed = Number(String(rawNegativeMarks).trim());
    if (!isNaN(parsed) && parsed >= 0) {
      negativeMarks = parsed;
    }
  }

  return {
    rowNum,
    qid,
    section,
    difficulty,
    question,
    options: {
      A: optA,
      B: optB,
      C: optC,
      D: optD
    },
    correct,
    marks,
    negativeMarks,
    isDeleted: false
  };
}

// 9. Row Validation
function validateRow(normalizedRow, rowNum, seenQIDs, seenQuestions, reportTracker) {
  const errors = [];

  if (!normalizedRow.question) {
    errors.push('Missing Question text');
    reportTracker.validationSummary.missingQuestionsSkipped++;
  }

  if (!normalizedRow.options.A || !normalizedRow.options.B || !normalizedRow.options.C || !normalizedRow.options.D) {
    const missing = [];
    if (!normalizedRow.options.A) missing.push('A');
    if (!normalizedRow.options.B) missing.push('B');
    if (!normalizedRow.options.C) missing.push('C');
    if (!normalizedRow.options.D) missing.push('D');
    errors.push(`Missing option(s): ${missing.join(', ')}`);
    reportTracker.validationSummary.missingOptionsSkipped++;
  }

  if (!['A', 'B', 'C', 'D'].includes(normalizedRow.correct)) {
    errors.push(`Invalid Correct answer '${normalizedRow.correct}'. Must be A, B, C, or D`);
    reportTracker.validationSummary.invalidCorrectAnswersSkipped++;
  }

  if (seenQIDs.has(normalizedRow.qid)) {
    errors.push(`Duplicate QID '${normalizedRow.qid}' in import batch`);
    reportTracker.duplicateSummary.duplicateQIDsSkipped++;
  }

  if (errors.length > 0) {
    errors.forEach(reason => {
      reportTracker.addError(rowNum, 'RowValidation', normalizedRow.qid || 'N/A', `${reason}. Skipped.`);
    });
    return false;
  }

  // Check duplicate options warning
  const opts = [normalizedRow.options.A, normalizedRow.options.B, normalizedRow.options.C, normalizedRow.options.D];
  const uniqueOpts = new Set(opts);
  if (uniqueOpts.size < opts.length) {
    reportTracker.addWarning(rowNum, 'Options', '', '', `Duplicate option text detected within row options`);
    reportTracker.validationSummary.duplicateOptionsFlagged++;
  }

  if (seenQuestions.has(normalizedRow.question)) {
    reportTracker.addWarning(rowNum, 'Question', normalizedRow.question, normalizedRow.question, `Duplicate question text detected (QID: ${normalizedRow.qid})`);
    reportTracker.duplicateSummary.duplicateQuestionsFlagged++;
  } else {
    seenQuestions.add(normalizedRow.question);
  }

  seenQIDs.add(normalizedRow.qid);
  return true;
}

// 10. Legacy export compatibility helper
function normalizeCsvQuestion(q) {
  const reportTracker = new ImportReportTracker();
  return normalizeRow(q, 1, {}, reportTracker);
}

async function importCsvQuestions(data, sessionToken) {
  const reportTracker = new ImportReportTracker();

  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const mode = testPaperUtils.getStorageMode();
    const importMode = data.mode || data.importMode || "create_new";
    const questionModeRaw = data.questionMode || data.rawQuestionMode || "replace_all_questions";
    const testId = data.testId || data.TestID;
    const testData = data.testData || {};
    const isPreviewOnly = data.previewOnly === true || data.mode === 'preview';

    let rawRowsInput = [];
    let headerMap = {};

    // 1. Extract rows from raw CSV string OR array of objects
    if (typeof data.csvText === 'string' || typeof data.csvData === 'string' || typeof data.rawCsv === 'string' || Buffer.isBuffer(data.csvBuffer)) {
      const csvStr = data.csvText || data.csvData || data.rawCsv || data.csvBuffer;
      const parsedGrid = parseCsvText(csvStr);
      if (parsedGrid.length > 0) {
        const rawHeaders = parsedGrid[0];
        rawHeaders.forEach(h => {
          headerMap[h] = normalizeHeaderName(h);
        });
        for (let i = 1; i < parsedGrid.length; i++) {
          const rowArr = parsedGrid[i];
          const rowObj = {};
          rawHeaders.forEach((h, colIdx) => {
            rowObj[h] = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
          });
          rawRowsInput.push({ rowNum: i + 1, data: rowObj });
        }
      }
    } else if (Array.isArray(data.questions) && data.questions.length > 0) {
      const sample = data.questions[0] || {};
      Object.keys(sample).forEach(k => {
        headerMap[k] = normalizeHeaderName(k);
      });
      data.questions.forEach((q, idx) => {
        rawRowsInput.push({ rowNum: idx + 2, data: q });
      });
    }

    reportTracker.rowsProcessed = rawRowsInput.length;

    if (rawRowsInput.length === 0) {
      return {
        success: false,
        error: 'No CSV rows received or parsed',
        report: reportTracker.toReportObject('Failed: No Data')
      };
    }

    // Protect against oversized upload DoS (> 20,000 questions per batch)
    if (rawRowsInput.length > 20000) {
      return {
        success: false,
        error: 'CSV row limit exceeded (Maximum 20,000 questions per batch)',
        report: reportTracker.toReportObject('Import Aborted: Oversized Batch')
      };
    }

    // 2. Normalize and Validate each row (fault-tolerant loop)
    const validQuestions = [];
    const seenQIDs = new Set();
    const seenQuestions = new Set();

    rawRowsInput.forEach(({ rowNum, data: rowObj }) => {
      try {
        const normalized = normalizeRow(rowObj, rowNum, headerMap, reportTracker);
        const isValid = validateRow(normalized, rowNum, seenQIDs, seenQuestions, reportTracker);
        if (isValid) {
          validQuestions.push(normalized);
        }
      } catch (rowErr) {
        reportTracker.addError(rowNum, 'RowException', 'N/A', `Unhandled row error: ${rowErr.message}. Skipped.`);
      }
    });

    reportTracker.rowsImported = validQuestions.length;

    if (validQuestions.length === 0) {
      return {
        success: false,
        error: 'No valid questions passed validation',
        report: reportTracker.toReportObject('Import Failed: No Valid Rows')
      };
    }

    // 3. PREVIEW MODE HANDLER (Return validated output without MongoDB write)
    if (isPreviewOnly) {
      const reportObj = reportTracker.toReportObject('Preview Generation Completed');
      return {
        success: true,
        previewOnly: true,
        testId: testId || 'PREVIEW',
        mode: importMode,
        questionMode: questionModeRaw,
        questionCount: validQuestions.length,
        previewQuestions: validQuestions.slice(0, 50),
        report: reportObj
      };
    }

    // 4. Update / Create Test Paper in MongoDB
    let finalTestId;
    let finalQuestions;
    let sectionNames = [];
    let existingTestPaper = null;

    const validQuestionModes = ['replace_all_questions', 'append_questions', 'upsert_by_qid'];
    const questionMode = validQuestionModes.includes(questionModeRaw) ? questionModeRaw : 'replace_all_questions';

    if (importMode === 'create_new') {
      finalTestId = 'T' + uuidv4().slice(0, 8);
      sectionNames = testData.Sections?.map(s => s.name || s) || [...new Set(validQuestions.map(q => q.section))];
      finalQuestions = validQuestions;
    } else {
      if (!testId) throw new Error('Test ID is required for update mode');
      existingTestPaper = await TestPaper.findOne({ TestID: testId });
      if (!existingTestPaper) {
        const converted = await testPaperUtils.convertLegacyToTestPaper(testId);
        if (!converted) throw new Error('Existing test paper not found');
        existingTestPaper = await TestPaper.findOne({ TestID: testId });
      }
      finalTestId = testId;

      if (testData) {
        if (testData.Name || testData.name) existingTestPaper.meta.name = testData.Name || testData.name;
        if (testData.Date || testData.date) existingTestPaper.meta.date = testData.Date || testData.date;
        if (testData.StartTime || testData.startTime) existingTestPaper.meta.startTime = testData.StartTime || testData.startTime;
        if (testData.ExpiryTime || testData.expiryTime) existingTestPaper.meta.expiryTime = testData.ExpiryTime || testData.expiryTime;
        if (testData.Duration || testData.duration) existingTestPaper.meta.duration = testData.Duration || testData.duration;
        if (testData.Mode || testData.mode) existingTestPaper.meta.mode = testData.Mode || testData.mode;
        if (testData.ExamType || testData.examType) existingTestPaper.meta.examType = testData.ExamType || testData.examType;
        if (testData.QuickResult !== undefined || testData.quickResult !== undefined) {
          existingTestPaper.meta.quickResult = testData.QuickResult !== undefined ? testData.QuickResult : testData.quickResult;
        }
        if (testData.liveLeaderboardEnabled !== undefined) existingTestPaper.meta.liveLeaderboardEnabled = testData.liveLeaderboardEnabled;
        if (testData.Sections || testData.sections) {
          sectionNames = (testData.Sections || testData.sections).map(s => s.name || s);
        }
      }

      if (!sectionNames.length) {
        sectionNames = existingTestPaper.sections.map(s => s.name);
      }

      const existingNonDeleted = existingTestPaper.questions.filter(q => !q.isDeleted);
      const existingQids = new Set(existingNonDeleted.map(q => q.qid));

      if (questionMode === 'replace_all_questions') {
        finalQuestions = validQuestions;
      } else if (questionMode === 'append_questions') {
        const duplicateQids = validQuestions.filter(q => existingQids.has(q.qid)).map(q => q.qid);
        if (duplicateQids.length > 0) {
          throw new Error(`Duplicate QIDs found in existing test: ${duplicateQids.join(', ')}. Use upsert mode.`);
        }
        finalQuestions = [...existingNonDeleted, ...validQuestions];
      } else if (questionMode === 'upsert_by_qid') {
        const existingMap = new Map(existingNonDeleted.map(q => [q.qid, q]));
        validQuestions.forEach(q => {
          existingMap.set(q.qid, q);
        });
        finalQuestions = Array.from(existingMap.values());
      }
    }

    const { stats, sections } = testPaperUtils.calculateStatsAndSections(finalQuestions, sectionNames);

    if (importMode === 'create_new') {
      await TestPaper.create({
        TestID: finalTestId,
        meta: {
          name: testData.Name || testData.name || 'CSV Imported Test',
          date: testData.Date || testData.date || new Date().toISOString().split('T')[0],
          startTime: testData.StartTime || testData.startTime || '00:00',
          expiryTime: testData.ExpiryTime || testData.expiryTime || '23:59',
          duration: testData.Duration || testData.duration || 60,
          mode: testData.Mode || testData.mode || 'online',
          examType: testData.ExamType || testData.examType || 'standard',
          quickResult: testData.QuickResult !== undefined ? testData.QuickResult : (testData.quickResult || false),
          liveLeaderboardEnabled: testData.liveLeaderboardEnabled !== false,
          answerKeyPublished: false,
          answerKeyPublishedAt: null,
          isDeleted: false,
          deletedAt: null
        },
        sections,
        questions: finalQuestions,
        stats
      });

      if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.LEGACY) {
        await Test.create({
          TestID: finalTestId,
          Name: testData.Name || testData.name || 'CSV Imported Test',
          Date: testData.Date || testData.date || new Date().toISOString().split('T')[0],
          StartTime: testData.StartTime || testData.startTime || '00:00',
          EndTime: testData.ExpiryTime || testData.expiryTime || '23:59',
          Duration: testData.Duration || testData.duration || 60,
          Sections: JSON.stringify(sections),
          Mode: testData.Mode || testData.mode || 'online',
          ExpiryTime: testData.ExpiryTime || testData.expiryTime || '23:59',
          ExamType: testData.ExamType || testData.examType || 'standard',
          QuickResult: testData.QuickResult !== undefined ? testData.QuickResult : (testData.quickResult || false),
          LiveLeaderboardEnabled: testData.liveLeaderboardEnabled !== false,
          IsDeleted: false
        });

        const legacyBulkOps = finalQuestions.map(q => ({
          updateOne: {
            filter: { TestID: finalTestId, QID: q.qid },
            update: {
              $set: {
                TestID: finalTestId,
                Section: q.section,
                QID: q.qid,
                Difficulty: q.difficulty,
                Question: q.question,
                A: q.options.A,
                B: q.options.B,
                C: q.options.C,
                D: q.options.D,
                Correct: q.correct,
                Marks: q.marks,
                NegativeMarks: q.negativeMarks,
                IsDeleted: false
              }
            },
            upsert: true
          }
        }));
        if (legacyBulkOps.length > 0) {
          await Question.bulkWrite(legacyBulkOps, { ordered: false });
        }
      }
    } else {
      existingTestPaper.sections = sections;
      existingTestPaper.questions = finalQuestions;
      existingTestPaper.stats = stats;
      await existingTestPaper.save();

      if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.LEGACY) {
        const legacyTest = await Test.findOne({ TestID: finalTestId });
        if (legacyTest) {
          if (testData?.name) legacyTest.Name = testData.name;
          if (testData?.date) legacyTest.Date = testData.date;
          if (testData?.startTime) legacyTest.StartTime = testData.startTime;
          if (testData?.expiryTime) legacyTest.ExpiryTime = testData.expiryTime;
          if (testData?.duration) legacyTest.Duration = testData.duration;
          if (testData?.mode) legacyTest.Mode = testData.mode;
          if (testData?.examType) legacyTest.ExamType = testData.examType;
          await legacyTest.save();
        }

        await Question.deleteMany({ TestID: finalTestId });
        const legacyBulkOps = finalQuestions.map(q => ({
          insertOne: {
            document: {
              TestID: finalTestId,
              Section: q.section,
              QID: q.qid,
              Difficulty: q.difficulty,
              Question: q.question,
              A: q.options.A,
              B: q.options.B,
              C: q.options.C,
              D: q.options.D,
              Correct: q.correct,
              Marks: q.marks,
              NegativeMarks: q.negativeMarks,
              IsDeleted: false
            }
          }
        }));
        if (legacyBulkOps.length > 0) {
          await Question.bulkWrite(legacyBulkOps, { ordered: false });
        }
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'importCsvQuestions',
      UserID: 'admin',
      TestID: finalTestId,
      Details: `CSV import ${importMode}: ${validQuestions.length} questions imported, ${reportTracker.rowsSkipped} skipped, ${reportTracker.autoFixedCount} auto-fixed`
    });

    const reportObj = reportTracker.toReportObject('Import Completed Successfully');

    const response = {
      success: true,
      testId: finalTestId,
      mode: importMode,
      questionMode,
      questionCount: finalQuestions.length,
      stats,
      report: reportObj
    };

    console.log('[CSV IMPORT COMPLETED REPORT]', JSON.stringify(reportObj, null, 2));

    return response;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'importCsvQuestions',
      Error: err.message
    });
    return {
      success: false,
      error: err.message,
      report: reportTracker.toReportObject(`Import Aborted: ${err.message}`)
    };
  }
}

async function sendExamNotification(req, data = {}) {
  try {
    const query = req?.query || {};
    const testId = data.testId || data.TestID || query.testId || query.TestID;
    const details = data.details || query.details || '';
    const filters = data.filters || query.filters || {};

    if (!testId) {
      return { success: false, error: 'Test ID is required' };
    }

    let testPaper = await TestPaper.findOne({ TestID: testId }).lean();
    if (!testPaper) {
      const converted = await testPaperUtils.convertLegacyToTestPaper(testId);
      if (converted) testPaper = converted;
    }

    if (!testPaper) {
      return { success: false, error: 'Test not found' };
    }

    const legacyTest = testPaperUtils.convertTestPaperToLegacyTest(testPaper);
    const test = {
      ...legacyTest,
      College: legacyTest.College || testPaper.College || testPaper.meta?.college,
      Department: legacyTest.Department || testPaper.Department || testPaper.meta?.department,
      Year: legacyTest.Year || testPaper.Year || testPaper.meta?.year
    };

    const userQuery = {
      Role: { $regex: /^student$/i },
      Status: { $regex: /^active$/i },
      IsDeleted: { $ne: true },
      Email: { $exists: true, $nin: [null, ''] },
      ExamNotifications: { $ne: false }
    };

    const college = filters.college || filters.College || test.College || test.college;
    const department = filters.department || filters.Department || test.Department || test.department;
    const year = filters.year || filters.Year || test.Year || test.year;

    if (college) userQuery.College = college;
    if (department) userQuery.Department = department;
    if (year) userQuery.Year = year;

    const users = await User.find(userQuery).select('UserID Email FullName').lean();

    const seenEmails = new Set();
    const recipients = users.filter((user) => {
      const email = String(user.Email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    });

    if (recipients.length === 0) {
      return { success: false, error: 'No eligible candidates found for this notification' };
    }

    let sentCount = 0;
    let failedCount = 0;
    const failedEmails = [];

    for (const user of recipients) {
      const emailResult = await sendExamNotificationEmail(user, test, details);
      if (emailResult.success) {
        sentCount++;
        await User.updateOne({ UserID: user.UserID }, { LastExamNotification: new Date() });
      } else {
        failedCount++;
        if (failedEmails.length < 10) {
          failedEmails.push(user.Email);
        }
      }
    }

    console.log(`[EXAM NOTIFICATION] Test ${testId}: sent ${sentCount}/${recipients.length}`);

    return {
      success: true,
      message: 'Exam notification completed',
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      failedEmails,
      count: sentCount
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'sendExamNotification',
      Error: err.message
    });
    return { success: false, error: err.message || 'Failed to send exam notification' };
  }
}

module.exports = {
  getAllTests,
  createTest,
  updateTest,
  deleteTest,
  publishAnswerKey,
  getTestConfig,
  importCsvQuestions,
  sendExamNotification,
  parseCsvText,
  sanitizeTextCell,
  cleanUnicode,
  replaceWordChars,
  normalizeHeaderName,
  normalizeDifficulty,
  normalizeSection,
  normalizeRow,
  validateRow,
  ImportReportTracker
};