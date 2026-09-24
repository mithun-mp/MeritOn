/**
 * Standalone Migration Script: migrateUserYears.js
 * Migrates legacy student registration years (1, 2, 3, 4) to permanent academic batch format (e.g. 2026-2028).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const legacyMap = {
  '1': '2026-2028',
  '2': '2025-2027',
  '3': '2024-2026',
  '4': '2023-2025'
};

async function runMigration() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is missing.');
    }

    console.log('[MIGRATION] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[MIGRATION] Connected to MongoDB.');

    let totalMigrated = 0;

    for (const [legacy, modern] of Object.entries(legacyMap)) {
      const res = await User.updateMany(
        { Year: legacy },
        { $set: { Year: modern } }
      );
      console.log(`[MIGRATION] Year '${legacy}' -> '${modern}': ${res.modifiedCount} updated`);
      totalMigrated += (res.modifiedCount || 0);
    }

    // Also normalize any whitespace around hyphens (e.g. "2026 - 2028" -> "2026-2028")
    const usersWithSpaces = await User.find({ Year: /\s+-\s*|\s*-\s+/ });
    for (const user of usersWithSpaces) {
      const cleanYear = user.Year.replace(/\s*-\s*/g, '-');
      await User.updateOne({ _id: user._id }, { $set: { Year: cleanYear } });
      totalMigrated++;
    }

    console.log(`[MIGRATION SUCCESS] Complete! Total candidate records migrated/normalized: ${totalMigrated}`);
  } catch (err) {
    console.error('[MIGRATION ERROR]', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('[MIGRATION] Disconnected from MongoDB.');
  }
}

runMigration();
