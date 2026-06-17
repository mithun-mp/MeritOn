require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

// Set DNS servers to Google DNS
dns.setServers(['8.8.8.8', '8.8.4.4']);
console.log('=== Using Google DNS 8.8.8.8, 8.8.4.4 ===\n');

console.log('1. Node.js Version:', process.version);
console.log('2. Mongoose Version:', mongoose.version);
console.log('3. DNS Servers:', dns.getServers());

const srvUri = process.env.MONGODB_URI;
console.log('4. SRV URI:', srvUri);

const connectTest = async () => {
  try {
    console.log('\nAttempting SRV connection...');
    const conn = await mongoose.connect(srvUri, {
      serverSelectionTimeoutMS: 30000
    });
    console.log('✅ SRV Connection Success!');
    console.log('Host:', conn.connection.host);
    console.log('DB:', conn.connection.name);
    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (err) {
    console.error('❌ SRV Connection Failed:', err.message);
    console.error('Full stack:', err.stack);
  }
};

connectTest();
