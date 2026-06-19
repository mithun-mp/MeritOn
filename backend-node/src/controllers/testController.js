
const Test = require('../models/Test');
const TestPaper = require('../models/TestPaper');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const { v4: uuidv4 } = require('uuid');
const testPaperUtils = require('../utils/testPaperUtils');
const examTimeUtils = require('../utils/examTimeUtils');

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

function normalizeCsvQuestion(q) {
  const question = q.Question || q.question;
  const correct = (q.Correct || q.correct)?.toUpperCase();
  const marks = q.Marks || q.marks || 1;
  const negativeMarks = q.NegativeMarks || q.negativeMarks || 0;
  const qid = (q.QID || q.qid || 'Q' + Date.now() + Math.random().toString(36).substr(2, 5)).toString();
  
  return {
    qid,
    section: (q.Section || q.section || 'General').toString(),
    difficulty: (q.Difficulty || q.difficulty || 'Medium').toString(),
    question: question.toString(),
    options: {
      A: (q.A || q.options?.A || '').toString(),
      B: (q.B || q.options?.B || '').toString(),
      C: (q.C || q.options?.C || '').toString(),
      D: (q.D || q.options?.D || '').toString()
    },
    correct,
    marks: Number(marks),
    negativeMarks: Number(negativeMarks),
    isDeleted: false
  };
}

