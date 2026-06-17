
const mongoose = require('mongoose');

const Admin = require('../src/models/Admin');
const Test = require('../src/models/Test');
const Question = require('../src/models/Question');
const Performance = require('../src/models/Performance');
const Response = require('../src/models/Response');
const ErrorLog = require('../src/models/ErrorLog');
const AuditLog = require('../src/models/AuditLog');
const User = require('../src/models/User');
const OTP = require('../src/models/OTP');
const Session = require('../src/models/Session');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/meriton-cbt');
  
  console.log('Clearing all collections...');
  
  await Promise.all([
    Admin.deleteMany({}),
    Test.deleteMany({}),
    Question.deleteMany({}),
    Performance.deleteMany({}),
    Response.deleteMany({}),
    ErrorLog.deleteMany({}),
    AuditLog.deleteMany({}),
    User.deleteMany({}),
    OTP.deleteMany({}),
    Session.deleteMany({})
  ]);
  
  console.log('All collections cleared!');
  
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
