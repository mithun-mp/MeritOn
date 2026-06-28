const Question = require('../models/Question');
const Test = require('../models/Test');
const TestPaper = require('../models/TestPaper');
const Session = require('../models/Session');
const Performance = require('../models/Performance');
const SubmissionResult = require('../models/SubmissionResult');
const Response = require('../models/Response');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const testPaperUtils = require('../utils/testPaperUtils');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  secure: true
});

// Helper to check if Cloudinary is configured
function isCloudinaryConfigured() {
  return !!process.env.CLOUDINARY_URL;
}

// Helper to check if media object has a valid image URL
function hasMediaImage(media) {
  if (!media || typeof media !== 'object') {
    return false;
  }
  const url = media.url;
  if (!url || typeof url !== 'string') {
    return false;
  }
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return false;
  }
  // Reject dangerous schemes
  if (trimmedUrl.startsWith('data:image') || 
      trimmedUrl.startsWith('javascript:') || 
      trimmedUrl.startsWith('blob:')) {
    return false;
  }
  // Only allow http/https
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return false;
  }
  return true;
}

// Helper to check if question has valid content (text OR image)
function hasQuestionContent(question) {
  if (!question || typeof question !== 'object') {
    return false;
  }
  // Check text content
  const text = question.question || question.Question || '';
  if (text && typeof text === 'string' && text.trim()) {
    return true;
  }
  // Check media content
  const media = question.questionMedia || question.question_media;
  if (hasMediaImage(media)) {
    return true;
  }
  return false;
}

// Helper to check if option has valid content (text OR image)
function hasOptionContent(optionText, optionMedia) {
  // Check text content
  if (optionText && typeof optionText === 'string' && optionText.trim()) {
    return true;
  }
  // Check media content
  if (hasMediaImage(optionMedia)) {
    return true;
  }
  return false;
}

// Helper to normalize optionMedia keys to uppercase A/B/C/D
function normalizeOptionMediaKeys(optionMedia) {
  if (!optionMedia || typeof optionMedia !== 'object') {
    return {
      A: getDefaultMediaObject(),
      B: getDefaultMediaObject(),
      C: getDefaultMediaObject(),
      D: getDefaultMediaObject()
    };
  }

  const normalized = {
    A: getDefaultMediaObject(),
    B: getDefaultMediaObject(),
    C: getDefaultMediaObject(),
    D: getDefaultMediaObject()
  };

  // Map from various possible key formats to uppercase
  const keyMap = {
    'a': 'A', 'A': 'A',
    'b': 'B', 'B': 'B',
    'c': 'C', 'C': 'C',
    'd': 'D', 'D': 'D'
  };

  for (const [incomingKey, targetKey] of Object.entries(keyMap)) {
    if (incomingKey in optionMedia) {
      normalized[targetKey] = normalizeMediaObject(optionMedia[incomingKey]);
    }
  }

  // Also check for legacy separate field names
  const legacyFields = {
    'optionA_media': 'A',
    'optionAMedia': 'A',
    'optionB_media': 'B',
    'optionBMedia': 'B',
    'optionC_media': 'C',
    'optionCMedia': 'C',
    'optionD_media': 'D',
    'optionDMedia': 'D'
  };

  for (const [legacyKey, targetKey] of Object.entries(legacyFields)) {
    if (legacyKey in optionMedia) {
      normalized[targetKey] = normalizeMediaObject(optionMedia[legacyKey]);
    }
  }

  return normalized;
}

// Default media object
function getDefaultMediaObject() {
  return {
    type: 'none',
    url: '',
    publicId: '',
    alt: '',
    width: 0,
    height: 0,
    bytes: 0,
    format: '',
    provider: ''
  };
}

