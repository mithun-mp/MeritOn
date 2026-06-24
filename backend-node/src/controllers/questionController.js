const Question = require('../models/Question');
const Test = require('../models/Test');
const TestPaper = require('../models/TestPaper');
const Session = require('../models/Session');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const testPaperUtils = require('../utils/testPaperUtils');

// Helper to verify admin session
async function verifyAdminSession(sessionToken) {
  if (!sessionToken) return false;
  const session = await Session.findOne({ sessionToken });
  if (!session || session.role !== 'admin' || new Date() > session.expiresAt) {
    return false;
  }
  return true;
}

// Helper to get question id from various possible fields
function getQuestionId(update) {
  return update.qid || update.QuestionID || update.QID || update.questionId;
}

// Helper to get updated data from update object
function getUpdatedData(update) {
  return update.updatedData || update;
}

async function getQuestions(testId, includeAnswers = false, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    let testPaper = await TestPaper.findOne({ TestID: testId });
    let legacyTest = await Test.findOne({ TestID: testId, IsDeleted: { $ne: true } });
    let answerKeyPublished = false;

    if (testPaper) {
      answerKeyPublished = testPaper.meta.answerKeyPublished;
    } else if (legacyTest) {
      answerKeyPublished = legacyTest.AnswerKeyPublished;
    }

    const shouldShowAnswers = includeAnswers && (isAdmin || answerKeyPublished);

    let questions = await testPaperUtils.getQuestions(testId);

    return questions.map(q => {
      if (!shouldShowAnswers) {
        delete q.Correct;
      }
      return q;
    });
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getQuestions',
      Error: err.message
    });
    throw err;
  }
}

async function getAnswers(testId) {
  try {
    let questions = await testPaperUtils.getQuestions(testId);
    const answers = {};
    questions.forEach(q => {
      answers[q.QID] = q.Correct;
    });
    return answers;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getAnswers',
      Error: err.message
    });
    throw err;
  }
}

async function addQuestions(testId, questions, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!testId) {
      return { success: false, error: 'Test ID is required' };
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return { success: false, error: 'Questions array is required' };
    }

    const mode = testPaperUtils.getStorageMode();

    const incomingIds = new Set();

    const normalizedIncoming = questions.map((q) => {
      const id = String(q.qid || q.QID || q.QuestionID || '').trim();

      if (!id) {
        throw new Error('New question missing qid');
      }

      if (incomingIds.has(id)) {
        throw new Error(`Duplicate question id in incoming batch: ${id}`);
      }

      incomingIds.add(id);

      const correct = String(q.correct || q.Correct || q.correctAnswer || '').trim().toUpperCase();

      if (!['A', 'B', 'C', 'D'].includes(correct)) {
        throw new Error(`Invalid correct option for QID ${id}`);
      }

      return {
        qid: id,
        section: String(q.section || q.Section || '').trim(),
        difficulty: String(q.difficulty || q.Difficulty || 'Medium').trim(),
        question: String(q.question || q.Question || ''),
        a: String(q.a || q.A || q.optionA || q.OptionA || ''),
        b: String(q.b || q.B || q.optionB || q.OptionB || ''),
        c: String(q.c || q.C || q.optionC || q.OptionC || ''),
        d: String(q.d || q.D || q.optionD || q.OptionD || ''),
        correct,
        marks: Number(q.marks ?? q.Marks ?? 1),
        negativeMarks: Number(q.negativeMarks ?? q.NegativeMarks ?? 0)
      };
    });

    for (const q of normalizedIncoming) {
      if (!q.section) throw new Error(`Question ${q.qid}: Missing section`);
      if (!q.question) throw new Error(`Question ${q.qid}: Missing question text`);
      if (!q.a || !q.b || !q.c || !q.d) throw new Error(`Question ${q.qid}: Missing one or more options`);
    }

    let testPaper = null;

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      testPaper = await TestPaper.findOne({ TestID: testId });

      if (!testPaper) {
        const converted = await testPaperUtils.convertLegacyToTestPaper(testId);
        if (converted) {
          testPaper = converted;
        } else {
          return { success: false, error: `TestPaper not found: ${testId}` };
        }
      }

      const existingIds = new Set(
        (testPaper.questions || [])
          .filter(q => !q.isDeleted)
          .map(q => String(q.qid || q.QID || q.QuestionID || '').trim())
          .filter(Boolean)
      );

      for (const id of incomingIds) {
        if (existingIds.has(id)) {
          return { success: false, error: `Duplicate question id already exists: ${id}` };
        }
      }
    }

    if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
      const existingLegacyQids = await Question.distinct('QID', {
        TestID: testId,
        IsDeleted: { $ne: true }
      });

      const legacySet = new Set(existingLegacyQids.map(id => String(id).trim()));

      for (const id of incomingIds) {
        if (legacySet.has(id)) {
          return { success: false, error: `Duplicate question id already exists: ${id}` };
        }
      }

      const questionsToCreate = normalizedIncoming.map(q => ({
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
        Marks: q.marks,
        NegativeMarks: q.negativeMarks,
        IsDeleted: false
      }));

      await Question.insertMany(questionsToCreate);
    }

    let beforeCount = null;
    let afterCount = null;

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      if (!testPaper) {
        testPaper = await TestPaper.findOne({ TestID: testId });
      }

      if (!testPaper) {
        return { success: false, error: `TestPaper not found: ${testId}` };
      }

      const newQuestions = normalizedIncoming.map(q => ({
        qid: q.qid,
        section: q.section,
        difficulty: q.difficulty,
        question: q.question,
        options: {
          A: q.a,
          B: q.b,
          C: q.c,
          D: q.d
        },
        correct: q.correct,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        isDeleted: false,
        deletedAt: null
      }));

      beforeCount = testPaper.questions.length;

      for (const q of newQuestions) {
        const duplicate = testPaper.questions.some(x =>
          !x.isDeleted &&
          String(x.qid || '').trim() === String(q.qid || '').trim()
        );

        if (duplicate) {
          return { success: false, error: `Duplicate question id already exists: ${q.qid}` };
        }

        testPaper.questions.push(q);
      }

      afterCount = testPaper.questions.length;

      if (afterCount !== beforeCount + newQuestions.length) {
        return { success: false, error: 'SAFETY ABORT: addQuestions count mismatch' };
      }

      const sectionNames = Array.from(new Set([
        ...(testPaper.sections || []).map(s => s.name),
        ...newQuestions.map(q => q.section)
      ].filter(Boolean)));

      const { stats, sections } = testPaperUtils.calculateStatsAndSections(testPaper.questions, sectionNames);

      testPaper.stats = stats;
      testPaper.sections = sections;

      testPaper.markModified('questions');
      testPaper.markModified('sections');
      testPaper.markModified('stats');

      await testPaper.save();
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'addQuestions',
      UserID: 'admin',
      TestID: testId,
      Details: `Added ${normalizedIncoming.length} questions`
    });

    return {
      success: true,
      added: normalizedIncoming.length,
      beforeCount,
      afterCount
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'addQuestions',
      Error: err.message
    });

    return {
      success: false,
      error: err.message || 'Failed to add questions'
    };
  }
}

