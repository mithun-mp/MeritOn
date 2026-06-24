const mongoose = require('mongoose');
const Response = require('../models/Response');
const Performance = require('../models/Performance');
const Question = require('../models/Question');
const Test = require('../models/Test');
const TestPaper = require('../models/TestPaper');
const User = require('../models/User');
const SubmissionResult = require('../models/SubmissionResult');
const LiveExamSession = require('../models/LiveExamSession');
const emailService = require('../services/emailService');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const testPaperUtils = require('../utils/testPaperUtils');
const examTimeUtils = require('../utils/examTimeUtils');

const CLAMP_NEGATIVE_PERCENTILE = process.env.CLAMP_NEGATIVE_PERCENTILE === 'true';
const RESULT_STORAGE_MODE = process.env.RESULT_STORAGE_MODE || (process.env.NODE_ENV === 'production' ? 'optimized' : 'dual');

function round2(value) {
  return Number((Math.round(value * 100) / 100).toFixed(2));
}

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
    const existingSubmission = await SubmissionResult.findOne({
      userID: data.userID,
      TestId: data.TestId
    }).lean();
    if (existingSubmission) {
      return {
        success: false,
        error: 'You have already submitted the test'
      };
    }

    let questions = await testPaperUtils.getQuestions(data.TestId);
    let testPaper = await TestPaper.findOne({ TestID: data.TestId }).lean();
    let test = testPaper ? {
      Name: testPaper.meta.name,
      Date: testPaper.meta.date,
      Duration: testPaper.meta.duration,
      ExpiryTime: testPaper.meta.startTime,
      EndTime: testPaper.meta.startTime,
      QuickResult: testPaper.meta.quickResult
    } : await Test.findOne({ TestID: data.TestId }).lean();

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.QID] = q;
    });

    // Initialize counters
    let rawScore = 0;
    let negativeScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let maxPossibleScore = 0;

    const sectionStats = {};
    const difficultyStats = {};
    const answersToSave = [];
    const oldAnswersToSave = [];
    const totalQuestions = questions.length;

    // Initialize difficulty keys
    ['Easy', 'Medium', 'Hard', 'Unknown'].forEach(d => {
      difficultyStats[d] = {
        totalQuestions: 0,
        attemptedCount: 0,
        correctCount: 0,
        wrongCount: 0,
        unansweredCount: 0,
        rawScore: 0,
        negativeScore: 0,
        netScore: 0,
        maxPossibleScore: 0,
        scorePercentile: 0,
        accuracyPercent: 0,
        attemptPercent: 0
      };
    });

    questions.forEach(q => {
      const userAnswer = data.answers[q.QID] || '';
      const isCorrect = userAnswer === q.Correct;
      const isUnanswered = userAnswer.trim() === '';
      const marks = q.Marks || 1;
      const negMarks = q.NegativeMarks || 0;
      const difficulty = q.Difficulty || 'Unknown';
      const section = q.Section || 'Uncategorized';

      maxPossibleScore += marks;

      let scoreAwarded = 0;
      if (isCorrect) {
        scoreAwarded = marks;
        rawScore += marks;
        correctCount++;
      } else if (!isUnanswered) {
        scoreAwarded = -negMarks;
        negativeScore += negMarks;
        wrongCount++;
      } else {
        unansweredCount++;
      }

      // Update section stats
      if (!sectionStats[section]) {
        sectionStats[section] = {
          totalQuestions: 0,
          attemptedCount: 0,
          correctCount: 0,
          wrongCount: 0,
          unansweredCount: 0,
          rawScore: 0,
          negativeScore: 0,
          netScore: 0,
          maxPossibleScore: 0,
          scorePercentile: 0,
          accuracyPercent: 0,
          attemptPercent: 0
        };
      }
      sectionStats[section].totalQuestions++;
      sectionStats[section].maxPossibleScore += marks;
      if (isCorrect) {
        sectionStats[section].correctCount++;
        sectionStats[section].rawScore += marks;
        sectionStats[section].attemptedCount++;
      } else if (!isUnanswered) {
        sectionStats[section].wrongCount++;
        sectionStats[section].negativeScore += negMarks;
        sectionStats[section].attemptedCount++;
      } else {
        sectionStats[section].unansweredCount++;
      }
      sectionStats[section].netScore = sectionStats[section].rawScore - sectionStats[section].negativeScore;

      // Update difficulty stats
      difficultyStats[difficulty].totalQuestions++;
      difficultyStats[difficulty].maxPossibleScore += marks;
      if (isCorrect) {
        difficultyStats[difficulty].correctCount++;
        difficultyStats[difficulty].rawScore += marks;
        difficultyStats[difficulty].attemptedCount++;
      } else if (!isUnanswered) {
        difficultyStats[difficulty].wrongCount++;
        difficultyStats[difficulty].negativeScore += negMarks;
        difficultyStats[difficulty].attemptedCount++;
      } else {
        difficultyStats[difficulty].unansweredCount++;
      }
      difficultyStats[difficulty].netScore = difficultyStats[difficulty].rawScore - difficultyStats[difficulty].negativeScore;

      // Save answers
      answersToSave.push({
        qid: q.QID,
        section: section,
        difficulty: difficulty,
        selected: userAnswer,
        correctAnswer: q.Correct,
        isCorrect: isCorrect,
        isUnanswered: isUnanswered,
        marks: marks,
        negativeMarks: negMarks,
        scoreAwarded: scoreAwarded
      });

      oldAnswersToSave.push({
        QID: q.QID,
        SelectedAnswer: userAnswer,
        IsCorrect: isCorrect,
        IsUnanswered: isUnanswered,
        Marks: isCorrect ? marks : 0,
        NegativeMarks: !isUnanswered && !isCorrect ? negMarks : 0
      });
    });

    const netScore = rawScore - negativeScore;

    // Calculate percentiles
    let scorePercentile = maxPossibleScore > 0 ? (netScore / maxPossibleScore) * 100 : 0;
    if (CLAMP_NEGATIVE_PERCENTILE) scorePercentile = Math.max(0, scorePercentile);
    const accuracyPercent = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const attemptedCount = correctCount + wrongCount;
    const attemptPercent = totalQuestions > 0 ? (attemptedCount / totalQuestions) * 100 : 0;

    // Calculate section percentiles
    Object.keys(sectionStats).forEach(section => {
      const s = sectionStats[section];
      s.scorePercentile = s.maxPossibleScore > 0 ? (s.netScore / s.maxPossibleScore) * 100 : 0;
      if (CLAMP_NEGATIVE_PERCENTILE) s.scorePercentile = Math.max(0, s.scorePercentile);
      s.scorePercentile = round2(s.scorePercentile);
      s.accuracyPercent = round2(s.totalQuestions > 0 ? (s.correctCount / s.totalQuestions) * 100 : 0);
      s.attemptPercent = round2(s.totalQuestions > 0 ? (s.attemptedCount / s.totalQuestions) * 100 : 0);
    });

    // Calculate difficulty percentiles
    Object.keys(difficultyStats).forEach(d => {
      const diff = difficultyStats[d];
      diff.scorePercentile = diff.maxPossibleScore > 0 ? (diff.netScore / diff.maxPossibleScore) * 100 : 0;
      if (CLAMP_NEGATIVE_PERCENTILE) diff.scorePercentile = Math.max(0, diff.scorePercentile);
      diff.scorePercentile = round2(diff.scorePercentile);
      diff.accuracyPercent = round2(diff.totalQuestions > 0 ? (diff.correctCount / diff.totalQuestions) * 100 : 0);
      diff.attemptPercent = round2(diff.totalQuestions > 0 ? (diff.attemptedCount / diff.totalQuestions) * 100 : 0);
    });

    // Time calculations
    const serverReceivedAt = new Date();
    const startedAt = data.StartedAt ? new Date(data.StartedAt) : serverReceivedAt;
    const submittedAt = data.SubmittedAt ? new Date(data.SubmittedAt) : serverReceivedAt;
    let totalTimeTakenSeconds = Math.max(0, (submittedAt - startedAt) / 1000);
    const allowedDurationSeconds = (test?.Duration || 0) * 60;
    const overtimeSeconds = Math.max(0, totalTimeTakenSeconds - allowedDurationSeconds);
    const submittedBeforeTime = totalTimeTakenSeconds <= allowedDurationSeconds;
    const totalTimeTakenMinutes = round2(totalTimeTakenSeconds / 60);

    // Violations
    const fullScreenViolations = data.FullScreenViolations || 0;
    const tabSwitchCount = data.TabSwitchCount || 0;
    const autoSubmitted = data.AutoSubmitted || false;
    const suspiciousScore = fullScreenViolations * 2 + tabSwitchCount * 3 + (autoSubmitted ? 1 : 0);

    // Quick result logic
    const quickResult = test?.QuickResult || false;

    // Build SubmissionResult
    const submissionResultDoc = new SubmissionResult({
      userID: data.userID,
      TestId: data.TestId,
      candidate: {
        name: data.name,
        email: data.Email,
        univId: data.univId || ''
      },
      test: {
        name: test?.Name || '',
        date: test?.Date ? test.Date.toISOString().split('T')[0] : '',
        durationMinutes: test?.Duration || 0,
        maxPossibleScore: maxPossibleScore,
        totalQuestions: totalQuestions
      },
      timing: {
        startedAt: startedAt,
        submittedAt: submittedAt,
        serverReceivedAt: serverReceivedAt,
        totalTimeTakenSeconds: totalTimeTakenSeconds,
        totalTimeTakenMinutes: totalTimeTakenMinutes,
        allowedDurationSeconds: allowedDurationSeconds,
        overtimeSeconds: overtimeSeconds,
        submittedBeforeTime: submittedBeforeTime,
        autoSubmitted: autoSubmitted
      },
      summary: {
        totalQuestions: totalQuestions,
        attemptedCount: attemptedCount,
        correctCount: correctCount,
        wrongCount: wrongCount,
        unansweredCount: unansweredCount,
        rawScore: rawScore,
        negativeScore: negativeScore,
        netScore: netScore,
        maxPossibleScore: maxPossibleScore,
        scorePercentile: round2(scorePercentile),
        accuracyPercent: round2(accuracyPercent),
        attemptPercent: round2(attemptPercent),
        state: 'completed'
      },
      sections: sectionStats,
      difficulty: {
        Easy: difficultyStats.Easy,
        Medium: difficultyStats.Medium,
        Hard: difficultyStats.Hard,
        Unknown: difficultyStats.Unknown
      },
      answers: answersToSave,
      violations: {
        fullScreenViolations: fullScreenViolations,
        tabSwitchCount: tabSwitchCount,
        suspiciousScore: suspiciousScore,
        autoSubmitted: autoSubmitted
      },
      result: {
        published: quickResult,
        publishedAt: quickResult ? serverReceivedAt : null,
        emailSent: false,
        emailSentAt: null
      },
      ranking: {
        rank: null,
        totalCandidates: 0,
        rankPercentile: null,
        calculatedAt: null
      }
    });
    await submissionResultDoc.save();

    // Update LiveExamSession if exists
    try {
      const testDate = new Date(test.Date || Date.now());
      let testEndTime = new Date(testDate);
      const [endHour, endMin] = (test.ExpiryTime || test.EndTime || '23:59').split(':').map(Number);
      testEndTime.setHours(endHour, endMin, 0, 0);
      const testExpiryPlus24 = new Date(testEndTime.getTime() + 24 * 60 * 60 * 1000);
      const submissionPlus24 = new Date(submittedAt.getTime() + 24 * 60 * 60 * 1000);
      const expiresAt = testExpiryPlus24 > submissionPlus24 ? testExpiryPlus24 : submissionPlus24;
      
      // Build query: combine test ID conditions and candidate ID conditions
      const testIdConditions = [
        { TestId: data.TestId },
        { testId: data.TestId },
        { TestID: data.TestId }
      ];
      
      const candidateConditions = [
        { userID: data.userID }
      ];
      if (data.Email) {
        candidateConditions.push({ "candidate.email": data.Email });
      }
      if (data.univId) {
        candidateConditions.push({ "candidate.univId": data.univId });
      }
      
      const sessionQuery = {
        $and: [
          { $or: testIdConditions },
          { $or: candidateConditions }
        ]
      };
      
      const updateResult = await LiveExamSession.updateOne(
        sessionQuery,
        {
          $set: {
            status: 'submitted',
            submittedAt: submittedAt,
            'resultSnapshot.scorePercentile': round2(scorePercentile),
            'resultSnapshot.netScore': netScore,
            'resultSnapshot.correctCount': correctCount,
            'resultSnapshot.wrongCount': wrongCount,
            'resultSnapshot.unansweredCount': unansweredCount,
            'resultSnapshot.totalTimeTakenSeconds': totalTimeTakenSeconds,
            'resultSnapshot.totalTimeTakenMinutes': totalTimeTakenMinutes,
            'security.fullScreenViolations': fullScreenViolations,
            'security.tabSwitchCount': tabSwitchCount,
            expiresAt,
            updatedAt: new Date()
          }
        }
      );
      console.log('[SUBMIT TEST] LiveExamSession update result:', updateResult);
    } catch (err) {
      console.error('[SUBMIT TEST] Error updating LiveExamSession', err);
    }

    // Update rankings for all candidates of this test
    await updateRankings(data.TestId);

    // Save old models if needed (dual mode)
    if (RESULT_STORAGE_MODE === 'dual' || RESULT_STORAGE_MODE === 'legacy') {
      const responseDoc = new Response({
        userID: data.userID,
        TestId: data.TestId,
        answers: oldAnswersToSave,
        SubmittedAt: serverReceivedAt
      });
      await responseDoc.save();

      const performanceDoc = new Performance({
        userID: data.userID,
        name: data.name,
        Email: data.Email,
        TestId: data.TestId,
        TotalScore: netScore,
        TotalQuestions: totalQuestions,
        SectionAnalyticsJSON: Object.fromEntries(
          Object.entries(sectionStats).map(([k, v]) => [
            k, {
              CorrectCount: v.correctCount,
              WrongCount: v.wrongCount,
              UnansweredCount: v.unansweredCount,
              TotalQuestions: v.totalQuestions,
              Score: v.netScore
            }
          ])
        ),
        CorrectCount: correctCount,
        WrongCount: wrongCount,
        UnansweredCount: unansweredCount,
        SubmittedAt: serverReceivedAt,
        StartedAt: startedAt,
        TotalTimeTaken: totalTimeTakenMinutes,
        AutoSubmitted: autoSubmitted,
        FullScreenViolations: fullScreenViolations,
        TabSwitchCount: tabSwitchCount,
        State: 'completed',
        NetScore: netScore,
        ResultPublished: quickResult,
        PublishedAt: quickResult ? serverReceivedAt : null
      });
      await performanceDoc.save();
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'submitTest',
      UserID: data.userID,
      Details: {
        TestId: data.TestId,
        Score: netScore
      }
    });

    return {
      success: true,
      Score: netScore,
      CorrectCount: correctCount,
      WrongCount: wrongCount,
      UnansweredCount: unansweredCount,
      TotalQuestions: totalQuestions,
      PerformanceID: submissionResultDoc._id.toString()
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

async function updateRankings(TestId) {
  try {
    const submissions = await SubmissionResult.find({
      TestId: TestId
    }).sort({
      'summary.netScore': -1,
      'summary.correctCount': -1,
      'timing.totalTimeTakenSeconds': 1,
      'timing.submittedAt': 1
    }).lean();

    const totalCandidates = submissions.length;

    for (let i = 0; i < totalCandidates; i++) {
      const sub = submissions[i];
      const rank = i + 1;
      const rankPercentile = totalCandidates > 0 ? ((totalCandidates - i) / totalCandidates) * 100 : 0;

      await SubmissionResult.updateOne(
        { _id: sub._id },
        {
          'ranking.rank': rank,
          'ranking.totalCandidates': totalCandidates,
          'ranking.rankPercentile': round2(rankPercentile),
          'ranking.calculatedAt': new Date()
        }
      );
    }
  } catch (err) {
    console.error('[updateRankings] Error:', err);
  }
}

// Convert SubmissionResult to old Performance format
function submissionToPerformance(sub) {
    return {
        _id: sub._id,
        userID: sub.userID,
        name: sub.candidate?.name,
        Email: sub.candidate?.email,
        TestId: sub.TestId,
        TotalScore: sub.summary?.netScore,
        TotalQuestions: sub.summary?.totalQuestions,
        SectionAnalyticsJSON: Object.fromEntries(
            Object.entries(sub.sections || {}).map(([k, v]) => [
                k, {
                    CorrectCount: v.correctCount,
                    WrongCount: v.wrongCount,
                    UnansweredCount: v.unansweredCount,
                    TotalQuestions: v.totalQuestions,
                    Score: v.netScore
                }
            ])
        ),
        CorrectCount: sub.summary?.correctCount,
        WrongCount: sub.summary?.wrongCount,
        UnansweredCount: sub.summary?.unansweredCount,
        SubmittedAt: sub.timing?.submittedAt,
        StartedAt: sub.timing?.startedAt,
        TotalTimeTaken: sub.timing?.totalTimeTakenMinutes,
        AutoSubmitted: sub.violations?.autoSubmitted,
        FullScreenViolations: sub.violations?.fullScreenViolations,
        TabSwitchCount: sub.violations?.tabSwitchCount,
        State: sub.summary?.state,
        NetScore: sub.summary?.netScore,
        Rank: sub.ranking?.rank,
        Percentile: sub.ranking?.rankPercentile,
        scorePercentile: sub.summary?.scorePercentile,
        OverallPercentage: sub.summary?.scorePercentile,
        ResultPublished: sub.result?.published,
        PublishedAt: sub.result?.publishedAt,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt
    };
}

async function getPerformance(data, sessionToken = null) {
  try {
    console.log('[RESULT] loading');
    // Check if requester is admin
    const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
    const testId = data.testId || data.TestId;
    let testPaper = await TestPaper.findOne({ TestID: testId }).lean();
    let test = testPaper ? {
      QuickResult: testPaper.meta.quickResult,
      AnswerKeyPublished: testPaper.meta.answerKeyPublished
    } : await Test.findOne({ TestID: testId }).lean();
    const quickResult = test?.QuickResult || false;
    console.log('[RESULT] quickResult:', quickResult);

    // If testId is provided, get all performances for the test
    if (data.testId) {
      if (!isAdmin) {
        return { success: false, error: 'Unauthorized' };
      }
      let submissions = await SubmissionResult.find({ TestId: data.testId }).lean();
      if (submissions.length === 0) {
        submissions = await Performance.find({ TestId: data.testId }).lean();
        return submissions;
      }
      return submissions.map(sub => submissionToPerformance(sub));
    }
    // Otherwise get single performance
    let submission = await SubmissionResult.findOne({ userID: data.userID, TestId: testId }).lean();
    if (!submission) {
      submission = await Performance.findOne({ userID: data.userID, TestId: testId }).lean();
      if (!submission) {
        return { success: false, error: 'Performance not found' };
      }
      // Check if published or admin or quickResult
      const resultPublished = submission.ResultPublished || quickResult;
      console.log('[RESULT] resultPublished:', resultPublished);
      if (!isAdmin && !resultPublished) {
        return { success: false, error: 'Result not published yet', submitted: true, resultPublished: false, quickResult };
      }
      return { success: true, Performance: submission, resultPublished, quickResult };
    }
    // Check if published or admin or quickResult
    const resultPublished = submission.result.published || quickResult;
    console.log('[RESULT] resultPublished:', resultPublished);
    if (!isAdmin && !resultPublished) {
      return { success: false, error: 'Result not published yet', submitted: true, resultPublished: false, quickResult };
    }
    console.log('[RESULT] rendering submissionResult');
    return { 
      success: true, 
      Performance: submissionToPerformance(submission), 
      submissionResult: submission, 
      resultPublished, 
      quickResult,
      answerKeyPublished: test?.AnswerKeyPublished || false
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getPerformance',
      Error: err.message,
      UserID: data?.userID || null,
      TestID: data?.TestId || data?.testId || null
    });
    return { success: false, error: err.message };
  }
}

