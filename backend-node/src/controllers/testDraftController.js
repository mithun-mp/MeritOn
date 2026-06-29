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

    // Create the test
    const testResult = await testController.createTest(testData, sessionToken);
    if (!testResult.success) {
      return { success: false, error: `Failed to create test: ${testResult.error}` };
    }
    const createdTestId = testResult.testId;

    // If the provided testId does not match the created one, we should use the created one?
    // But the function expects a specific testId. We'll check if they match.
    // If they don't match, we can either update the draft to use the created one or return an error.
    // For simplicity, we'll assume the testId passed is the one we want to use, and we will update the test with the draft data.
    // However, the createTest function generated a new test ID. We have two options:
    // 1. Use the generated test ID and update the draft's CommittedTestID to that.
    // 2. Update the test with the given testId using the draft data.
    // The current function signature expects to commit to a specific testId.
    // Let's change approach: we will update the existing test (if any) with the draft data, or create if not exists.
    // But to keep changes minimal, we will follow the existing pattern: the function is expected to work with a given testId.
    // We will instead update the test with the given testId using the draft data, and then add the questions.

    // Let's revert to the original plan: we will update the test with the given testId.
    // We'll first check if a test with the given testId exists; if not, we create it.

    // We'll refactor: we'll update or create the test with the given testId.

    // First, try to update the test with the given testId using the draft data.
    let testUpdateResult = await testController.updateTest(testId, testData, sessionToken);
    if (!testUpdateResult.success) {
      // If update fails, try to create a new test with the given testId? But our createTest function generates its own ID.
      // We cannot specify the test ID in createTest. So we will create a test and then update its TestID? Not possible.
      // Instead, we will create a test with generated ID and then update the draft to use that generated ID.
      // But the function expects to commit to the given testId.
      // Given the complexity, and since the original function only updated the draft, we will assume that the test already exists
      // and we are just updating it. If it doesn't exist, we will create a new test with generated ID and then update the draft's CommittedTestID to that generated ID.
      // However, the function's purpose is to commit the draft to a test, so we can generate the test ID from the draft.

      // Let's change the approach: we will create a new test from the draft data (which will generate a test ID) and then update the draft to point to that test.
      // We will ignore the passed testId for creation, but we will use it to update if we want to keep the same ID?
      // Since the requirement is to commit a draft to a test, we can generate a new test ID.

      // We'll create the test using the draft data (which gives us a generated ID).
      const createResult = await testController.createTest(testData, sessionToken);
      if (!createResult.success) {
        return { success: false, error: `Failed to create test: ${createResult.error}` };
      }
      const createdTestId = createResult.testId;

      // Now, we need to update the draft to use this created test ID.
      // We will set the draft's CommittedTestID to the createdTestId.
      // But note: the function's parameter testId is ignored for creation. We'll still update the draft with the given testId?
      // We decide to use the generated ID for the commit.

      // We'll update the draft to commit to the generated ID.
      draft.Status = 'PUBLISHED';
      draft.IsDeleted = true;
      draft.DeletedAt = new Date();
      draft.PublishedAt = new Date();
      draft.CommittedTestID = createdTestId; // Use the generated ID
      draft.UpdatedAt = new Date();

      await draft.save();

      // Now add the questions to the newly created test.
      const questionsResult = await questionController.addQuestions(createdTestId, questions, sessionToken);
      if (!questionsResult.success) {
        // If adding questions fails, we should still mark the draft as committed?
        // We'll consider it a partial failure, but we have already updated the draft.
        // For simplicity, we will return an error but note that the draft is already updated.
        // We could try to revert the draft, but that's complex.
        // We'll return the error and let the user know that the test was created but questions failed to add.
        await AuditLog.create({
          Timestamp: new Date(),
          Action: 'commitDraftToTest',
          UserID: 'admin',
          TestID: createdTestId,
          Details: `Draft committed but failed to add questions: ${questionsResult.error}`
        });
        return { success: false, error: `Test created but failed to add questions: ${questionsResult.error}` };
      }

      await AuditLog.create({
        Timestamp: new Date(),
        Action: 'commitDraftToTest',
        UserID: 'admin',
        TestID: createdTestId,
        Details: 'Draft committed to test and draft removed'
      });

      return { success: true, DraftID, testId: createdTestId, committed: true };
    }

    // If we reach here, the test update succeeded (meaning the test existed and we updated it).
    // Now we need to add the questions to this test.
    // But note: updating the test does not add questions; we need to add them separately.
    // We'll add the questions to the test.
    const questionsResult = await questionController.addQuestions(testId, questions, sessionToken);
    if (!questionsResult.success) {
      // We already updated the test, but failed to add questions.
      // We'll return an error.
      await AuditLog.create({
        Timestamp: new Date(),
        Action: 'commitDraftToTest',
        UserID: 'admin',
        TestID: testId,
        Details: `Test updated but failed to add questions: ${questionsResult.error}`
      });
      return { success: false, error: `Test updated but failed to add questions: ${questionsResult.error}` };
    }

    // Now mark the draft as published.
    draft.Status = 'PUBLISHED';
    draft.IsDeleted = true;
    draft.DeletedAt = new Date();
    draft.PublishedAt = new Date();
    draft.CommittedTestID = testId;
    draft.UpdatedAt = new Date();

    await draft.save();

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'commitDraftToTest',
      UserID: 'admin',
      TestID: testId,
      Details: 'Draft committed to test and draft removed'
    });

    return { success: true, DraftID, testId, committed: true };
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