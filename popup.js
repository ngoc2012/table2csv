function q(sel) {
  return document.querySelector(sel);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function renderPreview(columns, rows) {
  let html = '<table><thead><tr>' + columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>' + columns.map((c) => `<td>${escapeHtml(row[c] || '')}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  q('#preview').innerHTML = html;
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id;
}

// Injects content.js + content.css into the live page (no reload needed,
// like DevTools attaching on demand) then calls fn in that page's context.
async function runInPage(tabId, fn) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: fn });
  return result;
}

async function scan() {
  q('#status').textContent = 'Scanning…';
  q('#exportBtn').style.display = 'none';
  q('#preview').innerHTML = '';

  const tabId = await activeTabId();
  let resp;
  try {
    resp = await runInPage(tabId, () => window.__t2csv.scan());
  } catch (e) {
    q('#status').textContent = "Can't scan this page (" + e.message + ').';
    return;
  }

  if (!resp || !resp.found) {
    q('#status').textContent = 'No ul/ol list found on this page.';
    return;
  }

  q('#status').textContent = `Found list — ${resp.totalRows} rows, ${resp.columns.length} columns.`;
  renderPreview(resp.columns, resp.previewRows);
  q('#exportBtn').style.display = 'block';
}

async function exportCSV() {
  const tabId = await activeTabId();
  const resp = await runInPage(tabId, () => window.__t2csv.exportCSV());
  if (resp && resp.ok) window.close();
}

q('#scanBtn').addEventListener('click', scan);
q('#exportBtn').addEventListener('click', exportCSV);
