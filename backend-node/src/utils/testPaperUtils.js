const TestPaper = require('../models/TestPaper');
const Test = require('../models/Test');
const Question = require('../models/Question');

const STORAGE_MODES = {
  LEGACY: 'legacy',
  OPTIMIZED: 'optimized',
  DUAL: 'dual'
};

const getStorageMode = () => {
  const mode = process.env.TEST_STORAGE_MODE || (process.env.NODE_ENV === 'production' ? STORAGE_MODES.OPTIMIZED : STORAGE_MODES.DUAL);
  return mode;
};

// Section Name Normalization (Logical Reasoning(Verbal) -> Logical Reasoning (Verbal))
const normalizeSectionName = (name) => {
  if (!name || typeof name !== 'string') return 'General';
  let clean = name.trim();
  clean = clean.replace(/([a-zA-Z0-9])\(/g, '$1 (');
  clean = clean.replace(/\s+/g, ' ');
  return clean || 'General';
};

// Difficulty Value Normalization (Difficult -> Hard)
const normalizeDifficultyValue = (val) => {
  if (!val || typeof val !== 'string') return 'Medium';
  const clean = val.trim().toLowerCase();
  if (['easy', 'ez', '1', 'low'].includes(clean)) return 'Easy';
  if (['medium', 'med', 'normal', '2', 'moderate'].includes(clean)) return 'Medium';
  if (['hard', 'difficult', 'diff', 'complex', '3', 'high'].includes(clean)) return 'Hard';
  return 'Medium';
};

const calculateStatsAndSections = (questions = [], sectionNames = []) => {
  const activeQuestions = questions.filter(q => !q.isDeleted);
  
  let totalMarks = 0;
  const difficultyCount = {
    Easy: 0,
    Medium: 0,
    Hard: 0
  };

  const questionsPerSection = {};
  const sectionsMap = {};

  sectionNames.forEach(rawName => {
    const canonical = normalizeSectionName(rawName);
    sectionsMap[canonical] = { name: canonical, count: 0, totalMarks: 0 };
    questionsPerSection[canonical] = 0;
  });

  activeQuestions.forEach(q => {
    const sectionName = normalizeSectionName(q.section);
    const difficulty = normalizeDifficultyValue(q.difficulty);
    const marks = Number(q.marks) || 0;

    q.section = sectionName;
    q.difficulty = difficulty;

    difficultyCount[difficulty] = (difficultyCount[difficulty] || 0) + 1;
    totalMarks += marks;

    if (!sectionsMap[sectionName]) {
      sectionsMap[sectionName] = { name: sectionName, count: 0, totalMarks: 0 };
    }
    sectionsMap[sectionName].count++;
    sectionsMap[sectionName].totalMarks += marks;
    questionsPerSection[sectionName] = (questionsPerSection[sectionName] || 0) + 1;
  });

  const totalQuestions = activeQuestions.length;
  const sectionCount = Object.keys(sectionsMap).length;
  const averageMarksPerQuestion = totalQuestions > 0 ? Number((totalMarks / totalQuestions).toFixed(2)) : 0;

  const difficultyPercentage = {
    Easy: totalQuestions > 0 ? Number(((difficultyCount.Easy / totalQuestions) * 100).toFixed(1)) : 0,
    Medium: totalQuestions > 0 ? Number(((difficultyCount.Medium / totalQuestions) * 100).toFixed(1)) : 0,
    Hard: totalQuestions > 0 ? Number(((difficultyCount.Hard / totalQuestions) * 100).toFixed(1)) : 0
  };

  const stats = {
    totalQuestions,
    totalMarks,
    sectionCount,
    questionsPerSection,
    difficultyCount,
    averageMarksPerQuestion,
    difficultyPercentage
  };

  const sections = Object.values(sectionsMap);

  return { stats, sections };
};

const convertLegacyToTestPaper = async (testId) => {
  const legacyTest = await Test.findOne({ TestID: testId });
  if (!legacyTest) return null;

  const legacyQuestions = await Question.find({ TestID: testId });

  const questions = legacyQuestions.map(q => ({
    qid: q.QID,
    section: normalizeSectionName(q.Section),
    difficulty: normalizeDifficultyValue(q.Difficulty),
    question: q.Question,
    options: {
      A: q.A,
      B: q.B,
      C: q.C,
      D: q.D
    },
    correct: q.Correct,
    marks: q.Marks,
    negativeMarks: q.NegativeMarks,
    isDeleted: q.IsDeleted,
    deletedAt: q.DeletedAt
  }));

  let sectionsArray = [];
  try {
    if (typeof legacyTest.Sections === 'string') {
      sectionsArray = JSON.parse(legacyTest.Sections);
    } else if (Array.isArray(legacyTest.Sections)) {
      sectionsArray = legacyTest.Sections;
    }
  } catch (e) {
    sectionsArray = [];
  }
  const sectionNames = sectionsArray.map(s => s.name || s);

  const { stats, sections } = calculateStatsAndSections(questions, sectionNames);

  const testPaper = {
    schemaVersion: 1,
    TestID: legacyTest.TestID,
    meta: {
      name: legacyTest.Name,
      date: legacyTest.Date,
      startTime: legacyTest.StartTime,
      expiryTime: legacyTest.ExpiryTime,
      duration: legacyTest.Duration,
      mode: legacyTest.Mode,
      examType: legacyTest.ExamType,
      quickResult: legacyTest.QuickResult,
      liveLeaderboardEnabled: legacyTest.LiveLeaderboardEnabled,
      answerKeyPublished: legacyTest.AnswerKeyPublished,
      answerKeyPublishedAt: legacyTest.AnswerKeyPublishedAt,
      isDeleted: legacyTest.IsDeleted,
      deletedAt: legacyTest.DeletedAt
    },
    sections,
    questions,
    stats
  };

  return testPaper;
};

const convertTestPaperToLegacyTest = (testPaper) => {
  return {
    TestID: testPaper.TestID,
    Name: testPaper.meta.name,
    Date: testPaper.meta.date,
    StartTime: testPaper.meta.startTime,
    EndTime: testPaper.meta.expiryTime,
    Duration: testPaper.meta.duration,
    Sections: JSON.stringify(testPaper.sections),
    Mode: testPaper.meta.mode,
    ExpiryTime: testPaper.meta.expiryTime,
    ExamType: testPaper.meta.examType,
    QuickResult: testPaper.meta.quickResult,
    IsDeleted: testPaper.meta.isDeleted,
    DeletedAt: testPaper.meta.deletedAt,
    AnswerKeyPublished: testPaper.meta.answerKeyPublished,
    AnswerKeyPublishedAt: testPaper.meta.answerKeyPublishedAt,
    LiveLeaderboardEnabled: testPaper.meta.liveLeaderboardEnabled,
    liveLeaderboardEnabled: testPaper.meta.liveLeaderboardEnabled !== false
  };
};

const calculateTestStatus = (test, now = new Date()) => {
  const testDate = new Date(test.Date || test.meta?.date);
  const startTimeStr = test.StartTime || test.meta?.startTime;
  const expiryTimeStr = test.ExpiryTime || test.meta?.expiryTime;
  
  if (!startTimeStr || !expiryTimeStr) return 'unknown';
  
  const [startHour, startMin] = startTimeStr.split(':').map(Number);
  const [expiryHour, expiryMin] = expiryTimeStr.split(':').map(Number);
  
  const startTime = new Date(testDate);
  startTime.setHours(startHour, startMin, 0, 0);
  
  const expiryTime = new Date(testDate);
  expiryTime.setHours(expiryHour, expiryMin, 0, 0);

  if (now >= startTime && now <= expiryTime) {
    return 'active';
  } else if (now < startTime) {
    return 'upcoming';
  } else {
    return 'ended';
  }
};

const buildCountdownData = (startTime, now = new Date()) => {
  const totalMilliseconds = startTime - now;
  return {
    days: Math.floor(totalMilliseconds / (1000 * 60 * 60 * 24)),
    hours: Math.floor((totalMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((totalMilliseconds % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((totalMilliseconds % (1000 * 60)) / 1000),
    totalMilliseconds
  };
};

const convertTestPaperToLegacyQuestions = (testPaper) => {
  return testPaper.questions.map(q => ({
    TestID: testPaper.TestID,
    Section: normalizeSectionName(q.section),
    QID: q.qid,
    Difficulty: normalizeDifficultyValue(q.difficulty),
    Question: q.question,
    A: q.options.A,
    B: q.options.B,
    C: q.options.C,
    D: q.options.D,
    Correct: q.correct,
    Marks: q.marks,
    NegativeMarks: q.negativeMarks,
    IsDeleted: q.isDeleted,
    DeletedAt: q.deletedAt,
    questionMedia: q.questionMedia || null,
    optionMedia: q.optionMedia || null
  }));
};

const getTestById = async (testId) => {
  const mode = getStorageMode();
  let testPaper = await TestPaper.findOne({ TestID: testId });
  
  if (!testPaper) {
    const converted = await convertLegacyToTestPaper(testId);
    if (converted) {
      testPaper = new TestPaper(converted);
    }
  }
  
  return testPaper;
};

const getAllTests = async () => {
  const mode = getStorageMode();
  
  let testPapers = await TestPaper.find({ 'meta.isDeleted': false });
  let legacyTests = [];
  
  if (mode !== STORAGE_MODES.OPTIMIZED) {
    legacyTests = await Test.find({ IsDeleted: false });
  }

  const existingTestIds = new Set(testPapers.map(tp => tp.TestID));
  for (const lt of legacyTests) {
    if (!existingTestIds.has(lt.TestID)) {
      const converted = await convertLegacyToTestPaper(lt.TestID);
      if (converted) {
        testPapers.push(new TestPaper(converted));
      }
    }
  }

  return testPapers.map(tp => {
    const lt = convertTestPaperToLegacyTest(tp);
    return lt;
  });
};

const getQuestions = async (testId) => {
  const mode = getStorageMode();
  let testPaper = await TestPaper.findOne({ TestID: testId });
  
  if (!testPaper) {
    const legacyQuestions = await Question.find({ TestID: testId, IsDeleted: false });
    return legacyQuestions;
  }

  const activeQuestions = testPaper.questions.filter(q => !q.isDeleted);
  return convertTestPaperToLegacyQuestions({ ...testPaper.toObject(), questions: activeQuestions });
};

module.exports = {
  STORAGE_MODES,
  getStorageMode,
  normalizeSectionName,
  normalizeDifficultyValue,
  calculateStatsAndSections,
  convertLegacyToTestPaper,
  convertTestPaperToLegacyTest,
  convertTestPaperToLegacyQuestions,
  getTestById,
  getAllTests,
  getQuestions,
  calculateTestStatus,
  buildCountdownData
};
