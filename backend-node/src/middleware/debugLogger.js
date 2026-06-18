
/**
 * Debug Logger Middleware
 * Only active when NODE_ENV=development
 */

const isDev = process.env.NODE_ENV === 'development';

function debugLogger(req, res, next) {
    if (!isDev) return next();

    const start = Date.now();
    const { method, ip } = req;
    const action = req.query.action || req.body.action || 'unknown';

    console.log('\n' + '='.repeat(80));
    console.log(`[REQUEST] ${new Date().toISOString()}`);
    console.log(`  Method: ${method}`);
    console.log(`  Action: ${action}`);
    console.log(`  IP: ${ip}`);
    
    // Log request payload
    if (Object.keys(req.query).length > 0) {
        console.log(`  Query Params: ${JSON.stringify(req.query, null, 2)}`);
    }
    if (Object.keys(req.body).length > 0) {
        // Mask sensitive data
        const safeBody = { ...req.body };
        if (safeBody.password) safeBody.password = '***';
        if (safeBody.OTP) safeBody.OTP = '***';
        console.log(`  Request Body: ${JSON.stringify(safeBody, null, 2)}`);
    }

    // Hook into response to log duration
    const originalSend = res.send;
    res.send = function(body) {
        const duration = Date.now() - start;
        console.log(`  Duration: ${duration}ms`);
        console.log(`  Response: ${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);
        console.log('='.repeat(80) + '\n');
        return originalSend.call(this, body);
    };

    next();
}

module.exports = debugLogger;