// Normalize media object (ensure it has the correct structure and default values)
function normalizeMediaObject(input) {
  if (!input || typeof input !== 'object') {
    return getDefaultMediaObject();
  }

  const defaultObj = getDefaultMediaObject();
  const normalized = { ...defaultObj };

  // Only allow known fields
  const allowedFields = ['type', 'url', 'publicId', 'alt', 'width', 'height', 'bytes', 'format', 'provider'];
  for (const field of allowedFields) {
    if (field in input && input[field] !== undefined) {
      normalized[field] = input[field];
    }
  }

  // Validate type
  if (!['none', 'image'].includes(normalized.type)) {
    normalized.type = 'none';
  }

  // If URL is empty or not a valid http/uvr, set type to none
  if (!normalized.url || typeof normalized.url !== 'string' || !/^https?:\/\//.test(normalized.url)) {
    normalized.type = 'none';
    normalized.url = '';
    normalized.publicId = '';
  } else {
    // Ensure type is image if URL is present and valid
    normalized.type = 'image';
  }

  // Ensure numeric fields are numbers
  const numericFields = ['width', 'height', 'bytes'];
  for (const field of numericFields) {
    if (typeof normalized[field] !== 'number' || isNaN(normalized[field])) {
      normalized[field] = 0;
    }
  }

  // Trim string fields and limit lengths
  if (typeof normalized.url === 'string') {
    normalized.url = normalized.url.trim();
    if (normalized.url.length > 1000) {
      normalized.url = '';
      normalized.type = 'none';
    }
  }
  if (typeof normalized.publicId === 'string') {
    normalized.publicId = normalized.publicId.trim();
    if (normalized.publicId.length > 300) {
      normalized.publicId = '';
    }
  }
  if (typeof normalized.alt === 'string') {
    normalized.alt = normalized.alt.trim();
    if (normalized.alt.length > 200) {
      normalized.alt = normalized.alt.substring(0, 200);
    }
  }
  if (typeof normalized.format === 'string') {
    normalized.format = normalized.format.trim();
  }

  return normalized;
}

// Normalize question media
function normalizeQuestionMedia(input) {
  return normalizeMediaObject(input);
}

// Normalize option media for a specific option (e.g., 'A')
function normalizeOptionMedia(input, optionLabel) {
  const normalized = normalizeMediaObject(input);
  // Optionally, we could auto-generate alt text here if empty, but we'll leave it to the frontend or later processing
  return normalized;
}

// Generate alt text for media based on role and text
function generateMediaAltText({ role, optionLabel, questionText, optionText }) {
  if (role === 'question') {
    if (questionText && questionText.trim()) {
      return questionText.trim().substring(0, 80);
    }
    return 'Question image';
  } else if (role === 'option') {
    if (optionText && optionText.trim()) {
      return `Option ${optionLabel}: ${optionText.trim().substring(0, 80)}`;
    }
    return `Option ${optionLabel} image`;
  }
  return '';
}

const ANSWER_FIELD_KEYS = [
  'Answer',
  'CorrectAnswer',
  'correctAnswer',
  'CorrectOption',
  'correctOption',
  'answer',
  'Correct',
  'correct',
  'explanation'
];

// Helper to verify admin session
async function verifyAdminSession(sessionToken) {
  if (!sessionToken) return false;
  const session = await Session.findOne({ sessionToken });
  if (!session || session.role !== 'admin' || new Date() > session.expiresAt) {
    return false;
  }
  return true;
}

function getSessionTokenFromReq(req) {
  if (!req) return null;
  const query = req.query || {};
  const body = req.body || req.parsedBody || {};
  return query.sessionToken || body.sessionToken || null;
}

function stripAnswerFields(question) {
  const stripped = { ...question };
  for (const key of ANSWER_FIELD_KEYS) {
    if (key in stripped) {
      delete stripped[key];
    }
  }
  return stripped;
}

async function isAnswerKeyPublishedForTest(testId) {
  if (!testId) return false;

  const testPaper = await TestPaper.findOne({ TestID: testId }).lean();
  if (testPaper) {
    return testPaper.meta?.answerKeyPublished === true;
  }

  const legacyTest = await Test.findOne({ TestID: testId, IsDeleted: { $ne: true } }).lean();
  if (legacyTest) {
    return legacyTest.AnswerKeyPublished === true || legacyTest.answerKeyPublished === true;
  }

  return false;
}

async function isAdminRequest(req) {
  const sessionToken = getSessionTokenFromReq(req);
  return verifyAdminSession(sessionToken);
}

