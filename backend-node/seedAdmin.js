
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/meriton-cbt';

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  const existingAdmin = await Admin.findOne({ Username: 'admin' });
  if (existingAdmin) {
    console.log('Admin already exists! Username: admin, Password: admin123 (or whatever was set)');
    process.exit(0);
  }

  // Create test admin with plaintext password for compatibility, or hash it
  // Here we use plaintext for easy testing
  const admin = await Admin.create({
    Username: 'admin',
    Password: 'admin123'
  });

  console.log('Test admin created!');
  console.log('Username: admin');
  console.log('Password: admin123');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

