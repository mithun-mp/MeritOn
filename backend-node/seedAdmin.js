require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Admin = require('./src/models/Admin');

const bcrypt = require('bcryptjs');

async function seed() {
  console.log('Initializing Centralized MongoDB Atlas Connection...');
  await connectDB();

  const adminUsername = (process.env.INITIAL_ADMIN_USERNAME || 'admin').trim();
  const rawPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';

  const existingAdmin = await Admin.findOne({
    $or: [
      { Username: adminUsername },
      { username: adminUsername }
    ]
  });

  if (existingAdmin) {
    console.log(`Admin user already exists: ${adminUsername}`);
    await mongoose.connection.close();
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  await Admin.create({
    Username: adminUsername,
    Password: hashedPassword
  });

  console.log('Initial admin provisioned successfully.');
  console.log(`Username: ${adminUsername}`);
  console.log('Password: [STORED AS BCRYPT HASH]');

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed Admin failed:', err);
  process.exit(1);
});
