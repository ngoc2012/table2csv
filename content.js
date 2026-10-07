// Hover border handled entirely by content.css (:hover outline) — no JS needed.

function getLiRows(ul) {
  return Array.from(ul.children).filter((c) => c.tagName === 'LI');
}

// ponytail: grouping key is STRUCTURAL (tag + position among same-tag
// siblings), not class-based — rows whose class differs per state
// (e.g. "project-name" vs "project-name project-succeed text-success")
// still land in the same column.
function indexAmongTag(el) {
  let i = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) i++;
    sib = sib.previousElementSibling;
  }
  return i;
}

function segmentOf(el) {
  return el.tagName.toLowerCase() + ':' + indexAmongTag(el);
}

function pathOf(li, holder) {
  const segs = [];
  let el = holder;
  while (el && el !== li) {
    segs.unshift(segmentOf(el));
    el = el.parentElement;
  }
  return segs.join(' > ');
}

function elementChain(li, holder) {
  const chain = [];
  let el = holder;
  while (el && el !== li) {
    chain.unshift(el);
    el = el.parentElement;
  }
  return chain;
}

// Nearest classed element to the li (top-down), not to the text (bottom-up) —
// that's the stable wrapper (e.g. "project-recomendation") rather than a
// volatile inner label class (e.g. "label _c label-danger").
function columnNameFor(li, holder) {
  for (const el of elementChain(li, holder)) {
    if (typeof el.className === 'string' && el.className.trim()) {
      return el.className.trim().replace(/\s+/g, '-');
    }
  }
  return pathOf(li, holder);
}

function leavesOf(li) {
  const map = new Map(); // holder element -> text parts
  const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p = node.parentElement;
      while (p && p !== li) {
        if (p.tagName === 'UL' || p.tagName === 'OL' || p.tagName === 'LI') {
          return NodeFilter.FILTER_REJECT; // skip nested lists entirely
        }
        p = p.parentElement;
      }
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node;
  while ((node = walker.nextNode())) {
    const holder = node.parentElement;
    if (!map.has(holder)) map.set(holder, []);
    map.get(holder).push(node.textContent.trim());
  }
  const leaves = [];
  for (const [holder, parts] of map) {
    leaves.push({ holder, path: pathOf(li, holder), text: parts.join(' ').trim() });
  }
  return leaves;
}

// ponytail: single best list only, no multi-table support — pick the ul with
// the most li rows that actually carry text.
function findBestList() {
  const uls = Array.from(document.querySelectorAll('ul'));
  let best = null;
  let bestScore = 0;
  for (const ul of uls) {
    const score = getLiRows(ul).filter((li) => leavesOf(li).length > 0).length;
    if (score > bestScore) {
      bestScore = score;
      best = ul;
    }
  }
  return best;
}

function extract(ul) {
  const perLi = [];
  const colOrder = [];
  const candidates = new Map(); // path -> shortest class-name seen (most generic/state-free)

  for (const li of getLiRows(ul)) {
    const leaves = leavesOf(li);
    if (!leaves.length) continue; // e.g. pure action/dropdown li with no own text
    perLi.push(leaves);
    for (const { path, holder } of leaves) {
      if (!colOrder.includes(path)) colOrder.push(path);
      const name = columnNameFor(li, holder);
      const prev = candidates.get(path);
      if (!prev || name.length < prev.length) candidates.set(path, name);
    }
  }

  const colName = new Map(); // path -> deduped display name
  const usedNames = new Set();
  for (const path of colOrder) {
    const base = candidates.get(path);
    let name = base;
    let i = 2;
    while (usedNames.has(name)) name = `${base}-${i++}`;
    usedNames.add(name);
    colName.set(path, name);
  }

  const rows = perLi.map((leaves) => {
    const row = {};
    for (const { path, text } of leaves) {
      const name = colName.get(path);
      row[name] = row[name] ? `${row[name]} ${text}` : text;
    }
    return row;
  });

  return { columns: colOrder.map((p) => colName.get(p)), rows };
}

function toCSV(columns, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map(esc).join(',')];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c])).join(','));
  return lines.join('\n');
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCAN') {
    const ul = findBestList();
    if (!ul) {
      sendResponse({ found: false });
      return;
    }
    const { columns, rows } = extract(ul);
    sendResponse({ found: true, columns, totalRows: rows.length, previewRows: rows.slice(0, 2) });
  } else if (msg.type === 'EXPORT') {
    const ul = findBestList();
    if (!ul) {
      sendResponse({ ok: false });
      return;
    }
    const { columns, rows } = extract(ul);
    download('table-export.csv', toCSV(columns, rows));
    sendResponse({ ok: true, totalRows: rows.length });
  }
  return true;
});
