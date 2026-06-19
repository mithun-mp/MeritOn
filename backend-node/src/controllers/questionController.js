
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

    for (const q of questions) {
      if (!['A', 'B', 'C', 'D'].includes(q.correct)) {
        return { success: false, error: `Invalid correct option for QID ${q.qid}` };
      }
    }

    const mode = testPaperUtils.getStorageMode();

    if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
      const questionsToCreate = questions.map(q => ({
        TestID: testId,
        Section: q.section,
        QID: q.qid,
        Difficulty: q.difficulty,
        Question: String(q.question || ''),
        A: String(q.a || ''),
        B: String(q.b || ''),
        C: String(q.c || ''),
        D: String(q.d || ''),
        Correct: q.correct,
        Marks: q.marks || 1,
        NegativeMarks: q.negativeMarks || 0,
        IsDeleted: false
      }));
      await Question.insertMany(questionsToCreate);
    }

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      const testPaper = await TestPaper.findOne({ TestID: testId });
      if (testPaper) {
        const newQuestions = questions.map(q => ({
          qid: q.qid,
          section: q.section,
          difficulty: q.difficulty,
          question: String(q.question || ''),
          options: {
            A: String(q.a || ''),
            B: String(q.b || ''),
            C: String(q.c || ''),
            D: String(q.d || '')
          },
          correct: q.correct,
          marks: q.marks || 1,
          negativeMarks: q.negativeMarks || 0,
          isDeleted: false,
          deletedAt: null
        }));

        const existingQids = new Set(testPaper.questions.map(q => q.qid));
        for (const q of newQuestions) {
          if (existingQids.has(q.qid)) {
            const index = testPaper.questions.findIndex(x => x.qid === q.qid);
            testPaper.questions[index] = q;
          } else {
            testPaper.questions.push(q);
          }
        }

        const sectionNames = testPaper.sections.map(s => s.name);
        const { stats, sections } = testPaperUtils.calculateStatsAndSections(testPaper.questions, sectionNames);
        testPaper.stats = stats;
        testPaper.sections = sections;
        await testPaper.save();
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'addQuestions',
      UserID: 'admin',
      TestID: testId,
      Details: `Added ${questions.length} questions`
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'addQuestions',
      Error: err.message
    });
    return { success: false, error: 'Failed to add questions' };
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

module.exports = {
  getQuestions,
  getAnswers,
  addQuestions,
  updateQuestion,
  deleteQuestion
};
