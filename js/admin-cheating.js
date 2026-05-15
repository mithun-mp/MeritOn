(async function(){
  // Simple admin malpractice viewer
  const malBody = document.getElementById('malBody');
  const testFilter = document.getElementById('testFilter');
  const searchInput = document.getElementById('searchInput');
  const refreshBtn = document.getElementById('refreshBtn');

  let allTests = [];
  let records = [];

  const pageDebug = (type, module, message, data = null) => {
    if (window.debugLog) window.debugLog(type, module, message, data);
  };

  pageDebug('INFO', 'INIT', 'Malpractice viewer initialized');

  function renderRows(list) {
    pageDebug('INFO', 'RENDER', `Rendering ${list.length} malpractice rows`);
    if (!list || list.length === 0) {
      malBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No malpractice records found.</td></tr>';
      return;
    }

    malBody.innerHTML = list.map(r => {
      const submitted = new Date(r.SubmittedAt || r.timestamp || Date.now()).toLocaleString();
      const testName = (allTests.find(t=>String(t.TestID)===String(r.TestId)) || {}).Name || r.TestId || '—';
      const fs = Number(r.FullScreenViolations || 0);
      const ts = Number(r.TabSwitchCount || 0);
      const auto = r.AutoSubmitted === true || String(r.AutoSubmitted).toLowerCase() === 'true';
      const severity = (fs + ts) >= 5 || auto ? 'critical' : ((fs + ts) > 0 ? 'warn' : '');

      return `
        <tr>
          <td>
            <div style="font-weight:700">${r.name || r.Name || 'Candidate'}</div>
            <div style="color:#94a3b8; font-size:0.85rem">${r.userID || r.UserID || '—'} | ${r.Email || '—'}</div>
          </td>
          <td style="vertical-align:middle">${testName}</td>
          <td style="vertical-align:middle"><span class="badge ${severity}">${fs}</span></td>
          <td style="vertical-align:middle"><span class="badge ${severity}">${ts}</span></td>
          <td style="vertical-align:middle">${auto ? '<span class="badge critical">Yes</span>' : 'No'}</td>
          <td style="vertical-align:middle">${submitted}</td>
          <td style="vertical-align:middle"><button onclick="viewDetails('${r.userID}','${r.TestId}')" class="link-btn">View</button></td>
        </tr>
      `;
    }).join('');
  }

  window.viewDetails = async function(userID, TestId) {
    pageDebug('INFO', 'DETAILS', `Loading response details for ${userID} / ${TestId}`);
    try {
      const rows = await api.get('getResponses', { userID, TestId });
      const normalized = Array.isArray(rows) ? rows : (rows.data || []);
      pageDebug('INFO', 'DETAILS', 'Response details fetched', { count: normalized.length });
      const html = normalized.map(rr => `
        <div style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.03);">
          <div style="font-weight:700">Q: ${rr.QID} <span style="color:#94a3b8; font-weight:600;">(${rr.Section})</span></div>
          <div style="color:#94a3b8;">${rr.Question}</div>
          <div style="margin-top:6px;">Selected: <strong style="color:#f87171">${rr.SelectedAnswer || '—'}</strong> | Correct: <strong style="color:#4ade80">${rr.CorrectAnswer}</strong></div>
        </div>
      `).join('');

      const w = window.open('', '_blank', 'width=900,height=700');
      if (!w) {
        pageDebug('WARN', 'DETAILS', 'Popup blocked when opening details window');
        alert('Popup blocked. Please allow popups to view response details.');
        return;
      }
      w.document.write(`<body style="background:#0f172a;color:#fff;font-family:Inter,system-ui"><div style="padding:20px"><h3>Responses</h3>${html}</div></body>`);
    } catch (e) {
      pageDebug('ERROR', 'DETAILS', 'Failed to load details', e);
      alert('Failed to load details: ' + e.message);
    }
  }

  async function load() {
    pageDebug('INFO', 'LOAD', 'Starting malpractice page data load');
    malBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">Loading...</td></tr>';
    try {
      [allTests, records] = await Promise.all([
        (await api.get('getAllTests')) || [],
        (await api.get('getResults')) || []
      ]);

      pageDebug('INFO', 'LOAD', 'API calls completed', { tests: allTests.length, results: records.length });

      allTests = Array.isArray(allTests) ? allTests : (allTests.data || []);
      records = Array.isArray(records) ? records : (records.data || []);

      records = records.map(r => {
        const parsed = typeof r === 'string' ? JSON.parse(r) : r;
        return parsed;
      });
      pageDebug('INFO', 'LOAD', 'Normalized records', { count: records.length });

      const mal = records.filter(r => Number(r.FullScreenViolations || 0) > 0 || Number(r.TabSwitchCount || 0) > 0 || (String(r.AutoSubmitted).toLowerCase() === 'true'));
      pageDebug('INFO', 'LOAD', `Filtered malpractice records: ${mal.length}`);

      const testsSet = new Map();
      allTests.forEach(t => testsSet.set(String(t.TestID), t.Name));
      testFilter.innerHTML = '<option value="all">All Tests</option>' + Array.from(testsSet.entries()).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');

      renderRows(mal);
    } catch (err) {
      pageDebug('ERROR', 'LOAD', 'Failed to load malpractice data', err);
      malBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ef4444;">Failed to load data: ${err.message}</td></tr>`;
    }
  }

  refreshBtn.addEventListener('click', () => {
    pageDebug('INFO', 'UI', 'Refresh button clicked');
    load();
  });
  testFilter.addEventListener('change', ()=>{
    const val = testFilter.value;
    pageDebug('INFO', 'UI', `Test filter changed to ${val}`);
    const filtered = records.filter(r => (Number(r.FullScreenViolations||0)>0 || Number(r.TabSwitchCount||0)>0 || String(r.AutoSubmitted).toLowerCase()==='true') && (val==='all' ? true : String(r.TestId)===String(val)));
    renderRows(filtered);
  });

  searchInput.addEventListener('input', ()=>{
    const q = searchInput.value.trim().toLowerCase();
    pageDebug('INFO', 'UI', `Search query updated: ${q}`);
    const filtered = records.filter(r=> (Number(r.FullScreenViolations||0)>0 || Number(r.TabSwitchCount||0)>0 || String(r.AutoSubmitted).toLowerCase()==='true') && (
      (r.name||'').toLowerCase().includes(q) || (r.userID||'').toLowerCase().includes(q) || (r.Email||'').toLowerCase().includes(q)
    ));
    renderRows(filtered);
  });

  await load();
})();