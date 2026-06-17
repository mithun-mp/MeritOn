const TestDraft = require('../models/TestDraft');
const Test = require('../models/Test');
const Question = require('../models/Question');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const { v4: uuidv4 } = require('uuid');

async function verifyAdminSession(sessionToken) {
  const Session = require('../models/Session');
  const session = await Session.findOne({ sessionToken });
  if (!session || session.role !== 'admin' || new Date() > session.expiresAt) {
    return false;
  }
  return true;
}

async function saveTestDraft(data, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    let { DraftID, DraftName, TestData, Questions } = data;

    if (!DraftID) {
      DraftID = 'DRAFT_' + uuidv4().replace(/-/g, '').slice(0, 13);
    }

    let draft = await TestDraft.findOne({ DraftID });

    const draftData = {
      DraftID,
      DraftName,
      TestDataJSON: TestData,
      QuestionsJSON: Questions,
      Status: 'DRAFT',
      UpdatedAt: new Date(),
      LastSavedAt: new Date()
    };

    if (draft) {
      await TestDraft.updateOne({ DraftID }, draftData);
    } else {
      await TestDraft.create(draftData);
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'saveTestDraft',
      UserID: 'admin',
      TestID: DraftID,
      Details: 'Test draft saved'
    });

    return { success: true, DraftID };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'saveTestDraft',
      Error: err.message
    });
    return { success: false, error: 'Failed to save draft' };
  }
}

async function getTestDraft(DraftID, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const draft = await TestDraft.findOne({ DraftID, IsDeleted: { $ne: true } });
    if (!draft) {
      return { success: false, error: 'Draft not found' };
    }

    return draft;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getTestDraft',
      Error: err.message
    });
    return { success: false, error: 'Failed to get draft' };
  }
}

async function deleteTestDraft(DraftID, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    await TestDraft.updateOne({ DraftID }, { IsDeleted: true, DeletedAt: new Date() });

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'deleteTestDraft',
      UserID: 'admin',
      TestID: DraftID,
      Details: 'Test draft deleted'
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'deleteTestDraft',
      Error: err.message
    });
    return { success: false, error: 'Failed to delete draft' };
  }
}

async function commitDraftToTest(DraftID, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const draft = await TestDraft.findOne({ DraftID });
    if (!draft) {
      return { success: false, error: 'Draft not found' };
    }

    // Create test
    const testData = draft.TestDataJSON;
    const testId = 'T' + uuidv4().slice(0, 8);

    await Test.create({
      TestID: testId,
      Name: testData.name,
      Date: testData.date,
      StartTime: testData.startTime,
      EndTime: testData.endTime,
      Duration: testData.duration,
      Sections: testData.sections,
      Mode: testData.mode,
      ExpiryTime: testData.expiryTime,
      ExamType: testData.examType || 'standard',
      QuickResult: testData.quickResult || false
    });

    // Add questions
    const questions = draft.QuestionsJSON || [];
    for (let q of questions) {
      await Question.create({
        TestID: testId,
        Section: q.section,
        QID: q.qid,
        Difficulty: q.difficulty,
        Question: q.question,
        A: q.a,
        B: q.b,
        C: q.c,
        D: q.d,
        Correct: q.correct,
        Marks: q.marks || 1,
        NegativeMarks: q.negativeMarks || 0
      });
    }

    // Update draft
    await TestDraft.updateOne(
      { DraftID },
      {
        Status: 'COMMITTED',
        CommittedTestID: testId,
        UpdatedAt: new Date()
      }
    );

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'commitDraftToTest',
      UserID: 'admin',
      TestID: testId,
      Details: 'Draft committed to test'
    });

    return { success: true, testId };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'commitDraftToTest',
      Error: err.message
    });
    return { success: false, error: 'Failed to commit draft' };
  }
}

module.exports = {
  saveTestDraft,
  getTestDraft,
  deleteTestDraft,
  commitDraftToTest
};
