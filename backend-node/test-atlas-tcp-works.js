require('dotenv').config();
const mongoose = require('mongoose');

console.log('=== Testing Standard URI with Debug Logs ===\n');

const uri = process.env.MONGODB_STANDARD_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI environment variable not configured');
  process.exit(1);
}

console.log('MongoDB URI configured: yes');

// Enable mongoose debug logs
mongoose.set('debug', false);

const connectTest = async () => {
  try {
    console.log('Attempting connection...');
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 5000
    });
    console.log('\n✅ Connection successful!');
    console.log('Host:', conn.connection.host);
    console.log('DB:', conn.connection.name);
    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    console.error('Error Name:', err.name);
    console.error('Reason:', err.reason);
    if (err.reason) {
      console.error('Servers:', Array.from(err.reason.servers.entries()));
    }
    console.error('Full stack:', err.stack);
  }
};

connectTest();
