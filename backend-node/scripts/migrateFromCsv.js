
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const readline = require('readline');

// Load models
const Admin = require('../src/models/Admin');
const Test = require('../src/models/Test');
const Question = require('../src/models/Question');
const Performance = require('../src/models/Performance');
const Response = require('../src/models/Response');
const ErrorLog = require('../src/models/ErrorLog');
const AuditLog = require('../src/models/AuditLog');
const User = require('../src/models/User');

const MIGRATION_DATA_DIR = path.join(__dirname, '../migration-data');

// Helper to safely parse JSON
function safeJsonParse(str) {
  if (!str || typeof str !== 'string') return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// Helper to convert values
function convertValue(key, value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  
  // Boolean fields
  const booleanFields = ['IsDeleted', 'ResultPublished', 'AnswerKeyPublished', 'AutoSubmitted', 'EmailVerified', 'ExamNotifications', 'ResultNotifications', 'QuickResult', 'IsCorrect', 'IsUnanswered'];
  if (booleanFields.includes(key)) {
    return value === 'true' || value === true || value === 'TRUE';
  }
  
  // Number fields
  const numberFields = [
    'TotalScore', 'TotalQuestions', 'CorrectCount', 'WrongCount', 'UnansweredCount',
    'TotalTimeTaken', 'FullScreenViolations', 'TabSwitchCount', 'NetScore', 'Rank',
    'Marks', 'NegativeMarks', 'Duration', 'Year', 'ExecutionTime'
  ];
  if (numberFields.includes(key)) {
    // For ExecutionTime, strip 'ms' suffix
    if (key === 'ExecutionTime' && typeof value === 'string') {
      value = value.replace('ms', '');
    }
    const num = Number(value);
    return isNaN(num) ? null : num;
  }
  
  // Date fields
  const dateFields = ['Date', 'SubmittedAt', 'StartedAt', 'PublishedAt', 'AnswerKeyPublishedAt', 'DeletedAt', 'Timestamp', 'CreatedAt', 'LastLogin', 'LastExamNotification', 'LastResultNotification'];
  if (dateFields.includes(key) && value) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // JSON fields
  const jsonFields = ['Sections', 'SectionAnalyticsJSON'];
  if (jsonFields.includes(key)) {
    return safeJsonParse(value);
  }
  
  return value;
}

// Find CSV file (support both simple and full filename)
function findCsvFile(baseName) {
  const possibleFiles = [
    `${baseName}.csv`,
    `CBT_System_DB - ${baseName}.csv`
  ];
  
  for (const file of possibleFiles) {
    const filePath = path.join(MIGRATION_DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      return file;
    }
  }
  
  return null;
}

// Parse CSV file into array of objects
async function parseCsvFile(filename) {
  const filePath = path.join(MIGRATION_DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return { exists: false, rows: [] };
  }
  
  const rows = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Convert all fields
        const converted = {};
        for (const key in data) {
          converted[key] = convertValue(key, data[key]);
        }
        rows.push(converted);
      })
      .on('end', () => {
        resolve({ exists: true, rows });
      })
      .on('error', reject);
  });
}

// Migration config
const migrationConfig = [
  {
    baseName: 'Admin',
    model: Admin,
    getUpsertFilter: (doc) => ({ Username: doc.Username }),
    name: 'Admin',
    isSpecial: false
  },
  {
    baseName: 'Tests',
    model: Test,
    getUpsertFilter: (doc) => ({ TestID: doc.TestID }),
    name: 'Tests',
    isSpecial: false
  },
  {
    baseName: 'Questions',
    model: Question,
    getUpsertFilter: (doc) => ({ TestID: doc.TestID, QID: doc.QID }),
    name: 'Questions',
    isSpecial: false
  },
  {
    baseName: 'Users',
    model: User,
    getUpsertFilter: (doc) => ({ UserID: doc.UserID }),
    name: 'Users',
    isSpecial: false
  },
  {
    baseName: 'Performance',
    model: Performance,
    getUpsertFilter: (doc) => ({ userID: doc.userID, TestId: doc.TestId }),
    name: 'Performance',
    isSpecial: false
  },
  {
    baseName: 'Responses',
    model: Response,
    getUpsertFilter: (doc) => ({ userID: doc.userID, TestId: doc.TestId }),
    name: 'Responses',
    isSpecial: true
  },
  {
    baseName: 'ErrorLogs',
    model: ErrorLog,
    getUpsertFilter: null, // Always create new
    name: 'ErrorLogs',
    isSpecial: false
  },
  {
    baseName: 'AuditLogs',
    model: AuditLog,
    getUpsertFilter: null, // Always create new
    name: 'AuditLogs',
    isSpecial: false
  }
];

