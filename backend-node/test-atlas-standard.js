require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB Atlas (standard connection)...');

const USERNAME = 'MeritOn_Admin';
const PASSWORD = 'UQJwK6WE0goENZG8';
const DB_NAME = 'meriton';

const STANDARD_URI = `mongodb://${USERNAME}:${PASSWORD}@ac-saddzet-shard-00-00.dnoyc2g.mongodb.net:27017,ac-saddzet-shard-00-01.dnoyc2g.mongodb.net:27017,ac-saddzet-shard-00-02.dnoyc2g.mongodb.net:27017/${DB_NAME}?ssl=true&replicaSet=atlas-v771ee-shard-0&authSource=admin&retryWrites=true&w=majority`;

const connectTest = async () => {
  try {
    const conn = await mongoose.connect(STANDARD_URI, {
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
