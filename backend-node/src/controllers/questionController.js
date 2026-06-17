
const Question = require('../models/Question');
const Test = require('../models/Test');
const Session = require('../models/Session');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');

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
    const test = await Test.findOne({ TestID: testId, IsDeleted: { $ne: true } });
    
    // Only show answers if:
    // 1. User is admin OR
    // 2. Answer key is published
    const shouldShowAnswers = includeAnswers && (isAdmin || (test && test.AnswerKeyPublished));

    const query = { TestID: testId, IsDeleted: { $ne: true } };
    const questions = await Question.find(query);

    return questions.map(q => {
      const obj = q.toObject();
      if (!shouldShowAnswers) {
        delete obj.Correct;
      }
      return obj;
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
    const questions = await Question.find({ TestID: testId, IsDeleted: { $ne: true } });
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

    const question = await Question.findOne({ TestID: testId, QID: qid });
    if (!question) {
      return { success: false, error: 'Question not found' };
    }

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
