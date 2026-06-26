(async function(){
  // Simple admin malpractice viewer
  const malBody = document.getElementById('malBody');
  const testFilter = document.getElementById('testFilter');
  const searchInput = document.getElementById('searchInput');
  const refreshBtn = document.getElementById('refreshBtn');

  let allTests = [];
  let records = [];
  let summary = null;

  const pageDebug = (type, module, message, data = null) => {
    if (window.debugLog) window.debugLog(type, module, message, data);
  };

  pageDebug('INFO', 'INIT', 'Malpractice viewer initialized');

  function severityClass(severity) {
    const value = String(severity || '').toLowerCase();
    if (value === 'high' || value === 'critical') return 'critical';
    if (value === 'medium' || value === 'low' || value === 'warn') return 'warn';
    return '';
  }

  function updateSummaryCards(stats) {
    if (!stats) return;
    const bindings = {
      totalSuspiciousCandidates: 'summarySuspicious',
      totalViolations: 'summaryTotalViolations',
      fullScreenViolations: 'summaryFullScreen',
      tabSwitchViolations: 'summaryTabSwitch'
    };
    Object.entries(bindings).forEach(([key, elementId]) => {
      const el = document.getElementById(elementId);
      if (el && stats[key] !== undefined) el.textContent = stats[key];
    });
  }

  function renderRows(list) {
    pageDebug('INFO', 'RENDER', `Rendering ${list.length} malpractice rows`);
    if (!list || list.length === 0) {
      malBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No malpractice records found.</td></tr>';
      return;
    }

    malBody.innerHTML = list.map(r => {
      const submitted = r.submittedAt || r.SubmittedAt || r.timestamp
        ? new Date(r.submittedAt || r.SubmittedAt || r.timestamp).toLocaleString()
        : '—';
      const testName = r.testName || r.TestName || (allTests.find(t => String(t.TestID) === String(r.testId || r.TestId)) || {}).Name || r.testId || r.TestId || '—';
      const fs = Number(r.fullScreenViolations ?? r.FullScreenViolations ?? 0);
      const ts = Number(r.tabSwitchCount ?? r.TabSwitchCount ?? 0);
      const total = Number(r.totalViolations ?? (fs + ts));
      const auto = r.AutoSubmitted === true || String(r.AutoSubmitted).toLowerCase() === 'true' || r.status === 'auto_submitted';
      const severity = r.severity || (total >= 5 || auto ? 'High' : (total >= 2 ? 'Medium' : (total >= 1 ? 'Low' : 'Clean')));
      const badgeClass = severityClass(severity);
      const candidateName = r.candidateName || r.FullName || r.name || r.Name || 'Candidate';
      const userID = r.userID || r.UserID || '—';
      const email = r.email || r.Email || '—';
      const univId = r.univId || r.UnivID || '';

      return `
        <tr>
          <td>
            <div style="font-weight:700">${candidateName}</div>
            <div style="color:#94a3b8; font-size:0.85rem">${userID}${univId ? ' | ' + univId : ''} | ${email}</div>
          </td>
          <td style="vertical-align:middle">${testName}</td>
          <td style="vertical-align:middle"><span class="badge ${badgeClass}">${fs}</span></td>
          <td style="vertical-align:middle"><span class="badge ${badgeClass}">${ts}</span></td>
          <td style="vertical-align:middle">${auto ? '<span class="badge critical">Yes</span>' : 'No'}</td>
          <td style="vertical-align:middle">${submitted}</td>
          <td style="vertical-align:middle"><button onclick="viewDetails('${userID}','${r.testId || r.TestId}')" class="link-btn">View</button></td>
        </tr>
      `;
    }).join('');
  }

  function applyLocalFilters() {
    const val = testFilter.value;
    const q = searchInput.value.trim().toLowerCase();
    let filtered = records.slice();

    if (val && val !== 'all') {
      filtered = filtered.filter(r => String(r.testId || r.TestId) === String(val));
    }

    if (q) {
      filtered = filtered.filter(r => {
        const candidateName = String(r.candidateName || r.FullName || r.name || r.Name || '').toLowerCase();
        const userID = String(r.userID || r.UserID || '').toLowerCase();
        const email = String(r.email || r.Email || '').toLowerCase();
        const univId = String(r.univId || r.UnivID || '').toLowerCase();
        return candidateName.includes(q) || userID.includes(q) || email.includes(q) || univId.includes(q);
      });
    }

    renderRows(filtered);
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
      const selectedTestId = testFilter?.value && testFilter.value !== 'all' ? testFilter.value : undefined;
      const requestParams = selectedTestId ? { testId: selectedTestId } : {};
      const searchQuery = searchInput?.value?.trim();
      if (searchQuery) requestParams.search = searchQuery;

      const [testsRes, malRes] = await Promise.all([
        api.get('getAllTests'),
        api.get('getMalpracticeLogs', requestParams)
      ]);

      allTests = Array.isArray(testsRes) ? testsRes : (testsRes?.data || []);
      const payload = malRes || {};
      records = payload.logs || payload.data || payload.MalpracticeLogs || [];
      if (!Array.isArray(records)) records = [];
      summary = payload.summary || null;

      pageDebug('INFO', 'LOAD', 'API calls completed', { tests: allTests.length, records: records.length });

      const testsSet = new Map();
      allTests.forEach(t => testsSet.set(String(t.TestID), t.Name));
      const previousFilter = testFilter.value;
      testFilter.innerHTML = '<option value="all">All Tests</option>' + Array.from(testsSet.entries()).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
      if (previousFilter && [...testsSet.keys(), 'all'].includes(previousFilter)) {
        testFilter.value = previousFilter;
      }

      updateSummaryCards(summary);
      applyLocalFilters();
    } catch (err) {
      pageDebug('ERROR', 'LOAD', 'Failed to load malpractice data', err);
      malBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ef4444;">Failed to load data: ${err.message}</td></tr>`;
    }
  }

  refreshBtn.addEventListener('click', () => {
    pageDebug('INFO', 'UI', 'Refresh button clicked');
    load();
  });
  testFilter.addEventListener('change', () => {
    pageDebug('INFO', 'UI', `Test filter changed to ${testFilter.value}`);
    load();
  });

  searchInput.addEventListener('input', () => {
    pageDebug('INFO', 'UI', `Search query updated: ${searchInput.value.trim()}`);
    applyLocalFilters();
  });

  await load();
})();
