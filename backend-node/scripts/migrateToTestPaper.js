require('dotenv').config();
const mongoose = require('mongoose');
const Test = require('../src/models/Test');
const Question = require('../src/models/Question');
const TestPaper = require('../src/models/TestPaper');
const { calculateStatsAndSections } = require('../src/utils/testPaperUtils');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isExecute = args.includes('--execute');

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    console.log('Reading tests...');
    const tests = await Test.find({});
    console.log(`Found ${tests.length} tests`);

    for (const test of tests) {
      console.log(`Processing test ${test.TestID}...`);
      
      const questions = await Question.find({ TestID: test.TestID });
      
      const testPaperQuestions = questions.map(q => ({
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

      let sectionNames = [];
      try {
        if (typeof test.Sections === 'string') {
          const parsed = JSON.parse(test.Sections);
          sectionNames = Array.isArray(parsed) ? parsed.map(s => s.name || s) : [];
        } else if (Array.isArray(test.Sections)) {
          sectionNames = test.Sections.map(s => s.name || s);
        }
      } catch (e) {
        console.log('  Warning: Failed to parse sections, using question sections');
      }

      const { stats, sections } = calculateStatsAndSections(testPaperQuestions, sectionNames);

      const testPaperData = {
        TestID: test.TestID,
        meta: {
          name: test.Name,
          date: test.Date,
          startTime: test.StartTime,
          expiryTime: test.ExpiryTime,
          duration: test.Duration,
          mode: test.Mode,
          examType: test.ExamType,
          quickResult: test.QuickResult,
          liveLeaderboardEnabled: test.LiveLeaderboardEnabled,
          answerKeyPublished: test.AnswerKeyPublished,
          answerKeyPublishedAt: test.AnswerKeyPublishedAt,
          isDeleted: test.IsDeleted,
          deletedAt: test.DeletedAt
        },
        sections,
        questions: testPaperQuestions,
        stats
      };

      if (isDryRun) {
        console.log(`  Dry run: Would upsert TestPaper for ${test.TestID}`);
        console.log(`  Stats: ${JSON.stringify(stats, null, 2)}`);
      } else if (isExecute) {
        await TestPaper.findOneAndUpdate(
          { TestID: test.TestID },
          testPaperData,
          { upsert: true, new: true }
        );
        console.log(`  Upserted TestPaper for ${test.TestID}`);
      }
    }

    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

if (!isDryRun && !isExecute) {
  console.log('Usage: node scripts/migrateToTestPaper.js --dry-run | --execute');
  process.exit(1);
}

migrate();