async function getResults(data, sessionToken = null) {
  try {
    // Check if requester is admin
    const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }
    const TestId = data.testId;
    let submissions = await SubmissionResult.find({ TestId: TestId }).sort({
      'summary.netScore': -1,
      'timing.submittedAt': 1
    }).lean();
    let results;
    if (submissions.length === 0) {
      results = await Performance.find({ TestId: TestId }).sort({ NetScore: -1, SubmittedAt: 1 }).lean();
    } else {
      results = submissions.map(sub => submissionToPerformance(sub));
    }
    return { success: true, Results: results };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getResults',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function getResponses(data, sessionToken = null) {
  try {
    const testId = data.testId || data.TestId;
    let testPaper = await TestPaper.findOne({ TestID: testId }).lean();
    let test = testPaper ? {
      AnswerKeyPublished: testPaper.meta.answerKeyPublished
    } : await Test.findOne({ TestID: testId }).lean();
    const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
    const isAnswerKeyPublished = test?.AnswerKeyPublished || false;

    const questions = await testPaperUtils.getQuestions(testId);
    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.QID] = q;
    });

    // If testId is provided, get all responses for the test (flattened)
    if (data.testId) {
      if (!isAdmin) {
        return { success: false, error: 'Unauthorized' };
      }
      let submissions = await SubmissionResult.find({ TestId: data.testId }).lean();
      if (submissions.length === 0) {
        const responses = await Response.find({ TestId: data.testId }).lean();
        const flatResponses = [];
        responses.forEach(resp => {
          resp.answers.forEach(answer => {
            const question = questionMap[answer.QID];
            const includeCorrect = isAdmin || isAnswerKeyPublished;
            flatResponses.push({
              userID: resp.userID,
              TestId: resp.TestId,
              QID: answer.QID,
              Question: question ? question.Question : '',
              A: question ? question.A : '',
              B: question ? question.B : '',
              C: question ? question.C : '',
              D: question ? question.D : '',
              Correct: includeCorrect ? (question ? question.Correct : '') : '',
              SelectedAnswer: answer.SelectedAnswer,
              IsCorrect: includeCorrect ? answer.IsCorrect : null,
              IsUnanswered: answer.IsUnanswered,
              Marks: includeCorrect ? answer.Marks : null,
              NegativeMarks: includeCorrect ? answer.NegativeMarks : null
            });
          });
        });
        return flatResponses;
      }

      const flatResponses = [];
      submissions.forEach(sub => {
        sub.answers.forEach(ans => {
          const question = questionMap[ans.qid];
          const includeCorrect = isAdmin || isAnswerKeyPublished;
          flatResponses.push({
            userID: sub.userID,
            TestId: sub.TestId,
            QID: ans.qid,
            Question: question ? question.Question : '',
            A: question ? question.A : '',
            B: question ? question.B : '',
            C: question ? question.C : '',
            D: question ? question.D : '',
            Correct: includeCorrect ? ans.correctAnswer : '',
            SelectedAnswer: ans.selected,
            IsCorrect: includeCorrect ? ans.isCorrect : null,
            IsUnanswered: ans.isUnanswered,
            Marks: includeCorrect ? ans.marks : null,
            NegativeMarks: includeCorrect ? ans.negativeMarks : null
          });
        });
      });
      return flatResponses;
    }

    // Otherwise get single response
    let submission = await SubmissionResult.findOne({ TestId: data.TestId, userID: data.userID }).lean();
    if (!submission) {
      const response = await Response.findOne({ TestId: data.TestId, userID: data.userID }).lean();
      if (!response) {
        return { success: false, error: 'Responses not found' };
      }
      // Check if result is published or admin
      const perf = await Performance.findOne({ userID: data.userID, TestId: data.TestId }).lean();
      if (!isAdmin && !(perf?.ResultPublished)) {
        return { success: false, error: 'Result not published yet', submitted: true, resultPublished: false };
      }
      const includeCorrect = isAdmin || isAnswerKeyPublished;
      const flatAnswers = response.answers.map(answer => {
        const question = questionMap[answer.QID];
        return {
          QID: answer.QID,
          Question: question ? question.Question : '',
          A: question ? question.A : '',
          B: question ? question.B : '',
          C: question ? question.C : '',
          D: question ? question.D : '',
          Correct: includeCorrect ? (question ? question.Correct : '') : '',
          SelectedAnswer: answer.SelectedAnswer,
          IsCorrect: includeCorrect ? answer.IsCorrect : null,
          IsUnanswered: answer.IsUnanswered,
          Marks: includeCorrect ? answer.Marks : null,
          NegativeMarks: includeCorrect ? answer.NegativeMarks : null
        };
      });
      return { success: true, Responses: flatAnswers };
    }

    // Check if result is published or admin
    if (!isAdmin && !submission.result.published) {
      return { success: false, error: 'Result not published yet', submitted: true, resultPublished: false };
    }
    const includeCorrect = isAdmin || isAnswerKeyPublished;
    const flatAnswers = submission.answers.map(ans => {
      const question = questionMap[ans.qid];
      return {
        QID: ans.qid,
        Question: question ? question.Question : '',
        A: question ? question.A : '',
        B: question ? question.B : '',
        C: question ? question.C : '',
        D: question ? question.D : '',
        Correct: includeCorrect ? ans.correctAnswer : '',
        SelectedAnswer: ans.selected,
        IsCorrect: includeCorrect ? ans.isCorrect : null,
        IsUnanswered: ans.isUnanswered,
        Marks: includeCorrect ? ans.marks : null,
        NegativeMarks: includeCorrect ? ans.negativeMarks : null
      };
    });
    return { success: true, Responses: flatAnswers };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getResponses',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function publishResult(TestId, userID, Rank, Percentile) {
  try {
    let submission = await SubmissionResult.findOne({ TestId: TestId, userID: userID });
    let email, name, score;
    if (submission) {
      submission.result.published = true;
      submission.result.publishedAt = new Date();
      submission.ranking.rank = Rank;
      submission.ranking.rankPercentile = Percentile;
      await submission.save();
      email = submission.candidate.email;
      name = submission.candidate.name;
      score = submission.summary.netScore;
    } else {
      const performance = await Performance.findOne({ TestId: TestId, userID: userID });
      if (!performance) return { success: false, error: 'Performance not found' };
      performance.ResultPublished = true;
      performance.PublishedAt = new Date();
      performance.Rank = Rank;
      performance.Percentile = Percentile;
      await performance.save();
      email = performance.Email;
      name = performance.name;
      score = performance.TotalScore;
    }
    await emailService.sendResultEmail(email, name, TestId, score, Rank, Percentile);
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'publishResult',
      UserID: userID,
      Details: { TestId: TestId }
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

async function publishAllResults(TestId) {
  try {
    // Update rankings first
    await updateRankings(TestId);

    let submissions = await SubmissionResult.find({ TestId: TestId }).sort({
      'summary.netScore': -1,
      'timing.submittedAt': 1
    }).lean();
    if (submissions.length === 0) {
      const performances = await Performance.find({ TestId: TestId }).sort({ NetScore: -1, SubmittedAt: 1 }).lean();
      const total = performances.length;
      for (let i = 0; i < total; i++) {
        const perf = performances[i];
        const rank = i + 1;
        const percentile = ((total - i) / total) * 100;
        await publishResult(TestId, perf.userID, rank, percentile);
      }
    } else {
      const total = submissions.length;
      for (let i = 0; i < total; i++) {
        const sub = submissions[i];
        const rank = i + 1;
        const percentile = ((total - i) / total) * 100;
        await publishResult(TestId, sub.userID, rank, percentile);
      }
    }
    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'publishAllResults',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

/**
 * FEATURE: Global candidate analytics
 * Searches both optimized SubmissionResult and legacy Performance records.
 * Supports UserID, email, and name lookup.
 */
async function getCandidateAnalytics(params) {
  try {
    const query = (params?.query || params?.userID || '').trim();
    if (!query) {
      return { success: true, totalExams: 0, avgOverallPercentage: 0, avgPercentile: 0, strongestSections: [], examHistory: [], candidate: null };
    }

    // Build flexible search query for SubmissionResult
    const submissionQuery = {
      $or: [
        { userID: query },
        { 'candidate.email': { $regex: query, $options: 'i' } },
        { 'candidate.name': { $regex: query, $options: 'i' } },
        { 'candidate.univId': { $regex: query, $options: 'i' } }
      ]
    };

    let submissions = await SubmissionResult.find(submissionQuery).sort({ 'timing.submittedAt': -1 }).lean();
    let items = submissions;
    let useSubmission = true;
    let candidateInfo = null;

    // Fallback to legacy Performance if no SubmissionResult found
    if (submissions.length === 0) {
      const performanceQuery = {
        $or: [
          { userID: query },
          { Email: { $regex: query, $options: 'i' } },
          { Name: { $regex: query, $options: 'i' } },
          { UnivID: { $regex: query, $options: 'i' } }
        ]
      };
      items = await Performance.find(performanceQuery).sort({ SubmittedAt: -1 }).lean();
      useSubmission = false;
    }

    // Extract candidate info from first record
    if (items.length > 0) {
      const first = items[0];
      candidateInfo = useSubmission ? {
        userID: first.userID,
        name: first.candidate?.name,
        email: first.candidate?.email
      } : {
        userID: first.userID,
        name: first.Name,
        email: first.Email
      };
    }

    const stats = {
      totalTests: items.length,
      averageScore: 0,
      highestScore: -Infinity,
      lowestScore: Infinity,
      testsTaken: items.length,
      totalExams: items.length,
      avgOverallPercentage: 0,
      strongestSections: [],
      avgPercentile: 0
    };

    if (items.length > 0) {
      const scores = items.map(item => useSubmission ? item.summary.netScore : item.NetScore);
      stats.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      stats.highestScore = Math.max(...scores);
      stats.lowestScore = Math.min(...scores);

      const percentages = [];
      const sectionScores = {};
      const percentiles = [];
      items.forEach(item => {
        if (useSubmission) {
          const totalQuestions = item.summary.totalQuestions || 0;
          const correctCount = item.summary.correctCount || 0;
          if (totalQuestions > 0) percentages.push((correctCount / totalQuestions) * 100);
          if (item.sections) {
            Object.entries(item.sections).forEach(([section, data]) => {
              if (!sectionScores[section]) sectionScores[section] = { total: 0, correct: 0 };
              sectionScores[section].total += data.totalQuestions || 0;
              sectionScores[section].correct += data.correctCount || 0;
            });
          }
          if (item.ranking?.rankPercentile !== undefined && item.ranking?.rankPercentile !== null) {
            percentiles.push(item.ranking.rankPercentile);
          }
        } else {
          const totalQuestions = item.TotalQuestions || 0;
          const correctCount = item.CorrectCount || 0;
          if (totalQuestions > 0) percentages.push((correctCount / totalQuestions) * 100);
          if (item.SectionAnalyticsJSON) {
            Object.entries(item.SectionAnalyticsJSON).forEach(([section, data]) => {
              if (!sectionScores[section]) sectionScores[section] = { total: 0, correct: 0 };
              sectionScores[section].total += data.TotalQuestions || 0;
              sectionScores[section].correct += data.CorrectCount || 0;
            });
          }
          if (item.Percentile !== undefined && item.Percentile !== null) percentiles.push(item.Percentile);
        }
      });
      stats.avgOverallPercentage = percentages.length > 0 ? (percentages.reduce((a,b) => a+b, 0)/percentages.length) : 0;
      stats.avgPercentile = percentiles.length > 0 ? (percentiles.reduce((a,b) => a+b, 0)/percentiles.length) : 0;

      if (Object.keys(sectionScores).length > 0) {
        let maxPercentage = -1;
        Object.entries(sectionScores).forEach(([section, data]) => {
          const percentage = data.total > 0 ? (data.correct / data.total) * 100 : 0;
          if (percentage > maxPercentage) {
            maxPercentage = percentage;
            stats.strongestSections = [section];
          } else if (percentage === maxPercentage) {
            stats.strongestSections.push(section);
          }
        });
      }
    }

    const examHistory = items.map(item => {
      if (useSubmission) {
        return {
          testId: item.TestId,
          date: item.timing.submittedAt,
          overallPercentage: (item.summary.correctCount && item.summary.totalQuestions) ? (item.summary.correctCount / item.summary.totalQuestions) * 100 : 0,
          percentile: item.ranking?.rankPercentile,
          rank: item.ranking?.rank,
          state: item.summary.state
        };
      }
      return {
        testId: item.TestId,
        date: item.SubmittedAt,
        overallPercentage: (item.CorrectCount && item.TotalQuestions) ? (item.CorrectCount / item.TotalQuestions) * 100 : 0,
        percentile: item.Percentile,
        rank: item.Rank,
        state: item.State
      };
    });

    return { success: true, ...stats, examHistory, candidate: candidateInfo };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getCandidateAnalytics',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function getMalpracticeLogs(params, sessionToken) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) return { success: false, error: 'Unauthorized' };

    const testId = params.testId;
    let query = {};
    if (testId) query.TestId = testId;

    let submissions = await SubmissionResult.find(query).sort({ 'timing.submittedAt': -1 }).lean();
    let logs;
    if (submissions.length === 0) {
      const perfQuery = { $or: [{ FullScreenViolations: { $gt: 0 } }, { TabSwitchCount: { $gt: 0 } }] };
      if (testId) perfQuery.TestId = testId;
      logs = await Performance.find(perfQuery).sort({ SubmittedAt: -1 }).lean();
    } else {
      logs = submissions
        .filter(sub => (sub.violations?.fullScreenViolations || 0) > 0 || (sub.violations?.tabSwitchCount || 0) > 0)
        .map(sub => submissionToPerformance(sub));
    }

    return { success: true, MalpracticeLogs: logs };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getMalpracticeLogs',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

function calculateSectionGradePoint(sections) {
  if (!sections) return 0;
  const sectionList = Object.values(sections);
  if (sectionList.length === 0) return 0;
  const total = sectionList.reduce((sum, s) => sum + (s.scorePercentile || 0), 0);
  return round2(total / sectionList.length);
}

function calculateDifficultyGradePoint(difficulty) {
  if (!difficulty) return 0;
  let totalWeight = 0;
  let totalScore = 0;
  const weights = {
    Easy: 0.2, Medium: 0.3, Hard: 0.5, Unknown: 0
  };
  Object.keys(weights).forEach(key => {
    const d = difficulty[key];
    if (d && (d.scorePercentile !== undefined && d.scorePercentile !== null)) {
      totalWeight += weights[key];
      totalScore += (d.scorePercentile || 0) * weights[key];
    }
  });
  if (totalWeight === 0) return 0;
  return round2(totalScore / totalWeight);
}

function calculateTimeEfficiencyPercent(submission) {
  const allowed = submission.timing?.allowedDurationSeconds;
  if (!allowed || allowed <= 0) return 0;
  const taken = submission.timing?.totalTimeTakenSeconds || 0;
  return round2(Math.max(0, 100 - ((taken / allowed) * 100)));
}

function calculateLeaderboardScore(submission) {
  const scoreComponent = (submission.summary?.scorePercentile || 0) * 0.7;
  const accuracyComponent = (submission.summary?.accuracyPercent || 0) * 0.15;
  const sectionComponent = calculateSectionGradePoint(submission.sections) * 0.1;
  const timeComponent = calculateTimeEfficiencyPercent(submission) * 0.05;
  return round2(scoreComponent + accuracyComponent + sectionComponent + timeComponent);
}

function maskEmail(email) {
  if (!email) return '';
  const [localPart, domain] = email.split('@');
  if (localPart && domain) {
    return `${localPart.substring(0, 2)}***@${domain}`;
  }
  return '***@***.com';
}

function formatTime(seconds) {
  const s = Math.max(0, seconds || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function getLeaderboard(params, sessionToken = null) {
  try {
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) return { success: false, error: 'Unauthorized' };

    const testId = params.testId;
    if (!testId) return { success: false, error: 'testId is required' };

    const submissions = await SubmissionResult.find({ TestId: testId }).lean();
    const totalCandidates = submissions.length;

    const sortBy = params.sortBy || 'leaderboardScore';
    const sortOrder = (params.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    // Generate leaderboard rows
    let leaderboard = submissions.map(sub => ({
      userID: sub.userID,
      name: sub.candidate?.name || 'Unknown',
      emailMasked: maskEmail(sub.candidate?.email),
      TestId: sub.TestId,
      totalScore: sub.summary?.rawScore || 0,
      netScore: sub.summary?.netScore || 0,
      maxPossibleScore: sub.test?.maxPossibleScore || 0,
      scorePercentile: sub.summary?.scorePercentile || 0,
      accuracyPercent: sub.summary?.accuracyPercent || 0,
      attemptPercent: sub.summary?.attemptPercent || 0,
      totalTimeTakenSeconds: sub.timing?.totalTimeTakenSeconds || 0,
      totalTimeTakenDisplay: formatTime(sub.timing?.totalTimeTakenSeconds),
      correctCount: sub.summary?.correctCount || 0,
      wrongCount: sub.summary?.wrongCount || 0,
      unansweredCount: sub.summary?.unansweredCount || 0,
      sectionGradePoint: calculateSectionGradePoint(sub.sections),
      difficultyGradePoint: calculateDifficultyGradePoint(sub.difficulty),
      leaderboardScore: calculateLeaderboardScore(sub),
      submittedAt: sub.timing?.submittedAt || sub.createdAt
    }));

    // Default sort for rank
    function defaultSort(a, b) {
      const scoreDiff = b.leaderboardScore - a.leaderboardScore;
      if (scoreDiff !== 0) return scoreDiff;
      const pctDiff = b.scorePercentile - a.scorePercentile;
      if (pctDiff !== 0) return pctDiff;
      const netDiff = b.netScore - a.netScore;
      if (netDiff !== 0) return netDiff;
      const correctDiff = b.correctCount - a.correctCount;
      if (correctDiff !== 0) return correctDiff;
      const wrongDiff = a.wrongCount - b.wrongCount;
      if (wrongDiff !== 0) return wrongDiff;
      const timeDiff = a.totalTimeTakenSeconds - b.totalTimeTakenSeconds;
      if (timeDiff !== 0) return timeDiff;
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    }

    // Apply sorting
    if (sortBy === 'rank') {
      leaderboard.sort(defaultSort);
      if (sortOrder === 1) {
        // If rank ascending, it's same as default sort (1, 2, 3...), which is what we already have
      } else {
        // Reverse for descending
        leaderboard.sort((a, b) => -defaultSort(a, b));
      }
    } else {
      const sortFunctions = {
        leaderboardScore: (a, b) => b.leaderboardScore - a.leaderboardScore,
        scorePercentile: (a, b) => b.scorePercentile - a.scorePercentile,
        netScore: (a, b) => b.netScore - a.netScore,
        accuracyPercent: (a, b) => b.accuracyPercent - a.accuracyPercent,
        attemptPercent: (a, b) => b.attemptPercent - a.attemptPercent,
        time: (a, b) => a.totalTimeTakenSeconds - b.totalTimeTakenSeconds,
        correctCount: (a, b) => b.correctCount - a.correctCount,
        wrongCount: (a, b) => a.wrongCount - b.wrongCount,
        unansweredCount: (a, b) => a.unansweredCount - b.unansweredCount,
        submittedAt: (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)
      };
      const fn = sortFunctions[sortBy] || sortFunctions.leaderboardScore;
      leaderboard.sort((a, b) => {
        const res = fn(a, b);
        return sortOrder === 1 ? res : -res;
      });
    }

    // Assign ranks
    let currentRank = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      if (i > 0) {
        const prev = leaderboard[i - 1];
        const curr = leaderboard[i];
        const isSame = prev.leaderboardScore === curr.leaderboardScore &&
                        prev.netScore === curr.netScore &&
                        prev.correctCount === curr.correctCount &&
                        prev.wrongCount === curr.wrongCount &&
                        prev.totalTimeTakenSeconds === curr.totalTimeTakenSeconds;
        if (!isSame) {
          currentRank = i + 1;
        }
      }
      leaderboard[i].rank = currentRank;
    }

    // If sorting by rank, ensure rank order
    if (sortBy === 'rank') {
      leaderboard.sort((a, b) => sortOrder === 1 ? a.rank - b.rank : b.rank - a.rank);
    }

    return {
      success: true,
      testId,
      totalCandidates,
      sortedBy: sortBy,
      sortOrder: sortOrder === 1 ? 'asc' : 'desc',
      leaderboard
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getLeaderboard',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function getCandidateTests(data) {
  try {
    const userID = data.userID || data.userId;
    if (!userID) return { success: false, error: 'User ID required' };

    // First get all testPapers, then legacy tests
    const [testPapers, legacyTests, submissions] = await Promise.all([
      TestPaper.find({ 'meta.isDeleted': false }).lean(),
      Test.find({ IsDeleted: { $ne: true } }).lean(),
      SubmissionResult.find({ userID }).lean()
    ]);

    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.TestId] = sub;
    });

    // Combine testPapers and legacy tests without duplicates
    const existingTestIds = new Set(testPapers.map(tp => tp.TestID));
    const allTests = [...testPapers.map(tp => ({ ...tp, isTestPaper: true }))];
    for (const lt of legacyTests) {
      if (!existingTestIds.has(lt.TestID)) {
        allTests.push({ ...lt, isTestPaper: false });
      }
    }

    const active = [];
    const completed = [];
    const upcoming = [];
    const ended = [];

    allTests.forEach(test => {
      // Convert to legacy shape
      let legacyTest;
      if (test.isTestPaper) {
        legacyTest = testPaperUtils.convertTestPaperToLegacyTest(test);
      } else {
        legacyTest = test;
      }

      const submission = submissionMap[legacyTest.TestID];
      const submitted = !!submission;

      // Use examTimeUtils for exam window
      const examWindow = examTimeUtils.getExamWindowFromPaper(test.isTestPaper ? test : legacyTest);
      const { startAt, expiryAt, visibleUntil, now } = examWindow;

      let status;
      if (submitted) {
        status = 'completed';
      } else {
        // Convert examWindow.status (which is "Upcoming"/"Active"/"Ended") to lowercase
        status = examWindow.status.toLowerCase();
      }
      
      const testEntry = {
        TestID: legacyTest.TestID,
        Name: legacyTest.Name,
        Date: legacyTest.Date,
        StartTime: legacyTest.StartTime,
        ExpiryTime: legacyTest.ExpiryTime,
        Duration: legacyTest.Duration,
        Sections: legacyTest.Sections,
        status,
        canLogin: examWindow.canLogin,
        submitted,
        quickResult: legacyTest.QuickResult,
        resultPublished: submission ? submission.result?.published : false,
        liveLeaderboardEnabled: legacyTest.LiveLeaderboardEnabled !== false,
        startAtISO: examWindow.startAtISO,
        expiryAtISO: examWindow.expiryAtISO,
        serverNowISO: examWindow.serverNowISO,
        countdownData: examWindow.countdownData,
        liveLeaderboardVisibleUntilISO: examWindow.visibleUntilISO
      };

      if (submission) {
        testEntry.submittedAt = submission.timing?.submittedAt;
        testEntry.scorePercentile = submission.summary?.scorePercentile;
      }

      switch (status) {
        case 'completed':
          completed.push(testEntry);
          break;
        case 'active':
          active.push(testEntry);
          break;
        case 'upcoming':
          upcoming.push(testEntry);
          break;
        case 'ended':
          ended.push(testEntry);
          break;
      }
    });

    return { success: true, active, completed, upcoming, ended };
  } catch (err) {
    await ErrorLog.create({ Timestamp: new Date(), Function: 'getCandidateTests', Error: err.message });
    return { success: false, error: err.message };
  }
}

async function getCandidateOverallLeaderboard(data, sessionToken) {
  try {
    console.log('[OVERALL LEADERBOARD] Starting');
    // Verify session token
    const session = await Session.findOne({ sessionToken });
    if (!session || new Date() > session.expiresAt) {
      return { success: false, error: 'Invalid session' };
    }

    const sessionUserId = session.userId || session.userID;
    console.log('[OVERALL LEADERBOARD] current session user', { sessionUserId });

    // Find current user by any possible identifier
    const currentUser = await User.findOne({
      $or: [
        { UserID: sessionUserId },
        ...(mongoose.Types.ObjectId.isValid(sessionUserId) ? [{ _id: new mongoose.Types.ObjectId(sessionUserId) }] : [])
      ]
    }).lean();
    
    if (!currentUser) return { success: false, error: 'User not found' };
    console.log('[OVERALL LEADERBOARD] db user found', { 
      _id: String(currentUser._id), 
      UserID: currentUser.UserID, 
      name: currentUser.FullName 
    });

    const scope = {
      department: currentUser.Department || currentUser.department,
      college: currentUser.College || currentUser.college,
      year: currentUser.Year || currentUser.year
    };
    console.log('[OVERALL LEADERBOARD] scope department/college/year', scope);

    // Get all users in same department/year/college
    const users = await User.find({
      $and: [
        { $or: [{ Department: scope.department }, { department: scope.department }] },
        { $or: [{ Year: scope.year }, { year: scope.year }] },
        { $or: [{ College: scope.college }, { college: scope.college }] }
      ]
    }).lean();
    console.log('[OVERALL LEADERBOARD] matched users', users.map(u => ({ 
      _id: String(u._id), 
      UserID: u.UserID, 
      name: u.FullName 
    })));

    // Build all possible user IDs for matching
    const userIdsList = [];
    const userMap = new Map();
    users.forEach(u => {
      const ids = [];
      if (u._id) ids.push(String(u._id));
      if (u.UserID) ids.push(u.UserID);
      userIdsList.push(...ids);
      // Store user by each id for later lookup
      ids.forEach(id => userMap.set(id, u));
    });
    const uniqueUserIds = Array.from(new Set(userIdsList));
    console.log('[OVERALL LEADERBOARD] matched user ids', uniqueUserIds);

    // Get all submission results for these users
    const submissions = await SubmissionResult.find({
      userID: { $in: uniqueUserIds }
    }).lean();
    console.log('[OVERALL LEADERBOARD] submissionresults found', submissions.length);

    // Calculate per user stats by aggregating SubmissionResult
    const userStats = {};
    users.forEach(u => {
      const idKey = u.UserID || String(u._id);
      userStats[idKey] = {
        userID: u.UserID || String(u._id),
        name: u.FullName || u.fullName || u.name,
        emailMasked: maskEmail(u.Email || u.email),
        department: u.Department || u.department,
        college: u.College || u.college,
        year: u.Year || u.year,
        attendedTestCount: 0,
        totalScorePercentile: 0,
        totalAccuracyPercent: 0,
        totalAttemptPercent: 0,
        totalTimeTakenMinutes: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalUnanswered: 0,
        lastSubmittedAt: null
      };
    });

    submissions.forEach(sub => {
      // Find user in userMap using sub.userID
      let user = userMap.get(sub.userID);
      if (!user) {
        // Try to match by any other key
        for (const [id, u] of userMap.entries()) {
          if (id === sub.userID) {
            user = u;
            break;
          }
        }
      }
      if (user) {
        const key = user.UserID || String(user._id);
        const stats = userStats[key];
        if (stats) {
          stats.attendedTestCount++;
          stats.totalScorePercentile += sub.summary?.scorePercentile || 0;
          stats.totalAccuracyPercent += sub.summary?.accuracyPercent || 0;
          stats.totalAttemptPercent += sub.summary?.attemptPercent || 0;
          stats.totalTimeTakenMinutes += sub.timing?.totalTimeTakenMinutes || 0;
          stats.totalCorrect += sub.summary?.correctCount || 0;
          stats.totalWrong += sub.summary?.wrongCount || 0;
          stats.totalUnanswered += sub.summary?.unansweredCount || 0;
          
          if (!stats.lastSubmittedAt || new Date(sub.timing?.submittedAt) > new Date(stats.lastSubmittedAt)) {
            stats.lastSubmittedAt = sub.timing?.submittedAt;
          }
        }
      }
    });

    const SHOW_ZERO_ATTEMPT_LEADERBOARD = process.env.SHOW_ZERO_ATTEMPT_LEADERBOARD === 'true';
    
    let leaderboard = Object.values(userStats)
      .filter(u => SHOW_ZERO_ATTEMPT_LEADERBOARD || u.attendedTestCount > 0)
      .map(u => ({
        rank: 0,
        userID: u.userID,
        isCurrentUser: 
          (currentUser.UserID || String(currentUser._id)) === u.userID || 
          String(currentUser._id) === u.userID || 
          currentUser.UserID === u.userID,
        name: u.name,
        emailMasked: u.emailMasked,
        department: u.department,
        college: u.college,
        year: u.year,
        attendedTestCount: u.attendedTestCount,
        avgScorePercentile: u.attendedTestCount > 0 ? round2(u.totalScorePercentile / u.attendedTestCount) : 0,
        avgAccuracyPercent: u.attendedTestCount > 0 ? round2(u.totalAccuracyPercent / u.attendedTestCount) : 0,
        avgAttemptPercent: u.attendedTestCount > 0 ? round2(u.totalAttemptPercent / u.attendedTestCount) : 0,
        avgTimeTakenMinutes: u.attendedTestCount > 0 ? round2(u.totalTimeTakenMinutes / u.attendedTestCount) : 0,
        totalCorrect: u.totalCorrect,
        totalWrong: u.totalWrong,
        totalUnanswered: u.totalUnanswered,
        lastSubmittedAt: u.lastSubmittedAt
      }));

    // Sort leaderboard
    leaderboard.sort((a, b) => {
      if (b.avgScorePercentile !== a.avgScorePercentile) return b.avgScorePercentile - a.avgScorePercentile;
      if (b.avgAccuracyPercent !== a.avgAccuracyPercent) return b.avgAccuracyPercent - a.avgAccuracyPercent;
      if (a.avgTimeTakenMinutes !== b.avgTimeTakenMinutes) return a.avgTimeTakenMinutes - b.avgTimeTakenMinutes;
      if (b.attendedTestCount !== a.attendedTestCount) return b.attendedTestCount - a.attendedTestCount;
      if (!a.lastSubmittedAt && !b.lastSubmittedAt) return 0;
      if (!a.lastSubmittedAt) return 1;
      if (!b.lastSubmittedAt) return -1;
      return new Date(a.lastSubmittedAt) - new Date(b.lastSubmittedAt);
    });

    // Assign ranks
    for (let i = 0; i < leaderboard.length; i++) {
      leaderboard[i].rank = i + 1;
    }
    
    console.log('[OVERALL LEADERBOARD] final rows', leaderboard);

    return {
      success: true,
      scope,
      currentUserID: currentUser.UserID || String(currentUser._id),
      updatedAt: new Date(),
      leaderboard
    };
  } catch (err) {
    await ErrorLog.create({ Timestamp: new Date(), Function: 'getCandidateOverallLeaderboard', Error: err.message });
    console.error('[OVERALL LEADERBOARD] Error', err);
    return { success: false, error: err.message };
  }
}

async function getLiveTestLeaderboard(data, sessionToken) {
  try {
    console.log('[LIVE TEST LEADERBOARD] testId', data.testId);
    // Verify session token
    const session = await Session.findOne({ sessionToken });
    if (!session || new Date() > session.expiresAt) {
      return { success: false, error: 'Invalid session' };
    }

    const testId = data.testId;
    if (!testId) return { success: false, error: 'Test ID required' };

    const test = await Test.findOne({ TestID: testId }).lean();
    const testName = test?.Name || 'Test';
    const sessionUserId = session.userId || session.userID;
    const currentUser = await User.findOne({
      $or: [
        { UserID: sessionUserId },
        ...(mongoose.Types.ObjectId.isValid(sessionUserId) ? [{ _id: new mongoose.Types.ObjectId(sessionUserId) }] : [])
      ]
    }).lean();
    const currentUserID = currentUser ? (currentUser.UserID || String(currentUser._id)) : sessionUserId;

    const submissions = await SubmissionResult.find({ TestId: testId }).lean();
    console.log('[LIVE TEST LEADERBOARD] submissions found', submissions.length);
    const userIDsInTest = submissions.map(s => s.userID);
    const usersInTest = await User.find({
      $or: [
        { UserID: { $in: userIDsInTest } },
        ...(userIDsInTest.some(id => mongoose.Types.ObjectId.isValid(id)) ? 
          [{ _id: { $in: userIDsInTest.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) } }] : [])
      ]
    }).lean();
    const userMap = new Map();
    usersInTest.forEach(u => {
      if (u._id) userMap.set(String(u._id), u);
      if (u.UserID) userMap.set(u.UserID, u);
    });

    let leaderboard = submissions.map(sub => {
      let user = userMap.get(sub.userID);
      // Try to find user by any key in userMap
      if (!user) {
        for (const [id, u] of userMap.entries()) {
          if (id === sub.userID) {
            user = u;
            break;
          }
        }
      }
      const totalTimeTakenSeconds = sub.timing?.totalTimeTakenSeconds || 
        (sub.timing?.totalTimeTakenMinutes ? sub.timing.totalTimeTakenMinutes * 60 : 0);
      return {
        rank: 0,
        userID: sub.userID,
        isCurrentUser: sub.userID === currentUserID || 
          (currentUser && sub.userID === String(currentUser._id)) || 
          (currentUser && sub.userID === currentUser.UserID),
        name: sub.candidate?.name || user?.FullName || user?.fullName || user?.name || 'Unknown',
        scorePercentile: sub.summary?.scorePercentile || 0,
        netScore: sub.summary?.netScore || 0,
        maxPossibleScore: sub.test?.maxPossibleScore || 0,
        correctCount: sub.summary?.correctCount || 0,
        wrongCount: sub.summary?.wrongCount || 0,
        unansweredCount: sub.summary?.unansweredCount || 0,
        totalTimeTakenSeconds,
        totalTimeTakenMinutes: sub.timing?.totalTimeTakenMinutes || 0,
        submittedAt: sub.timing?.submittedAt
      };
    });

    // Sort
    leaderboard.sort((a, b) => {
      if (b.scorePercentile !== a.scorePercentile) return b.scorePercentile - a.scorePercentile;
      if (b.netScore !== a.netScore) return b.netScore - a.netScore;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      if (a.wrongCount !== b.wrongCount) return a.wrongCount - b.wrongCount;
      if (a.totalTimeTakenSeconds !== b.totalTimeTakenSeconds) return a.totalTimeTakenSeconds - b.totalTimeTakenSeconds;
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });

    // Assign ranks
    for (let i = 0; i < leaderboard.length; i++) {
      leaderboard[i].rank = i + 1;
    }
    
    console.log('[LIVE TEST LEADERBOARD] rows generated', leaderboard.length);
    const updatedAt = new Date();
    console.log('[LIVE TEST LEADERBOARD] updatedAt', updatedAt);

    return { 
      success: true, 
      testId, 
      testName,
      currentUserID,
      updatedAt,
      leaderboard
    };
  } catch (err) {
    await ErrorLog.create({ Timestamp: new Date(), Function: 'getLiveTestLeaderboard', Error: err.message });
    console.error('[LIVE TEST LEADERBOARD] Error', err);
    return { success: false, error: err.message };
  }
}

async function startExamSession(data, sessionToken) {
  try {
    console.log('[START EXAM SESSION] Starting', { testId: data.TestId });
    // Verify session token
    const session = await Session.findOne({ sessionToken });
    if (!session || new Date() > session.expiresAt) {
      return { success: false, error: 'Invalid session' };
    }

    const testId = data.TestId;
    if (!testId) return { success: false, error: 'Test ID required' };

    let testPaper = await TestPaper.findOne({ TestID: testId }).lean();
    let test, totalQuestions;

    if (testPaper) {
      test = testPaperUtils.convertTestPaperToLegacyTest(testPaper);
      const activeQuestions = testPaper.questions.filter(q => !q.isDeleted);
      totalQuestions = activeQuestions.length;
    } else {
      test = await Test.findOne({ TestID: testId }).lean();
      if (!test) return { success: false, error: 'Test not found' };
      const questions = await Question.find({ TestID: testId, IsDeleted: { $ne: true } }).lean();
      totalQuestions = questions.length;
    }

    const sessionUserId = session.userId || session.userID;
    const currentUser = await User.findOne({
      $or: [
        { UserID: sessionUserId },
        ...(mongoose.Types.ObjectId.isValid(sessionUserId) ? [{ _id: new mongoose.Types.ObjectId(sessionUserId) }] : [])
      ]
    }).lean();
    const userID = currentUser ? (currentUser.UserID || String(currentUser._id)) : sessionUserId;

    // Parse test end time for expiresAt
    const testDate = new Date(test.Date);
    let testEndTime = new Date(testDate);
    const [endHour, endMin] = (test.ExpiryTime || test.EndTime || '23:59').split(':').map(Number);
    testEndTime.setHours(endHour, endMin, 0, 0);
    const expiresAt = new Date(testEndTime.getTime() + 24 * 60 * 60 * 1000);

    // Check if already submitted
    const existingSubmission = await SubmissionResult.findOne({ userID, TestId: testId }).lean();
    if (existingSubmission) {
      return { success: false, error: 'You have already submitted this test' };
    }

    // Upsert LiveExamSession
    const sessionId = `${userID}-${testId}-${Date.now()}`;
    const now = new Date();
    const liveSession = await LiveExamSession.findOneAndUpdate(
      { userID, TestId: testId },
      {
        $setOnInsert: {
          sessionId,
          startedAt: now,
          candidate: {
            name: currentUser?.FullName || currentUser?.fullName || currentUser?.name || 'Unknown',
            email: currentUser?.Email || currentUser?.email || '',
            univId: currentUser?.UnivID || currentUser?.univId || '',
            department: currentUser?.Department || currentUser?.department || '',
            college: currentUser?.College || currentUser?.college || '',
            year: currentUser?.Year || currentUser?.year || ''
          },
          test: {
            name: test.Name || '',
            date: testDate,
            startTime: test.StartTime || '',
            expiryTime: test.ExpiryTime || test.EndTime || '',
            durationMinutes: test.Duration || 0
          }
        },
        $set: {
          status: 'in_progress',
          lastHeartbeat: now,
          'progress.totalQuestions': totalQuestions,
          expiresAt,
          updatedAt: now
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    console.log('[START EXAM SESSION] Session created/updated');
    return {
      success: true,
      sessionId: liveSession.sessionId,
      startedAt: liveSession.startedAt,
      totalQuestions
    };
  } catch (err) {
    await ErrorLog.create({ Timestamp: new Date(), Function: 'startExamSession', Error: err.message });
    console.error('[START EXAM SESSION] Error', err);
    return { success: false, error: err.message };
  }
}

async function examHeartbeat(data, sessionToken) {
  try {
    // Verify session token
    const session = await Session.findOne({ sessionToken });
    if (!session || new Date() > session.expiresAt) {
      return { success: false, error: 'Invalid session' };
    }

    const testId = data.TestId;
    const sessionId = data.sessionId;
    if (!testId) return { success: false, error: 'Test ID required' };

    const sessionUserId = session.userId || session.userID;
    const currentUser = await User.findOne({
      $or: [
        { UserID: sessionUserId },
        ...(mongoose.Types.ObjectId.isValid(sessionUserId) ? [{ _id: new mongoose.Types.ObjectId(sessionUserId) }] : [])
      ]
    }).lean();
    const userID = currentUser ? (currentUser.UserID || String(currentUser._id)) : sessionUserId;

    const now = new Date();
    const answeredCount = data.answeredCount || 0;
    const currentQuestionIndex = data.currentQuestionIndex || 0;
    const fullScreenViolations = data.FullScreenViolations || data.fullScreenViolations || 0;
    const tabSwitchCount = data.TabSwitchCount || data.tabSwitchCount || 0;

    const liveSession = await LiveExamSession.findOne({ userID, TestId: testId }).lean();
    if (!liveSession) {
      return { success: false, error: 'Session not found' };
    }
    if (liveSession.status === 'submitted') {
      return { success: false, error: 'Test already submitted' };
    }

    const totalQuestions = liveSession.progress.totalQuestions || 0;
    const remainingCount = totalQuestions - answeredCount;
    const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

    await LiveExamSession.updateOne(
      { userID, TestId: testId },
      {
        $set: {
          lastHeartbeat: now,
          'progress.currentQuestionIndex': currentQuestionIndex,
          'progress.answeredCount': answeredCount,
          'progress.remainingCount': remainingCount,
          'progress.progressPercent': progressPercent,
          'security.fullScreenViolations': fullScreenViolations,
          'security.tabSwitchCount': tabSwitchCount,
          updatedAt: now
        }
      }
    );

    return { success: true };
  } catch (err) {
    await ErrorLog.create({ Timestamp: new Date(), Function: 'examHeartbeat', Error: err.message });
    console.error('[EXAM HEARTBEAT] Error', err);
    return { success: false, error: err.message };
  }
}

function getCandidateMergeKey(row) {
  const email = row?.candidate?.email || row?.email;
  const univId = row?.candidate?.univId || row?.univId;
  const userID = row?.userID || row?.UserID || row?.userId;

  if (email) return `email:${String(email).trim().toLowerCase()}`;
  if (univId) return `univ:${String(univId).trim().toLowerCase()}`;
  return `user:${String(userID).trim().toLowerCase()}`;
}

async function getLiveExamSessionLeaderboard(data, sessionToken) {
  try {
    console.log('[LIVE EXAM SESSION LEADERBOARD] Starting', { testId: data.testId });
    // Verify session token
    const session = await Session.findOne({ sessionToken });
    if (!session || new Date() > session.expiresAt) {
      return { success: false, error: 'Invalid session' };
    }

    const normalizedTestId = data.testId || data.TestID || data.TestId;
    if (!normalizedTestId) return { success: false, error: 'Test ID required' };

    // Get test from TestPaper first, then legacy Test
    let testPaper = await TestPaper.findOne({ TestID: normalizedTestId }).lean();
    let testName = 'Test';
    let liveLeaderboardEnabled = true;

    if (testPaper) {
      testName = testPaper.meta?.name || 'Test';
      liveLeaderboardEnabled = testPaper.meta?.liveLeaderboardEnabled !== false;
    } else {
      const test = await Test.findOne({ TestID: normalizedTestId }).lean();
      if (test) {
        testName = test.Name || 'Test';
        liveLeaderboardEnabled = test.LiveLeaderboardEnabled !== false;
      }
    }

    // Check if live leaderboard is enabled
    if (!liveLeaderboardEnabled) {
      return { 
        success: false, 
        error: 'Live leaderboard disabled for this test', 
        liveLeaderboardEnabled: false 
      };
    }

    const isAdmin = await verifyAdminSession(sessionToken);
    const sessionUserId = session.userId || session.userID;
    const currentUser = await User.findOne({
      $or: [
        { UserID: sessionUserId },
        ...(mongoose.Types.ObjectId.isValid(sessionUserId) ? [{ _id: new mongoose.Types.ObjectId(sessionUserId) }] : [])
      ]
    }).lean();
    const currentUserID = currentUser ? (currentUser.UserID || String(currentUser._id)) : sessionUserId;

    console.log('[LIVE LINK] leaderboard query testId', normalizedTestId);
    // Query LiveExamSession with all possible TestId fields
    const liveSessions = await LiveExamSession.find({
      $or: [
        { TestId: normalizedTestId },
        { testId: normalizedTestId },
        { TestID: normalizedTestId }
      ]
    }).lean();
    console.log('[LIVE LINK] live sessions found', liveSessions.length);
    console.log('[LIVE MERGE DEBUG] live sessions:');
    liveSessions.forEach(ls => {
      console.log(`  userID: ${ls.userID}, candidate.email: ${ls.candidate?.email}, candidate.univId: ${ls.candidate?.univId}, status: ${ls.status}`);
    });

    // Query SubmissionResult with all possible TestId fields
    const submissions = await SubmissionResult.find({
      $or: [
        { TestId: normalizedTestId },
        { TestID: normalizedTestId },
        { testId: normalizedTestId }
      ]
    }).lean();
    console.log('[LIVE LINK] submission results found', submissions.length);
    console.log('[LIVE MERGE DEBUG] submission results:');
    submissions.forEach(sub => {
      console.log(`  userID: ${sub.userID}, candidate.email: ${sub.candidate?.email}, candidate.univId: ${sub.candidate?.univId}`);
    });

    // Merge data: key by getCandidateMergeKey
    const mergedMap = new Map();

    // Step 1: Add all LiveExamSession rows first
    liveSessions.forEach(ls => {
      const key = getCandidateMergeKey(ls);
      console.log('[LIVE MERGE DEBUG] live session merge key:', key);
      mergedMap.set(key, {
        source: 'live',
        liveSession: ls,
        submission: null
      });
    });

    // Step 2: Add all SubmissionResult rows (submitted overrides in_progress)
    submissions.forEach(sub => {
      const key = getCandidateMergeKey(sub);
      console.log('[LIVE MERGE DEBUG] submission merge key:', key);
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing.submission = sub;
        existing.source = 'both';
      } else {
        mergedMap.set(key, {
          source: 'submission',
          liveSession: null,
          submission: sub
        });
      }
    });

    // Process into leaderboard rows
    const rows = [];
    mergedMap.forEach((entry, key) => {
      const ls = entry.liveSession;
      const sub = entry.submission;
      
      // Determine userID for isCurrentUser check: use submission first, then live session
      const userID = sub?.userID || ls?.userID;
      const isCurrentUser = userID === currentUserID;
      
      if (sub) {
        // Submission exists: render submitted row, ignore in_progress
        const totalTimeTakenSeconds = sub.timing?.totalTimeTakenSeconds || 
            (sub.timing?.totalTimeTakenMinutes ? sub.timing.totalTimeTakenMinutes * 60 : 0);
        rows.push({
          rank: 0,
          userID: userID,
          isCurrentUser,
          name: sub.candidate?.name || ls?.candidate?.name || 'Unknown',
          status: 'submitted',
          scorePercentile: sub.summary?.scorePercentile || 0,
          netScore: sub.summary?.netScore || 0,
          maxPossibleScore: sub.test?.maxPossibleScore || 0,
          correctCount: sub.summary?.correctCount || 0,
          wrongCount: sub.summary?.wrongCount || 0,
          unansweredCount: sub.summary?.unansweredCount || 0,
          totalTimeTakenSeconds,
          totalTimeTakenMinutes: sub.timing?.totalTimeTakenMinutes || 0,
          submittedAt: sub.timing?.submittedAt
        });
      } else if (ls) {
        // Only live session exists: render in_progress row
        rows.push({
          rank: '-',
          userID: userID,
          isCurrentUser,
          name: ls.candidate?.name || 'Unknown',
          status: 'in_progress',
          answeredCount: ls.progress?.answeredCount || 0,
          totalQuestions: ls.progress?.totalQuestions || 0,
          progressPercent: ls.progress?.progressPercent || 0,
          lastHeartbeat: ls.lastHeartbeat
        });
      }
    });

    // Separate and sort
    const submittedRows = rows.filter(r => r.status === 'submitted');
    const inProgressRows = rows.filter(r => r.status === 'in_progress');

    // Sort submitted first
    submittedRows.sort((a, b) => {
      if (b.scorePercentile !== a.scorePercentile) return b.scorePercentile - a.scorePercentile;
      if (b.netScore !== a.netScore) return b.netScore - a.netScore;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      if (a.wrongCount !== b.wrongCount) return a.wrongCount - b.wrongCount;
      if (a.totalTimeTakenSeconds !== b.totalTimeTakenSeconds) return a.totalTimeTakenSeconds - b.totalTimeTakenSeconds;
      if (!a.submittedAt && !b.submittedAt) return 0;
      if (!a.submittedAt) return 1;
      if (!b.submittedAt) return -1;
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });

    // Assign ranks to submitted
    for (let i = 0; i < submittedRows.length; i++) {
      submittedRows[i].rank = i + 1;
    }

    // Sort in-progress
    inProgressRows.sort((a, b) => {
      if (b.progressPercent !== a.progressPercent) return b.progressPercent - a.progressPercent;
      if (b.answeredCount !== a.answeredCount) return b.answeredCount - a.answeredCount;
      if (!a.lastHeartbeat && !b.lastHeartbeat) return 0;
      if (!a.lastHeartbeat) return 1;
      if (!b.lastHeartbeat) return -1;
      return new Date(b.lastHeartbeat) - new Date(a.lastHeartbeat);
    });

    console.log('[LIVE LINK] final live board rows', rows.length);
    const updatedAt = new Date();
    return {
      success: true,
      testId: normalizedTestId,
      testName,
      currentUserID,
      updatedAt,
      leaderboard: [...submittedRows, ...inProgressRows]
    };
  } catch (err) {
    await ErrorLog.create({ Timestamp: new Date(), Function: 'getLiveExamSessionLeaderboard', Error: err.message });
    console.error('[LIVE EXAM SESSION LEADERBOARD] Error', err);
    return { success: false, error: err.message };
  }
}

async function toggleLiveLeaderboard(data, sessionToken) {
  try {
    // Verify admin session
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Admin access required' };
    }

    const normalizedTestId = data.testId || data.TestID || data.TestId;
    const enabled = data.enabled;

    // Find TestPaper first, then legacy Test
    let testPaper = await TestPaper.findOne({ TestID: normalizedTestId });
    if (testPaper) {
      testPaper.meta.liveLeaderboardEnabled = enabled;
      await testPaper.save();
      return {
        success: true,
        testId: testPaper.TestID,
        liveLeaderboardEnabled: enabled
      };
    } else {
      // Find legacy test
      const test = await Test.findOne({
        $or: [
          { TestID: normalizedTestId },
          { TestID: data.TestId },
          { TestID: data.TestID }
        ]
      });
      if (!test) {
        return { success: false, error: 'Test not found' };
      }
      test.LiveLeaderboardEnabled = enabled;
      await test.save();
      return {
        success: true,
        testId: test.TestID,
        liveLeaderboardEnabled: enabled
      };
    }
  } catch (err) {
    await ErrorLog.create({ Timestamp: new Date(), Function: 'toggleLiveLeaderboard', Error: err.message });
    console.error('[TOGGLE LIVE LEADERBOARD] Error', err);
    return { success: false, error: err.message };
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
  getMalpracticeLogs,
  getLeaderboard,
  getCandidateTests,
  getCandidateOverallLeaderboard,
  getLiveTestLeaderboard,
  startExamSession,
  examHeartbeat,
  getLiveExamSessionLeaderboard,
  toggleLiveLeaderboard
};
