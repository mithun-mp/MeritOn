
const Test = require('../models/Test');
const TestPaper = require('../models/TestPaper');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const { v4: uuidv4 } = require('uuid');
const testPaperUtils = require('../utils/testPaperUtils');

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

    // Process each test like Code.gs does
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    const processedTests = tests.map(testObj => {
      const dateIST = new Date(new Date(testObj.Date).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      
      // Handle time strings (like "09:00")
      const parseTime = (timeStr) => {
        if (!timeStr) return new Date(dateIST);
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date(dateIST);
        d.setHours(h || 0, m || 0, 0, 0);
        return d;
      };

      const startTimeObj = parseTime(testObj.StartTime);
      const expiryTimeObj = parseTime(testObj.ExpiryTime || testObj.EndTime);
      const endTimeObj = parseTime(testObj.EndTime);

      const startStr = formatTime(startTimeObj);
      const expiryStr = formatTime(expiryTimeObj);
      const endStr = formatTime(endTimeObj);

      const startDisplay = formatTimeDisplay(startTimeObj);
      const expiryDisplay = formatTimeDisplay(expiryTimeObj);

      const [sh, sm] = startStr.split(':').map(Number);
      const [xh, xm] = expiryStr.split(':').map(Number);

      const start = new Date(dateIST);
      start.setHours(sh, sm, 0);

      const expiry = new Date(dateIST);
      expiry.setHours(xh, xm, 0);

      const canLogin = (now >= start && now <= expiry);

      return {
        ...testObj,
        status: now < start ? 'Upcoming' : (canLogin ? 'Available' : 'Closed'),
        canLogin,
        StartTime: startStr,
        ExpiryTime: expiryStr,
        StartTimeDisplay: startDisplay,
        ExpiryTimeDisplay: expiryDisplay,
        EndTime: endStr,
        Date: dateIST.toISOString().split('T')[0],
        liveLeaderboardEnabled: testObj.LiveLeaderboardEnabled !== false
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

module.exports = {
  getAllTests,
  createTest,
  updateTest,
  deleteTest,
  publishAnswerKey
};

