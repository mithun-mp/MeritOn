// Test script for SubmissionResult calculations
// Note: This uses in-memory test data

const assert = require('assert');

// Mock data
const mockTest = { Duration: 60 };
const mockQuestions = [
  { QID: 'q1', Correct: 'A', Marks: 2, NegativeMarks: 0.5, Section: 'Logical', Difficulty: 'Easy' },
  { QID: 'q2', Correct: 'B', Marks: 2, NegativeMarks: 0.5, Section: 'Logical', Difficulty: 'Medium' },
  { QID: 'q3', Correct: 'C', Marks: 2, NegativeMarks: 0.5, Section: 'Logical', Difficulty: 'Hard' },
  { QID: 'q4', Correct: 'D', Marks: 2, NegativeMarks: 0.5, Section: 'Verbal', Difficulty: 'Easy' }
];
const mockAnswers = {
  q1: 'A',  // correct
  q2: 'C',  // wrong
  q3: '',   // unanswered
  q4: 'D'   // correct
};

// Calculate using the same logic as in examController
function calculateSubmission(test, questions, answers, startedAt, submittedAt, autoSubmitted, fullScreenViolations, tabSwitchCount) {
  let rawScore = 0;
  let negativeScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let maxPossibleScore = 0;
  const sections = {};
  const difficulties = { Easy: {}, Medium: {}, Hard: {}, Unknown: {} };
  const answerArray = [];

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

  questions.forEach(q => {
    const userAnswer = answers[q.QID] || '';
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
    if (isCorrect) {
      sections[section].correctCount++;
      sections[section].rawScore += marks;
      sections[section].attemptedCount++;
    } else if (!isUnanswered) {
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
    if (isCorrect) {
      difficulties[difficulty].correctCount++;
      difficulties[difficulty].rawScore += marks;
      difficulties[difficulty].attemptedCount++;
    } else if (!isUnanswered) {
      difficulties[difficulty].wrongCount++;
      difficulties[difficulty].negativeScore += negMarks;
      difficulties[difficulty].attemptedCount++;
    } else {
      difficulties[difficulty].unansweredCount++;
    }
    difficulties[difficulty].netScore = difficulties[difficulty].rawScore - difficulties[difficulty].negativeScore;

    answerArray.push({
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
  });

  const netScore = rawScore - negativeScore;
  const totalQuestions = questions.length;
  const attemptedCount = correctCount + wrongCount;

  // Calculate percentiles
  let scorePercentile = maxPossibleScore > 0 ? (netScore / maxPossibleScore) * 100 : 0;
  const accuracyPercent = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
  const attemptPercent = totalQuestions > 0 ? (attemptedCount / totalQuestions) * 100 : 0;

  // Calculate section percentiles
  Object.keys(sections).forEach(section => {
    const s = sections[section];
    s.scorePercentile = s.maxPossibleScore > 0 ? (s.netScore / s.maxPossibleScore) * 100 : 0;
    s.accuracyPercent = s.totalQuestions > 0 ? (s.correctCount / s.totalQuestions) * 100 : 0;
    s.attemptPercent = s.totalQuestions > 0 ? (s.attemptedCount / s.totalQuestions) * 100 : 0;
  });

  // Calculate difficulty percentiles
  Object.keys(difficulties).forEach(d => {
    const diff = difficulties[d];
    diff.scorePercentile = diff.maxPossibleScore > 0 ? (diff.netScore / diff.maxPossibleScore) * 100 : 0;
    diff.accuracyPercent = diff.totalQuestions > 0 ? (diff.correctCount / diff.totalQuestions) * 100 : 0;
    diff.attemptPercent = diff.totalQuestions > 0 ? (diff.attemptedCount / diff.totalQuestions) * 100 : 0;
  });

  return {
    summary: {
      totalQuestions,
      attemptedCount,
      correctCount,
      wrongCount,
      unansweredCount,
      rawScore,
      negativeScore,
      netScore,
      maxPossibleScore,
      scorePercentile,
      accuracyPercent,
      attemptPercent
    },
    sections,
    difficulty: difficulties,
    answers: answerArray
  };
}

// Test cases
console.log('=== SUBMISSION RESULT CALCULATION TESTS');
console.log();

const result = calculateSubmission(
  mockTest,
  mockQuestions,
  mockAnswers,
  new Date(),
  new Date(),
  false,
  0,
  0
);

console.log('Test Case 1: Mixed answers (2 correct, 1 wrong, 1 unanswered');
console.log('Expected rawScore:', result.summary.rawScore); // should be 4
console.log('Expected netScore:', result.summary.netScore); // should be 3.5
console.log('Expected correctCount:', result.summary.correctCount); // should be 2
console.log('Expected wrongCount:', result.summary.wrongCount); // should be 1
console.log('Expected unansweredCount:', result.summary.unansweredCount); // should be 1
console.log('Expected maxPossibleScore:', result.summary.maxPossibleScore); // should be 8
console.log('Expected scorePercentile:', result.summary.scorePercentile); // should be ~43.75
console.log();

assert.strictEqual(result.summary.rawScore, 4, 'Raw score should be 4');
assert.strictEqual(result.summary.negativeScore, 0.5, 'Negative score should be 0.5');
assert.strictEqual(result.summary.netScore, 3.5, 'Net score should be 3.5');
assert.strictEqual(result.summary.correctCount, 2, 'Correct count should be 2');
assert.strictEqual(result.summary.wrongCount, 1, 'Wrong count should be 1');
assert.strictEqual(result.summary.unansweredCount, 1, 'Unanswered count should be 1');
assert.strictEqual(result.summary.maxPossibleScore, 8, 'Max possible score should be 8');
assert.strictEqual(result.summary.scorePercentile, (3.5 / 8) * 100, 'Score percentile should be (3.5/8 *100');

console.log('✅ All basic calculation tests passed!');
