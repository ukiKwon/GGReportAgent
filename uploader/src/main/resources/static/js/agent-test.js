/* agent 테스트 패널 — 제공 REST API를 화면에서 호출해 본다. 외부 라이브러리 없음. */
(function () {
  'use strict';

  var panel = document.getElementById('agentPanel');
  if (!panel) return;

  var base = panel.getAttribute('data-base') || '/';
  if (base.charAt(base.length - 1) !== '/') base += '/';

  // API를 추가하려면 이 배열에 항목만 넣으면 된다.
  var APIS = [{
    id: 'proposals',
    name: '입찰제안서 조회',
    method: 'GET',
    path: 'api/proposals',
    params: [
      { name: 'institution', label: '기관명 (부분 일치)', placeholder: '예: 서울대학교' },
      { name: 'year', label: '연도', placeholder: '예: 2025' },
      { name: 'category', label: '기관분류', type: 'select',
        options: ['', '지자체', '대학교', '대학병원', '공공기관', '미분류'] },
      { name: 'size', label: '건수', placeholder: '20' }
    ],
    render: renderProposalList,
    sentence: function (p) {
      var who = [p.year ? p.year + '년' : '', p.category || '', p.institution || ''].filter(Boolean).join(' ');
      return (who ? who + '의 ' : '') + '입찰제안서를 찾아줘.'
        + (p.size ? ' ' + p.size + '건까지만 보여줘.' : '');
    },
    reply: function (d) {
      if (!d.total) return '조건에 맞는 입찰제안서가 없습니다.';
      var f = (d.items || [])[0] || {};
      return '입찰제안서 ' + d.total + '건을 찾았습니다. 가장 최근 건은 '
        + (f.institutionName || '기관미상') + '의 "' + (f.fileName || '?') + '"'
        + (f.totalSlides != null ? ' (' + f.totalSlides + '장)' : '') + '입니다.\n'
        + '아래 표에서 [크게보기]를 누르면 파싱된 JSON 전체를 보여드릴게요.';
    }
  }, {
    id: 'rfps',
    name: '입찰공고문(RFP) 조회',
    method: 'GET',
    path: 'api/rfps',
    params: [
      { name: 'institution', label: '기관명 (부분 일치)', placeholder: '예: 서울특별시' },
      { name: 'noticeDate', label: '공고일 (앞자리 일치)', placeholder: '예: 2024 또는 20240315' },
      { name: 'category', label: '기관분류', type: 'select',
        options: ['', '지자체', '대학교', '대학병원', '공공기관', '미분류'] },
      { name: 'size', label: '건수', placeholder: '20' }
    ],
    render: renderRfpList,
    sentence: function (p) {
      var when = p.noticeDate ? p.noticeDate + '에 공고된 ' : '';
      var who = [p.category || '', p.institution || ''].filter(Boolean).join(' ');
      return when + (who ? who + '의 ' : '') + '입찰공고문 요약을 찾아줘.'
        + (p.size ? ' ' + p.size + '건까지만.' : '');
    },
    reply: function (d) {
      if (!d.total) return '조건에 맞는 입찰공고문이 없습니다.';
      var f = (d.items || [])[0] || {};
      return '입찰공고문 ' + d.total + '건을 찾았습니다. 가장 최근 건은 '
        + (f.institutionName || '기관미상') + '의 "' + (f.fileName || '?') + '"'
        + (f.noticeDate ? ' (공고일 ' + f.noticeDate + ')' : '') + '입니다.\n'
        + '[크게보기]를 누르면 요약 MD 원문을 보여드릴게요.';
    }
  }];

  var selected = APIS[0];

  var el = {
    open: document.getElementById('agentTestOpen'),
    close: document.getElementById('agentTestClose'),
    list: document.getElementById('agentApiList'),
    params: document.getElementById('agentParams'),
    url: document.getElementById('agentUrl'),
    send: document.getElementById('agentSend'),
    result: document.getElementById('agentResult'),
    overlay: document.getElementById('agentOverlay'),
    modal: document.getElementById('agentModal'),
    modalTitle: document.getElementById('agentModalTitle'),
    modalMeta: document.getElementById('agentModalMeta'),
    tabs: document.getElementById('agentModalTabs'),
    modalBody: document.getElementById('agentModalBody')
  };

  // ── 패널 열기/닫기 ────────────────────────────────────────────────
  if (el.open) el.open.addEventListener('click', function () { panel.classList.add('open'); });
  el.close.addEventListener('click', function () { panel.classList.remove('open'); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (el.modal.classList.contains('open')) closeModal();
    else panel.classList.remove('open');
  });

  // ── API 목록 ─────────────────────────────────────────────────────
  APIS.forEach(function (api) {
    var item = document.createElement('div');
    item.className = 'agent-api-item' + (api === selected ? ' selected' : '');
    item.innerHTML = '<div class="name"></div><div class="path"></div>';
    item.querySelector('.name').textContent = api.name;
    item.querySelector('.path').textContent = api.method + ' ' + base + api.path;
    item.addEventListener('click', function () {
      selected = api;
      Array.prototype.forEach.call(el.list.children, function (c) { c.classList.remove('selected'); });
      item.classList.add('selected');
      renderParams();
    });
    el.list.appendChild(item);
  });

  function renderParams() {
    el.params.innerHTML = '';
    selected.params.forEach(function (p) {
      var wrap = document.createElement('div');
      wrap.className = 'agent-field';
      var label = document.createElement('label');
      label.textContent = p.label;
      var input;
      if (p.type === 'select') {
        input = document.createElement('select');
        p.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o === '' ? '(전체)' : o;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = p.placeholder || '';
      }
      input.className = 'form-control form-control-sm';
      input.dataset.param = p.name;
      input.addEventListener('input', updateUrl);
      input.addEventListener('change', updateUrl);
      wrap.appendChild(label);
      wrap.appendChild(input);
      el.params.appendChild(wrap);
    });
    updateUrl();
  }

  function currentUrl() {
    var query = [];
    Array.prototype.forEach.call(el.params.querySelectorAll('[data-param]'), function (input) {
      var v = input.value.trim();
      if (v) query.push(encodeURIComponent(input.dataset.param) + '=' + encodeURIComponent(v));
    });
    return base + selected.path + (query.length ? '?' + query.join('&') : '');
  }

  function updateUrl() {
    el.url.textContent = selected.method + ' ' + currentUrl();
  }

  // ── 요청 ─────────────────────────────────────────────────────────
  // 입력한 조건을 말풍선으로 "타이핑"해 보여주고, 잠깐 버퍼링한 뒤 응답을 붙인다.
  // 네트워크 요청 자체는 타이핑과 **동시에** 시작하므로 느려지지 않는다.
  var busy = false;

  el.send.addEventListener('click', function () {
    if (busy) return;
    busy = true;
    el.send.disabled = true;

    var url = currentUrl();
    var params = collectParams();
    var started = Date.now();

    el.result.innerHTML = '';
    var chat = document.createElement('div');
    chat.className = 'agent-chat';
    el.result.appendChild(chat);
    var results = document.createElement('div');
    el.result.appendChild(results);

    // 화면에 보여줄 소요시간은 **네트워크 시간만** 이다. 타이핑 연출 시간이 섞이면 숫자가 거짓말이 된다.
    var networkMs = 0;
    var request = fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (res) {
        return res.text().then(function (text) {
          networkMs = Date.now() - started;
          return { status: res.status, ok: res.ok, text: text };
        });
      });

    var said = selected.sentence ? selected.sentence(params) : selected.name + ' 요청할게.';
    var me = addBubble(chat, 'me');

    typeInto(me, said)
      .then(function () { return wait(260); })           // 살짝 뜸 들이기
      .then(function () {
        var dots = addBubble(chat, 'bot');
        dots.innerHTML = '<span class="agent-dots"><i></i><i></i><i></i></span>';
        return request.then(function (res) {
          return wait(Math.max(0, 420 - (Date.now() - started))).then(function () {
            dots.innerHTML = '';
            return { bubble: dots, res: res };
          });
        }, function (err) {
          dots.innerHTML = '';
          return { bubble: dots, error: err };
        });
      })
      .then(function (r) {
        var ms = networkMs || (Date.now() - started);
        if (r.error) {
          return typeInto(r.bubble, '요청이 실패했습니다: ' + r.error).then(function () {
            results.appendChild(statusBar({ status: 0, ok: false }, ms));
          });
        }
        var data = null;
        try { data = JSON.parse(r.res.text); } catch (e) { /* JSON이 아닐 수 있음 */ }
        var answer;
        if (!r.res.ok) {
          answer = '요청이 실패했습니다 (HTTP ' + r.res.status + ')'
            + (data && data.error ? ': ' + data.error : '.');
        } else if (data && selected.reply) {
          answer = selected.reply(data);
        } else {
          answer = '응답을 받았습니다 (HTTP ' + r.res.status + ').';
        }
        return typeInto(r.bubble, answer).then(function () {
          showResult(r.res, ms, data, results);
        });
      })
      .then(release, release);

    function release() {
      busy = false;
      el.send.disabled = false;
    }
  });

  function collectParams() {
    var params = {};
    Array.prototype.forEach.call(el.params.querySelectorAll('[data-param]'), function (input) {
      var v = input.value.trim();
      if (v) params[input.dataset.param] = v;
    });
    return params;
  }

  function addBubble(chat, kind) {
    var b = document.createElement('div');
    b.className = 'agent-bubble ' + kind;
    chat.appendChild(b);
    return b;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * 한 글자씩 찍되 **경과 시간 기준**으로 진행한다. 글자마다 setTimeout 을 걸면
   * 타이머가 밀리는 환경(백그라운드 탭·느린 PC)에서 한 문장에 수십 초가 걸린다.
   * 길이와 무관하게 전체 연출은 TYPE_MS 안에 끝난다.
   */
  var TYPE_MS = 700;

  function typeInto(bubble, text) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      bubble.textContent = text;
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var body = document.createTextNode('');
      var caret = document.createElement('span');
      caret.className = 'agent-caret';
      caret.textContent = '▌';
      bubble.textContent = '';
      bubble.appendChild(body);
      bubble.appendChild(caret);

      var begin = Date.now();
      var shown = 0;
      var tick = window.requestAnimationFrame
        ? function (fn) { window.requestAnimationFrame(fn); }
        : function (fn) { setTimeout(fn, 16); };

      (function step() {
        var ratio = Math.min(1, (Date.now() - begin) / TYPE_MS);
        var want = Math.ceil(text.length * ratio);
        if (want > shown) {
          body.nodeValue = text.slice(0, want);
          shown = want;
        }
        if (ratio >= 1) {
          body.nodeValue = text;
          bubble.removeChild(caret);
          resolve();
          return;
        }
        tick(step);
      })();
    });
  }

  function statusBar(res, ms) {
    var bar = document.createElement('div');
    bar.className = 'agent-status';
    var pill = document.createElement('span');
    pill.className = 'agent-pill ' + (res.ok ? 'ok' : 'err');
    pill.textContent = 'HTTP ' + (res.status || 'ERR');
    var time = document.createElement('span');
    time.textContent = ms + ' ms';
    bar.appendChild(pill);
    bar.appendChild(time);
    return bar;
  }

  function showResult(res, ms, data, container) {
    container.innerHTML = '';
    container.appendChild(statusBar(res, ms));
    if (res.ok && data && selected.render) {
      selected.render(data, container);
    }
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    summary.textContent = '원문 JSON';
    summary.style.cursor = 'pointer';
    summary.style.fontSize = '12.5px';
    summary.style.margin = '6px 0';
    var pre = document.createElement('pre');
    pre.className = 'agent-json';
    pre.textContent = data ? JSON.stringify(data, null, 2) : res.text;
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-outline btn-sm';
    copy.textContent = '복사';
    copy.style.marginTop = '6px';
    copy.addEventListener('click', function () {
      var ta = document.createElement('textarea');
      ta.value = pre.textContent;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); copy.textContent = '복사됨'; } catch (e) { copy.textContent = '복사 실패'; }
      document.body.removeChild(ta);
      setTimeout(function () { copy.textContent = '복사'; }, 1500);
    });
    details.appendChild(summary);
    details.appendChild(pre);
    details.appendChild(copy);
    container.appendChild(details);
  }

  // ── 입찰제안서 목록 렌더링 ────────────────────────────────────────
  function renderProposalList(data, container) {
    var info = document.createElement('div');
    info.style.fontSize = '12.5px';
    info.style.marginBottom = '8px';
    info.textContent = '총 ' + (data.total != null ? data.total : 0) + '건'
      + (data.totalPages ? ' (page ' + data.page + '/' + data.totalPages + ')' : '');
    container.appendChild(info);

    var items = data.items || [];
    if (!items.length) {
      var none = document.createElement('div');
      none.style.fontSize = '12.5px';
      none.textContent = '결과가 없습니다.';
      container.appendChild(none);
      return;
    }
    var table = document.createElement('table');
    table.className = 'agent-result-table';
    table.innerHTML = '<thead><tr><th>파일명</th><th>기관</th><th>연도</th><th>장수</th><th></th></tr></thead>';
    var tbody = document.createElement('tbody');
    items.forEach(function (it) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(it.fileName));
      tr.appendChild(cell((it.institutionName || '-') + ' / ' + (it.institutionCategory || '-')));
      tr.appendChild(cell(it.year || '-'));
      tr.appendChild(cell(it.totalSlides != null ? it.totalSlides : '-'));
      var td = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-sm';
      btn.textContent = '크게보기';
      btn.addEventListener('click', function () { openDetail(it.id); });
      td.appendChild(btn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // ── 입찰공고문(RFP) 목록 렌더링 ──────────────────────────────────
  function renderRfpList(data, container) {
    var info = document.createElement('div');
    info.style.fontSize = '12.5px';
    info.style.marginBottom = '8px';
    info.textContent = '총 ' + (data.total != null ? data.total : 0) + '건'
      + (data.totalPages ? ' (page ' + data.page + '/' + data.totalPages + ')' : '');
    container.appendChild(info);

    var items = data.items || [];
    if (!items.length) {
      var none = document.createElement('div');
      none.style.fontSize = '12.5px';
      none.textContent = '결과가 없습니다.';
      container.appendChild(none);
      return;
    }
    var table = document.createElement('table');
    table.className = 'agent-result-table';
    table.innerHTML = '<thead><tr><th>파일명</th><th>기관</th><th>공고일</th><th></th></tr></thead>';
    var tbody = document.createElement('tbody');
    items.forEach(function (it) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(it.fileName));
      tr.appendChild(cell((it.institutionName || '-') + ' / ' + (it.institutionCategory || '-')));
      tr.appendChild(cell(it.noticeDate || '-'));
      var td = document.createElement('td');
      td.appendChild(detailButton('크게보기', function () { openRfpDetail(it.id); }));
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function detailButton(text, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline btn-sm';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  // ── 크게보기 ─────────────────────────────────────────────────────
  // 문서 종류마다 제목·메타·탭 구성이 달라 spec 으로 넘긴다.
  var PROPOSAL_VIEW = {
    title: function (doc) { return doc.file_name || '제안서'; },
    meta: function (doc) {
      return [['기관', (doc.institutionName || '-') + ' / ' + (doc.institutionCategory || '-')],
              ['연도', doc.year || '-'],
              ['총 슬라이드', doc.total_slides != null ? doc.total_slides : '-'],
              ['파싱 시각', doc.created_at || '-'],
              ['JSON', doc.jsonFileName || '-'],
              ['ppt_path', doc.ppt_path || '-']];
    },
    tabs: [{ key: 'slides', label: '슬라이드', render: renderSlides },
           { key: 'json', label: '원문 JSON', render: renderJson }]
  };

  var RFP_VIEW = {
    title: function (doc) { return doc.fileName || '입찰공고문'; },
    meta: function (doc) {
      return [['기관', (doc.institutionName || '-') + ' / ' + (doc.institutionCategory || '-')],
              ['공고일', doc.noticeDate || '-'],
              ['파싱 시각', doc.parsedAt || '-'],
              ['MD', doc.mdFileName || '-']];
    },
    tabs: [{ key: 'markdown', label: '요약 (MD)', render: renderMarkdown },
           { key: 'json', label: '원문 JSON', render: renderJson }]
  };

  function openDetail(id) {
    openDoc(base + 'api/proposals/' + id, PROPOSAL_VIEW);
  }

  function openRfpDetail(id) {
    openDoc(base + 'api/rfps/' + id, RFP_VIEW);
  }

  function openDoc(url, view) {
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        if (!r.ok) {
          alert('조회 실패: ' + (r.data && r.data.error ? r.data.error : '알 수 없는 오류'));
          return;
        }
        showDetail(r.data, view);
      })
      .catch(function (err) { alert('조회 실패: ' + err); });
  }

  function showDetail(doc, view) {
    el.modalTitle.textContent = view.title(doc);
    el.modalMeta.innerHTML = '';
    view.meta(doc).forEach(function (pair) {
      var span = document.createElement('span');
      span.innerHTML = '<b></b> ';
      span.querySelector('b').textContent = pair[0] + ':';
      span.appendChild(document.createTextNode(' ' + pair[1]));
      el.modalMeta.appendChild(span);
    });

    el.tabs.innerHTML = '';
    view.tabs.forEach(function (tab, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agent-tab' + (i === 0 ? ' active' : '');
      btn.dataset.tab = tab.key;
      btn.textContent = tab.label;
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(el.tabs.children, function (t) { t.classList.remove('active'); });
        btn.classList.add('active');
        el.modalBody.innerHTML = '';
        tab.render(doc);
      });
      el.tabs.appendChild(btn);
    });
    el.modalBody.innerHTML = '';
    view.tabs[0].render(doc);

    el.overlay.classList.add('open');
    el.modal.classList.add('open');
  }

  function renderJson(doc) {
    var pre = document.createElement('pre');
    pre.className = 'agent-json';
    pre.style.maxHeight = 'none';
    pre.textContent = JSON.stringify(doc, null, 2);
    el.modalBody.appendChild(pre);
  }

  /** md 원문을 그대로 보여준다(렌더링 라이브러리 없음). 줄바꿈·표 정렬이 살아 있어야 읽힌다. */
  function renderMarkdown(doc) {
    var pre = document.createElement('pre');
    pre.className = 'agent-json';
    pre.style.maxHeight = 'none';
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = doc.markdown || '(요약 내용이 없습니다)';
    el.modalBody.appendChild(pre);
  }

  function renderSlides(doc) {
    (doc.slides || []).forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'slide-card';
      var head = document.createElement('div');
      head.className = 'slide-card-head';
      var no = document.createElement('span');
      no.className = 'slide-no';
      no.textContent = '#' + s.index;
      var title = document.createElement('span');
      title.className = 'slide-title';
      title.textContent = s.title || '(제목 없음)';
      head.appendChild(no);
      head.appendChild(title);
      if (s.has_image) {
        var badge = document.createElement('span');
        badge.className = 'badge badge-done';
        badge.textContent = '이미지 포함';
        head.appendChild(badge);
      }
      var text = document.createElement('div');
      text.className = 'slide-text';
      text.textContent = s.text_full || '(텍스트 없음)';
      card.appendChild(head);
      card.appendChild(text);
      el.modalBody.appendChild(card);
    });
  }

  function closeModal() {
    el.overlay.classList.remove('open');
    el.modal.classList.remove('open');
  }

  el.overlay.addEventListener('click', closeModal);
  document.getElementById('agentModalClose').addEventListener('click', closeModal);

  renderParams();
})();
