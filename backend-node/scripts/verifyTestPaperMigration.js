require('dotenv').config();
const mongoose = require('mongoose');
const Test = require('../src/models/Test');
const Question = require('../src/models/Question');
const TestPaper = require('../src/models/TestPaper');
const { getAllTests, getQuestions } = require('../src/utils/testPaperUtils');

async function verify() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const testCount = await Test.countDocuments({});
    const testPaperCount = await TestPaper.countDocuments({});
    console.log(`Test count: ${testCount}, TestPaper count: ${testPaperCount}`);
    if (testCount !== testPaperCount) {
      console.warn('Warning: Test and TestPaper counts do not match!');
    }

    const testPapers = await TestPaper.find({});
    let allValid = true;

    for (const testPaper of testPapers) {
      console.log(`Checking ${testPaper.TestID}...`);
      
      const test = await Test.findOne({ TestID: testPaper.TestID });
      if (!test) {
        console.warn(`  No legacy test found for ${testPaper.TestID}`);
        continue;
      }

      // Check meta data
      if (test.Name !== testPaper.meta.name) {
        console.error(`  Name mismatch: ${test.Name} vs ${testPaper.meta.name}`);
        allValid = false;
      }
      if (test.QuickResult !== testPaper.meta.quickResult) {
        console.error(`  QuickResult mismatch: ${test.QuickResult} vs ${testPaper.meta.quickResult}`);
        allValid = false;
      }
      if (test.AnswerKeyPublished !== testPaper.meta.answerKeyPublished) {
        console.error(`  AnswerKeyPublished mismatch: ${test.AnswerKeyPublished} vs ${testPaper.meta.answerKeyPublished}`);
        allValid = false;
      }
      if (test.IsDeleted !== testPaper.meta.isDeleted) {
        console.error(`  IsDeleted mismatch: ${test.IsDeleted} vs ${testPaper.meta.isDeleted}`);
        allValid = false;
      }

      // Check questions
      const legacyQuestions = await Question.find({ TestID: testPaper.TestID, IsDeleted: false });
      const testPaperActiveQuestions = testPaper.questions.filter(q => !q.isDeleted);
      
      if (legacyQuestions.length !== testPaperActiveQuestions.length) {
        console.error(`  Question count mismatch: ${legacyQuestions.length} vs ${testPaperActiveQuestions.length}`);
        allValid = false;
      } else {
        let totalMarksLegacy = 0;
        let totalMarksTestPaper = 0;
        
        for (const lq of legacyQuestions) {
          totalMarksLegacy += lq.Marks;
          const tpq = testPaperActiveQuestions.find(q => q.qid === lq.QID);
          if (!tpq) {
            console.error(`  Missing question ${lq.QID} in TestPaper`);
            allValid = false;
          } else {
            if (lq.Question !== tpq.question) {
              console.error(`  Question mismatch for ${lq.QID}`);
              allValid = false;
            }
            if (lq.Correct !== tpq.correct) {
              console.error(`  Correct answer mismatch for ${lq.QID}`);
              allValid = false;
            }
            if (lq.Marks !== tpq.marks) {
              console.error(`  Marks mismatch for ${lq.QID}`);
              allValid = false;
            }
          }
        }

        for (const tpq of testPaperActiveQuestions) {
          totalMarksTestPaper += tpq.marks;
        }

        if (totalMarksLegacy !== totalMarksTestPaper) {
          console.error(`  Total marks mismatch: ${totalMarksLegacy} vs ${totalMarksTestPaper}`);
          allValid = false;
        } else if (totalMarksLegacy !== testPaper.stats.totalMarks) {
          console.error(`  Stats totalMarks mismatch: ${totalMarksLegacy} vs ${testPaper.stats.totalMarks}`);
          allValid = false;
        }
      }
    }

    console.log('\nChecking API compatibility...');
    console.log('Testing getAllTests...');
    const allTests = await getAllTests();
    console.log(`getAllTests returned ${allTests.length} tests`);

    if (testPapers.length > 0) {
      const firstTestId = testPapers[0].TestID;
      console.log(`Testing getQuestions for ${firstTestId}...`);
      const questions = await getQuestions(firstTestId);
      console.log(`getQuestions returned ${questions.length} questions`);
    }

    if (allValid) {
      console.log('\n✅ All tests passed! Migration is valid.');
    } else {
      console.log('\n❌ Some checks failed!');
    }

  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

verify();
