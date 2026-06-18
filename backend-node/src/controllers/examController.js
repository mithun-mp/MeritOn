const Response = require('../models/Response');
const Performance = require('../models/Performance');
const Question = require('../models/Question');
const emailService = require('../services/emailService');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');

// Verify admin session
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
    const existingPerformance = await Performance.findOne({
      userID: data.userID,
      TestId: data.TestId
    }).lean();
    if (existingPerformance) {
      return {
        success: false,
        error: 'You have already submitted the test'
      };
    }

    const questions = await Question.find({
      TestID: data.TestId,
      IsDeleted: { $ne: true }
    }).lean();
    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.QID] = q;
    });

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    const sectionAnalytics = {};
    const answersToSave = [];
    const totalQuestions = questions.length;

    questions.forEach(q => {
      const userAnswer = data.answers[q.QID] || '';
      const isCorrect = userAnswer === q.Correct;
      const isUnanswered = userAnswer.trim() === '';

      let marks = 0;
      let negativeMarks = 0;
      if (isCorrect) {
        marks = q.Marks;
        correctCount++;
      } else if (!isUnanswered) {
        negativeMarks = q.NegativeMarks;
        wrongCount++;
      } else {
        unansweredCount++;
      }
      totalScore += (marks - negativeMarks);

      if (!sectionAnalytics[q.Section]) {
        sectionAnalytics[q.Section] = {
          CorrectCount: 0,
          WrongCount: 0,
          UnansweredCount: 0,
          TotalQuestions: 0,
          Score: 0
        };
      }

      sectionAnalytics[q.Section].TotalQuestions++;
      if (isCorrect) {
        sectionAnalytics[q.Section].CorrectCount++;
        sectionAnalytics[q.Section].Score += q.Marks;
      } else if (!isUnanswered) {
        sectionAnalytics[q.Section].WrongCount++;
        sectionAnalytics[q.Section].Score -= q.NegativeMarks;
      } else {
        sectionAnalytics[q.Section].UnansweredCount++;
      }

      answersToSave.push({
        QID: q.QID,
        SelectedAnswer: userAnswer,
        IsCorrect: isCorrect,
        IsUnanswered: isUnanswered,
        Marks: marks,
        NegativeMarks: negativeMarks
      });
    });

    const totalTimeTaken = data.TotalTimeTaken || 0;

    const responseDoc = new Response({
      userID: data.userID,
      TestId: data.TestId,
      answers: answersToSave,
      SubmittedAt: new Date()
    });
    await responseDoc.save();

    const performanceDoc = new Performance({
      userID: data.userID,
      name: data.name,
      Email: data.Email,
      TestId: data.TestId,
      TotalScore: totalScore,
      TotalQuestions: totalQuestions,
      SectionAnalyticsJSON: sectionAnalytics,
      CorrectCount: correctCount,
      WrongCount: wrongCount,
      UnansweredCount: unansweredCount,
      SubmittedAt: new Date(),
      StartedAt: data.StartedAt ? new Date(data.StartedAt) : null,
      TotalTimeTaken: totalTimeTaken,
      AutoSubmitted: data.AutoSubmitted || false,
      FullScreenViolations: data.FullScreenViolations || 0,
      TabSwitchCount: data.TabSwitchCount || 0,
      State: 'completed',
      NetScore: totalScore
    });
    await performanceDoc.save();

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'submitTest',
      UserID: data.userID,
      Details: {
        TestId: data.TestId,
        Score: totalScore
      }
    });

    return {
      success: true,
      Score: totalScore,
      CorrectCount: correctCount,
      WrongCount: wrongCount,
      UnansweredCount: unansweredCount,
      TotalQuestions: totalQuestions,
      PerformanceID: performanceDoc._id.toString()
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'submitTest',
      Error: err.message,
      UserID: data?.userID || null,
      TestID: data?.TestId || null
    });
    return {
      success: false,
      error: err.message
    };
  }
}

async function getPerformance(data) {
  try {
    const performance = await Performance.findOne({
      userID: data.userID,
      TestId: data.TestId
    }).lean();
    if (!performance) {
      return {
        success: false,
        error: 'Performance not found'
      };
    }
    return {
      success: true,
      Performance: performance
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getPerformance',
      Error: err.message,
      UserID: data?.userID || null,
      TestID: data?.TestId || null
    });
    return {
      success: false,
      error: err.message
    };
  }
}

