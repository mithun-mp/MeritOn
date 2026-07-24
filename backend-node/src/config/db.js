const mongoose = require('mongoose');
const dns = require('dns');

// Enable strictQuery for Mongoose 7/8 compatibility
mongoose.set('strictQuery', true);

// Configure Google Public DNS for reliable SRV record resolution across platforms
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (dnsErr) {
  console.warn('[DB WARNING] Custom DNS fallback could not be applied:', dnsErr.message);
}

const DEFAULT_ATLAS_URI = 'mongodb+srv://MeritOn_Admin:MeritOn_Admin@meriton.dnoyc2g.mongodb.net/meriton-cbt?retryWrites=true&w=majority&appName=MeritOn';

const getMongoUri = () => {
  return process.env.MONGODB_URI || DEFAULT_ATLAS_URI;
};

const connectDB = async () => {
  const uri = getMongoUri();
  
  const options = {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 15000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true
  };

  try {
    const conn = await mongoose.connect(uri, options);
    console.log(`[DB SUCCESS] MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`[DB SUCCESS] Database Name: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[DB ERROR] MongoDB Atlas Connection Failed: ${error.message}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    throw error;
  }
};

// Mongoose Connection Event Monitoring
mongoose.connection.on('disconnected', () => {
  console.warn('[DB WARNING] Mongoose disconnected from MongoDB Atlas');
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB SUCCESS] Mongoose reconnected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('[DB ERROR] Mongoose connection error:', err.message);
});

// Graceful Process Shutdown Handling
const gracefulShutdown = async (signal) => {
  console.log(`\n[DB INFO] Received ${signal}. Closing Mongoose Atlas connection...`);
  try {
    await mongoose.connection.close(false);
    console.log('[DB INFO] Mongoose connection closed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[DB ERROR] Error during graceful shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = connectDB;
