(function (root) {
  'use strict';
  // 지식시스템 탭 (계획 C2, 스펙 §⑦-⑥ / §② 19번). 백엔드는 이미 있는 GET /search
  // (trigram FTS5). 여기서는 조회·표시만 한다.
  const knowledge = {};

  const SNIPPET_LEN = 200;
  const MIN_QUERY = 3;          // trigram 특성상 3자 미만 질의는 항상 0건이다

  knowledge.MIN_QUERY = MIN_QUERY;

  knowledge.rows = function (chunks) {
    return (chunks || []).map(function (c) {
      const flat = String(c.text || '').replace(/\s+/g, ' ').trim();
      return {
        filename: c.filename,
        doctype: c.doctype,
        institutionId: c.institution_id || null,
        path: c.path,
        chunkNo: c.chunk_no,
        snippet: flat.length > SNIPPET_LEN ? flat.slice(0, SNIPPET_LEN) + '…' : flat,
      };
    });
  };

  // ⚠️ 입력은 **이미 esc를 거친 문자열**이라는 계약이다. 순서를 뒤집어(강조 후 이스케이프)
  // 쓰면 <mark>까지 escape되거나, 원문을 강조한 뒤 넣으면 XSS가 된다.
  // 엔티티(&lt; 등) 안쪽은 건드리지 않는다 — 'lt' 같은 질의어가 엔티티를 깨뜨리지 않게.
  knowledge.highlight = function (escapedText, query) {
    const q = String(query == null ? '' : query).trim();
    const text = String(escapedText == null ? '' : escapedText);
    if (!q) return text;
    const needle = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // 정규식 메타문자는 리터럴로
    const re = new RegExp(needle, 'gi');
    return text.split(/(&[a-zA-Z]+;|&#\d+;)/).map(function (part, i) {
      return i % 2 ? part : part.replace(re, '<mark>$&</mark>');   // 홀수 인덱스 = 엔티티
    }).join('');
  };

  // ── 렌더 ────────────────────────────────────────────────────────────
  function esc(s) {
    return (root.logic && root.logic.esc) ? root.logic.esc(s) : String(s == null ? '' : s);
  }

  knowledge.renderResults = function (el, chunks, query) {
    const rows = knowledge.rows(chunks);
    if (!rows.length) {
      el.innerHTML = '<p class="wf-empty">검색 결과가 없습니다.</p>';
      return;
    }
    el.innerHTML = '<p class="wf-empty">' + rows.length + '건</p>' + rows.map(function (r) {
      return '<div class="kn-hit"><div class="kn-head"><b>' + esc(r.filename) + '</b>' +
        ' · ' + esc(r.doctype) + (r.institutionId ? ' · ' + esc(r.institutionId) : '') +
        ' · ' + esc(r.path) + ' #' + r.chunkNo + '</div>' +
        '<div class="kn-snip">' + knowledge.highlight(esc(r.snippet), query) + '</div></div>';
    }).join('');
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function run() {
    const q = (el('kn-q').value || '').trim();
    const out = el('kn-results');
    if (q.length < MIN_QUERY) {
      out.innerHTML = '<p class="wf-empty">검색어를 ' + MIN_QUERY +
        '자 이상 입력하세요 — 인덱스가 trigram이라 그보다 짧으면 항상 0건입니다.</p>';
      return;
    }
    const params = ['q=' + encodeURIComponent(q), 'limit=20'];
    const inst = el('kn-inst').value;
    if (inst) params.push('institution_id=' + encodeURIComponent(inst));
    const doctype = el('kn-doctype').value;
    if (doctype) params.push('doctype=' + encodeURIComponent(doctype));

    out.innerHTML = '<p class="wf-empty">검색 중…</p>';
    fetch('/search?' + params.join('&')).then(function (r) {
      return r.json().then(function (body) {
        // 503(인덱스 미빌드)은 서버가 준 안내를 그대로 보여준다 — 삼켜서 "결과 없음"으로
        // 보이게 하면 사용자가 빌드하면 된다는 사실을 영영 모른다.
        if (!r.ok) throw new Error((body && body.detail) || ('검색 실패 (' + r.status + ')'));
        return body;
      });
    }).then(function (chunks) {
      knowledge.renderResults(out, chunks, q);
    }).catch(function (e) {
      out.innerHTML = '<p class="wf-empty">' + esc(e.message) + '</p>';
    });
  }

  function renderControls() {
    const rows = (root.store && root.store.loadData() || []).filter(function (r) { return r.institutionId; });
    el('kn-controls').innerHTML =
      '<input id="kn-q" placeholder="검색어(3자 이상)" size="28">' +
      '<select id="kn-inst"><option value="">기관 전체</option>' +
      rows.map(function (r) {
        return '<option value="' + esc(r.institutionId) + '">' + esc(r.name) + '</option>';
      }).join('') + '</select>' +
      '<select id="kn-doctype"><option value="">문서 전체</option>' +
      '<option value="spec">spec(조사자료)</option>' +
      '<option value="plan">plan(제안서)</option>' +
      '<option value="bank_ideas">bank_ideas(은행 아이디어)</option></select>' +
      '<button id="kn-go">검색</button>';
    el('kn-go').onclick = run;
    el('kn-q').onkeydown = function (e) { if (e.key === 'Enter') run(); };
  }

  knowledge.mount = function () {
    if (!el('kn-q')) renderControls();      // 입력값을 날리지 않게 처음 한 번만 그린다
  };

  knowledge.unmount = function () { /* 폴링·스트림이 없어 정리할 것이 없다 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = knowledge;
  else root.knowledge = knowledge;
})(typeof self !== 'undefined' ? self : this);
