
const Test = require('../models/Test');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const { v4: uuidv4 } = require('uuid');

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
    const query = includeDeleted ? {} : { IsDeleted: { $ne: true } };
    const tests = await Test.find(query);

    // Process each test like Code.gs does
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    const processedTests = tests.map(test => {
      const testObj = test.toObject();
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

        const newTest = await Test.create({
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

        const test = await Test.findOne({ TestID: testId });
        if (!test) {
            return { success: false, error: 'Test not found' };
        }

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

    const test = await Test.findOne({ TestID: testId });
    if (!test) {
      return { success: false, error: 'Test not found' };
    }

    if (test.AnswerKeyPublished) {
      return { success: true, message: 'Answer key already published' };
    }

    test.AnswerKeyPublished = true;
    test.AnswerKeyPublishedAt = new Date();
    await test.save();

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

