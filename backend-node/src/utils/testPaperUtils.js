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

const calculateStatsAndSections = (questions, sectionNames = []) => {
  const activeQuestions = questions.filter(q => !q.isDeleted);
  
  const stats = {
    totalQuestions: activeQuestions.length,
    totalMarks: 0,
    difficultyCount: {
      Easy: 0,
      Medium: 0,
      Hard: 0,
      Unknown: 0
    },
    sectionCount: {}
  };

  const sectionsMap = {};
  sectionNames.forEach(name => {
    sectionsMap[name] = { name, count: 0, totalMarks: 0 };
  });

  activeQuestions.forEach(q => {
    const difficulty = q.difficulty;
    if (stats.difficultyCount.hasOwnProperty(difficulty)) {
      stats.difficultyCount[difficulty]++;
    } else {
      stats.difficultyCount.Unknown++;
    }

    stats.totalMarks += q.marks;

    if (!sectionsMap[q.section]) {
      sectionsMap[q.section] = { name: q.section, count: 0, totalMarks: 0 };
    }
    sectionsMap[q.section].count++;
    sectionsMap[q.section].totalMarks += q.marks;
    stats.sectionCount[q.section] = (stats.sectionCount[q.section] || 0) + 1;
  });

  const sections = Object.values(sectionsMap);

  return { stats, sections };
};

const convertLegacyToTestPaper = async (testId) => {
  const legacyTest = await Test.findOne({ TestID: testId });
  if (!legacyTest) return null;

  const legacyQuestions = await Question.find({ TestID: testId });

  const questions = legacyQuestions.map(q => ({
    qid: q.QID,
    section: q.Section,
    difficulty: q.Difficulty,
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
  // Parse test date and times
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
    Section: q.section,
    QID: q.qid,
    Difficulty: q.difficulty,
    Question: q.question,
    A: q.options.A,
    B: q.options.B,
    C: q.options.C,
    D: q.options.D,
    Correct: q.correct,
    Marks: q.marks,
    NegativeMarks: q.negativeMarks,
    IsDeleted: q.isDeleted,
    DeletedAt: q.deletedAt
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
