
const Question = require('../models/Question');
const Response = require('../models/Response');
const Performance = require('../models/Performance');
const Test = require('../models/Test');
const Session = require('../models/Session');
const { updateRanks } = require('../services/rankingService');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const { paginate } = require('../utils/paginate');
const { sendResultEmail } = require('../services/emailService');

const EXAM_STATES = {
  SUBMITTED: 'Submitted',
  AUTO_SUBMITTED: 'AutoSubmitted'
};

async function verifyAdminSession(sessionToken) {
  if (!sessionToken) return false;
  const session = await Session.findOne({ sessionToken });
  if (!session || session.role !== 'admin' || new Date() > session.expiresAt) {
    return false;
  }
  return true;
}

async function submitTest(data) {
  try {
    const { userID, name, Email, TestId, answers, startedAt, FullScreenViolations, TabSwitchCount, autoSubmitted } = data;

    // Check for duplicate submission first
    const existingSubmission = await Performance.findOne({ userID, TestId });
    if (existingSubmission) {
      return { success: false, error: 'Submission already exists' };
    }

    // Check test exists
    const test = await Test.findOne({ TestID: TestId, IsDeleted: { $ne: true } });
    if (!test) {
      return { success: false, error: 'Invalid Test Reference' };
    }

    // Get questions
    const questions = await Question.find({ TestID: TestId, IsDeleted: { $ne: true } });
    if (questions.length === 0) {
      return { success: false, error: 'Test question bank empty' };
    }

    let stats = { raw: 0, net: 0, correct: 0, wrong: 0, unanswered: 0 };
    const sectionAnalytics = {};
    const answersArray = [];
    const submittedAt = new Date();

    questions.forEach((q) => {
      const qid = q.QID;
      const section = q.Section;
      const correctAns = String(q.Correct || '').trim().toUpperCase();
      const marks = Number(q.Marks || 1);
      const negMarks = Number(q.NegativeMarks || 0);

      const selectedAns = answers[qid] ? String(answers[qid]).trim().toUpperCase() : null;
      const isUnanswered = (selectedAns === null || selectedAns === '');
      const isCorrect = !isUnanswered && selectedAns === correctAns;

      if (!sectionAnalytics[section]) {
        sectionAnalytics[section] = { correct: 0, wrong: 0, unanswered: 0, total: 0, score: 0 };
      }
      sectionAnalytics[section].total++;

      if (isCorrect) {
        stats.correct++;
        stats.raw += marks;
        stats.net += marks;
        sectionAnalytics[section].correct++;
        sectionAnalytics[section].score += marks;
      } else if (isUnanswered) {
        stats.unanswered++;
        sectionAnalytics[section].unanswered++;
      } else {
        stats.wrong++;
        stats.net -= negMarks;
        sectionAnalytics[section].wrong++;
        sectionAnalytics[section].score -= negMarks;
      }

      answersArray.push({
        QID: qid,
        SelectedAnswer: selectedAns || '',
        IsCorrect: isCorrect,
        IsUnanswered: isUnanswered,
        Marks: marks,
        NegativeMarks: negMarks
      });
    });

    const startTimeObj = startedAt ? new Date(startedAt) : null;
    const timeTaken = startTimeObj ? Math.floor((submittedAt - startTimeObj) / 1000) : 0;

    await Performance.create({
      userID,
      name,
      Email,
      TestId,
      TotalScore: stats.raw,
      TotalQuestions: questions.length,
      SectionAnalyticsJSON: sectionAnalytics,
      CorrectCount: stats.correct,
      WrongCount: stats.wrong,
      UnansweredCount: stats.unanswered,
      SubmittedAt: submittedAt,
      ResultPublished: false,
      StartedAt: startTimeObj,
      TotalTimeTaken: timeTaken,
      AutoSubmitted: autoSubmitted === true,
      FullScreenViolations: FullScreenViolations || data.fullscreenViolations || 0,
      TabSwitchCount: TabSwitchCount || data.tabSwitchCount || 0,
      State: autoSubmitted ? EXAM_STATES.AUTO_SUBMITTED : EXAM_STATES.SUBMITTED,
      NetScore: isNaN(stats.net) ? 0 : stats.net
    });

    await Response.create({
      userID,
      TestId,
      answers: answersArray,
      SubmittedAt: submittedAt
    });

    // Update ranks
    await updateRanks(TestId);

    return { success: true, score: stats.net, rawScore: stats.raw, correctCount: stats.correct, total: questions.length, submittedAt };
  } catch (err) {
    if (err.code === 11000) { // Duplicate key error
      return { success: false, error: 'Submission already exists' };
    }
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'submitTest',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function getPerformance(params, sessionToken) {
  const query = {};
  if (params.TestId || params.testId) query.TestId = params.TestId || params.testId;
  if (params.userID || params.userId) query.userID = params.userID || params.userId;

  // Check if admin
  const isAdmin = await verifyAdminSession(sessionToken);
  
  if (!isAdmin) {
    // Non-admin: only get their own published results
    if (!params.userID && !params.userId) {
      return []; // Or maybe throw error? Let's follow Code.gs behavior
    }
    query.ResultPublished = true;
  }

  let data = await Performance.find(query);

  // Search
  if (params.search && isAdmin) { // Only admin can search
    const s = params.search.toLowerCase();
    data = data.filter(d => 
      (d.name || '').toLowerCase().includes(s) || 
      (d.Email || '').toLowerCase().includes(s)
    );
  }

  // Sorting
  if (params.sort === 'score') {
    data.sort((a, b) => (Number(b.NetScore) || 0) - (Number(a.NetScore) || 0));
  } else if (params.sort === 'accuracy') {
    data.sort((a, b) => {
      const accA = (Number(a.CorrectCount) / Number(a.TotalQuestions)) || 0;
      const accB = (Number(b.CorrectCount) / Number(b.TotalQuestions)) || 0;
      return accB - accA;
    });
  } else {
    data.sort((a, b) => new Date(b.SubmittedAt) - new Date(a.SubmittedAt));
  }

  if (params.page) {
    return paginate(data, params);
  }

  return data;
}

async function getResults(params, sessionToken) {
  return getPerformance(params, sessionToken);
}

async function getResponses(params) {
  const query = {};
  if (params.TestId || params.testId) query.TestId = params.TestId || params.testId;
  if (params.userID || params.userId) query.userID = params.userID || params.userId;

  const responseDocs = await Response.find(query);
  if (responseDocs.length === 0) {
    return [];
  }

  // Get all unique test IDs
  const testIds = [...new Set(responseDocs.map(r => r.TestId))];
  // Get questions for all tests
  const questions = await Question.find({ TestID: { $in: testIds }, IsDeleted: { $ne: true } });
  // Create question map
  const questionMap = {};
  questions.forEach(q => {
    if (!questionMap[q.TestID]) {
      questionMap[q.TestID] = {};
    }
    questionMap[q.TestID][q.QID] = q;
  });

  // Get performances to get name and email
  const performances = await Performance.find({ TestId: { $in: testIds } });
  const perfMap = {};
  performances.forEach(p => {
    if (!perfMap[p.TestId]) {
      perfMap[p.TestId] = {};
    }
    perfMap[p.TestId][p.userID] = p;
  });

  // Reconstruct flat format
  const flatResponses = [];
  responseDocs.forEach(doc => {
    doc.answers.forEach(answer => {
      const q = questionMap[doc.TestId] && questionMap[doc.TestId][answer.QID];
      const perf = perfMap[doc.TestId] && perfMap[doc.TestId][doc.userID];
      if (q && perf) {
        flatResponses.push({
          userID: doc.userID,
          name: perf.name,
          Email: perf.Email,
          TestId: doc.TestId,
          QID: answer.QID,
          Section: q.Section,
          Question: String(q.Question || ''),
          OptionA: String(q.A || ''),
          OptionB: String(q.B || ''),
          OptionC: String(q.C || ''),
          OptionD: String(q.D || ''),
          SelectedAnswer: answer.SelectedAnswer,
          CorrectAnswer: String(q.Correct || ''),
          IsCorrect: answer.IsCorrect,
          IsUnanswered: answer.IsUnanswered,
          Difficulty: q.Difficulty,
          SubmittedAt: doc.SubmittedAt,
          Marks: answer.Marks,
          NegativeMarks: answer.NegativeMarks
        });
      }
    });
  });

  if (params.page) {
    return paginate(flatResponses, params);
  }

  return flatResponses;
}

async function getCandidateAnalytics(userId) {
  if (!userId) throw new Error('userID required');
  const performances = await Performance.find({ userID: userId });
  const stats = {
    totalExams: 0,
    totalMarks: 0,
    totalNet: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalUnanswered: 0,
    totalTabSwitches: 0,
    totalFullScreenViolations: 0,
    examHistory: [],
    sectionWiseOverall: {},
    bestRank: Infinity,
    avgPercentile: 0
  };
  performances.forEach(row => {
    const s = Number(row.TotalScore) || 0;
    const n = Number(row.NetScore) || 0;
    const t = Number(row.TotalQuestions) || 0;
    const p = Number(row.Percentile) || 0;
    const r = Number(row.Rank) || Infinity;
    stats.totalExams++;
    stats.totalMarks += s;
    stats.totalNet += n;
    stats.totalQuestions += t;
    stats.totalCorrect += Number(row.CorrectCount) || 0;
    stats.totalWrong += Number(row.WrongCount) || 0;
    stats.totalUnanswered += Number(row.UnansweredCount) || 0;
    stats.totalTabSwitches += Number(row.TabSwitchCount) || 0;
    stats.totalFullScreenViolations += Number(row.FullScreenViolations) || 0;
    stats.avgPercentile += p;
    if (r < stats.bestRank) stats.bestRank = r;
    stats.examHistory.push({
      TestId: row.TestId,
      SubmittedAt: row.SubmittedAt,
      TotalScore: s,
      NetScore: n,
      CorrectCount: row.CorrectCount,
      WrongCount: row.WrongCount,
      UnansweredCount: row.UnansweredCount,
      Rank: row.Rank,
      Percentile: row.Percentile,
      TotalTimeTaken: row.TotalTimeTaken
    });
    // Section aggregation
    if (row.SectionAnalyticsJSON) {
      const sections = row.SectionAnalyticsJSON;
      for (const name in sections) {
        if (!stats.sectionWiseOverall[name]) {
          stats.sectionWiseOverall[name] = { correct: 0, wrong: 0, unanswered: 0, total: 0, score: 0 };
        }
        stats.sectionWiseOverall[name].correct += sections[name].correct;
        stats.sectionWiseOverall[name].wrong += sections[name].wrong;
        stats.sectionWiseOverall[name].unanswered += sections[name].unanswered;
        stats.sectionWiseOverall[name].total += sections[name].total;
        stats.sectionWiseOverall[name].score += sections[name].score;
      }
    }
  });
  if (stats.totalExams > 0) {
    stats.avgPercentile = stats.avgPercentile / stats.totalExams;
  }
  return stats;
}

async function publishResult(testId, userId, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const perf = await Performance.findOne({ TestId: testId, userID: userId });
    if (!perf) {
      return { success: false, error: 'Result not found' };
    }
    if (perf.ResultPublished) {
      return { success: true, message: 'Already published' };
    }
    perf.ResultPublished = true;
    perf.PublishedAt = new Date();
    await perf.save();

    // Get test name
    const test = await Test.findOne({ TestID: testId });
    const testName = test ? test.Name : testId;

    // Send result email
    await sendResultEmail(perf, perf.Rank, testName);

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'publishResult',
      UserID: 'admin',
      TestID: testId,
      Details: `Published result for ${userId}`
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'publishResult',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function publishAllResults(testId, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }
    const perfs = await Performance.find({ TestId: testId });
    // Get test name
    const test = await Test.findOne({ TestID: testId });
    const testName = test ? test.Name : testId;
    
    let publishedCount = 0;
    let failedCount = 0;
    const startTime = Date.now();

    for (const perf of perfs) {
      if (perf.ResultPublished) continue;
      if (Date.now() - startTime > 240000) break; // Stop after 4 mins
      try {
        perf.ResultPublished = true;
        perf.PublishedAt = new Date();
        await perf.save();
        // Send result email
        await sendResultEmail(perf, perf.Rank, testName);
        publishedCount++;
      } catch (e) {
        failedCount++;
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'publishAllResults',
      UserID: 'admin',
      TestID: testId,
      Details: `Published ${publishedCount} results, failed ${failedCount}`
    });

    return {
      success: true,
      publishedCount,
      failedCount,
      remaining: perfs.length - publishedCount - failedCount
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'publishAllResults',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function getMalpracticeLogs(params, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const query = {};
    if (params.TestId || params.testId) query.TestId = params.TestId || params.testId;
    
    // Find performances with any violations
    const logs = await Performance.find({
      ...query,
      $or: [
        { FullScreenViolations: { $gt: 0 } },
        { TabSwitchCount: { $gt: 0 } },
        { AutoSubmitted: true }
      ]
    });

    return logs;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getMalpracticeLogs',
      Error: err.message
    });
    return { success: false, error: 'Failed to get malpractice logs' };
  }
}

module.exports = {
  submitTest,
  getPerformance,
  getResults,
  getResponses,
  getCandidateAnalytics,
  publishResult,
  publishAllResults,
  getMalpracticeLogs
};
