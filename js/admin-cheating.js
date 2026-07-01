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

  function getAdminSessionToken() {
    try {
      const user = JSON.parse(localStorage.getItem('cbt_user') || 'null');
      return user?.sessionToken || '';
    } catch (error) {
      console.error('Failed to read admin session from cbt_user:', error);
      return '';
    }
  }

  function findRecord(userID, TestId) {
    return records.find(r =>
      String(r.userID || r.UserID) === String(userID) &&
      String(r.testId || r.TestId) === String(TestId)
    );
  }

  function renderScoreDeductionSummary(record) {
    if (!record) return '';
    const adj = window.getViolationAdjustedScore
      ? window.getViolationAdjustedScore(record)
      : {
          rawScore: Number(record.netScore ?? record.scoreBeforeDeduction ?? 0),
          adjustedScore: Number(record.adjustedScore ?? record.netScore ?? 0),
          violationDeduction: 0,
          hasDeduction: false,
          fullScreenDeduction: 0,
          tabSwitchDeduction: 0,
          deductionReason: ''
        };

    if (!adj.hasDeduction) {
      return `<p style="margin-top:12px;color:#94a3b8;">Raw score: <strong style="color:#fff;">${adj.rawScore}</strong> (no violation deduction applied)</p>`;
    }

    const updatedAt = record.deductionUpdatedAt
      ? new Date(record.deductionUpdatedAt).toLocaleString()
      : '—';

    return `
      <div style="margin-top:16px;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px;">
        <h4 style="margin:0 0 10px;color:#60a5fa;">Score & Deduction Summary</h4>
        <p style="margin:4px 0;">Raw score: <strong>${adj.rawScore}</strong></p>
        <p style="margin:4px 0;">Fullscreen deduction: <strong>${adj.fullScreenDeduction}</strong></p>
        <p style="margin:4px 0;">Tab switch deduction: <strong>${adj.tabSwitchDeduction}</strong></p>
        <p style="margin:4px 0;">Total deduction: <strong style="color:#f87171;">${adj.violationDeduction}</strong></p>
        <p style="margin:4px 0;">Adjusted final score: <strong style="color:#4ade80;">${adj.adjustedScore}</strong></p>
        <p style="margin:4px 0;">Reason: ${adj.deductionReason || record.deductionReason || '—'}</p>
        <p style="margin:4px 0;color:#94a3b8;font-size:0.85rem;">Updated: ${updatedAt}</p>
      </div>
    `;
  }

  function updateScoreDeductionSummary(record) {
    let summaryEl = document.getElementById('scoreDeductionSummary');
    if (!summaryEl) {
      summaryEl = document.createElement('div');
      summaryEl.id = 'scoreDeductionSummary';
      const modalContent = document.getElementById('violationModalContent');
      const actions = modalContent?.querySelector('.admin-modal-actions');
      if (modalContent && actions) {
        modalContent.insertBefore(summaryEl, actions);
      }
    }
    summaryEl.innerHTML = renderScoreDeductionSummary(record);
  }

  function getTestId(test) {
    return String(test?.TestID || test?.TestId || test?.testId || test?.id || test?._id || '').trim();
  }

  function getTestTitle(test) {
    return test?.Name || test?.Title || test?.title || test?.TestName || test?.name || getTestId(test) || 'Unnamed Test';
  }

  function parseTestsResponse(response) {
    if (window.normalizeApiListResponse) {
      const parsed = window.normalizeApiListResponse(response, 'Tests');
      if (parsed.length) return parsed;
      const dataParsed = window.normalizeApiListResponse(response, 'data');
      if (dataParsed.length) return dataParsed;
    }
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.Tests)) return response.Tests;
    if (Array.isArray(response?.tests)) return response.tests;
    if (Array.isArray(response?.data)) return response.data;
    return [];
  }

  function populateTestFilter(tests, previousFilter) {
    if (!testFilter) return;

    const testsSet = new Map();
    tests.forEach(t => {
      const id = getTestId(t);
      if (!id) return;
      testsSet.set(id, getTestTitle(t));
    });

    if (testsSet.size === 0) {
      testFilter.innerHTML = '<option value="all">All Tests</option><option value="" disabled>No tests found</option>';
      return;
    }

    testFilter.innerHTML = '<option value="all">All Tests</option>' +
      Array.from(testsSet.entries())
        .map(([id, name]) => `<option value="${id}">${name} (${id})</option>`)
        .join('');

    if (previousFilter && [...testsSet.keys(), 'all'].includes(previousFilter)) {
      testFilter.value = previousFilter;
    }
  }

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
      malBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">No malpractice records found.</td></tr>';
      return;
    }

    malBody.innerHTML = list.map(r => {
      const submitted = r.submittedAt || r.SubmittedAt || r.timestamp
        ? new Date(r.submittedAt || r.SubmittedAt || r.timestamp).toLocaleString()
        : '—';
      const testName = r.testName || r.TestName || (allTests.find(t => getTestId(t) === String(r.testId || r.TestId)) || {}).Name || r.testId || r.TestId || '—';
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

      // Calculate Total Deduction
      const state = (window.getViolationState || window.getViolationAdjustedScore)(r);
      const totalDeduction = Number(
        state.totalViolationDeduction ??
        state.violationDeduction ??
        (
          Number(state.fullScreenDeduction || 0) +
          Number(state.tabSwitchDeduction || 0)
        )
      );

      return `
        <tr>
          <td>
            <div style="font-weight:700">${candidateName}</div>
            <div style="color:#94a3b8; font-size:0.85rem">${userID}${univId ? ' | ' + univId : ''} | ${email}</div>
          </td>
          <td style="vertical-align:middle">${testName}</td>
          <td style="vertical-align:middle"><span class="badge ${badgeClass}">${fs}</span></td>
          <td style="vertical-align:middle"><span class="badge ${badgeClass}">${ts}</span></td>
          <td style="vertical-align:middle"><strong>${totalDeduction}</strong></td>
          <td style="vertical-align:middle">${auto ? '<span class="badge critical">Yes</span>' : 'No'}</td>
          <td style="vertical-align:middle">${submitted}</td>
          <td style="vertical-align:middle">
            <button onclick="openViolationModal('${userID}','${r.testId || r.TestId}',${fs},${ts})" class="link-btn btn-admin btn-admin-warning btn-admin-sm">Adjust</button>
            <button onclick="viewDetails('${userID}','${r.testId || r.TestId}')" class="link-btn btn-admin btn-admin-info btn-admin-sm">View</button>
          </td>
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
    const record = findRecord(userID, TestId);
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
      w.document.write(`<body style="background:#0f172a;color:#fff;font-family:Inter,system-ui"><div style="padding:20px"><h3>Responses</h3>${renderScoreDeductionSummary(record)}${html}</div></body>`);
    } catch (e) {
      pageDebug('ERROR', 'DETAILS', 'Failed to load details', e);
      alert('Failed to load details: ' + e.message);
    }
  }

  window.openViolationModal = function(userID, TestId, rawFs, rawTab) {
    pageDebug('INFO', 'VIOLATION_MODAL', `Opening violation modal for ${userID} / ${TestId}`);
    const record = findRecord(userID, TestId);
    document.getElementById('violationUserID').value = userID;
    document.getElementById('violationTestId').value = TestId;
    document.getElementById('rawFullScreen').textContent = rawFs;
    document.getElementById('rawTabSwitch').textContent = rawTab;
    document.getElementById('fullScreenDeduction').value = Number(record?.fullScreenDeduction ?? 0);
    document.getElementById('fullScreenDeduction').max = rawFs;
    document.getElementById('tabSwitchDeduction').value = Number(record?.tabSwitchDeduction ?? 0);
    document.getElementById('tabSwitchDeduction').max = rawTab;
    document.getElementById('deductionReason').value = record?.deductionReason || '';
    updateEffectiveValues();
    updateScoreDeductionSummary(record);
    document.getElementById('violationModal').style.display = 'flex';
  }

  window.closeViolationModal = function() {
    pageDebug('INFO', 'VIOLATION_MODAL', 'Closing violation modal');
    document.getElementById('violationModal').style.display = 'none';
  }

  window.updateEffectiveValues = function() {
    const rawFs = Number(document.getElementById('rawFullScreen').textContent);
    const rawTab = Number(document.getElementById('rawTabSwitch').textContent);
    const fsDed = Number(document.getElementById('fullScreenDeduction').value) || 0;
    const tabDed = Number(document.getElementById('tabSwitchDeduction').value) || 0;
    
    const effectiveFs = Math.max(0, rawFs - fsDed);
    const effectiveTab = Math.max(0, rawTab - tabDed);
    const effectiveSuspicious = effectiveFs + effectiveTab;
    
    document.getElementById('effectiveFullScreen').textContent = effectiveFs;
    document.getElementById('effectiveTabSwitch').textContent = effectiveTab;
    document.getElementById('effectiveSuspiciousScore').textContent = effectiveSuspicious;
  }

  window.saveDeduction = async function() {
    pageDebug('INFO', 'VIOLATION_MODAL', 'Saving violation deduction');
    const userID = document.getElementById('violationUserID').value;
    const TestId = document.getElementById('violationTestId').value;
    const fullScreenDeduction = Number(document.getElementById('fullScreenDeduction').value) || 0;
    const tabSwitchDeduction = Number(document.getElementById('tabSwitchDeduction').value) || 0;
    const reason = document.getElementById('deductionReason').value.trim();
    
    const sessionToken = getAdminSessionToken();

    if (!sessionToken) {
      alert('Admin session not found. Please login again.');
      return;
    }
    
    if ((fullScreenDeduction > 0 || tabSwitchDeduction > 0) && reason.length < 5) {
      alert('Reason required (minimum 5 characters) when deduction > 0');
      return;
    }
    
    try {
      const result = await api.post({
        action: 'adjustSubmissionViolations',
        sessionToken,
        userID,
        TestId,
        fullScreenDeduction,
        tabSwitchDeduction,
        reason
      });
      
      if (result.success) {
        pageDebug('INFO', 'VIOLATION_MODAL', 'Deduction saved successfully', result);
        alert('Violation deduction updated successfully.');
        closeViolationModal();
        load();
      } else {
        pageDebug('ERROR', 'VIOLATION_MODAL', 'Failed to save deduction', result);
        alert('Failed to save deduction: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      pageDebug('ERROR', 'VIOLATION_MODAL', 'Error saving deduction', e);
      alert('Error saving deduction: ' + e.message);
    }
  }

  window.undoDeduction = async function() {
    pageDebug('INFO', 'VIOLATION_MODAL', 'Undoing violation deduction');
    const userID = document.getElementById('violationUserID').value;
    const TestId = document.getElementById('violationTestId').value;
    const sessionToken = getAdminSessionToken();

    if (!sessionToken) {
      alert('Admin session not found. Please login again.');
      return;
    }
    
    if (!confirm('Are you sure you want to undo the violation deduction?')) {
      return;
    }
    
    try {
      const result = await api.post({
        action: 'undoSubmissionViolationDeduction',
        sessionToken,
        userID,
        TestId
      });
      
      if (result.success) {
        pageDebug('INFO', 'VIOLATION_MODAL', 'Deduction undone successfully', result);
        alert('Violation deduction undone successfully.');
        closeViolationModal();
        load();
      } else {
        pageDebug('ERROR', 'VIOLATION_MODAL', 'Failed to undo deduction', result);
        alert('Failed to undo deduction: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      pageDebug('ERROR', 'VIOLATION_MODAL', 'Error undoing deduction', e);
      alert('Error undoing deduction: ' + e.message);
    }
  }

  document.getElementById('fullScreenDeduction')?.addEventListener('input', updateEffectiveValues);
  document.getElementById('tabSwitchDeduction')?.addEventListener('input', updateEffectiveValues);

  async function load() {
    pageDebug('INFO', 'LOAD', 'Starting malpractice page data load');

    const sessionToken = getAdminSessionToken();
    console.log('Admin session exists:', !!sessionToken);
    if (!sessionToken) {
      if (malBody) {
        malBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#ef4444;">Admin session not found. Please login again.</td></tr>';
      }
      if (testFilter) {
        testFilter.innerHTML = '<option value="all">All Tests</option><option value="" disabled>Login required</option>';
      }
      return;
    }

    if (!malBody || !testFilter) {
      console.error('Malpractice page DOM elements missing', { malBody: !!malBody, testFilter: !!testFilter });
      return;
    }

    malBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">Loading...</td></tr>';
    try {
      const selectedTestId = testFilter.value && testFilter.value !== 'all' ? testFilter.value : undefined;
      const requestParams = selectedTestId ? { testId: selectedTestId } : {};
      const searchQuery = searchInput?.value?.trim();
      if (searchQuery) requestParams.search = searchQuery;

      const [testsRes, malRes] = await Promise.all([
        api.get('getAllTests'),
        api.get('getMalpracticeLogs', requestParams)
      ]);

      if (testsRes && testsRes.success === false) {
        throw new Error(testsRes.error || 'Failed to load tests');
      }
      if (malRes && malRes.success === false) {
        throw new Error(malRes.error || 'Failed to load malpractice logs');
      }

      allTests = parseTestsResponse(testsRes);
      const payload = malRes || {};
      records = payload.logs || payload.data || payload.MalpracticeLogs || [];
      if (!Array.isArray(records)) records = [];
      summary = payload.summary || null;

      pageDebug('INFO', 'LOAD', 'API calls completed', { tests: allTests.length, records: records.length });

      const previousFilter = testFilter.value;
      populateTestFilter(allTests, previousFilter);

      updateSummaryCards(summary);
      applyLocalFilters();
    } catch (err) {
      pageDebug('ERROR', 'LOAD', 'Failed to load malpractice data', err);
      console.error('Malpractice page load failed:', err);
      malBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#ef4444;">Failed to load data: ${err.message}</td></tr>`;
      if (allTests.length === 0 && testFilter) {
        testFilter.innerHTML = '<option value="all">All Tests</option><option value="" disabled>Failed to load tests</option>';
      }
    }
  }

  refreshBtn?.addEventListener('click', () => {
    pageDebug('INFO', 'UI', 'Refresh button clicked');
    load();
  });
  testFilter?.addEventListener('change', () => {
    pageDebug('INFO', 'UI', `Test filter changed to ${testFilter.value}`);
    load();
  });

  searchInput?.addEventListener('input', () => {
    pageDebug('INFO', 'UI', `Search query updated: ${searchInput.value.trim()}`);
    applyLocalFilters();
  });

  await load();
})();
