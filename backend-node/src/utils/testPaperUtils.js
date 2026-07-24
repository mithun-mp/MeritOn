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

// Extended Unicode & String Clean-up Helper (Feature 5)
const cleanExtendedUnicodeString = (str) => {
  if (typeof str !== 'string') return '';
  let clean = str;
  clean = clean.replace(/[\u200B\uFEFF\uFFFD\u00A0]/g, ' ');
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return clean.trim().replace(/\s+/g, ' ');
};

// Section Name Normalization (Logical Reasoning(Verbal) -> Logical Reasoning (Verbal))
const normalizeSectionName = (name) => {
  if (!name || typeof name !== 'string') return 'General';
  let clean = cleanExtendedUnicodeString(name);
  clean = clean.replace(/([a-zA-Z0-9])\(/g, '$1 (');
  clean = clean.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  clean = clean.replace(/\s+/g, ' ');

  const lower = clean.toLowerCase();
  if (lower.includes('logical') && lower.includes('reasoning') && lower.includes('verbal')) {
    return 'Logical Reasoning (Verbal)';
  }
  if (lower.includes('logical') && lower.includes('reasoning') && (lower.includes('non') || lower.includes('non-verbal'))) {
    return 'Logical Reasoning (Non-Verbal)';
  }
  if (lower.includes('quantitative') || lower.includes('quant')) {
    return 'Quantitative Aptitude';
  }
  if (lower.includes('verbal') && (lower.includes('ability') || lower.includes('english'))) {
    return 'Verbal Ability';
  }

  return clean.replace(/\b\w+/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
};

// Difficulty Value Normalization (Difficult, difficulty-hard -> Hard)
const normalizeDifficultyValue = (val) => {
  if (!val || typeof val !== 'string') return 'Medium';
  const clean = cleanExtendedUnicodeString(val).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['easy', 'ez', '1', 'low'].includes(clean)) return 'Easy';
  if (['medium', 'med', 'normal', '2', 'moderate'].includes(clean)) return 'Medium';
  if (['hard', 'difficult', 'diff', 'complex', '3', 'high', 'difficultyhard'].includes(clean)) return 'Hard';
  return 'Medium';
};

// Correct Answer Normalizer (a -> A)
const normalizeCorrectAnswer = (ans) => {
  if (!ans || typeof ans !== 'string') return '';
  const clean = cleanExtendedUnicodeString(ans).toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(clean) ? clean : '';
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

// Comprehensive CSV Import Analysis Engine (Feature 3 & Feature 4)
const generateCsvAnalysis = (questionsRaw = []) => {
  const warnings = [];
  const errors = [];
  let encodingIssuesCount = 0;
  let unicodeIssuesCount = 0;

  const normalizedQuestions = [];
  const qidSet = new Set();
  const duplicateQIDs = new Set();
  const questionTextSet = new Set();
  const duplicateQuestionTexts = new Set();

  let missingCorrectAnswersCount = 0;
  let blankQuestionsCount = 0;
  let blankOptionsCount = 0;

  questionsRaw.forEach((q, idx) => {
    const rowNum = idx + 1;
    const rawQid = String(q.qid || q.QID || `Q${rowNum}`);
    const rawSection = String(q.section || q.Section || 'General');
    const rawDifficulty = String(q.difficulty || q.Difficulty || 'Medium');
    const rawQuestion = String(q.question || q.Question || '');
    const rawOptA = String(q.options?.A || q.A || '');
    const rawOptB = String(q.options?.B || q.B || '');
    const rawOptC = String(q.options?.C || q.C || '');
    const rawOptD = String(q.options?.D || q.D || '');
    const rawCorrect = String(q.correct || q.Correct || '');

    if (/[\u200B\uFEFF\uFFFD\u00A0]/.test(rawQuestion + rawOptA + rawOptB + rawOptC + rawOptD)) {
      unicodeIssuesCount++;
      warnings.push(`Row ${rowNum} (QID: ${rawQid}): Non-standard Unicode or invisible characters stripped.`);
    }

    const cleanQid = cleanExtendedUnicodeString(rawQid);
    const cleanSec = normalizeSectionName(rawSection);
    const cleanDiff = normalizeDifficultyValue(rawDifficulty);
    const cleanQText = cleanExtendedUnicodeString(rawQuestion);
    const cleanA = cleanExtendedUnicodeString(rawOptA);
    const cleanB = cleanExtendedUnicodeString(rawOptB);
    const cleanC = cleanExtendedUnicodeString(rawOptC);
    const cleanD = cleanExtendedUnicodeString(rawOptD);
    const cleanCorr = normalizeCorrectAnswer(rawCorrect);

    if (qidSet.has(cleanQid)) {
      duplicateQIDs.add(cleanQid);
      errors.push(`Row ${rowNum}: Duplicate QID '${cleanQid}' found.`);
    } else {
      qidSet.add(cleanQid);
    }

    if (cleanQText) {
      if (questionTextSet.has(cleanQText.toLowerCase())) {
        duplicateQuestionTexts.add(cleanQText);
        warnings.push(`Row ${rowNum} (QID: ${cleanQid}): Duplicate question text detected.`);
      } else {
        questionTextSet.add(cleanQText.toLowerCase());
      }
    } else {
      blankQuestionsCount++;
      errors.push(`Row ${rowNum} (QID: ${cleanQid}): Question text is blank.`);
    }

    if (!cleanA || !cleanB || !cleanC || !cleanD) {
      blankOptionsCount++;
      errors.push(`Row ${rowNum} (QID: ${cleanQid}): One or more options (A, B, C, D) are blank.`);
    }

    if (!cleanCorr) {
      missingCorrectAnswersCount++;
      errors.push(`Row ${rowNum} (QID: ${cleanQid}): Correct answer '${rawCorrect}' is invalid. Must be A, B, C, or D.`);
    }

    normalizedQuestions.push({
      qid: cleanQid,
      section: cleanSec,
      difficulty: cleanDiff,
      question: cleanQText,
      options: { A: cleanA, B: cleanB, C: cleanC, D: cleanD },
      correct: cleanCorr,
      marks: Number(q.marks || q.Marks) || 1,
      negativeMarks: Number(q.negativeMarks || q.NegativeMarks) || 0
    });
  });

  const { stats, sections } = calculateStatsAndSections(normalizedQuestions);

  let overallStatus = 'PASS';
  if (errors.length > 0) {
    overallStatus = 'ERROR';
  } else if (warnings.length > 0) {
    overallStatus = 'WARNING';
  }

  const analysisReport = {
    overallStatus,
    questionsFound: normalizedQuestions.length,
    sectionsFound: sections.length,
    sectionBreakdown: stats.questionsPerSection,
    difficultyDistribution: stats.difficultyCount,
    totalMarks: stats.totalMarks,
    averageMarks: stats.averageMarksPerQuestion,
    duplicateQIDsCount: duplicateQIDs.size,
    duplicateQuestionTextsCount: duplicateQuestionTexts.size,
    blankQuestionsCount,
    blankOptionsCount,
    missingCorrectAnswersCount,
    unicodeIssuesCount,
    encodingIssuesCount,
    warnings,
    errors
  };

  return {
    analysisReport,
    normalizedQuestions,
    stats,
    sections
  };
};

// Lightweight Candidate Eligibility Helper
const checkCandidateEligibility = (candidate, target = {}) => {
  if (!target || typeof target !== 'object') return true;

  const targetDept = (target.department || '').trim().toLowerCase();
  const targetYear = (target.year || '').trim().toLowerCase();
  const targetBatch = (target.batch || '').trim().toLowerCase();

  if ((!targetDept || targetDept === 'all') && (!targetYear || targetYear === 'all') && !targetBatch) {
    return true;
  }

  if (!candidate || typeof candidate !== 'object') return false;

  const candDept = (candidate.Department || candidate.department || '').trim().toLowerCase();
  const candYear = String(candidate.Year || candidate.year || '').trim().toLowerCase();
  const candBatch = (candidate.Batch || candidate.batch || '').trim().toLowerCase();

  if (targetDept && targetDept !== 'all') {
    if (!candDept || candDept !== targetDept) return false;
  }

  if (targetYear && targetYear !== 'all') {
    if (!candYear || candYear !== targetYear) return false;
  }

  if (targetBatch) {
    if (!candBatch || !candBatch.includes(targetBatch)) return false;
  }

  return true;
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
    correct: normalizeCorrectAnswer(q.Correct),
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
      allowQuestionPaperDownload: legacyTest.AllowQuestionPaperDownload !== undefined ? legacyTest.AllowQuestionPaperDownload : false,
      target: legacyTest.Target || legacyTest.target || { department: '', year: '', batch: '' },
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
  const targetObj = testPaper.meta?.target || { department: '', year: '', batch: '' };
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
    AllowQuestionPaperDownload: testPaper.meta.allowQuestionPaperDownload || false,
    allowQuestionPaperDownload: testPaper.meta.allowQuestionPaperDownload || false,
    Target: targetObj,
    target: targetObj,
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
    Correct: normalizeCorrectAnswer(q.correct),
    Marks: q.marks,
    NegativeMarks: q.negativeMarks,
    IsDeleted: q.isDeleted,
    DeletedAt: q.deletedAt,
    questionMedia: q.questionMedia || null,
    optionMedia: q.optionMedia || null
  }));
};

const getTestById = async (testId) => {
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
  cleanExtendedUnicodeString,
  normalizeSectionName,
  normalizeDifficultyValue,
  normalizeCorrectAnswer,
  calculateStatsAndSections,
  generateCsvAnalysis,
  convertLegacyToTestPaper,
  convertTestPaperToLegacyTest,
  convertTestPaperToLegacyQuestions,
  getTestById,
  getAllTests,
  getQuestions,
  calculateTestStatus,
  buildCountdownData,
  checkCandidateEligibility
};
