require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB Atlas connection...');
console.log('URI:', process.env.MONGODB_URI);

const connectTest = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    console.log('✅ Atlas connection successful!');
    console.log('Host:', conn.connection.host);
    console.log('DB:', conn.connection.name);
    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    if (err.codeName) console.error('Code name:', err.codeName);
    process.exit(1);
  }
};

connectTest();
