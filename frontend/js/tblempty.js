(function (root) {
  'use strict';
  // 빈 표 한 줄 (DESIGN '빈 표'). 머리 줄은 호출하는 쪽이 그대로 그린다.
  const tblEmpty = {};
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; }); }
  tblEmpty.SR = '비어 있음';

  // colCount = 머리 줄 실제 열 수(선택 칸·sr-only '동작' 칸 포함). opts: { sr, cls }
  tblEmpty.rowHtml = function (colCount, opts) {
    const o = opts || {}, n = Math.max(1, Math.floor(Number(colCount)) || 1);
    let h = '<tr class="tb-empty' + (o.cls ? ' ' + esc(o.cls) : '') + '"><td><span class="sr-only">' + esc(o.sr || tblEmpty.SR) + '</span></td>';
    for (let i = 1; i < n; i++) h += '<td></td>';
    return h + '</tr>';
  };

  // 표 아래 안내 한 줄. text는 esc, actionHtml은 호출 쪽이 조립한 단추 HTML만(사용자 값 금지).
  tblEmpty.noteHtml = function (text, actionHtml, opts) {
    if (!text && !actionHtml) return '';
    const id = opts && opts.id ? ' id="' + esc(opts.id) + '"' : '';
    return '<p class="tb-empty-note"' + id + '>' + esc(text) + (actionHtml ? ' ' + actionHtml : '') + '</p>';
  };

  // DOM으로 표를 만드는 화면(board-minutes·instsummary)용
  tblEmpty.rowEl = function (doc, colCount, opts) {
    const o = opts || {}, n = Math.max(1, Math.floor(Number(colCount)) || 1);
    const tr = doc.createElement('tr'); tr.className = 'tb-empty' + (o.cls ? ' ' + o.cls : '');
    for (let i = 0; i < n; i++) {
      const td = doc.createElement('td');
      if (i === 0) { const s = doc.createElement('span'); s.className = 'sr-only'; s.textContent = o.sr || tblEmpty.SR; td.appendChild(s); }
      tr.appendChild(td);
    }
    return tr;
  };
  tblEmpty.noteEl = function (doc, text) {
    const p = doc.createElement('p'); p.className = 'tb-empty-note'; p.textContent = text || ''; return p;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = tblEmpty;
  else root.tblEmpty = tblEmpty;
})(typeof self !== 'undefined' ? self : this);
