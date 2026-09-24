
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const MIGRATION_DATA_DIR = path.join(__dirname, '../migration-data');

function maskValue(key, value) {
  if (!value) return value;
  const sensitiveKeys = ['email', 'password', 'phone', 'contact'];
  const lowerKey = key.toLowerCase();
  if (sensitiveKeys.some(s => lowerKey.includes(s))) {
    return '[MASKED]';
  }
  return value;
}

async function analyzeCsv(filePath) {
  const results = [];
  const filename = path.basename(filePath);
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        resolve({
          filename,
          headers: results.length > 0 ? Object.keys(results[0]) : [],
          rowCount: results.length,
          sampleRows: results.slice(0, 3).map(row => {
            const masked = {};
            for (const key in row) {
              masked[key] = maskValue(key, row[key]);
            }
            return masked;
          }),
          dataTypes: results.length > 0 ? (() => {
            const types = {};
            for (const key of Object.keys(results[0])) {
              const values = results.map(r => r[key]).filter(v => v && v.trim() !== '');
              if (values.length === 0) {
                types[key] = 'unknown';
                continue;
              }
              // Check booleans
              if (values.every(v => v === 'true' || v === 'false')) {
                types[key] = 'boolean';
              }
              // Check numbers
              else if (values.every(v => !isNaN(parseFloat(v)))) {
                types[key] = 'number';
              }
              // Check dates
              else if (values.every(v => !isNaN(Date.parse(v)))) {
                types[key] = 'date';
              }
              // Check JSON
              else if (values.some(v => v.startsWith('{') || v.startsWith('['))) {
                types[key] = 'json';
              }
              else {
                types[key] = 'string';
              }
            }
            return types;
          })() : {}
        });
      })
      .on('error', reject);
  });
}

async function main() {
  const files = fs.readdirSync(MIGRATION_DATA_DIR).filter(f => f.endsWith('.csv'));
  console.log('=== CSV INVENTORY REPORT ===\n');
  
  for (const file of files) {
    const filePath = path.join(MIGRATION_DATA_DIR, file);
    const analysis = await analyzeCsv(filePath);
    
    console.log(`--- ${analysis.filename} ---`);
    console.log(`Row count: ${analysis.rowCount}`);
    console.log(`Headers: ${analysis.headers.join(', ')}`);
    console.log('Data types:');
    for (const [key, type] of Object.entries(analysis.dataTypes)) {
      console.log(`  ${key}: ${type}`);
    }
    console.log('Sample rows:');
    for (const row of analysis.sampleRows) {
      console.log('  ' + JSON.stringify(row, null, 2).split('\n').join('\n  '));
    }
    console.log('');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
