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

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: 'SCAN' }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.found) {
      q('#status').textContent = 'No ul/li list found on this page. (Reload the page after installing if it was already open.)';
      return;
    }
    q('#status').textContent = `Found list — ${resp.totalRows} rows, ${resp.columns.length} columns.`;
    renderPreview(resp.columns, resp.previewRows);

    const btn = q('#exportBtn');
    btn.style.display = 'block';
    btn.onclick = () => {
      chrome.tabs.sendMessage(tab.id, { type: 'EXPORT' }, (r) => {
        if (r && r.ok) window.close();
      });
    };
  });
})();
