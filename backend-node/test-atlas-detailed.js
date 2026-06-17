require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
const { URL } = require('url');

console.log('=== MongoDB Atlas Debug Test ===\n');

console.log('1. Node.js Version:', process.version);
console.log('2. Mongoose Version:', mongoose.version);

const srvUri = process.env.MONGODB_URI;
const uriUrl = new URL(srvUri);
console.log('3. URI Hostname:', uriUrl.hostname);

const USERNAME = 'MeritOn_Admin';
const PASSWORD = 'UQJwK6WE0goENZG8';
const DB_NAME = 'meriton';

const standardUri = `mongodb://${USERNAME}:${PASSWORD}@ac-saddzet-shard-00-00.dnoyc2g.mongodb.net:27017,ac-saddzet-shard-00-01.dnoyc2g.mongodb.net:27017,ac-saddzet-shard-00-02.dnoyc2g.mongodb.net:27017/${DB_NAME}?ssl=true&replicaSet=atlas-v771ee-shard-0&authSource=admin&retryWrites=true&w=majority`;

console.log('4. Standard URI:', standardUri);

console.log('\n5. DNS SRV Lookup:', `_mongodb._tcp.${uriUrl.hostname}`);
dns.resolveSrv(`_mongodb._tcp.${uriUrl.hostname}`, (err, records) => {
  if (err) {
    console.error('   ❌ SRV Lookup Error:', err.message);
    console.error('   Stack:', err.stack);
  } else {
    console.log('   ✅ SRV Lookup Success:');
    console.log('   Records:', records);
  }

  console.log('\n6. DNS Lookup for individual shards:');
  const shards = [
    'ac-saddzet-shard-00-00.dnoyc2g.mongodb.net',
    'ac-saddzet-shard-00-01.dnoyc2g.mongodb.net',
    'ac-saddzet-shard-00-02.dnoyc2g.mongodb.net'
  ];

  shards.forEach((shard, idx) => {
    dns.lookup(shard, (err, address) => {
      if (err) {
        console.error(`   ❌ ${shard}:`, err.message);
      } else {
        console.log(`   ✅ ${shard}:`, address);
      }

      // After all lookups, try connections
      if (idx === shards.length - 1) {
        console.log('\n7. Testing SRV URI Connection:');
        testConnection(srvUri, 'SRV');

        setTimeout(() => {
          console.log('\n8. Testing Standard URI Connection:');
          testConnection(standardUri, 'Standard');
        }, 2000);
      }
    });
  });
});

async function testConnection(uri, type) {
  try {
    console.log(`   Connecting via ${type}...`);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 20000
    });
    console.log(`   ✅ ${type} Connection Success!`);
    console.log('   Host:', conn.connection.host);
    console.log('   DB:', conn.connection.name);
    await mongoose.disconnect();
    console.log('   Disconnected.');
  } catch (err) {
    console.error(`   ❌ ${type} Connection Failed:`, err.message);
    console.error('   Error Name:', err.name);
    if (err.codeName) console.error('   Code Name:', err.codeName);
    console.error('   Full Stack:\n', err.stack);
  }
}