async function updateQuestion(testId, qid, updatedData, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const mode = testPaperUtils.getStorageMode();

    if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
      const question = await Question.findOne({ TestID: testId, QID: qid });
      if (question) {
        const fieldMap = {
          section: 'Section',
          difficulty: 'Difficulty',
          question: 'Question',
          a: 'A',
          b: 'B',
          c: 'C',
          d: 'D',
          correct: 'Correct',
          marks: 'Marks',
          negativeMarks: 'NegativeMarks'
        };

        for (const key in updatedData) {
          const fieldName = fieldMap[key];
          if (fieldName) {
            let val = updatedData[key];
            if (['section', 'difficulty', 'correct'].includes(key)) {
              val = String(val || '').trim();
            } else {
              val = String(val || '');
            }
            question[fieldName] = val;
          }
        }
        await question.save();
      }
    }

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      const testPaper = await TestPaper.findOne({ TestID: testId });
      if (testPaper) {
        const index = testPaper.questions.findIndex(q => q.qid === qid);
        if (index !== -1) {
          const q = testPaper.questions[index];
          if (updatedData.section) q.section = updatedData.section;
          if (updatedData.difficulty) q.difficulty = updatedData.difficulty;
          if (updatedData.question) q.question = updatedData.question;
          if (updatedData.a) q.options.A = updatedData.a;
          if (updatedData.b) q.options.B = updatedData.b;
          if (updatedData.c) q.options.C = updatedData.c;
          if (updatedData.d) q.options.D = updatedData.d;
          if (updatedData.correct) q.correct = updatedData.correct;
          if (updatedData.marks) q.marks = updatedData.marks;
          if (updatedData.negativeMarks) q.negativeMarks = updatedData.negativeMarks;

          const sectionNames = testPaper.sections.map(s => s.name);
          const { stats, sections } = testPaperUtils.calculateStatsAndSections(testPaper.questions, sectionNames);
          testPaper.stats = stats;
          testPaper.sections = sections;
          await testPaper.save();
        }
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'updateQuestion',
      UserID: 'admin',
      TestID: testId,
      Details: `Updated question ${qid}`
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'updateQuestion',
      Error: err.message
    });
    return { success: false, error: 'Failed to update question' };
  }
}

