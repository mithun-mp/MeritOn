require('dotenv').config();
const mongoose = require('mongoose');

console.log('=== Testing Standard URI with Debug Logs ===\n');

const USERNAME = 'MeritOn_Admin';
const PASSWORD = 'UQJwK6WE0goENZG8';
const DB_NAME = 'meriton';

const standardUri = `mongodb://${USERNAME}:${PASSWORD}@ac-saddzet-shard-00-00.dnoyc2g.mongodb.net:27017,ac-saddzet-shard-00-01.dnoyc2g.mongodb.net:27017,ac-saddzet-shard-00-02.dnoyc2g.mongodb.net:27017/${DB_NAME}?ssl=true&replicaSet=atlas-v771ee-shard-0&authSource=admin&retryWrites=true&w=majority`;

// Enable mongoose debug logs
mongoose.set('debug', true);

const connectTest = async () => {
  try {
    console.log('Attempting connection...');
    const conn = await mongoose.connect(standardUri, {
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
