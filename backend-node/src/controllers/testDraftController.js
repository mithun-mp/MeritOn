const TestDraft = require('../models/TestDraft');
const Test = require('../models/Test');
const Question = require('../models/Question');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const { v4: uuidv4 } = require('uuid');
const testController = require('./testController');
const questionController = require('./questionController');

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
      IsDeleted: false,
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

    const draft = await TestDraft.findOne({ DraftID, IsDeleted: { $ne: true }, Status: 'DRAFT' });
    if (!draft) {
      return { success: false, error: 'Draft not found' };
    }

    const draftObj = draft.toObject();
    draftObj.TestData = draftObj.TestDataJSON || {};
    draftObj.Questions = draftObj.QuestionsJSON || [];
    delete draftObj.TestDataJSON;
    delete draftObj.QuestionsJSON;
    return draftObj;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getTestDraft',
      Error: err.message
    });
    return { success: false, error: 'Failed to get draft' };
  }
}

async function getTestDrafts(sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const drafts = await TestDraft.find({ IsDeleted: false, Status: 'DRAFT' }).sort({ UpdatedAt: -1 });
    return drafts.map(d => {
      const draftObj = d.toObject();
      draftObj.TestData = draftObj.TestDataJSON || {};
      draftObj.Questions = draftObj.QuestionsJSON || [];
      delete draftObj.TestDataJSON;
      delete draftObj.QuestionsJSON;
      return draftObj;
    });
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getTestDrafts',
      Error: err.message
    });
    return { success: false, error: 'Failed to get drafts' };
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

async function commitDraftToTest(DraftID, testId, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!DraftID) {
      return { success: false, error: 'Draft ID is required' };
    }
    if (!testId) {
      return { success: false, error: 'Test ID is required' };
    }

    const draft = await TestDraft.findOne({ DraftID, IsDeleted: false, Status: 'DRAFT' });
    if (!draft) {
      return { success: false, error: 'Draft not found or already finalized' };
    }

    // Extract test data and questions from draft
    const testData = draft.TestDataJSON || {};
    const questions = draft.QuestionsJSON || [];

    // Validate test data (basic)
    if (!testData.name) {
      return { success: false, error: 'Test name is required in draft' };
    }
    if (!testData.date) {
      return { success: false, error: 'Test date is required in draft' };
    }
    if (!testData.startTime) {
      return { success: false, error: 'Start time is required in draft' };
    }
    if (!testData.expiryTime) {
      return { success: false, error: 'Expiry time is required in draft' };
    }
    if (!testData.duration) {
      return { success: false, error: 'Duration is required in draft' };
    }

    // Try updating existing test first; if it doesn't exist, create a new test
    let targetTestId = testId;
    let testUpdateResult = await testController.updateTest(targetTestId, testData, sessionToken);

    if (!testUpdateResult.success) {
      // Create new test if update was not successful
      const createResult = await testController.createTest(testData, sessionToken);
      if (!createResult.success) {
        return { success: false, error: `Failed to create test: ${createResult.error}` };
      }
      targetTestId = createResult.testId;
    }

    // Add questions to the target test
    if (questions && questions.length > 0) {
      const questionsResult = await questionController.addQuestions(targetTestId, questions, sessionToken);
      if (!questionsResult.success) {
        await AuditLog.create({
          Timestamp: new Date(),
          Action: 'commitDraftToTest',
          UserID: 'admin',
          TestID: targetTestId,
          Details: `Draft committed but failed to add questions: ${questionsResult.error}`
        });
        return { success: false, error: `Test updated/created but failed to add questions: ${questionsResult.error}` };
      }
    }

    // Mark draft as published and committed
    draft.Status = 'PUBLISHED';
    draft.IsDeleted = true;
    draft.DeletedAt = new Date();
    draft.PublishedAt = new Date();
    draft.CommittedTestID = targetTestId;
    draft.UpdatedAt = new Date();
    await draft.save();

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'commitDraftToTest',
      UserID: 'admin',
      TestID: targetTestId,
      Details: 'Draft committed to test and draft removed'
    });

    return { success: true, DraftID, testId: targetTestId, committed: true };
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
  getTestDrafts,
  deleteTestDraft,
  commitDraftToTest
};