const mongoose = require('mongoose');
const Performance = require('../src/models/Performance');
const Response = require('../src/models/Response');
const Question = require('../src/models/Question');
const Test = require('../src/models/Test');
const SubmissionResult = require('../src/models/SubmissionResult');
require('dotenv').config({ path: '.env' });

async function migrate() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(`=== MERITON SUBMISSION RESULT MIGRATION ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log();

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  console.log();

  // Get all Performance entries
  const performances = await Performance.find({}).lean();
  console.log(`Found ${performances.length} Performance entries`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const perf of performances) {
    try {
      // Check if SubmissionResult already exists
      const existing = await SubmissionResult.findOne({ userID: perf.userID, TestId: perf.TestId }).lean();
      if (existing) {
        skipped++;
        console.log(`Skipping (already exists): ${perf.userID} / ${perf.TestId}`);
        continue;
      }

      // Get corresponding Response
      const response = await Response.findOne({ userID: perf.userID, TestId: perf.TestId }).lean();
      // Get questions for test
      const questions = await Question.find({ TestID: perf.TestId, IsDeleted: { $ne: true } }).lean();
      const test = await Test.findOne({ TestID: perf.TestId }).lean();

      const questionMap = {};
      questions.forEach(q => questionMap[q.QID] = q);

      // Calculate everything
      let rawScore = 0;
      let negativeScore = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;
      let maxPossibleScore = 0;
      const sections = {};
      const difficulties = { Easy: {}, Medium: {}, Hard: {}, Unknown: {} };
      const answers = [];

      // Initialize difficulties
      ['Easy', 'Medium', 'Hard', 'Unknown'].forEach(d => {
        difficulties[d] = {
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

      if (response?.answers) {
        response.answers.forEach(ans => {
          const q = questionMap[ans.QID];
          if (!q) return; // Skip if question not found

          const marks = q.Marks || 1;
          const negMarks = q.NegativeMarks || 0;
          const difficulty = q.Difficulty || 'Unknown';
          const section = q.Section || 'Uncategorized';

          maxPossibleScore += marks;

          let scoreAwarded = 0;
          if (ans.IsCorrect) {
            scoreAwarded = marks;
            rawScore += marks;
            correctCount++;
          } else if (!ans.IsUnanswered) {
            scoreAwarded = -negMarks;
            negativeScore += negMarks;
            wrongCount++;
          } else {
            unansweredCount++;
          }

          // Update section
          if (!sections[section]) {
            sections[section] = {
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
          sections[section].totalQuestions++;
          sections[section].maxPossibleScore += marks;
          if (ans.IsCorrect) {
            sections[section].correctCount++;
            sections[section].rawScore += marks;
            sections[section].attemptedCount++;
          } else if (!ans.IsUnanswered) {
            sections[section].wrongCount++;
            sections[section].negativeScore += negMarks;
            sections[section].attemptedCount++;
          } else {
            sections[section].unansweredCount++;
          }
          sections[section].netScore = sections[section].rawScore - sections[section].negativeScore;

          // Update difficulty
          difficulties[difficulty].totalQuestions++;
          difficulties[difficulty].maxPossibleScore += marks;
          if (ans.IsCorrect) {
            difficulties[difficulty].correctCount++;
            difficulties[difficulty].rawScore += marks;
            difficulties[difficulty].attemptedCount++;
          } else if (!ans.IsUnanswered) {
            difficulties[difficulty].wrongCount++;
            difficulties[difficulty].negativeScore += negMarks;
            difficulties[difficulty].attemptedCount++;
          } else {
            difficulties[difficulty].unansweredCount++;
          }
          difficulties[difficulty].netScore = difficulties[difficulty].rawScore - difficulties[difficulty].negativeScore;

          answers.push({
            qid: ans.QID,
            section: section,
            difficulty: difficulty,
            selected: ans.SelectedAnswer,
            correctAnswer: q.Correct,
            isCorrect: ans.IsCorrect,
            isUnanswered: ans.IsUnanswered,
            marks: marks,
            negativeMarks: negMarks,
            scoreAwarded: scoreAwarded
          });
        });
      }

      const netScore = rawScore - negativeScore;
      const totalQuestions = questions.length;
      const attemptedCount = correctCount + wrongCount;

      // Calculate percentiles
      let scorePercentile = maxPossibleScore > 0 ? (netScore / maxPossibleScore) * 100 : 0;
      if (process.env.CLAMP_NEGATIVE_PERCENTILE === 'true') {
        scorePercentile = Math.max(0, scorePercentile);
      }
      const accuracyPercent = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
      const attemptPercent = totalQuestions > 0 ? (attemptedCount / totalQuestions) * 100 : 0;

      // Calculate section percentiles
      Object.keys(sections).forEach(section => {
        const s = sections[section];
        s.scorePercentile = s.maxPossibleScore > 0 ? (s.netScore / s.maxPossibleScore) * 100 : 0;
        if (process.env.CLAMP_NEGATIVE_PERCENTILE === 'true') s.scorePercentile = Math.max(0, s.scorePercentile);
        s.accuracyPercent = s.totalQuestions > 0 ? (s.correctCount / s.totalQuestions) * 100 : 0;
        s.attemptPercent = s.totalQuestions > 0 ? (s.attemptedCount / s.totalQuestions) * 100 : 0;
      });

      // Calculate difficulty percentiles
      Object.keys(difficulties).forEach(d => {
        const diff = difficulties[d];
        diff.scorePercentile = diff.maxPossibleScore > 0 ? (diff.netScore / diff.maxPossibleScore) * 100 : 0;
        if (process.env.CLAMP_NEGATIVE_PERCENTILE === 'true') diff.scorePercentile = Math.max(0, diff.scorePercentile);
        diff.accuracyPercent = diff.totalQuestions > 0 ? (diff.correctCount / diff.totalQuestions) * 100 : 0;
        diff.attemptPercent = diff.totalQuestions > 0 ? (diff.attemptedCount / diff.totalQuestions) * 100 : 0;
      });

      // Time data
      const serverReceivedAt = perf.SubmittedAt || new Date();
      const startedAt = perf.StartedAt || serverReceivedAt;
      let totalTimeTakenSeconds = perf.TotalTimeTaken ? perf.TotalTimeTaken * 60 : Math.max(0, (serverReceivedAt - startedAt) / 1000);
      const allowedDurationSeconds = (test?.Duration || 0) * 60;
      const overtimeSeconds = Math.max(0, totalTimeTakenSeconds - allowedDurationSeconds);
      const submittedBeforeTime = totalTimeTakenSeconds <= allowedDurationSeconds;
      const totalTimeTakenMinutes = Number((totalTimeTakenSeconds / 60).toFixed(2));

      const submission = {
        userID: perf.userID,
        TestId: perf.TestId,
        candidate: {
          name: perf.name,
          email: perf.Email,
          univId: ''
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
          submittedAt: serverReceivedAt,
          serverReceivedAt: serverReceivedAt,
          totalTimeTakenSeconds: totalTimeTakenSeconds,
          totalTimeTakenMinutes: totalTimeTakenMinutes,
          allowedDurationSeconds: allowedDurationSeconds,
          overtimeSeconds: overtimeSeconds,
          submittedBeforeTime: submittedBeforeTime,
          autoSubmitted: perf.AutoSubmitted || false
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
          scorePercentile: Number(scorePercentile.toFixed(2)),
          accuracyPercent: Number(accuracyPercent.toFixed(2)),
          attemptPercent: Number(attemptPercent.toFixed(2)),
          state: perf.State || 'completed'
        },
        sections: sections,
        difficulty: {
          Easy: difficulties.Easy,
          Medium: difficulties.Medium,
          Hard: difficulties.Hard,
          Unknown: difficulties.Unknown
        },
        answers: answers,
        violations: {
          fullScreenViolations: perf.FullScreenViolations || 0,
          tabSwitchCount: perf.TabSwitchCount || 0,
          suspiciousScore: (perf.FullScreenViolations || 0) * 2 + (perf.TabSwitchCount || 0) * 3 + (perf.AutoSubmitted ? 1 : 0),
          autoSubmitted: perf.AutoSubmitted || false
        },
        result: {
          published: perf.ResultPublished || false,
          publishedAt: perf.PublishedAt || null,
          emailSent: false,
          emailSentAt: null
        },
        ranking: {
          rank: perf.Rank || null,
          totalCandidates: 0,
          rankPercentile: perf.Percentile || null,
          calculatedAt: null
        }
      };

      if (!dryRun) {
        await SubmissionResult.create(submission);
        console.log(`Migrated: ${perf.userID} / ${perf.TestId}`);
      } else {
        console.log(`Would migrate: ${perf.userID} / ${perf.TestId}`);
      }
      migrated++;
    } catch (err) {
      errors++;
      console.error(`Error migrating ${perf.userID} / ${perf.TestId}:`, err.message);
    }
  }

  // After migration, update rankings for all tests
  if (!dryRun) {
    const testIds = [...new Set(performances.map(p => p.TestId))];
    console.log();
    console.log(`Updating rankings for ${testIds.length} tests...`);
    for (const testId of testIds) {
      try {
        await updateRankings(testId);
        console.log(`Rankings updated for ${testId}`);
      } catch (err) {
        console.error(`Error updating rankings for ${testId}:`, err.message);
      }
    }
  }

  console.log();
  console.log('=== MIGRATION COMPLETE ===');
  console.log(`Total entries: ${performances.length}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  await mongoose.disconnect();
}

async function updateRankings(TestId) {
  try {
    const submissions = await SubmissionResult.find({ TestId: TestId }).sort({
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
          'ranking.rankPercentile': Number(rankPercentile.toFixed(2)),
          'ranking.calculatedAt': new Date()
        }
      );
    }
  } catch (err) {
    console.error('[updateRankings] Error:', err);
  }
}

migrate().catch(console.error);
