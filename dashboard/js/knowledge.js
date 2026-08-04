(function (root) {
  'use strict';
  // 지식시스템 탭 (계획 C2, 스펙 §⑦-⑥ / §② 19번). 백엔드는 이미 있는 GET /search
  // (trigram FTS5). 여기서는 조회·표시만 한다.
  const knowledge = {};

  const SNIPPET_LEN = 200;
  // trigram FTS는 3자 미만 질의를 못 잡는다. **그건 FTS의 한계이지 의미 검색의
  // 한계가 아니다**(계획 F) — 그래서 더 이상 입력을 막지 않고, 0건일 때만 이유를
  // 안내한다. 인덱스에 벡터가 있는지는 화면이 알 수 없으니 서버에 물어보는 게 맞다.
  const FTS_MIN_QUERY = 3;

  knowledge.MIN_QUERY = FTS_MIN_QUERY;

  knowledge.rows = function (chunks) {
    return (chunks || []).map(function (c) {
      const flat = String(c.text || '').replace(/\s+/g, ' ').trim();
      return {
        filename: c.filename,
        doctype: c.doctype,
        institutionId: c.institution_id || null,
        path: c.path,
        chunkNo: c.chunk_no,
        scoreKind: c.score_kind || 'bm25',
        snippet: flat.length > SNIPPET_LEN ? flat.slice(0, SNIPPET_LEN) + '…' : flat,
      };
    });
  };

  // 지금이 하이브리드인지 FTS 단독인지 알려준다. **조용히 나빠지는 것이 가장 나쁘다** —
  // 임베딩 엔드포인트가 죽어 글자 검색만 되고 있는데 화면이 아무 말도 안 하면,
  // 사용자는 "그런 문서가 없나 보다" 하고 넘어간다.
  knowledge.modeBadge = function (chunks) {
    if (!chunks || !chunks.length) return null;
    return chunks[0].score_kind === 'rrf'
      ? { cls: 'kn-mode on', text: '의미 검색 포함', title: '글자 일치 + 뜻이 가까운 문서를 함께 찾았습니다.' }
      : { cls: 'kn-mode off', text: 'FTS 단독', title: '임베딩을 쓸 수 없어 글자가 겹치는 문서만 찾았습니다.' };
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
  // ⚠️ 폴백이 원문을 그대로 돌려주면 안 된다 — logic.js가 안 실려 있을 때 조용히
  // 이스케이프가 사라져 코퍼스 본문의 <script>가 그대로 실행된다. 폴백도 이스케이프한다.
  function esc(s) {
    if (root.logic && root.logic.esc) return root.logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 원문에서 **검색에 걸린 그 청크**가 어디인지 찾는다(계획 F 후속 G2).
  // 청크는 chunker가 문단을 strip해 재조립한 것이라 원문과 글자가 딱 맞지 않을 수
  // 있다. 그래서 ①통째 일치 → ②첫 줄 일치 순으로 시도하고, 둘 다 실패하면
  // -1을 돌려 **청크 표시 없이** 원문만 보여준다(틀린 곳을 짚느니 안 짚는 게 낫다).
  knowledge.locateChunk = function (fullText, chunkText) {
    const full = String(fullText == null ? '' : fullText);
    const chunk = String(chunkText == null ? '' : chunkText).trim();
    if (!chunk) return { start: -1, end: -1 };

    let at = full.indexOf(chunk);
    if (at >= 0) return { start: at, end: at + chunk.length };

    const firstLine = chunk.split('\n')[0].trim();
    if (firstLine.length >= 6) {
      at = full.indexOf(firstLine);
      if (at >= 0) return { start: at, end: at + firstLine.length };
    }
    return { start: -1, end: -1 };
  };

  // 원문 → 표시용 HTML. **이스케이프를 먼저 하고 그 위에 강조를 얹는다** —
  // 순서를 뒤집으면 원문에 든 <script>가 그대로 실행된다(highlight와 같은 계약).
  knowledge.documentHtml = function (fullText, chunkText, query) {
    const full = String(fullText == null ? '' : fullText);
    const at = knowledge.locateChunk(full, chunkText);
    if (at.start < 0) return knowledge.highlight(esc(full), query);

    // 청크 경계로 세 조각을 낸 뒤 **각각** 이스케이프한다. 통째로 이스케이프한 뒤
    // 자르면 엔티티(&lt;) 한가운데가 잘려 나갈 수 있다.
    return knowledge.highlight(esc(full.slice(0, at.start)), query) +
      '<mark class="kn-chunk" id="kn-anchor">' +
      knowledge.highlight(esc(full.slice(at.start, at.end)), query) +
      '</mark>' +
      knowledge.highlight(esc(full.slice(at.end)), query);
  };

  knowledge.renderResults = function (el, chunks, query) {
    const rows = knowledge.rows(chunks);
    if (!rows.length) {
      const hint = String(query || '').trim().length < FTS_MIN_QUERY
        ? '검색 결과가 없습니다. 질의가 ' + FTS_MIN_QUERY +
          '자 미만이면 글자 검색이 동작하지 않아, 의미 검색이 꺼져 있을 때는 항상 0건입니다.'
        : '검색 결과가 없습니다.';
      el.innerHTML = '<p class="wf-empty">' + esc(hint) + '</p>';
      return;
    }
    const badge = knowledge.modeBadge(chunks);
    el.innerHTML = '<p class="wf-empty">' + rows.length + '건' +
      (badge ? ' <span class="' + badge.cls + '" title="' + esc(badge.title) + '">' +
        esc(badge.text) + '</span>' : '') + '</p>' + rows.map(function (r, i) {
      return '<div class="kn-hit" data-index="' + i + '" title="클릭하면 원문을 엽니다">' +
        '<div class="kn-head"><span class="kn-open">원문 열기 ↗</span><b>' + esc(r.filename) + '</b>' +
        ' · ' + esc(r.doctype) + (r.institutionId ? ' · ' + esc(r.institutionId) : '') +
        ' · ' + esc(r.path) + ' #' + r.chunkNo + '</div>' +
        '<div class="kn-snip">' + knowledge.highlight(esc(r.snippet), query) + '</div></div>';
    }).join('');
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  let lastChunks = [];      // 결과 행 클릭 시 원문+청크를 되짚기 위해 보관
  let lastQuery = '';

  function openDocument(index) {
    const hit = lastChunks[index];
    if (!hit) return;
    const modal = el('doc-modal');
    el('doc-title').textContent = hit.filename || '원문';
    el('doc-meta').textContent = hit.path + ' #' + hit.chunk_no + ' — 불러오는 중…';
    el('doc-body').innerHTML = '';
    modal.style.display = '';

    fetch('/documents?path=' + encodeURIComponent(hit.path)).then(function (r) {
      return r.json().then(function (body) {
        // 서버가 준 사유를 그대로 보여준다(허용되지 않은 위치·형식 미지원 등).
        if (!r.ok) throw new Error((body && body.detail) || ('원문을 열지 못했습니다 (' + r.status + ')'));
        return body;
      });
    }).then(function (doc) {
      el('doc-meta').textContent = doc.path + ' · ' + doc.chars.toLocaleString() + '자' +
        (doc.truncated ? ' (앞부분만 표시)' : '');
      el('doc-body').innerHTML = '<pre>' +
        knowledge.documentHtml(doc.text, hit.text, lastQuery) + '</pre>';
      const anchor = el('kn-anchor');
      if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ block: 'center' });
    }).catch(function (e) {
      el('doc-meta').textContent = hit.path;
      el('doc-body').innerHTML = '<p class="wf-empty">' + esc(e.message) + '</p>';
    });
  }

  function wireDocumentModal() {
    const modal = el('doc-modal');
    if (!modal || modal.dataset.wired) return;
    modal.dataset.wired = '1';
    function close() { modal.style.display = 'none'; }
    el('doc-close').onclick = close;
    // 기존 모달들과 같은 관행 — 배경 클릭·Esc로도 닫힌다.
    modal.onclick = function (e) { if (e.target === modal) close(); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') close();
    });
  }

  function run() {
    const q = (el('kn-q').value || '').trim();
    const out = el('kn-results');
    if (!q) {
      out.innerHTML = '<p class="wf-empty">검색어를 입력하세요.</p>';
      return;
    }
    const params = ['q=' + encodeURIComponent(q), 'limit=20'];
    const inst = el('kn-inst').value;
    if (inst) params.push('institution_id=' + encodeURIComponent(inst));
    const doctype = el('kn-doctype').value;
    if (doctype) params.push('doctype=' + encodeURIComponent(doctype));

    // 하이브리드는 질의를 임베딩하느라 CPU 환경에서 1초 넘게 걸린다 — 표시가 없으면
    // 먹통으로 보인다. 버튼도 잠가 같은 질의가 여러 번 날아가지 않게 한다.
    const go = el('kn-go');
    if (go) { go.disabled = true; go.textContent = '검색 중…'; }
    out.innerHTML = '<p class="wf-empty">검색 중… (의미 검색이 켜져 있으면 1초 남짓 걸립니다)</p>';
    fetch('/search?' + params.join('&')).then(function (r) {
      return r.json().then(function (body) {
        // 503(인덱스 미빌드)은 서버가 준 안내를 그대로 보여준다 — 삼켜서 "결과 없음"으로
        // 보이게 하면 사용자가 빌드하면 된다는 사실을 영영 모른다.
        if (!r.ok) throw new Error((body && body.detail) || ('검색 실패 (' + r.status + ')'));
        return body;
      });
    }).then(function (chunks) {
      lastChunks = chunks || [];
      lastQuery = q;
      knowledge.renderResults(out, chunks, q);
      Array.prototype.forEach.call(out.querySelectorAll('.kn-hit'), function (node) {
        node.onclick = function () { openDocument(Number(node.dataset.index)); };
      });
    }).catch(function (e) {
      out.innerHTML = '<p class="wf-empty">' + esc(e.message) + '</p>';
    }).then(function () {
      if (go) { go.disabled = false; go.textContent = '검색'; }
    });
  }

  function renderControls() {
    const rows = (root.store && root.store.loadData() || []).filter(function (r) { return r.institutionId; });
    el('kn-controls').innerHTML =
      '<input id="kn-q" placeholder="검색어 (뜻이 비슷한 문서도 찾습니다)" size="30">' +
      '<select id="kn-inst"><option value="">기관 전체</option>' +
      rows.map(function (r) {
        return '<option value="' + esc(r.institutionId) + '">' + esc(r.name) + '</option>';
      }).join('') + '</select>' +
      '<select id="kn-doctype"><option value="">문서 전체</option>' +
      '<option value="spec">spec(조사자료)</option>' +
      '<option value="plan">plan(제안서)</option>' +
      '<option value="bank_ideas">bank_ideas(은행 아이디어)</option>' +
      '<option value="archive">archive(완료 산출물)</option></select>' +
      '<button id="kn-go">검색</button>';
    el('kn-go').onclick = run;
    el('kn-q').onkeydown = function (e) { if (e.key === 'Enter') run(); };
  }

  knowledge.mount = function () {
    if (!el('kn-q')) renderControls();      // 입력값을 날리지 않게 처음 한 번만 그린다
    wireDocumentModal();
  };

  knowledge.unmount = function () { /* 폴링·스트림이 없어 정리할 것이 없다 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = knowledge;
  else root.knowledge = knowledge;
})(typeof self !== 'undefined' ? self : this);