// Dry run function
async function dryRun() {
  console.log('=== DRY RUN MODE - No DB writes ===\n');
  
  for (const config of migrationConfig) {
    const filename = findCsvFile(config.baseName);
    console.log(`--- ${config.name} ---`);
    if (!filename) {
      console.log(`File for ${config.name} not found, skipping.\n`);
      continue;
    }
    console.log(`Using file: ${filename}`);
    
    const result = await parseCsvFile(filename);
    console.log(`Rows detected: ${result.rows.length}`);
    
    // Check duplicates
    const duplicates = [];
    const seen = new Set();
    
    if (config.isSpecial && config.name === 'Responses') {
      // For responses, group by userID+TestId
      const responseGroups = {};
      for (const row of result.rows) {
        const key = `${row.userID}_${row.TestId}`;
        if (!responseGroups[key]) {
          responseGroups[key] = [];
        }
        responseGroups[key].push(row);
      }
      console.log(`Optimized response documents: ${Object.keys(responseGroups).length}`);
    } else {
      // Normal processing
      for (const row of result.rows) {
        if (config.getUpsertFilter) {
          const filter = config.getUpsertFilter(row);
          const key = JSON.stringify(filter);
          if (seen.has(key)) {
            duplicates.push(row);
          } else {
            seen.add(key);
          }
        }
      }
      console.log(`Unique rows: ${result.rows.length - duplicates.length}`);
      if (duplicates.length > 0) {
        console.log(`Duplicate rows: ${duplicates.length} (will be upserted)`);
      }
    }
    
    console.log('');
  }
  
  console.log('=== DRY RUN COMPLETE ===');
}

// Execute migration
async function executeMigration(skipConfirmation = false, clearFirst = false) {
  if (!skipConfirmation) {
    // Ask for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      rl.question(
        `WARNING: This will modify your MongoDB database.${clearFirst ? ' AND CLEAR ALL EXISTING DATA!' : ''} Are you sure you want to proceed? (y/N) `,
        resolve
      );
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
      console.log('Migration cancelled.');
      return;
    }
  }
  
  console.log('=== EXECUTING MIGRATION ===\n');
  
  // Connect to MongoDB
  await mongoose.connect('mongodb://localhost:27017/meriton-cbt');
  console.log('Connected to MongoDB\n');
  
  if (clearFirst) {
    console.log('Clearing existing data...');
    await Promise.all([
      Admin.deleteMany({}),
      Test.deleteMany({}),
      Question.deleteMany({}),
      User.deleteMany({}),
      Performance.deleteMany({}),
      Response.deleteMany({}),
      ErrorLog.deleteMany({}),
      AuditLog.deleteMany({})
    ]);
    console.log('Data cleared.\n');
  }
  
  for (const config of migrationConfig) {
    const filename = findCsvFile(config.baseName);
    console.log(`--- Migrating ${config.name} ---`);
    if (!filename) {
      console.log(`File for ${config.name} not found, skipping.\n`);
      continue;
    }
    console.log(`Using file: ${filename}`);
    
    const result = await parseCsvFile(filename);
    console.log(`Rows to process: ${result.rows.length}`);
    
    let migrated = 0;
    let failed = 0;
    
    if (config.isSpecial && config.name === 'Responses') {
        // Special handling for Responses: group by userID+TestId
        const responseGroups = {};
        for (const row of result.rows) {
          const key = `${row.userID}_${row.TestId}`;
          if (!responseGroups[key]) {
            responseGroups[key] = {
              userID: row.userID,
              TestId: row.TestId,
              SubmittedAt: row.SubmittedAt,
              answers: []
            };
          }
          responseGroups[key].answers.push({
            QID: row.QID,
            SelectedAnswer: row.SelectedAnswer || '',
            IsCorrect: row.IsCorrect,
            IsUnanswered: row.IsUnanswered,
            Marks: row.Marks,
            NegativeMarks: row.NegativeMarks
          });
        }
        
        // Process groups
        for (const doc of Object.values(responseGroups)) {
          try {
            if (config.getUpsertFilter) {
              const filter = config.getUpsertFilter(doc);
              await config.model.findOneAndUpdate(filter, doc, { upsert: true });
            } else {
              await config.model.create(doc);
            }
            migrated++;
          } catch (err) {
            console.error(`Failed to migrate response group: ${err.message}`);
            failed++;
          }
        }
      } else {
      // Normal processing
      for (const row of result.rows) {
        try {
          if (config.getUpsertFilter) {
            const filter = config.getUpsertFilter(row);
            await config.model.findOneAndUpdate(filter, row, { upsert: true });
          } else {
            await config.model.create(row);
          }
          migrated++;
        } catch (err) {
          console.error(`Failed to migrate row: ${err.message}`);
          failed++;
        }
      }
    }
    
    console.log(`Migrated: ${migrated}`);
    if (failed > 0) {
      console.log(`Failed: ${failed}`);
    }
    console.log('');
  }
  
  await mongoose.disconnect();
  console.log('=== MIGRATION COMPLETE ===');
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--dry-run')) {
    await dryRun();
  } else if (args.includes('--execute')) {
    await executeMigration(args.includes('--yes'), args.includes('--clear'));
  } else {
    console.log('Usage:');
    console.log('  node scripts/migrateFromCsv.js --dry-run                # Preview changes');
    console.log('  node scripts/migrateFromCsv.js --execute [--yes] [--clear]  # Run actual migration');
  }
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
