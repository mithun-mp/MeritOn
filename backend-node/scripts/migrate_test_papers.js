/**
 * MeritOn CBT Platform — Database Migration Script (v1.0.0)
 * 
 * Tasks Performed:
 * 1. Migrates legacy 'Difficult' difficulty values to 'Hard' across all questions.
 * 2. Normalizes section names (e.g. "Logical Reasoning(Verbal)" -> "Logical Reasoning (Verbal)").
 * 3. Sets schemaVersion = 1 on all TestPaper documents.
 * 4. Re-calculates sections array and statistics object.
 * 5. Replaces empty media objects with null to reduce document size.
 * 6. Computes test meta status (Draft, Scheduled, Live, Completed, Expired).
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const TestPaper = require('../src/models/TestPaper');
const Test = require('../src/models/Test');
const Question = require('../src/models/Question');
const { normalizeSectionName, normalizeDifficultyValue, calculateStatsAndSections } = require('../src/utils/testPaperUtils');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/meriton_cbt';

async function runMigration() {
  console.log('=== MERITON CBT PLATFORM MIGRATION START ===');
  console.log(`Connecting to MongoDB: ${MONGODB_URI}`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully.\n');

    // 1. Migrate TestPaper documents
    const testPapers = await TestPaper.find({});
    console.log(`Found ${testPapers.length} TestPaper documents to migrate...`);

    let migratedTestPapersCount = 0;
    let difficultMigratedCount = 0;
    let mediaCleanedCount = 0;

    for (const tp of testPapers) {
      tp.schemaVersion = 1;
      let modified = false;

      if (Array.isArray(tp.questions)) {
        tp.questions.forEach(q => {
          // Difficulty migration
          if (q.difficulty && (q.difficulty.toLowerCase() === 'difficult' || q.difficulty !== normalizeDifficultyValue(q.difficulty))) {
            const oldDiff = q.difficulty;
            q.difficulty = normalizeDifficultyValue(q.difficulty);
            difficultMigratedCount++;
            modified = true;
            console.log(`[TestID ${tp.TestID}] Migrated difficulty '${oldDiff}' -> '${q.difficulty}' (QID: ${q.qid})`);
          }

          // Section normalization
          const normalizedSec = normalizeSectionName(q.section);
          if (q.section !== normalizedSec) {
            q.section = normalizedSec;
            modified = true;
          }

          // Empty media object to null
          if (q.questionMedia && (q.questionMedia.type === 'none' || (!q.questionMedia.url && !q.questionMedia.publicId))) {
            q.questionMedia = null;
            mediaCleanedCount++;
            modified = true;
          }

          if (q.optionMedia) {
            let hasValidMedia = false;
            ['A', 'B', 'C', 'D'].forEach(k => {
              if (q.optionMedia[k] && q.optionMedia[k].type !== 'none' && (q.optionMedia[k].url || q.optionMedia[k].publicId)) {
                hasValidMedia = true;
              }
            });
            if (!hasValidMedia) {
              q.optionMedia = null;
              mediaCleanedCount++;
              modified = true;
            }
          }
        });
      }

      // Re-trigger pre-save recalculation by saving
      await tp.save();
      migratedTestPapersCount++;
    }

    console.log(`\nMigrated ${migratedTestPapersCount} TestPaper documents.`);
    console.log(`Difficulty 'Difficult' -> 'Hard' replacements: ${difficultMigratedCount}`);
    console.log(`Empty media objects replaced with null: ${mediaCleanedCount}\n`);

    // 2. Migrate Legacy Question documents
    const legacyQuestions = await Question.find({});
    console.log(`Found ${legacyQuestions.length} legacy Question documents to check...`);

    let legacyMigratedCount = 0;
    for (const lq of legacyQuestions) {
      let lqModified = false;

      if (lq.Difficulty && lq.Difficulty.toLowerCase() === 'difficult') {
        lq.Difficulty = 'Hard';
        lqModified = true;
      }
      const normSec = normalizeSectionName(lq.Section);
      if (lq.Section !== normSec) {
        lq.Section = normSec;
        lqModified = true;
      }

      if (lqModified) {
        await lq.save();
        legacyMigratedCount++;
      }
    }

    console.log(`Migrated ${legacyMigratedCount} legacy Question documents.\n`);

    console.log('=== MERITON CBT PLATFORM MIGRATION COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Migration failed with error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