async function getResults(TestId) {
  try {
    const performances = await Performance.find({
      TestId: TestId
    }).sort({ NetScore: -1, SubmittedAt: 1 }).lean();
    return {
      success: true,
      Results: performances
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getResults',
      Error: err.message
    });
    return {
      success: false,
      error: err.message
    };
  }
}

async function getResponses(TestId, userID) {
  try {
    const response = await Response.findOne({
      TestId: TestId,
      userID: userID
    }).lean();
    if (!response) {
      return {
        success: false,
        error: 'Responses not found'
      };
    }
    const questions = await Question.find({
      TestID: TestId,
      IsDeleted: { $ne: true }
    }).lean();
    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.QID] = q;
    });
    const flatAnswers = response.answers.map(answer => {
      const question = questionMap[answer.QID];
      return {
        QID: answer.QID,
        Question: question ? question.Question : '',
        A: question ? question.A : '',
        B: question ? question.B : '',
        C: question ? question.C : '',
        D: question ? question.D : '',
        Correct: question ? question.Correct : '',
        SelectedAnswer: answer.SelectedAnswer,
        IsCorrect: answer.IsCorrect,
        IsUnanswered: answer.IsUnanswered,
        Marks: answer.Marks,
        NegativeMarks: answer.NegativeMarks
      };
    });
    return {
      success: true,
      Responses: flatAnswers
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getResponses',
      Error: err.message
    });
    return {
      success: false,
      error: err.message
    };
  }
}

async function publishResult(TestId, userID, Rank, Percentile) {
  try {
    const performance = await Performance.findOne({
      TestId: TestId,
      userID: userID
    });
    if (!performance) {
      return {
        success: false,
        error: 'Performance not found'
      };
    }
    performance.ResultPublished = true;
    performance.PublishedAt = new Date();
    performance.Rank = Rank;
    performance.Percentile = Percentile;
    await performance.save();
    await emailService.sendResultEmail(
      performance.Email,
      performance.name,
      TestId,
      performance.TotalScore,
      Rank,
      Percentile
    );
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'publishResult',
      UserID: userID,
      Details: { TestId: TestId }
    });
    return {
      success: true
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'publishResult',
      Error: err.message
    });
    return {
      success: false,
      error: err.message
    };
  }
}

async function publishAllResults(TestId) {
  try {
    const performances = await Performance.find({
      TestId: TestId
    }).sort({ NetScore: -1, SubmittedAt: 1 }).lean();
    const total = performances.length;
    for (let i = 0; i < total; i++) {
      const perf = performances[i];
      const rank = i + 1;
      const percentile = ((total - i) / total) * 100;
      await publishResult(TestId, perf.userID, rank, percentile);
    }
    return {
      success: true
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'publishAllResults',
      Error: err.message
    });
    return {
      success: false,
      error: err.message
    };
  }
}

async function getCandidateAnalytics(userID) {
  try {
    const performances = await Performance.find({
      userID: userID
    }).sort({ SubmittedAt: -1 }).lean();
    const stats = {
      totalTests: performances.length,
      averageScore: 0,
      highestScore: -Infinity,
      lowestScore: Infinity,
      testsTaken: performances.length
    };
    if (performances.length > 0) {
      const scores = performances.map(p => p.NetScore);
      stats.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      stats.highestScore = Math.max(...scores);
      stats.lowestScore = Math.min(...scores);
    }
    return {
      success: true,
      Analytics: stats,
      Performances: performances
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getCandidateAnalytics',
      Error: err.message
    });
    return {
      success: false,
      error: err.message
    };
  }
}

async function getMalpracticeLogs(params, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const testId = params.testId;
    const query = {
      $or: [
        { FullScreenViolations: { $gt: 0 } },
        { TabSwitchCount: { $gt: 0 } }
      ]
    };

    if (testId) {
      query.TestId = testId;
    }

    const logs = await Performance.find(query).sort({ SubmittedAt: -1 }).lean();

    return {
      success: true,
      MalpracticeLogs: logs
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getMalpracticeLogs',
      Error: err.message
    });
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  submitTest,
  getPerformance,
  getResults,
  getResponses,
  publishResult,
  publishAllResults,
  getCandidateAnalytics,
  getMalpracticeLogs
};
