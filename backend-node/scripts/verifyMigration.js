
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');

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

// Parse CSV file and count rows
async function countCsvRows(filename) {
  const filePath = path.join(MIGRATION_DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  
  let count = 0;
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', () => count++)
      .on('end', () => resolve(count))
      .on('error', reject);
  });
}

const verifyConfig = [
  { name: 'Admin', baseName: 'Admin', model: Admin, isSpecial: false },
  { name: 'Tests', baseName: 'Tests', model: Test, isSpecial: false },
  { name: 'Questions', baseName: 'Questions', model: Question, isSpecial: false },
  { name: 'Users', baseName: 'Users', model: User, isSpecial: false },
  { name: 'Performance', baseName: 'Performance', model: Performance, isSpecial: false },
  { name: 'Responses', baseName: 'Responses', model: Response, isSpecial: true },
  { name: 'ErrorLogs', baseName: 'ErrorLogs', model: ErrorLog, isSpecial: false },
  { name: 'AuditLogs', baseName: 'AuditLogs', model: AuditLog, isSpecial: false }
];

const connectDB = require('../src/config/db');

async function main() {
  console.log('=== MIGRATION VERIFICATION ===\n');
  
  // Connect to MongoDB Atlas
  await connectDB();
  
  for (const config of verifyConfig) {
    const filename = findCsvFile(config.baseName);
    if (!filename) {
      console.log(`--- ${config.name} ---`);
      console.log(`CSV file not found, skipping.\n`);
      continue;
    }
    
    const csvCount = await countCsvRows(filename);
    let mongoCount;
    
    if (config.isSpecial && config.name === 'Responses') {
      // Count total answers for Responses
      const responses = await Response.find({}, { answers: 1 });
      mongoCount = responses.reduce((sum, r) => sum + r.answers.length, 0);
    } else {
      mongoCount = await config.model.countDocuments();
    }
    
    console.log(`--- ${config.name} ---`);
    console.log(`CSV rows: ${csvCount}`);
    console.log(`MongoDB docs/answers: ${mongoCount}`);
    console.log(`Match: ${csvCount === mongoCount ? '✅ Yes' : '❌ No'}`);
    console.log('');
  }
  
  await mongoose.disconnect();
  console.log('=== VERIFICATION COMPLETE ===');
}

main().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
