
const https = require('https');

const API_URL = 'meriton.onrender.com';
const API_PATH = '/api';

function makePostRequest(action, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ ...data, action });
        const options = {
            hostname: API_URL,
            port: 443,
            path: API_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function testHealth() {
    return new Promise((resolve, reject) => {
        https.get(`https://${API_URL}/health`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('🔍 Testing Production Backend...\n');
    
    try {
        console.log('1️⃣ Checking health endpoint...');
        const health = await testHealth();
        console.log('✅ Health check:', health.success ? 'ok' : 'error', health, '\n');

        console.log('2️⃣ Testing getAllTests (public endpoint)...');
        const tests = await makePostRequest('getAllTests', {});
        console.log('✅ getAllTests:', tests.length > 0 ? 'found tests' : 'empty', '\n');

        console.log('📝 Note: Full login/register tests require test user credentials.');
        console.log('   Please create a test user first or use known credentials.');
        
    } catch (err) {
        console.error('❌ Test failed:', err);
    }
}

runTests();