async function resolveCandidateUserIds(req) {
  const ids = new Set();
  const sessionToken = getSessionTokenFromReq(req);

  if (sessionToken) {
    const session = await Session.findOne({ sessionToken });
    if (session && new Date() <= session.expiresAt && session.role !== 'admin') {
      if (session.userId) ids.add(String(session.userId));
      if (session.userID) ids.add(String(session.userID));
    }
  }

  if (req) {
    const query = req.query || {};
    const body = req.body || req.parsedBody || {};
    for (const key of ['userID', 'userId', 'UserID']) {
      if (query[key]) ids.add(String(query[key]));
      if (body[key]) ids.add(String(body[key]));
    }
  }

  return Array.from(ids);
}

async function hasCandidateSubmittedTest(req, testId) {
  const userIds = await resolveCandidateUserIds(req);
  if (!userIds.length || !testId) return false;

  for (const userID of userIds) {
    const submission = await SubmissionResult.findOne({ TestId: testId, userID }).lean();
    if (submission) return true;

    const performance = await Performance.findOne({ TestId: testId, userID }).lean();
    if (performance) return true;

    const responseDoc = await Response.findOne({ TestId: testId, userID }).lean();
    if (responseDoc) return true;
  }

  return false;
}

async function canReturnAnswers(req, testId) {
  if (await isAdminRequest(req)) return true;
  if (!(await isAnswerKeyPublishedForTest(testId))) return false;
  if (await hasCandidateSubmittedTest(req, testId)) return true;
  return false;
}

// Helper to get question id from various possible fields
function getQuestionId(update) {
  return update.qid || update.QuestionID || update.QID || update.questionId;
}

// Helper to get updated data from update object
function getUpdatedData(update) {
  return update.updatedData || update;
}

async function getQuestions(testId, includeAnswers = false, sessionToken, req = null) {
  try {
    const request = req || { query: { sessionToken, testId }, body: {} };
    if (!request.query.testId) request.query.testId = testId;
    if (!request.query.sessionToken && sessionToken) request.query.sessionToken = sessionToken;

    let questions = await testPaperUtils.getQuestions(testId);
    const questionList = questions.map(q => ({ ...q }));

    if (!includeAnswers) {
      return questionList.map(q => stripAnswerFields(q));
    }

    const allowed = await canReturnAnswers(request, testId);
    const mapped = questionList.map(q => (allowed ? q : stripAnswerFields(q)));
    mapped.answerKeyAvailable = allowed;
    if (!allowed) {
      mapped.message = 'Answer key is not available for this test yet';
    }
    return mapped;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getQuestions',
      Error: err.message
    });
    throw err;
  }
}

