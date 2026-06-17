const net = require('net');

console.log('=== Testing TCP Connection to Shards on Port 27017 ===\n');

const shards = [
  'ac-saddzet-shard-00-00.dnoyc2g.mongodb.net',
  'ac-saddzet-shard-00-01.dnoyc2g.mongodb.net',
  'ac-saddzet-shard-00-02.dnoyc2g.mongodb.net'
];

shards.forEach((shard) => {
  const socket = new net.Socket();
  const timeout = 10000;
  let connected = false;

  socket.setTimeout(timeout);

  socket.connect(27017, shard, () => {
    connected = true;
    console.log(`✅ ${shard}:27017 - Connection successful`);
    socket.end();
  });

  socket.on('timeout', () => {
    socket.destroy();
    if (!connected) {
      console.error(`❌ ${shard}:27017 - Connection timeout after ${timeout}ms`);
    }
  });

  socket.on('error', (err) => {
    console.error(`❌ ${shard}:27017 - Connection error: ${err.message}`);
  });

  socket.on('close', () => {
    // Do nothing
  });
});
