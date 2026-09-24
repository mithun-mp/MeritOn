require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../src/models/Admin');

const ADMINS = [
  {
    Username: process.env.INITIAL_ADMIN_USERNAME || 'admin',
    Password: process.env.INITIAL_ADMIN_PASSWORD || 'ChangeMe123!',
    Role: 'admin',
    Status: 'active'
  }
];

async function createAdmins() {
  console.log('========================================');
  console.log('MERITON ADMIN ACCOUNT CREATION');
  console.log('========================================\n');

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB successfully\n');

    for (const adminData of ADMINS) {
      // Hash password
      const hashedPassword = await bcrypt.hash(adminData.Password, 10);

      // Upsert admin
      const result = await Admin.findOneAndUpdate(
        { Username: adminData.Username },
        { $set: { Password: hashedPassword } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      console.log(`✅ Admin account processed: ${adminData.Username}`);
      console.log(`   MongoDB document id: ${result._id}`);
      console.log('');
    }

    console.log('========================================');
    console.log('ADMIN ACCOUNTS CREATED/UPDATED SUCCESSFULLY');
    console.log('========================================');

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmins();