async function getAnswers(testId, req = null) {
  try {
    const request = req || { query: { testId }, body: {} };
    if (!request.query.testId) request.query.testId = testId;

    const allowed = await canReturnAnswers(request, testId);
    if (!allowed) {
      return { success: false, error: 'Answer key is not available for this test yet' };
    }

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

      // Normalize media fields
      const questionMedia = normalizeQuestionMedia(q.questionMedia || q.question_media || {});
      const optionMedia = normalizeOptionMediaKeys(q.optionMedia || {});

      return {
        qid: id,
        section: String(q.section || q.Section || '').trim(),
        difficulty: String(q.difficulty || q.Difficulty || 'Medium').trim(),
        question: String(q.question || q.Question || ''),
        questionMedia,
        a: String(q.a || q.A || q.optionA || q.OptionA || ''),
        b: String(q.b || q.B || q.optionB || q.OptionB || ''),
        c: String(q.c || q.C || q.optionC || q.OptionC || ''),
        d: String(q.d || q.D || q.optionD || q.OptionD || ''),
        optionMedia,
        correct,
        marks: Number(q.marks ?? q.Marks ?? 1),
        negativeMarks: Number(q.negativeMarks ?? q.NegativeMarks ?? 0)
      };
    });

    // Validate with content-aware checks (text OR image)
    for (const q of normalizedIncoming) {
      if (!q.section) throw new Error(`Question ${q.qid}: Missing section`);
      if (!hasQuestionContent(q)) throw new Error(`Question ${q.qid}: Missing question content (text or image)`);
      if (!hasOptionContent(q.a, q.optionMedia.A)) throw new Error(`Question ${q.qid}: Option A missing content (text or image)`);
      if (!hasOptionContent(q.b, q.optionMedia.B)) throw new Error(`Question ${q.qid}: Option B missing content (text or image)`);
      if (!hasOptionContent(q.c, q.optionMedia.C)) throw new Error(`Question ${q.qid}: Option C missing content (text or image)`);
      if (!hasOptionContent(q.d, q.optionMedia.D)) throw new Error(`Question ${q.qid}: Option D missing content (text or image)`);
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
        questionMedia: q.questionMedia,
        options: {
          A: q.a,
          B: q.b,
          C: q.c,
          D: q.d
        },
        optionMedia: q.optionMedia,
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

        // Handle media fields
        if (updatedData.questionMedia !== undefined) {
          question.questionMedia = normalizeQuestionMedia(updatedData.questionMedia);
        }
        if (updatedData.optionMedia !== undefined) {
          // Use the new normalizeOptionMediaKeys helper
          question.optionMedia = normalizeOptionMediaKeys(updatedData.optionMedia);
        } else {
          // If individual option media fields are provided (e.g., optionA_media)
          const optionFields = ['optionA_media', 'optionB_media', 'optionC_media', 'optionD_media'];
          const optionMap = { 'optionA_media': 'A', 'optionB_media': 'B', 'optionC_media': 'C', 'optionD_media': 'D' };
          let mediaChanged = false;
          const newOptionMedia = { ...question.optionMedia };
          for (const field of optionFields) {
            if (updatedData[field] !== undefined) {
              const opt = optionMap[field];
              newOptionMedia[opt] = normalizeOptionMedia(updatedData[field], opt);
              mediaChanged = true;
            }
          }
          if (mediaChanged) {
            question.optionMedia = newOptionMedia;
          }
        }

        // Validate question has content after update
        const questionObj = {
          question: question.Question,
          questionMedia: question.questionMedia
        };
        if (!hasQuestionContent(questionObj)) {
          throw new Error(`Question ${qid}: Missing question content (text or image) after update`);
        }

        // Validate options have content after update
        if (!hasOptionContent(question.A, question.optionMedia?.A)) {
          throw new Error(`Question ${qid}: Option A missing content (text or image) after update`);
        }
        if (!hasOptionContent(question.B, question.optionMedia?.B)) {
          throw new Error(`Question ${qid}: Option B missing content (text or image) after update`);
        }
        if (!hasOptionContent(question.C, question.optionMedia?.C)) {
          throw new Error(`Question ${qid}: Option C missing content (text or image) after update`);
        }
        if (!hasOptionContent(question.D, question.optionMedia?.D)) {
          throw new Error(`Question ${qid}: Option D missing content (text or image) after update`);
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
          if (updatedData.questionMedia) q.questionMedia = normalizeQuestionMedia(updatedData.questionMedia);
          if (updatedData.a) q.options.A = updatedData.a;
          if (updatedData.b) q.options.B = updatedData.b;
          if (updatedData.c) q.options.C = updatedData.c;
          if (updatedData.d) q.options.D = updatedData.d;
          if (updatedData.correct) q.correct = updatedData.correct;
          if (updatedData.marks) q.marks = updatedData.marks;
          if (updatedData.negativeMarks) q.negativeMarks = updatedData.negativeMarks;

          // Handle option media
          if (updatedData.optionmedia) {
            // Use the new normalizeOptionMediaKeys helper
            q.optionmedia = normalizeOptionMediaKeys(updatedData.optionmedia);
          } else {
            // Handle individual option media fields
            const optionFields = ['optiona_media', 'optionb_media', 'optionc_media', 'optiond_media'];
            const optionMap = { 'optiona_media': 'A', 'optionb_media': 'B', 'optionc_media': 'C', 'optiond_media': 'D' };
            let mediaChanged = false;
            for (const field of optionFields) {
              if (updatedData[field] !== undefined) {
                const opt = optionMap[field];
                q.optionmedia[opt] = normalizeOptionMedia(updatedData[field], opt);
                mediaChanged = true;
              }
            }
          }

          // Validate question has content after update
          const questionObj = {
            question: q.question,
            questionMedia: q.questionMedia
          };
          if (!hasQuestionContent(questionObj)) {
            throw new Error(`Question ${qid}: Missing question content (text or image) after update`);
          }

          // Validate options have content after update
          if (!hasOptionContent(q.options.A, q.optionmedia?.A)) {
            throw new Error(`Question ${qid}: Option A missing content (text or image) after update`);
          }
          if (!hasOptionContent(q.options.B, q.optionmedia?.B)) {
            throw new Error(`Question ${qid}: Option B missing content (text or image) after update`);
          }
          if (!hasOptionContent(q.options.C, q.optionmedia?.C)) {
            throw new Error(`Question ${qid}: Option C missing content (text or image) after update`);
          }
          if (!hasOptionContent(q.options.D, q.optionmedia?.D)) {
            throw new Error(`Question ${qid}: Option D missing content (text or image) after update`);
          }

          const sectionNames = testPaper.sectionnames.map(s => s.name);
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
      const question = await Question.findOne({ TestID: testId, QID: qid });
      if (question) {
        if (permanent) {
          await question.remove();
        } else {
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
          const q = testPaper.questions[index];
          if (permanent) {
            testPaper.questions.splice(index, 1);
          } else {
            q.isDeleted = true;
            q.deletedAt = new Date();
          }

          const sectionNames = testPaper.sectionnames.map(s => s.name);
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

async function bulkUpdateQuestions(testId, questions, sessionToken) {
  // We need to capture the original question count for safety check
  let originalQuestionCount = 0;
  let testPaper = null;

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

    // Get the current test paper to determine original count and for updates
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
      originalQuestionCount = testPaper.questions.length;
    } else {
      // For LEGACY mode, we don't need the test paper for the update itself, but we need it for the safety check?
      // Actually, in LEGACY mode, we update the Question collection directly.
      // We can get the count from the Question collection.
      const count = await Question.countDocuments({ TestID: testId, IsDeleted: { $ne: true } });
      originalQuestionCount = count;
    }

    const incomingIds = new Set();

    // Normalize incoming questions, including media fields
    const normalizedIncoming = questions.map((q) => {
      const id = String(q.qid || q.QID || q.QuestionID || '').trim();

      if (!id) {
        throw new Error('Question missing qid');
      }

      if (incomingIds.has(id)) {
        throw new Error(`Duplicate question id in incoming batch: ${id}`);
      }

      incomingIds.add(id);

      const correct = String(q.correct || q.Correct || q.correctAnswer || '').trim().toUpperCase();

      if (!['A', 'B', 'C', 'D'].includes(correct)) {
        throw new Error(`Invalid correct option for QID ${id}`);
      }

      // Normalize media fields
      const questionMedia = normalizeQuestionMedia(q.questionMedia || q.question_media || {});
      const optionMedia = normalizeOptionMediaKeys(q.optionMedia || {});

      return {
        qid: id,
        section: String(q.section || q.Section || '').trim(),
        difficulty: String(q.difficulty || q.Difficulty || 'Medium').trim(),
        question: String(q.question || q.Question || ''),
        questionMedia,
        a: String(q.a || q.A || q.optionA || q.OptionA || ''),
        b: String(q.b || q.B || q.optionB || q.OptionB || ''),
        c: String(q.c || q.C || q.optionC || q.OptionC || ''),
        d: String(q.d || q.D || q.optionD || q.OptionD || ''),
        optionMedia,
        correct,
        marks: Number(q.marks ?? q.Marks ?? 1),
        negativeMarks: Number(q.negativeMarks ?? q.NegativeMarks ?? 0)
      };
    });

    // Validate with content-aware checks (text OR image)
    for (const q of normalizedIncoming) {
      if (!q.section) throw new Error(`Question ${q.qid}: Missing section`);
      if (!hasQuestionContent(q)) throw new Error(`Question ${q.qid}: Missing question content (text or image)`);
      if (!hasOptionContent(q.a, q.optionMedia.A)) throw new Error(`Question ${q.qid}: Option A missing content (text or image)`);
      if (!hasOptionContent(q.b, q.optionMedia.B)) throw new Error(`Question ${q.qid}: Option B missing content (text or image)`);
      if (!hasOptionContent(q.c, q.optionMedia.C)) throw new Error(`Question ${q.qid}: Option C missing content (text or image)`);
      if (!hasOptionContent(q.d, q.optionMedia.D)) throw new Error(`Question ${q.qid}: Option D missing content (text or image)`);
    }

    // Process based on mode
    if (mode === testPaperUtils.STORAGE_MODES.LEGACY || mode === testPaperUtils.STORAGE_MODES.DUAL) {
      // Update legacy Question collection
      const questionsToUpdate = normalizedIncoming.map(q => ({
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
        Negativemarks: q.negativeMarks,
        IsDeleted: false
      }));

      // Use bulkWrite for efficiency
      const updateOperations = questionsToUpdate.map(q => ({
        updateOne: {
          filter: { TestID: testId, QID: q.qid },
          update: { $set: q },
          upsert: true
        }
      }));

      await Question.bulkWrite(updateOperations);
    }

    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      if (!testPaper) {
        testPaper = await TestPaper.findOne({ TestID: testId });
      }

      if (!testPaper) {
        return { success: false, error: `TestPaper not found: ${testId}` };
      }

      // Update each question in the TestPaper's questions array
      for (const incoming of normalizedIncoming) {
        const index = testPaper.questions.findIndex(q => q.qid === incoming.qid);
        if (index !== -1) {
          const q = testPaper.questions[index];
          q.section = incoming.section;
          q.difficulty = incoming.difficulty;
          q.question = incoming.question;
          q.questionmedia = incoming.questionmedia;
          q.options.A = incoming.a;
          q.options.B = incoming.b;
          q.options.C = incoming.c;
          q.options.D = incoming.d;
          q.optionmedia = incoming.optionmedia;
          q.correct = incoming.correct;
          q.marks = incoming.marks;
          q.negativemarks = incoming.negativemarks;
          q.updatedat = new Date();
        } else {
          // If the question doesn't exist, we should insert it? But bulkUpdateQuestions is for updating existing.
          // According to the original function, it does not insert new ones. We'll skip insertion here.
          // However, the original function only updates existing ones and returns an error if not found?
          // Let's check the original: it only updated if found, and did not insert.
          // We'll follow the same: only update existing.
          // But note: the original function did not throw an error for missing qid, it just skipped.
          // We'll do the same.
        }
      }

      // Recalculate stats and sections
      const sectionnames = Array.from(new Set([
        ...(testPaper.sectionnames || []).map(s => s.name),
        ...normalizedincoming.map(q => q.section)
      ].filter(Boolean)));

      const { stats, sections } = testPaperUtils.calculateStatsAndSections(testPaper.questions, sectionnames);
      testpaper.stats = stats;
      testpaper.sections = sections;

      // Mark modified and save
      testpaper.markmodified('questions');
      testpaper.markmodified('sections');
      testpaper.markmodified('stats');

      await testpaper.save();
    }

    // Safety check: ensure question count hasn't decreased (bulkUpdateQuestions does not delete)
    let newquestioncount = 0;
    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
      newquestioncount = testpaper.questions.length;
    } else {
      newquestioncount = await Question.countDocuments({ TestID: testId, IsDeleted: { $ne: true } });
    }

    if (newquestioncount < originalquestioncount) {
      console.error('[bulkupdatequestions] Safety check failed: question count decreased unexpectedly. Original:', originalquestioncount, 'New:', newquestioncount);
      await ErrorLog.create({
        Timestamp: new Date(),
        Function: 'bulkupdatequestions',
        Error: `Question count decreased from ${originalquestioncount} to ${newquestioncount} despite no deletions requested`
      });
      return { success: false, error: 'Failed to bulk update questions due to internal error' };
    }

    // Optional: Update legacy Question collection for compatibility (if in DUAL or LEGACY mode)
    if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED || mode === testPaperUtils.STORAGE_MODES.LEGACY) {
      // Map current questions to legacy format (we need to get the current state)
      let legacyquestions = [];
      if (mode === testPaperUtils.STORAGE_MODES.DUAL || mode === testPaperUtils.STORAGE_MODES.OPTIMIZED) {
        // Use the updated testPaper
        if (!testpaper) {
          testpaper = await TestPaper.findOne({ TestID: testId });
        }
        legacyquestions = testpaper.questions.map(q => ({
          TestID: testId,
          Section: q.section,
          QID: q.qid || q.questionid || q.qid || q.id || q._id.tostring(),
          Difficulty: q.difficulty,
          Question: q.question,
          A: q.options.A,
          B: q.options.B,
          C: q.options.C,
          D: q.options.D,
          Correct: q.correct,
          Marks: q.marks,
          Negativemarks: q.negativemarks,
          IsDeleted: q.isdeleted || false
        }));
      } else {
        // LEGACY mode: we already updated the Question collection, so we can fetch them
        const freshquestions = await Question.find({ TestID: testId, IsDeleted: { $ne: true } });
        legacyquestions = freshquestions.map(q => ({
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
          Negativemarks: q.negativemarks,
          IsDeleted: q.isdeleted
        }));
      }

      // Update each legacy question
      for (const qdata of legacyquestions) {
        await Question.findoneandupdate(
          { TestID: testId, QID: qdata.qid },
          { ...qdata, Updatedat: new Date() },
          { upsert: true, new: true }
        );
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'bulkupdatequestions',
      UserID: 'admin',
      TestID: testId,
      Details: `Bulk updated ${normalizedincoming.length} questions`
    });

    return {
      success: true,
      updated: normalizedincoming.length,
      testid: testid,
      source: 'testpaper'
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'bulkupdatequestions',
      Error: err.message
    });
    return { success: false, error: 'Failed to bulk update questions' };
  }
}

