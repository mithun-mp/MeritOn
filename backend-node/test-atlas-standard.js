require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB Atlas (standard connection)...');

const uri = process.env.MONGODB_STANDARD_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI environment variable not configured');
  process.exit(1);
}

console.log('MongoDB URI configured: yes');

const connectTest = async () => {
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000
    });
    console.log('✅ Atlas connection successful!');
    console.log('Host:', conn.connection.host);
    console.log('DB:', conn.connection.name);
    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    if (err.codeName) console.error('Code name:', err.codeName);
    console.error('Full error:', err);
    process.exit(1);
  }
};

connectTest();
