
const connectDB = require('../src/config/db');

async function main() {
  await connectDB();
  
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