async function importCsvQuestions(data, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const mode = testPaperUtils.getStorageMode();
    const { mode: importMode, questionMode, testId, testData, questions } = data;
    
    // Validate questions
    const normalizedQuestions = questions.map(q => normalizeCsvQuestion(q));
    normalizedQuestions.forEach(q => {
      if (!q.question.trim()) throw new Error('Question text is required');
      if (!q.options.A.trim() || !q.options.B.trim() || !q.options.C.trim() || !q.options.D.trim()) throw new Error('All options (A-D) are required');
      if (!['A', 'B', 'C', 'D'].includes(q.correct)) throw new Error('Correct answer must be A, B, C, or D');
    });

    let finalTestId;
    let finalQuestions;
    let sectionNames = [];

    if (importMode === 'create_new') {
      finalTestId = 'T' + uuidv4().slice(0, 8);
      sectionNames = testData.sections?.map(s => s.name || s) || [...new Set(normalizedQuestions.map(q => q.section))];
      finalQuestions = normalizedQuestions;
    } else {
      if (!testId) throw new Error('Test ID is required for update mode');
      
      const existingTestPaper = await TestPaper.findOne({ TestID: testId });
      if (!existingTestPaper) {
        const converted = await testPaperUtils.convertLegacyToTestPaper(testId);
        if (!converted) throw new Error('Test not found');
        throw new Error('Test found but not in TestPaper collection, please convert first');
      }

      finalTestId = testId;
      
      // Update test data if provided
      if (testData) {
        if (testData.name) existingTestPaper.meta.name = testData.name;
        if (testData.date) existingTestPaper.meta.date = testData.date;
        if (testData.startTime) existingTestPaper.meta.startTime = testData.startTime;
        if (testData.expiryTime) existingTestPaper.meta.expiryTime = testData.expiryTime;
        if (testData.duration) existingTestPaper.meta.duration = testData.duration;
        if (testData.mode) existingTestPaper.meta.mode = testData.mode;
        if (testData.examType) existingTestPaper.meta.examType = testData.examType;
        if (testData.quickResult !== undefined) existingTestPaper.meta.quickResult = testData.quickResult;
        if (testData.liveLeaderboardEnabled !== undefined) existingTestPaper.meta.liveLeaderboardEnabled = testData.liveLeaderboardEnabled;
        if (testData.sections) sectionNames = testData.sections.map(s => s.name || s);
      }
      
      if (!sectionNames.length) {
        sectionNames = existingTestPaper.sections.map(s => s.name);
      }

      // Handle question update modes
      if (questionMode === 'replace_all_questions') {
        finalQuestions = normalizedQuestions;
      } else if (questionMode === 'append_questions') {
        const existingNonDeleted = existingTestPaper.questions.filter(q => !q.isDeleted);
        finalQuestions = [...existingNonDeleted, ...normalizedQuestions];
      } else if (questionMode === 'upsert_by_qid') {
        // Upsert mode
        const existingMap = new Map(existingTestPaper.questions.filter(q => !q.isDeleted).map(q => [q.qid, q]));
        normalizedQuestions.forEach(q => {
          existingMap.set(q.qid, q);
        });
        finalQuestions = Array.from(existingMap.values());
      } else {
        throw new Error('Invalid question mode');
      }
    }

    const { stats, sections } = testPaperUtils.calculateStatsAndSections(finalQuestions, sectionNames);

    if (importMode === 'create_new') {
      // Create new TestPaper
      await TestPaper.create({
        TestID: finalTestId,
        meta: {
          name: testData.name,
          date: testData.date,
          startTime: testData.startTime,
          expiryTime: testData.expiryTime,
          duration: testData.duration,
          mode: testData.mode || 'online',
          examType: testData.examType || 'standard',
          quickResult: testData.quickResult || false,
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

      // Dual write to legacy if needed
      if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.LEGACY) {
        await Test.create({
          TestID: finalTestId,
          Name: testData.name,
          Date: testData.date,
          StartTime: testData.startTime,
          EndTime: testData.expiryTime,
          Duration: testData.duration,
          Sections: JSON.stringify(sections),
          Mode: testData.mode || 'online',
          ExpiryTime: testData.expiryTime,
          ExamType: testData.examType || 'standard',
          QuickResult: testData.quickResult || false,
          LiveLeaderboardEnabled: testData.liveLeaderboardEnabled !== false,
          IsDeleted: false
        });

        const legacyQuestions = finalQuestions.map(q => ({
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
        }));

        await Question.insertMany(legacyQuestions);
      }
    } else {
      // Update existing TestPaper
      const testPaper = await TestPaper.findOne({ TestID: finalTestId });
      testPaper.sections = sections;
      testPaper.questions = finalQuestions;
      testPaper.stats = stats;
      await testPaper.save();

      // Dual write to legacy if needed
      if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.LEGACY) {
        // Update legacy test
        const legacyTest = await Test.findOne({ TestID: finalTestId });
        if (legacyTest) {
          if (testData?.name) legacyTest.Name = testData.name;
          if (testData?.date) legacyTest.Date = testData.date;
          if (testData?.startTime) legacyTest.StartTime = testData.startTime;
          if (testData?.expiryTime) legacyTest.ExpiryTime = testData.expiryTime;
          if (testData?.endTime) legacyTest.EndTime = testData.endTime;
          if (testData?.duration) legacyTest.Duration = testData.duration;
          if (testData?.sections) legacyTest.Sections = JSON.stringify(sections);
          if (testData?.mode) legacyTest.Mode = testData.mode;
          if (testData?.examType) legacyTest.ExamType = testData.examType;
          if (testData?.quickResult !== undefined) legacyTest.QuickResult = testData.quickResult;
          if (testData?.liveLeaderboardEnabled !== undefined) legacyTest.LiveLeaderboardEnabled = testData.liveLeaderboardEnabled;
          await legacyTest.save();
        }

        // Update legacy questions
        await Question.deleteMany({ TestID: finalTestId });
        const legacyQuestions = finalQuestions.map(q => ({
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
        }));
        await Question.insertMany(legacyQuestions);
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'importCsvQuestions',
      UserID: 'admin',
      TestID: finalTestId,
      Details: `CSV import ${importMode} with ${normalizedQuestions.length} questions`
    });

    return {
      success: true,
      testId: finalTestId,
      mode: importMode,
      questionMode,
      questionCount: finalQuestions.length,
      stats
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'importCsvQuestions',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

module.exports = {
  getAllTests,
  createTest,
  updateTest,
  deleteTest,
  publishAnswerKey,
  getTestConfig,
  importCsvQuestions
};

