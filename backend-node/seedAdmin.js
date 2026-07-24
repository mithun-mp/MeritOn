require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Admin = require('./src/models/Admin');

async function seed() {
  console.log('Initializing Centralized MongoDB Atlas Connection...');
  await connectDB();

  const existingAdmin = await Admin.findOne({ Username: 'admin' });
  if (existingAdmin) {
    console.log('Admin already exists! Username: admin');
    await mongoose.connection.close();
    process.exit(0);
  }

  await Admin.create({
    Username: 'admin',
    Password: 'admin123'
  });

  console.log('Test admin created successfully!');
  console.log('Username: admin');
  console.log('Password: admin123');

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed Admin failed:', err);
  process.exit(1);
});