async function deleteQuestion(testId, qid, sessionToken, permanent = false) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const mode = testPaperUtils.getStorageMode();

    if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
      if (permanent) {
        await Question.deleteOne({ TestID: testId, QID: qid });
      } else {
        const question = await Question.findOne({ TestID: testId, QID: qid });
        if (question) {
          question.IsDeleted = true;
          question.DeletedAt = new Date();
          await question.save();
        }
      }
    }

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      const testPaper = await TestPaper.findOne({ TestID: testId });
      if (testPaper) {
        const index = testPaper.questions.findIndex(q => q.qid === qid);
        if (index !== -1) {
          if (permanent) {
            testPaper.questions.splice(index, 1);
          } else {
            testPaper.questions[index].isDeleted = true;
            testPaper.questions[index].deletedAt = new Date();
          }
          const sectionNames = testPaper.sections.map(s => s.name);
          const { stats, sections } = testPaperUtils.calculateStatsAndSections(testPaper.questions, sectionNames);
          testPaper.stats = stats;
          testPaper.sections = sections;
          await testPaper.save();
        }
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'deleteQuestion',
      UserID: 'admin',
      TestID: testId,
      Details: `Deleted question ${qid} (permanent: ${permanent})`
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'deleteQuestion',
      Error: err.message
    });
    return { success: false, error: 'Failed to delete question' };
  }
}

