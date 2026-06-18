require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../src/models/Admin');

const ADMINS = [
  {
    Username: 'Admin',
    Password: 'MithunAdmin123',
    Role: 'admin',
    Status: 'active'
  },
  {
    Username: 'admin',
    Password: 'admin123',
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

    console.log('\nNow test with:');
    console.log('POST https://meriton.onrender.com/api');
    console.log('{');
    console.log('  "action":"adminLogin",');
    console.log('  "username":"Admin",');
    console.log('  "password":"MithunAdmin123"');
    console.log('}');
    console.log('');
    console.log('And also test with lowercase "admin" and "admin123"');

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmins();
