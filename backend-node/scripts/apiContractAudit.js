const fs = require('fs');
const path = require('path');

// Paths
const backendRoutesPath = path.join(__dirname, '../src/routes/api.js');
const frontendJsPath = path.join(__dirname, '../../js');

// Step 1: Read backend routes
function getBackendActions() {
  const content = fs.readFileSync(backendRoutesPath, 'utf8');
  const actions = [];
  const caseRegex = /case\s+'([^']+)':/g;
  let match;
  while ((match = caseRegex.exec(content)) !== null) {
    actions.push(match[1]);
  }
  return new Set(actions);
}

// Step 2: Scan frontend JS files for api calls
function getFrontendActions() {
  const frontendFiles = fs.readdirSync(frontendJsPath).filter(file => file.endsWith('.js'));
  const actions = [];

  frontendFiles.forEach(file => {
    const filePath = path.join(frontendJsPath, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Scan for api.get or api.post with action
    lines.forEach((line, index) => {
      // api.get('action')
      const getMatch = line.match(/api\.get\s*\(\s*['"]([^'"]+)['"]/);
      if (getMatch) {
        actions.push({
          file,
          line: index + 1,
          action: getMatch[1],
          method: 'GET'
        });
      }

      // api.post({ action: '...' })
      const postMatch = line.match(/action\s*:\s*['"]([^'"]+)['"]/);
      if (postMatch && line.includes('api.post')) {
        actions.push({
          file,
          line: index + 1,
          action: postMatch[1],
          method: 'POST'
        });
      }
    });
  });

  return actions;
}

function main() {
  console.log('📋 MERITON API CONTRACT AUDIT\n');
  const backendActions = getBackendActions();
  const frontendActions = getFrontendActions();

  console.log('Backend supported actions:', [...backendActions].join(', '), '\n');

  const results = frontendActions.map(frontend => {
    const exists = backendActions.has(frontend.action);
    return {
      ...frontend,
      status: exists ? 'ACTION OK' : 'ACTION MISSING',
      risk: exists ? 'none' : 'high'
    };
  });

  console.group('Frontend API Calls');
  results.forEach(result => {
    const emoji = result.status === 'ACTION OK' ? '✅' : '❌';
    console.log(`${emoji} ${result.file}:${result.line} | ${result.method} ${result.action} | ${result.status}`);
  });
  console.groupEnd();

  const missing = results.filter(r => r.status === 'ACTION MISSING');
  if (missing.length > 0) {
    console.log('\n⚠️ Missing actions:', missing.map(m => m.action).join(', '));
  } else {
    console.log('\n✅ All frontend actions are supported by backend!');
  }
}

main();