async function bulkUpdateQuestions(data) {
  try {
    console.log('[bulkUpdateQuestions] incoming payload:', { testId: data.testId || data.TestID, updatesCount: data.updates?.length });

    const isAdmin = await verifyAdminSession(data.sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const testId = data.testId || data.TestID;
    if (!testId) {
      return { success: false, error: 'Test ID is required' };
    }

    const updates = data.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      return { success: false, error: 'Updates array is required and must not be empty' };
    }

    // Find TestPaper
    let testPaper = await TestPaper.findOne({ TestID: testId });
    if (!testPaper) {
      // Try to convert from legacy if not found
      const converted = await testPaperUtils.convertLegacyToTestPaper(testId);
      if (converted) {
        testPaper = converted;
      } else {
        return { success: false, error: `TestPaper not found: ${testId}` };
      }
    }
    console.log('[bulkUpdateQuestions] matched TestPaper:', testPaper.TestID);
    console.log('[bulkUpdateQuestions] incoming update qids:', updates.map(u => u.qid || u.QuestionID || u.QID || u.questionId));
    console.log('[bulkUpdateQuestions] stored question key sample:', testPaper.questions.slice(0, 3).map(q => ({
      QuestionID: q.QuestionID,
      QID: q.QID,
      id: q.id,
      _id: q._id,
      qid: q.qid,
      question: q.Question || q.question
    })));

    const originalQuestionCount = testPaper.questions.length;
    console.log('[bulkUpdateQuestions] original question count:', originalQuestionCount);

    const updatedCount = updates.length;
    const failedUpdates = [];

    for (const update of updates) {
      const qid = getQuestionId(update);
      if (!qid) {
        failedUpdates.push({ update, reason: 'Missing question ID' });
        continue;
      }

      const updatedData = getUpdatedData(update);
      // Find question in testPaper.questions with normalized string comparison
      const norm = (v) => v != null ? String(v).trim() : null;
      const normalizedQid = norm(qid);
      if (normalizedQid === null) {
        failedUpdates.push({ update, qid: qid || '', reason: 'Invalid question ID' });
        continue;
      }

      const index = testPaper.questions.findIndex(q => {
        const possible = [
          q.qid,
          q.QuestionID,
          q.QID,
          q.id,
          q._id
        ];
        return possible.some(val => val != null && String(val).trim() === normalizedQid);
      });

      if (index === -1) {
        failedUpdates.push({ update, qid, reason: 'Question not found in TestPaper' });
        continue;
      }

      const q = testPaper.questions[index];

      // Update fields with fallback to existing values
      if (!q.options) q.options = {};

      if (updatedData.question !== undefined || updatedData.Question !== undefined || updatedData.text !== undefined) {
        q.question = updatedData.question ?? updatedData.Question ?? updatedData.text ?? q.question;
      }
      if (updatedData.section !== undefined || updatedData.Section !== undefined) {
        q.section = updatedData.section ?? updatedData.Section ?? q.section;
      }
      if (updatedData.a !== undefined || updatedData.A !== undefined || updatedData.optionA !== undefined || updatedData.OptionA !== undefined) {
        q.options.A = updatedData.a ?? updatedData.A ?? updatedData.optionA ?? updatedData.OptionA ?? q.options.A;
      }
      if (updatedData.b !== undefined || updatedData.B !== undefined || updatedData.optionB !== undefined || updatedData.OptionB !== undefined) {
        q.options.B = updatedData.b ?? updatedData.B ?? updatedData.optionB ?? updatedData.OptionB ?? q.options.B;
      }
      if (updatedData.c !== undefined || updatedData.C !== undefined || updatedData.optionC !== undefined || updatedData.OptionC !== undefined) {
        q.options.C = updatedData.c ?? updatedData.C ?? updatedData.optionC ?? updatedData.OptionC ?? q.options.C;
      }
      if (updatedData.d !== undefined || updatedData.D !== undefined || updatedData.optionD !== undefined || updatedData.OptionD !== undefined) {
        q.options.D = updatedData.d ?? updatedData.D ?? updatedData.optionD ?? updatedData.OptionD ?? q.options.D;
      }
      if (updatedData.correct !== undefined || updatedData.correctAnswer !== undefined || updatedData.CorrectAnswer !== undefined) {
        q.correct = updatedData.correct ?? updatedData.correctAnswer ?? updatedData.CorrectAnswer ?? q.correct;
      }
      if (updatedData.difficulty !== undefined || updatedData.Difficulty !== undefined) {
        q.difficulty = updatedData.difficulty ?? updatedData.Difficulty ?? q.difficulty;
      }
      if (updatedData.marks !== undefined || updatedData.Marks !== undefined) {
        q.marks = Number(updatedData.marks ?? updatedData.Marks);
      }
      if (updatedData.negativeMarks !== undefined || updatedData.NegativeMarks !== undefined) {
        q.negativeMarks = Number(updatedData.negativeMarks ?? updatedData.NegativeMarks);
      }
      q.updatedAt = new Date();

      // Optional: mirror to legacy uppercase fields for compatibility
      q.Question = q.question;
      q.Section = q.section;
      q.OptionA = q.options.A;
      q.OptionB = q.options.B;
      q.OptionC = q.options.C;
      q.OptionD = q.options.D;
      q.CorrectAnswer = q.correct;
      q.Difficulty = q.difficulty;
      q.Marks = q.marks;
      q.NegativeMarks = q.negativeMarks;
    }

    // Safety check: ensure question count hasn't decreased (bulkUpdateQuestions does not delete)
    const newQuestionCount = testPaper.questions.length;
    if (newQuestionCount < originalQuestionCount) {
      console.error('[bulkUpdateQuestions] Safety check failed: question count decreased unexpectedly. Original:', originalQuestionCount, 'New:', newQuestionCount);
      await ErrorLog.create({
        Timestamp: new Date(),
        Function: 'bulkUpdateQuestions',
        Error: `Question count decreased from ${originalQuestionCount} to ${newQuestionCount} despite no deletions requested`
      });
      return { success: false, error: 'Failed to bulk update questions due to internal error' };
    }

    // Recalculate stats and sections
    const sectionNames = testPaper.sections.map(s => s.name);
    const { stats, sections } = testPaperUtils.calculateStatsAndSections(testPaper.questions, sectionNames);
    testPaper.stats = stats;
    testPaper.sections = sections;

    // Mark modified paths
    testPaper.markModified('questions');
    testPaper.markModified('sections');
    testPaper.markModified('stats');

    // Save TestPaper
    await testPaper.save();
    console.log('[bulkUpdateQuestions] saved TestPaper:', testPaper.TestID);

    // Optional: Update legacy Question collection for compatibility
    const mode = testPaperUtils.getStorageMode();
    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.LEGACY) {
      // Map TestPaper questions to legacy format
      const questionsToUpdate = testPaper.questions.map(q => ({
        TestID: testId,
        Section: q.section,
        QID: q.qid || q.QuestionID || q.qid || q.id || q._id.toString(),
        Difficulty: q.difficulty,
        Question: q.question,
        A: q.options.A,
        B: q.options.B,
        C: q.options.C,
        D: q.options.D,
        Correct: q.correct,
        Marks: q.marks,
        NegativeMarks: q.negativeMarks,
        IsDeleted: q.isDeleted || false
      }));

      // Update each legacy question
      for (const qData of questionsToUpdate) {
        await Question.findOneAndUpdate(
          { TestID: testId, QID: qData.QID },
          { ...qData, UpdatedAt: new Date() },
          { upsert: true, new: true }
        );
      }
    }

    const failedCount = failedUpdates.length;
    const success = failedCount === 0;

    if (!success) {
      console.log('[bulkUpdateQuestions] failed updates:', failedUpdates);
      return {
        success: false,
        error: `Some questions were not matched (${failedCount} failures)`,
        updated: updatedCount - failedCount,
        failed: failedUpdates,
        testId,
        source: 'TestPaper'
      };
    }

    return {
      success: true,
      updated: updatedCount,
      testId,
      source: 'TestPaper'
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'bulkUpdateQuestions',
      Error: err.message
    });
    return { success: false, error: 'Failed to bulk update questions' };
  }
}

module.exports = {
  getQuestions,
  getAnswers,
  addQuestions,
  updateQuestion,
  deleteQuestion,
  bulkUpdateQuestions
};