// New function: upload question image
async function uploadQuestionImage(req) {
  try {
    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      return { success: false, error: 'Image upload is not configured.' };
    }

    // Check if file exists
    if (!req.file) {
      return { success: false, error: 'No file uploaded.' };
    }

    // Get parameters from request
    const mediaRole = req.body.mediaRole;
    const testId = req.body.testId;
    const qid = req.body.qid;
    const alt = req.body.alt;

    // Validate mediaRole
    if (!mediaRole || !['question', 'optionA', 'optionB', 'optionC', 'optionD'].includes(mediaRole)) {
      return { success: false, error: 'Invalid media role. Must be one of: question, optionA, optionB, optionC, optionD.' };
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return { success: false, error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' };
    }

    // Validate file size based on role
    let maxSize;
    if (mediaRole === 'question') {
      maxSize = parseInt(process.env.CLOUDINARY_MAX_QUESTION_IMAGE_BYTES) || 1048576; // 1MB default
    } else {
      maxSize = parseInt(process.env.CLOUDINARY_MAX_OPTION_IMAGE_BYTES) || 716800; // 700KB default
    }

    if (req.file.size > maxSize) {
      return { success: false, error: `File size exceeds the limit of ${maxSize} bytes for ${mediaRole}.` };
    }

    // Determine folder based on testId or draft
    let folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'meriton/question-media';
    if (testId) {
      folder += `/${testId}`;
    } else {
      folder += '/draft';
    }
    if (qid) {
      folder += `/${qid}`;
    }

    // Generate a unique public ID
    const filename = req.file.originalname;
    const publicId = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

    // Upload to Cloudinary using a promise-based wrapper
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          public_id: publicId,
          resource_type: 'image',
          use_filename: false,
          unique_filename: true,
          overwrite: false,
          quality: 'auto',
          fetch_format: 'auto'
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      stream.end(req.file.buffer);
    });

    // Prepare the media object
    let finalAlt = alt;
    if (!finalAlt) {
      // Generate from filename if no alt provided
      const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      if (mediaRole === 'question') {
        finalAlt = `Question image: ${filenameWithoutExt}`;
      } else {
        const optionLetter = mediaRole.charAt(mediaRole.length - 1).toUpperCase();
        finalAlt = `Option ${optionLetter} image: ${filenameWithoutExt}`;
      }
    }

    // Truncate alt to 200 characters
    if (finalAlt && finalAlt.length > 200) {
      finalAlt = finalAlt.substring(0, 200);
    }

    const mediaObject = {
      type: 'image',
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      alt: finalAlt,
      width: uploadResult.width || 0,
      height: uploadResult.height || 0,
      bytes: uploadResult.bytes || 0,
      format: uploadResult.format || '',
      provider: 'cloudinary'
    };

    return {
      success: true,
      media: mediaObject
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'uploadQuestionImage',
      Error: err.message
    });
    return { success: false, error: 'Image upload failed. Please try a smaller JPG, PNG, or WebP image.' };
  }
}

module.exports = {
  getQuestions,
  getAnswers,
  addQuestions,
  updateQuestion,
  deleteQuestion,
  bulkUpdateQuestions,
  uploadQuestionImage
};