(function (root) {
  'use strict';
  // 디자이너 전용 뷰 (계획 H, 스펙 §② 14). 7단계 이관 뒤 디자이너가 **무엇을 받았는지
  // 열어보고 작업물을 올리는** 화면이다. 그 전까지는 쪽지 통지만 있었다.
  //
  // 서버 모드 + 소속이 '디자이너'일 때만 뜬다(app.applyDesignerUI). 순수 로직과 DOM
  // 렌더를 나누고 순수부만 node --test로 고정한다.
  const designer = {};

  // export.js와 같은 방식으로 logic을 가져온다(브라우저는 전역, node는 require).
  const logic = (typeof require !== 'undefined') ? require('./logic.js') : root.logic;
  const roles = (typeof require !== 'undefined') ? require('./roles.js') : root.roles;
  const doccheck = (typeof require !== 'undefined') ? require('./doccheck.js') : root.doccheck;

  // ── 우선순위 (기능 ⑦) ────────────────────────────────────────────────
  // 새 컬럼을 두지 않고 **입찰일까지 남은 일수**로 매긴다(사용자 확정). 근거가 이미
  // 데이터에 있어 사람이 따로 관리하지 않아도 항상 맞다.
  //
  // 구간은 logic.computeUrgency(182/365/730일)를 쓰지 않는다 — 그건 *계약 만료*까지의
  // 척도라 작업 마감에는 터무니없이 길다. 지도의 임박도와 이 화면의 급함은 다른 것을
  // 재는 자라서, 같은 daysUntil을 쓰되 구간은 따로 둔다.
  designer.PRIORITY_LEVELS = ['urgent', 'soon', 'normal', 'later', 'unknown'];

  designer.priority = function (task, today) {
    const date = task && task.bid_date;
    if (!date) return { days: null, level: 'unknown', label: '미상', tentative: false };
    const days = logic.daysUntil(date, today || new Date());
    if (days === Infinity) return { days: null, level: 'unknown', label: '미상', tentative: false };

    let level = 'later';
    if (days <= 7) level = 'urgent';          // 지난 것(음수)도 여기 — 가장 급하다
    else if (days <= 30) level = 'soon';
    else if (days <= 90) level = 'normal';

    const label = days === 0 ? 'D-DAY' : (days > 0 ? 'D-' + days : 'D+' + (-days));
    return {
      days: days, level: level, label: label,
      // 예상일은 추측이다 — 확정일과 같은 무게로 보이면 안 된다(계획 D의 원칙).
      tentative: (task.schedule_confidence || '') !== '확정',
    };
  };

  designer.sortByPriority = function (tasks, today) {
    return (tasks || []).slice().sort(function (a, b) {
      const pa = designer.priority(a, today), pb = designer.priority(b, today);
      // 날짜 미상은 맨 뒤 — 모른다고 급한 것 앞에 세우면 순서가 거짓말이 된다.
      const da = pa.days === null ? Infinity : pa.days;
      const db = pb.days === null ? Infinity : pb.days;
      return da - db;
    });
  };

  // ── 목록 구분 (기능 ⑥·⑧) ───────────────────────────────────────────
  designer.buckets = function (tasks) {
    const out = { requested: [], working: [], done: [] };
    (tasks || []).forEach(function (t) {
      const s = t && t.status;
      if (s === '작성중') out.working.push(t);
      else if (s === '1차완료' || s === '2차완료') out.done.push(t);
      // 모르는 상태를 버리면 디자이너가 일감을 통째로 놓친다 — 요청받음으로 남긴다.
      else out.requested.push(t);
    });
    return out;
  };

  // ── 처리상태 태그 (기능 ⑨) ──────────────────────────────────────────
  const TAGS = {
    '대기': { cls: 'dg-tag wait', text: '요청받음' },
    '작성중': { cls: 'dg-tag work', text: '작업 중' },
    '1차완료': { cls: 'dg-tag sent', text: '제출됨' },
    '2차완료': { cls: 'dg-tag ok', text: '승인완료' },
  };

  designer.statusTag = function (status) {
    // 모르는 상태도 원문을 그대로 보여준다 — 빈칸으로 두면 무슨 상태인지 영영 모른다.
    return TAGS[status] || { cls: 'dg-tag', text: String(status == null ? '상태 미상' : status) };
  };

  // ── 이관 패키지 (기능 ①·②) ─────────────────────────────────────────
  designer.handoffRows = function (payload) {
    return (((payload || {}).teams) || []).map(function (t) {
      const content = t.draft_content || '';
      return {
        team: t.team,
        taskId: t.task_id || null,
        // 디자이너는 팀이 올린 파일을 **받아서** 작업한다 — 텍스트 작성물만 보여주면
        // 정작 받아야 할 실물이 화면에 없다(사용자 지적).
        files: designer.fileRows(t.files),
        working: !!t.working,
        tag: designer.statusTag(t.status),
        // ready는 '결재까지 끝난 것'이다. 화면이 강조를 다르게 주되 **감추지는 않는다** —
        // 감추면 디자이너가 다 받은 줄 안다(서버도 같은 이유로 거르지 않는다).
        ready: t.status === '2차완료',
        author: t.assignee || null,
        approver: t.approver || null,
        contact: t.contact || t.team,       // 문의 수신자는 서버가 골라 준다
        hasContent: content.length > 0,
        content: content,
      };
    });
  };

  designer.packageReady = function (payload) {
    const rows = designer.handoffRows(payload);
    if (!rows.length) return false;         // 팀이 없는 것은 '준비 완료'가 아니다
    return rows.every(function (r) { return r.ready; });
  };

  // ── 작업물 파일 ──────────────────────────────────────────────────────
  designer.sizeText = function (bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  };

  designer.fileRows = function (files) {
    return (files || []).map(function (f) {
      return { name: f.name, size: f.size, sizeText: designer.sizeText(f.size),
        uploadedAt: (f.uploaded_at || '').slice(0, 19).replace('T', ' ') };
    });
  };

  // 아직 자기 일을 끝내지 않은 팀. 서버가 계산해 준 waiting_on이 정본이고
  // (server/routers/tasks.py의 같은 규칙), 없으면 팀별 working 플래그로 만든다.
  // 규칙 자체를 화면에서 다시 정의하지는 않는다.
  designer.waitingOn = function (payload) {
    const p = payload || {};
    if (Array.isArray(p.waiting_on)) return p.waiting_on;
    return (p.teams || []).filter(function (t) { return t.working; })
      .map(function (t) { return t.team; });
  };

  designer.canSubmit = function (task, files, handoff) {
    if (!task) return false;
    if (task.status === '1차완료' || task.status === '2차완료') return false;
    if ((files || []).length === 0) return false;   // 빈손으로 내면 결재자가 볼 것이 없다
    // 팀이 아직 쓰고 있는데 그 위에서 만든 결과를 결재에 올리면 앞뒤가 안 맞는다
    // (사용자 지적). handoff를 모르면 이 조건은 건너뛴다 — 서버 가드가 최종 방어다.
    if (handoff && designer.waitingOn(handoff).length) return false;
    return true;
  };

  // 버튼을 왜 못 누르는지 한 문장으로. 비활성 버튼만 두면 이유를 영영 모른다.
  designer.submitBlockReason = function (task, files, handoff) {
    if (!task) return '';
    if (task.status === '1차완료' || task.status === '2차완료') {
      return '이미 제출했습니다.';
    }
    if ((files || []).length === 0) return '작업물을 하나 이상 올린 뒤 제출할 수 있습니다.';
    const waiting = handoff ? designer.waitingOn(handoff) : [];
    if (waiting.length) {
      return waiting.join('·') + '팀이 아직 작업 중입니다 — 끝난 뒤에 제출할 수 있습니다.';
    }
    return '';
  };

  // ── 렌더 ────────────────────────────────────────────────────────────
  // knowledge.js·chat.js와 같은 이유 — 폴백이 원문을 그대로 내보내면 XSS가 된다.
  function esc(s) {
    if (root.logic && root.logic.esc) return root.logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function el(id) { return document.getElementById(id); }

  const BUCKET_TITLES = [
    ['requested', '요청받은 작업'], ['working', '작업 중'], ['done', '제출됨'],
  ];

  designer.renderList = function (container, tasks, today, selectedId) {
    const b = designer.buckets(tasks);
    container.innerHTML = BUCKET_TITLES.map(function (pair) {
      const rows = designer.sortByPriority(b[pair[0]], today);
      const body = rows.length ? rows.map(function (t) {
        const p = designer.priority(t, today);
        const tag = designer.statusTag(t.status);
        return '<div class="dg-item' + (t.task_id === selectedId ? ' on' : '') +
          '" data-id="' + esc(t.task_id) + '">' +
          '<div class="dg-item-head"><b>' + esc(t.institution_name) + '</b>' +
          '<span class="dg-day ' + p.level + '"' +
          (p.tentative ? ' title="입찰일이 예상값입니다(확정 아님)"' : '') + '>' +
          esc(p.label) + (p.tentative ? '?' : '') + '</span></div>' +
          '<div class="dg-item-sub"><span class="' + tag.cls + '">' + esc(tag.text) + '</span>' +
          '<span class="dg-files">📎 ' + (t.file_count || 0) + '</span></div></div>';
      }).join('') : '<p class="wf-empty">없습니다.</p>';
      return '<div class="dg-bucket"><h4>' + pair[1] + ' <span>' + b[pair[0]].length +
        '</span></h4>' + body + '</div>';
    }).join('');
  };

  designer.renderHandoff = function (container, payload) {
    const rows = designer.handoffRows(payload);
    if (!rows.length) {
      container.innerHTML = '<p class="wf-empty">아직 받은 산출물이 없습니다.</p>';
      return;
    }
    const ready = designer.packageReady(payload);
    container.innerHTML =
      '<div class="dg-pkg-head">' + (ready
        ? '<span class="dg-tag ok">전 팀 승인완료</span>'
        : '<span class="dg-tag work">일부 팀이 아직 승인 전입니다</span>') +
      (payload.pptx_path
        ? ' <span class="dg-pptx">📦 ' + esc(payload.pptx_path) + '</span>' : '') +
      '</div>' +
      rows.map(function (r, i) {
        // 팀이 올린 파일 = 디자이너가 **받아서 작업할 실물**. 이게 안 보이면 화면의
        // 목적 자체가 반쪽이다(사용자 지적).
        const files = r.files.length
          ? '<div class="dg-team-files">' + r.files.map(function (f) {
              return '<a href="#" class="dg-team-dl" data-task="' + esc(r.taskId) +
                '" data-name="' + esc(f.name) + '">⬇ ' + esc(f.name) + '</a>' +
                '<span class="dg-size">' + esc(f.sizeText) + '</span>';
            }).join('') + '</div>'
          : '<div class="dg-team-files none">받은 파일 없음</div>';
        return '<div class="dg-card' + (r.ready ? ' ready' : '') + '">' +
          '<div class="dg-card-head"><b>' + esc(r.team) + '</b>' +
          '<span class="' + r.tag.cls + '">' + esc(r.tag.text) + '</span>' +
          (r.author ? '<span class="dg-who">' + esc(r.author) + '</span>' : '') +
          '<button class="dg-ask" data-to="' + esc(r.contact) + '">문의</button></div>' +
          files +
          (r.hasContent
            ? '<pre class="dg-body" data-index="' + i + '">' + esc(r.content) + '</pre>'
            : '<p class="wf-empty">아직 작성물이 없습니다.</p>') +
          '</div>';
      }).join('');
  };

  // 카드 본문(.dg-body)의 접기/펴기. **작업함과 결재함이 같은 함수를 쓴다** — 전에는
  // 작업함에만 배선이 있어서 결재함 카드는 잘린 채 펴지지도 않았다(2026-08-20 발견).
  designer.wireBodyToggles = function (container) {
    if (!container || !container.querySelectorAll) return;
    container.querySelectorAll('.dg-body').forEach(function (pre) {
      // 실제로 넘칠 때만 접힌 상태다. 다 보이는 글에 '더 보기'를 띄우면 그 자체가
      // 거짓말이라 클릭도 막는다.
      const clamped = pre.scrollHeight > pre.clientHeight + 1;
      pre.classList.toggle('clamped', clamped);
      if (!clamped) { pre.classList.remove('open'); pre.onclick = null; return; }
      pre.onclick = function () { pre.classList.toggle('open'); };
    });
  };

  // ── 작업물 파일 + 제안서 점검(NEXT 106). 사용자 글(name·inst_name·contexts·acked_by_name)은 textContent로만 넣는다 ──
  const SVGNS = 'http://www.w3.org/2000/svg';
  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function glyph(kind) {   // aria-hidden SVG만(이모지 금지). 삼각형=확인 필요, 체크=확인함, 점선 원=일부·못 함
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 12 12'); s.setAttribute('aria-hidden', 'true');
    let p;
    if (kind === 'dashed') {
      p = document.createElementNS(SVGNS, 'circle');
      p.setAttribute('cx', '6'); p.setAttribute('cy', '6'); p.setAttribute('r', '4.5'); p.setAttribute('stroke-dasharray', '2 2');
    } else {
      p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', kind === 'open' ? 'M6 1.5 L11 10.5 H1 Z' : kind === 'acked' ? 'M2 6.5 L5 9 L10 3' : 'M2 4 L6 8 L10 4');
    }
    s.appendChild(p);
    return s;
  }
  function chipEl(b) {
    const c = mk('span', 'dc-chip' + (b.cls ? ' ' + b.cls : ''));
    const g = b.kind === 'open' ? 'open' : b.kind === 'acked' ? 'acked' : (b.kind === 'part' || b.kind === 'nc') ? 'dashed' : null;
    if (g) c.appendChild(glyph(g));
    c.appendChild(document.createTextNode(b.text));
    return c;
  }
  function fidBtn(text, name, what, cls) {
    const b = mk('button', cls || 'dc-tg', text);
    b.type = 'button'; b.dataset.fid = name + '\u0000' + what;
    return b;
  }

  function panelEl(i, name, sf, v) {
    const on = v.on || {}; const busyOf = v.busy || {};
    const d = (v.det || {})[name];
    const p = mk('div', 'dc-panel');
    p.id = 'dc-p-' + i; p.dataset.name = name;
    p.setAttribute('role', 'region'); p.setAttribute('aria-label', name + ' 점검 결과');
    const head = mk('div', 'dc-head');
    head.appendChild(mk('span', 'dc-at', sf.checked_at ? '점검 ' + doccheck.timeText(sf.checked_at) : ''));
    const ctxLoaded = !!(v.ctx || {})[name];
    if (d && d.hits && d.hits.length && !ctxLoaded && (d.state === 'DONE' || d.state === 'PARTIAL')) {
      const cb = fidBtn(busyOf[name] === 'ctx' ? doccheck.COPY.ctxLoading : '문맥 보기', name, 'ctx');
      cb.disabled = !!busyOf[name];
      cb.onclick = function () { on.context(name); };
      head.appendChild(cb);
    }
    if (doccheck.canRecheck(d)) {   // 다시 해도 소용없는 사유(retry:false)면 숨김(P3-2)
      const rb = fidBtn(busyOf[name] === 'recheck' ? doccheck.COPY.checking : '다시 점검', name, 'precheck');
      rb.disabled = !!busyOf[name];
      rb.onclick = function () { on.recheck(name, 'precheck'); };
      head.appendChild(rb);
    }
    p.appendChild(head);
    const notes = [];
    if (v.locked) notes.push(doccheck.COPY.lockedLine);
    doccheck.notes(d).forEach(function (t) { notes.push(t); });
    // 찾은 이름이 없으면 빈칸 대신 한 줄(P3-1) — 사유의 정본 자리. PARTIAL 사유는 notes에 이미 있으면 겹치지 않게 뺀다.
    if (d && !(d.hits || []).length) {
      const el1 = doccheck.emptyLine(d);
      if (el1 && notes.indexOf(el1) < 0) notes.push(el1);
    }
    if ((v.ctxMsg || {})[name]) notes.push(v.ctxMsg[name]);
    if (notes.length) {
      const ul = mk('ul', 'dc-notes');
      notes.forEach(function (t) { ul.appendChild(mk('li', null, t)); });
      p.appendChild(ul);
    }
    const errText = (v.err || {})[name] || '';
    const er = mk('p', 'dc-err', errText);
    // 다시 그릴 때마다 같은 문구가 또 읽히지 않게 — 문구가 새로 바뀐 때만 role=alert(P3-4)
    if (doccheck.errAnnounce((v.seen || {})[name], errText)) er.setAttribute('role', 'alert');
    if (v.seen) { if (errText) v.seen[name] = errText; else delete v.seen[name]; }
    p.appendChild(er);
    if (!d) {
      if (!(v.err || {})[name]) p.appendChild(mk('p', 'dc-why', doccheck.COPY.detailLoading));
      return p;
    }
    const hits = d.hits || [];
    if (!hits.length) return p;
    const can = !v.locked && doccheck.canAck(d);
    const cap = (v.more || {})[name] ? hits.length : 100;
    const tbl = mk('table', 'dc-hits');
    tbl.appendChild(mk('caption', 'sr-only', name + '에서 찾은 다른 기관 이름'));
    const trh = mk('tr');
    [['c-ack', '의도한 언급'], ['c-name', '기관 이름'], ['c-loc', '위치'], ['c-cnt', '횟수'], ['c-by', '표시']].forEach(function (c) {
      const th = mk('th', c[0], c[1]); th.setAttribute('scope', 'col'); trh.appendChild(th);
    });
    const thead = mk('thead'); thead.appendChild(trh); tbl.appendChild(thead);
    const tb = mk('tbody');
    const ctxMap = (v.ctx || {})[name] || {};
    hits.slice(0, cap).forEach(function (h) {
      const key = doccheck.hitKey(h);
      const shown = doccheck.shownAcked(h, (v.pend || {})[name]);   // 요청 중에는 요청한 상태로(P2-2)
      const tr = mk('tr', shown ? 'acked' : 'open');
      const td1 = mk('td', 'c-ack');
      const lab = mk('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = shown; cb.disabled = !can;
      cb.dataset.fid = name + '\u0000k:' + key;
      cb.setAttribute('aria-label', doccheck.ackLabel(h));
      if (busyOf[name] === 'ack') cb.setAttribute('aria-disabled', 'true');
      cb.onchange = function () {
        if (busyOf[name]) { cb.checked = shown; return; }
        on.ack(name, h, cb.checked);
      };
      lab.appendChild(cb); td1.appendChild(lab); tr.appendChild(td1);
      tr.appendChild(mk('td', 'c-name', doccheck.instText(h.inst_name)));
      const tdl = mk('td', 'c-loc');
      const lp = doccheck.locParts(h.loc_kind, h.loc_no);
      tdl.appendChild(document.createTextNode(lp[0]));
      if (lp[1] != null) tdl.appendChild(mk('span', 'n', String(lp[1])));
      if (lp[2]) tdl.appendChild(document.createTextNode(lp[2]));
      tr.appendChild(tdl);
      tr.appendChild(mk('td', 'c-cnt', String(h.count)));
      const tdb = mk('td', 'c-by');
      if (h.acked) {
        if (h.acked_by_name) tdb.appendChild(document.createTextNode(h.acked_by_name + ' '));
        tdb.appendChild(mk('span', 't', doccheck.ackedAtText(h.acked_at)));
      }
      tr.appendChild(tdb);
      tb.appendChild(tr);
      const cl = ctxMap[key];
      if (cl && cl.length) {
        const ctr = mk('tr', 'dc-ctx'); const td = mk('td'); td.colSpan = 5;
        const ul = mk('ul');
        // 서버 InstNameMatcher.context가 앞뒤 말줄임(…)만 넣고 따옴표는 안 넣는다(확인 11-23) — 따옴표는 화면에서 씌운다.
        cl.forEach(function (c) { ul.appendChild(mk('li', null, '“' + c + '”')); });
        td.appendChild(ul); ctr.appendChild(td); tb.appendChild(ctr);
      }
    });
    tbl.appendChild(tb);
    p.appendChild(tbl);
    if (hits.length > cap) {
      const mb = fidBtn('나머지 ' + (hits.length - cap) + '줄 더 보기', name, 'more');
      mb.onclick = function () { on.more(name); };
      p.appendChild(mb);
    }
    return p;
  }

  // view 없이 부르면 점검 표시 없이 줄만 그린다. view: {sum, det, open, busy, err, ctx, ctxMsg, more, locked, on:{toggle,recheck,context,ack,more}}
  designer.renderFiles = function (container, files, view) {
    const rows = designer.fileRows(files);
    const v = view || {};
    const byName = {};
    if (v.sum && v.sum !== 'fail') (v.sum.files || []).forEach(function (x) { byName[x.name] = x; });
    const busyOf = v.busy || {}; const on = v.on || {};
    container.textContent = '';
    if (!rows.length) { container.appendChild(mk('p', 'wf-empty', '올린 작업물이 없습니다.')); return; }
    rows.forEach(function (f, i) {
      const sf = byName[f.name] || null;
      const row = mk('div', 'dg-file');
      const a = mk('a', 'dg-dl', f.name);
      a.href = '#'; a.dataset.name = f.name; a.title = f.name;
      row.appendChild(a);
      row.appendChild(mk('span', 'dg-size', f.sizeText));
      row.appendChild(mk('span', 'dg-at', f.uploadedAt));
      if (view && (v.sum === null || v.sum === undefined)) {
        row.appendChild(mk('span', 'dc-why', doccheck.COPY.loading));
      } else if (view && v.sum !== 'fail') {
        const b = doccheck.badgeFor(sf, { checking: busyOf[f.name] === 'recheck' });
        if (b) {
          row.appendChild(chipEl(b));
          if (b.extra) row.appendChild(chipEl(b.extra));
          // 사유(b.why)는 줄에 싣지 않는다 — 펼침 칸 안내 줄이 정본(P2-1, 1280px 한 줄 유지)
          if (b.retry) {
            const rb = fidBtn('다시 점검', f.name, 'recheck');
            rb.onclick = function () { on.recheck(f.name, 'recheck'); };
            row.appendChild(rb);
          }
        }
        if (sf) {
          const open = !!(v.open || {})[f.name];
          const tg = fidBtn('점검 결과', f.name, 'toggle');
          tg.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (open) tg.setAttribute('aria-controls', 'dc-p-' + i);   // 닫힌 칸은 가리킬 대상이 없다(P3-7)
          tg.appendChild(glyph('chev'));
          tg.onclick = function () { on.toggle(f.name); };
          row.appendChild(tg);
        }
      }
      const rm = mk('button', 'dg-rm', '삭제'); rm.dataset.name = f.name;
      row.appendChild(rm);
      container.appendChild(row);
      if (view && sf && (v.open || {})[f.name]) container.appendChild(panelEl(i, f.name, sf, v));
    });
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  let tasks = [];
  let selectedId = null;
  let handoff = null;
  let files = [];
  let busy = false;
  // 제안서 점검 상태(NEXT 106). 작업을 바꾸면 dcResetAll()로 비운다.
  let dcSum = null;          // null=불러오는 중 | 'fail' | 요약 응답
  let dcDet = {};            // 파일 이름 → 상세 응답
  let dcOpenNames = {};      // 펼친 파일
  let dcBusy = {};           // 파일 이름 → 'ack' | 'recheck' | 'ctx' | 'load'
  let dcErr = {};            // 파일 이름 → 오류 문구(.dc-err)
  let dcCtx = {};            // 파일 이름 → {hitKey: [문맥]}
  let dcCtxMsg = {};
  let dcMore = {};           // 100줄 넘게 펼친 파일
  let dcPend = {};           // 파일 이름 → 표시 요청 중인 {key, want}(체크칸을 요청한 상태로 그린다)
  let dcSeen = {};           // 파일 이름 → 이미 화면에 그린 오류 문구(같은 문구를 다시 읽히지 않게)
  let smSubmitting = false;  // 제출 요청 중(Esc·바깥 클릭·중복 제출 막기)
  let dcFocus = null;        // 다시 그린 뒤 돌려줄 포커스 {name, what} | {name, first:true}
  let uploading = false;
  let smState = null;        // 제출 확인창이 열려 있는 동안 {model, approver}

  function profile() { return root.store.loadProfile(); }

  // 소속(역할) → tasks.team. 규칙 본체는 roles.js 한 곳에 있다 — 접미사를 떼는
  // 순서를 여기 복제해 두면 `부장`이 생겼을 때처럼 한쪽만 고쳐져 조용히 갈라진다.
  designer.teamOf = function (role) { return roles.teamOf(role); };

  function myTeam() { return designer.teamOf(profile().team); }

  // 작업함은 더 이상 디자이너 전용이 아니다(계획 I) — 화면 문구도 소속을 따라간다.
  // 예전에는 '디자이너 작업함'으로 굳어 있어 영업팀 담당자가 들어와도 그렇게 보였다.
  designer.headline = function (prof) {
    const team = ((prof || {}).team || '').trim();
    return team ? team + ' 작업함' : '작업함';
  };

  // 제출하면 누구에게 가는지 — server/teams.py의 lead_of와 같은 규칙이다.
  // **디자이너 작업물도 영업팀장에게** 간다(디자이너는 영업팀 소속). 영업부장은
  // 그 뒤 최종본만 본다. 모르는 소속에 결재자를 지어내지 않는다.
  designer.approverLabel = function (role) {
    return roles.approverOf(role) || '결재자';
  };

  // 한글 이름은 헤더에 못 실으므로 by로 보낸다(X-User-Id는 ASCII만 — A1 F10).
  function actorBody(extra) {
    return Object.assign({ by: profile().name || null }, extra || {});
  }

  // 오류는 alert() 대신 줄에 한 줄(11-23). 기본은 목록 위 #dg-msg, 파일 줄·저장 줄은 sink로 받는다.
  function dgMsg(text, isErr) { root.dlg.line(el('dg-msg'), text, isErr); }
  function savedMsg(text, bad) {
    const sv = el('dg-saved'); if (!sv) return;
    sv.textContent = text || ''; sv.className = bad ? 'dg-hint st-bad' : 'dg-hint';
    if (bad) sv.setAttribute('role', 'alert'); else sv.removeAttribute('role');
  }
  function fail(msg, sink) { return function () { (sink || dgMsg)(msg, true); }; }

  function loadTasks() {
    return fetch('/tasks?team=' + encodeURIComponent(myTeam())).then(function (r) {
      if (!r.ok) throw new Error('tasks ' + r.status);
      return r.json();
    }).then(function (body) {
      tasks = body;
      if (selectedId && !tasks.filter(function (t) { return t.task_id === selectedId; }).length) {
        selectedId = null;
      }
      paint();
    }).catch(fail('작업 목록을 불러오지 못했습니다. 서버에 연결되지 않았습니다. 잠시 뒤 작업함을 다시 열어 보세요.'));
  }

  function loadDetail() {
    if (!selectedId) { handoff = null; files = []; paint(); return Promise.resolve(); }
    const id = selectedId;
    return Promise.all([
      fetch('/tasks/' + encodeURIComponent(id) + '/handoff').then(function (r) {
        return r.ok ? r.json() : null;
      }),
      fetch('/tasks/' + encodeURIComponent(id) + '/files').then(function (r) {
        return r.ok ? r.json() : [];
      }),
      fetch('/tasks/' + encodeURIComponent(id)).then(function (r) {
        return r.ok ? r.json() : null;
      }),
      loadSummary(),
    ]).then(function (res) {
      if (selectedId !== id) return;        // 그 사이 다른 것을 골랐으면 버린다
      handoff = res[0]; files = res[1];
      const detail = res[2];
      if (detail) el('dg-memo').value = detail.draft_content || '';
      paint();
    }).catch(fail('작업 상세를 불러오지 못했습니다. 서버에 연결되지 않았습니다. 목록에서 작업을 다시 고르세요.'));
  }

  function selected() {
    return tasks.filter(function (t) { return t.task_id === selectedId; })[0] || null;
  }

  function paint() {
    const today = new Date();
    designer.renderList(el('dg-list'), tasks, today, selectedId);
    el('dg-list').querySelectorAll('.dg-item').forEach(function (node) {
      node.onclick = function () { selectedId = node.dataset.id; dgMsg('', false); dcResetAll(); loadDetail(); };
    });

    const task = selected();
    el('dg-detail').style.display = task ? '' : 'none';
    el('dg-empty').style.display = task ? 'none' : '';
    if (!task) return;

    el('dg-title').textContent = task.institution_name + ' — 이관 패키지';
    designer.renderHandoff(el('dg-pkg'), handoff);
    designer.renderFiles(el('dg-files'), files, dcView(task));
    paintDcSummary();
    wireDetail();

    const submit = el('dg-submit');
    const ok = designer.canSubmit(task, files, handoff);
    const why = designer.submitBlockReason(task, files, handoff);
    submit.disabled = busy || !ok;
    submit.title = why;
    // 비활성 버튼만 두면 왜 못 누르는지 영영 모른다 — 사유를 옆에 쓴다.
    el('dg-why').textContent = ok ? '' : why;
    el('dg-save').disabled = busy;
    el('dg-upload').disabled = busy;
    el('dg-upload').textContent = uploading ? '올리는 중…' : '올리기';
    el('dc-up').hidden = !uploading;
    restoreFocus();
  }

  function wireDetail() {
    el('dg-pkg').querySelectorAll('.dg-ask').forEach(function (btn) {
      btn.onclick = function () {
        const task = selected();
        // 쪽지 발송 폼을 두 벌 만들지 않는다 — 쪽지함 것을 채워서 연다.
        if (root.notify && root.notify.openCompose) {
          root.notify.openCompose({
            recipient: btn.dataset.to,
            institutionId: task && task.institution_id,
            taskId: task && task.task_id,
          });
        }
      };
    });
    el('dg-pkg').querySelectorAll('.dg-team-dl').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        window.open('/tasks/' + encodeURIComponent(a.dataset.task) + '/files/' +
          encodeURIComponent(a.dataset.name), '_blank');
      };
    });
    designer.wireBodyToggles(el('dg-pkg'));
    el('dg-files').querySelectorAll('.dg-dl').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        window.open('/tasks/' + encodeURIComponent(selectedId) + '/files/' +
          encodeURIComponent(a.dataset.name), '_blank');
      };
    });
    el('dg-files').querySelectorAll('.dg-rm').forEach(function (btn) {
      btn.onclick = function () {
        const name = btn.dataset.name;
        root.dlg.confirm({
          title: '첨부 삭제', text: '"' + name + '" 파일을 삭제할까요?', go: '삭제', cancel: '취소', danger: true,
        }).then(function (ok) {
          if (!ok) return;
          dcUpMsg('', false);
          return fetch('/tasks/' + encodeURIComponent(selectedId) + '/files/' +
            encodeURIComponent(name) + '?by=' + encodeURIComponent(profile().name || ''), {
            method: 'DELETE', headers: { 'X-User-Id': 'web-user' },
          }).then(function (r) {
            if (!r.ok && r.status !== 204) {
              return readErr(r).then(function (e) {
                const er = doccheck.errorFor(e.status, e.code, 'delete');
                // 404 문구는 '목록을 새로 불러왔습니다'라고 하므로 실제로 다시 부른 뒤 알린다(P3-3)
                if (er.reload) return loadDetail().then(loadTasks).then(function () { dcUpMsg(er.text, true); });
                dcUpMsg(er.text, true);
              });
            }
            delete dcOpenNames[name]; delete dcDet[name]; delete dcCtx[name];
            return loadDetail().then(loadTasks);
          }).catch(fail('첨부를 삭제하지 못했습니다. 서버에 연결되지 않았습니다. 잠시 뒤 다시 삭제하세요.', dcUpMsg));
        });
      };
    });
  }

  function dcUpMsg(text, isErr) {
    const m = el('dc-up-msg');
    m.textContent = text || '';
    m.className = isErr ? 'dc-err' : 'dg-hint';
    if (isErr) m.setAttribute('role', 'alert'); else m.removeAttribute('role');
  }

  function upload() {
    const input = el('dg-file-input');
    const file = input.files && input.files[0];
    if (!file) { dcUpMsg('올릴 파일을 먼저 고르세요.', true); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('by', profile().name || '');
    busy = true; uploading = true; dcUpMsg('', false); paint();
    fetch('/tasks/' + encodeURIComponent(selectedId) + '/files', {
      method: 'POST', body: fd, headers: { 'X-User-Id': 'web-user' },
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        if (!r.ok) {   // P1-1: detail이 객체여도 [object Object]가 되지 않게 code로 문구를 고른다
          const err = new Error('upload');
          err.status = r.status; err.code = doccheck.errorCode(body); err.detail = doccheck.errorDetailText(body);
          throw err;
        }
        return body || {};
      });
    }).then(function (body) {
      input.value = '';
      if (body.name) { delete dcDet[body.name]; delete dcCtx[body.name]; }   // 바꿔 올렸으면 이전 점검은 낡았다
      return loadDetail().then(loadTasks).then(function () { dcAfterUpload(body); });
    }).catch(function (e) {
      dcUpMsg(e && e.status ? doccheck.errorFor(e.status, e.code, 'upload', e.detail).text : doccheck.COPY.err.net, true);
    }).then(function () { busy = false; uploading = false; paint(); });
  }

  function dcAfterUpload(body) {
    const f = dcSum && dcSum !== 'fail' ? (dcSum.files || []).filter(function (x) { return x.name === body.name; })[0] : null;
    // 조사는 dlg.withObj(받침에 따라 을/를)로 맞춘다(팀 결정 11-23)
    const text = doccheck.uploadResultText(body.name, !!body.replaced, doccheck.badgeFor(f, {}), root.dlg && root.dlg.withObj);
    dcUpMsg(text, false); live(text);
    if (f && ((Number(f.unconfirmed_count) || 0) > 0 || dcOpenNames[f.name])) {   // 미확인이 있으면 자동 펼침(포커스는 옮기지 않음)
      dcOpenNames[f.name] = true; dcLoadDetail(f.name, false);
    }
  }

  // ── 제안서 점검 배선(NEXT 106, 규격 design-reviewer 2026-11-23 106) ─────────
  function dcResetAll() {
    dcSum = null; dcDet = {}; dcOpenNames = {}; dcBusy = {}; dcErr = {}; dcCtx = {}; dcCtxMsg = {}; dcMore = {}; dcFocus = null; dcPend = {}; dcSeen = {};
    const m = el('dc-up-msg'); if (m) { m.textContent = ''; m.className = 'dg-hint'; m.removeAttribute('role'); }
  }
  function dcUrl(name) { return '/tasks/' + encodeURIComponent(selectedId) + '/files/' + encodeURIComponent(name) + '/doc-check'; }
  function live(t) { const n = el('dc-live'); if (n) n.textContent = t; }
  function readErr(r) {
    return r.json().catch(function () { return null; }).then(function (b) {
      return { status: r.status, code: doccheck.errorCode(b), detail: doccheck.errorDetailText(b) };
    });
  }
  function dcDone() { paint(); dcFocus = null; }

  function dcView(task) {
    return { sum: dcSum, det: dcDet, open: dcOpenNames, busy: dcBusy, err: dcErr, ctx: dcCtx, ctxMsg: dcCtxMsg, more: dcMore, pend: dcPend, seen: dcSeen,
      locked: doccheck.isLocked(task),
      on: { toggle: dcToggle, recheck: dcRecheck, ack: dcAck,
        context: function (n) { dcLoadDetail(n, true); },
        more: function (n) {
          const hs = (dcDet[n] && dcDet[n].hits) || [];
          dcMore[n] = true;
          // [더 보기]는 사라지므로 새로 나온 첫 줄 체크칸으로(P3-2). 못 가면 [점검 결과] 토글로.
          dcFocus = { name: n, what: hs.length > 100 ? 'k:' + doccheck.hitKey(hs[100]) : 'more', alt: 'toggle' };
          dcDone();
        } } };
  }

  function paintDcSummary() {
    const box = el('dc-sum'); if (!box) return;
    box.textContent = '';
    if (dcSum === 'fail') { box.textContent = doccheck.COPY.summaryFail; return; }
    doccheck.summaryChips(dcSum).forEach(function (c, i) {
      if (i) box.appendChild(document.createTextNode(' · '));
      if (c.open) box.appendChild(mk('span', 'dc-chip open', c.text)); else box.appendChild(document.createTextNode(c.text));
    });
  }

  function restoreFocus() {
    if (!dcFocus) return;
    const box = el('dg-files');
    if (dcFocus.first) {   // 제출 확인창 [돌아가서 확인] → 첫 미확인 체크칸
      const panels = box.querySelectorAll('.dc-panel');
      for (let i = 0; i < panels.length; i++) {
        if (panels[i].dataset.name === dcFocus.name) {
          const t = panels[i].querySelector('tr.open input');
          if (t && !t.disabled) { t.focus(); return; }
        }
      }
      // 체크칸을 못 찾으면(이미 다 표시·점검 결과가 바뀜 등) 그 파일의 [점검 결과] 토글로(P3-4)
      const tgs = box.querySelectorAll('[data-fid]');
      for (let j = 0; j < tgs.length; j++) {
        if (tgs[j].dataset.fid === dcFocus.name + '\u0000toggle' && !tgs[j].disabled) { tgs[j].focus(); break; }
      }
      return;
    }
    const all = box.querySelectorAll('[data-fid]');
    const tryFid = function (what) {
      const want = dcFocus.name + '\u0000' + what;
      for (let i = 0; i < all.length; i++) {
        if (all[i].dataset.fid === want && !all[i].disabled) { all[i].focus(); return true; }
      }
      return false;
    };
    if (tryFid(dcFocus.what)) return;
    // 누르려던 단추가 사라졌으면(다시 점검 뒤 [다시 점검]이 없어짐 등) 그 파일의 [점검 결과] 토글로(P3-2)
    if (dcFocus.alt) tryFid(dcFocus.alt);
    else if (dcFocus.what === 'recheck') tryFid('toggle');
  }

  function loadSummary() {
    const id = selectedId;
    if (!id) return Promise.resolve();
    return fetch('/tasks/' + encodeURIComponent(id) + '/doc-check').then(function (r) {
      return r.ok ? r.json() : 'fail';
    }).catch(function () { return 'fail'; }).then(function (s) {
      if (selectedId !== id) return;
      dcSum = s; paint();
    });
  }

  // 파일이 목록에서 사라졌으면(404) 펼침 칸도 없으니 문구를 올리기 줄(#dc-up-msg)에 남긴다(P2-1)
  function dcGoneNotice(name, text) {
    if (doccheck.fileGone(files, name)) { dcUpMsg(text, true); dcErr[name] = ''; delete dcSeen[name]; }
  }

  // keepErr: 409로 다시 불러오는 길이면 앞서 세운 오류 문구를 지우지 않는다(P2-1)
  function dcLoadDetail(name, withCtx, keepErr) {
    const id = selectedId;
    dcBusy[name] = withCtx ? 'ctx' : 'load'; if (!keepErr) dcErr[name] = '';
    paint();
    return fetch(dcUrl(name) + (withCtx ? '?with_context=true' : '')).then(function (r) {
      if (r.ok) return r.json().then(function (b) { return { ok: true, body: b }; });
      return readErr(r).then(function (e) { return { ok: false, e: e }; });
    }).then(function (res) {
      if (selectedId !== id) return;
      if (res.ok) {
        dcDet[name] = res.body;
        if (withCtx) {
          const m = {};
          (res.body.hits || []).forEach(function (h) { if (h.contexts) m[doccheck.hitKey(h)] = h.contexts; });
          dcCtx[name] = m;
          dcCtxMsg[name] = res.body.context_state === 'UNAVAILABLE' ? doccheck.COPY.ctxUnavailable : '';
        } else { delete dcCtx[name]; dcCtxMsg[name] = ''; }
        return;
      }
      dcErr[name] = doccheck.errorFor(res.e.status, res.e.code, withCtx ? 'ctx' : 'load').text;
      if (res.e.status === 404) { const t = dcErr[name]; return loadDetail().then(function () { dcGoneNotice(name, t); }); }
    }).catch(function () { dcErr[name] = doccheck.COPY.err.net; })
      .then(function () { delete dcBusy[name]; dcDone(); });
  }

  function dcToggle(name) {
    dcFocus = { name: name, what: 'toggle' };
    if (dcOpenNames[name]) { delete dcOpenNames[name]; dcDone(); return; }
    dcOpenNames[name] = true;
    dcLoadDetail(name, false);   // 열 때마다 새로 부른다(문맥 없음)
  }

  function dcReload(name, mode) {
    if (mode === 'files') { const t = dcErr[name]; return loadDetail().then(function () { dcGoneNotice(name, t); }); }
    return loadSummary().then(function () { return dcLoadDetail(name, false, true); });
  }

  function dcRecheck(name, what) {
    const id = selectedId; const task = selected();
    dcBusy[name] = 'recheck'; dcErr[name] = ''; dcFocus = { name: name, what: what };
    paint();
    fetch(dcUrl(name), { method: 'POST', headers: Object.assign({ 'X-User-Id': 'web-user' }, doccheck.headers(task, 'doc_check_recheck')) })
      .then(function (r) {
        if (r.ok) return r.json().then(function (b) { return { ok: true, body: b }; });
        return readErr(r).then(function (e) { return { ok: false, e: e }; });
      }).then(function (res) {
        if (selectedId !== id) return;
        if (res.ok) { dcDet[name] = res.body; delete dcCtx[name]; dcCtxMsg[name] = ''; return loadSummary(); }
        const er = doccheck.errorFor(res.e.status, res.e.code, 'recheck');
        dcErr[name] = er.text;
        if (er.reload) return dcReload(name, er.reload);
      }).catch(function () { dcErr[name] = doccheck.COPY.err.net; })
      .then(function () {
        delete dcBusy[name];
        const f = dcSum && dcSum !== 'fail' ? (dcSum.files || []).filter(function (x) { return x.name === name; })[0] : null;
        const b = doccheck.badgeFor(f, {});
        if (b && !dcErr[name]) live(name + ' ' + b.text);
        dcDone();
      });
  }

  function dcAck(name, hit, want) {
    const id = selectedId; const task = selected(); const d = dcDet[name];
    if (!task || !d || !d.sha256) return;
    dcBusy[name] = 'ack'; dcErr[name] = ''; dcFocus = { name: name, what: 'k:' + doccheck.hitKey(hit) };
    dcPend[name] = { key: doccheck.hitKey(hit), want: want };   // 요청 중에는 요청한 상태로 그린다(P2-2)
    paint();
    fetch(dcUrl(name) + '/ack', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'X-User-Id': 'web-user' },
        doccheck.headers(task, want ? 'doc_check_ack' : 'doc_check_unack')),
      body: JSON.stringify({ acked: want, sha256: d.sha256, items: [doccheck.ackItem(hit)] }),
    }).then(function (r) {
      if (r.ok) return r.json().then(function (b) { return { ok: true, body: b }; });
      return readErr(r).then(function (e) { return { ok: false, e: e }; });
    }).then(function (res) {
      if (selectedId !== id) return;
      if (res.ok) { dcDet[name] = res.body; live(doccheck.ackLive(hit, want)); return loadSummary(); }
      const er = doccheck.errorFor(res.e.status, res.e.code, 'ack');
      delete dcPend[name];
      dcErr[name] = er.text;   // 요청이 끝나면 요청 상태(dcPend)를 지워 서버가 아는 상태로 돌아간다
      if (er.reload) return dcReload(name, er.reload);
    }).catch(function () { dcErr[name] = doccheck.COPY.err.net; })
      .then(function () { delete dcBusy[name]; delete dcPend[name]; dcDone(); });
  }

  // ── 제출 확인창(.dlg) — confirm/alert 대체(P2-1). 헤더는 규격 6-6(P2-2) ──
  function renderSmBody(box, m) {
    box.textContent = '';
    if (m.variant === 'A') { box.appendChild(mk('p', null, m.text)); return; }
    const p1 = mk('p');
    p1.appendChild(document.createTextNode(m.p1.pre));
    p1.appendChild(mk('strong', null, m.p1.strong));
    p1.appendChild(document.createTextNode(m.p1.post));
    box.appendChild(p1);
    const ul = mk('ul', 'dc-sm-files');
    m.files.forEach(function (f) {
      const li = mk('li');
      const nm = mk('span', 'nm', f.name); nm.title = f.name;
      li.appendChild(nm);
      li.appendChild(mk('span', 'dc-chip open', '확인 필요 ' + f.n + '건'));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (m.more) box.appendChild(mk('p', 'dc-why', '외 ' + m.more + '개'));
    if (m.p3) box.appendChild(mk('p', null, m.p3));
    box.appendChild(mk('p', null, m.p4));
  }

  function openSubmit(model, approver) {
    const modal = el('dc-submit-modal');
    if (!modal || !root.dlg) return;
    smState = { model: model, approver: approver };
    el('dc-sm-t').textContent = model.title;
    const go = el('dc-sm-go'); const back = el('dc-sm-back');
    go.textContent = model.go; go.disabled = false;
    back.textContent = model.back; back.disabled = false;
    el('dc-sm-err').textContent = '';
    renderSmBody(el('dc-sm-d'), model);
    root.dlg.open(modal, {
      focus: back,   // 첫 포커스는 안전한 쪽 단추
      restoreFallback: function () { return el('dg-submit'); },
      onClose: function () { smState = null; },
    });
  }

  function onSubmitBack() {
    const st = smState; const modal = el('dc-submit-modal');
    if (st && st.model.variant === 'B' && st.model.firstName) {   // 돌아가서 확인: 첫 미확인 파일 칸을 펴고 첫 체크칸으로
      const name = st.model.firstName;
      root.dlg.close(modal, { restore: false });
      dcOpenNames[name] = true; dcFocus = { name: name, first: true };
      dcLoadDetail(name, false);
      return;
    }
    root.dlg.requestClose(modal);
  }

  function doSubmit() {
    const st = smState; if (!st || smSubmitting) return;   // 요청 중 두 번째 제출을 막는다(P2-3)
    const modal = el('dc-submit-modal'); const task = selected();
    const go = el('dc-sm-go'); const back = el('dc-sm-back'); const err = el('dc-sm-err');
    smSubmitting = true;
    const unlock = function (text) {
      smSubmitting = false;
      if (!root.dlg.isOpen(modal)) {   // 그사이 창이 닫혔으면(로그아웃 등) 실패를 창 밖 줄에 남긴다
        const sv = el('dg-saved'); sv.textContent = text; sv.setAttribute('tabindex', '-1');
        return;
      }
      err.textContent = text;
      go.textContent = st.model.go;
      root.dlg.setDisabled(go, false); root.dlg.setDisabled(back, false);
    };
    err.textContent = ''; go.textContent = '제출 중…';
    root.dlg.setDisabled(go, true); root.dlg.setDisabled(back, true);
    fetch('/tasks/' + encodeURIComponent(selectedId) + '/submit', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'X-User-Id': 'web-user' }, doccheck.headers(task, st.model.button)),
      body: JSON.stringify(actorBody()),
    }).then(function (r) {
      if (!r.ok) {
        return readErr(r).then(function (e) { unlock(doccheck.errorFor(e.status, e.code, 'submit', e.detail).text); });
      }
      smSubmitting = false;
      root.dlg.close(modal);
      savedMsg('', false);
      const sv = el('dg-saved');
      sv.textContent = '제출했습니다. ' + st.approver + '에게 결재 요청을 보냈습니다.';
      sv.setAttribute('tabindex', '-1');
      // 제출한 작업은 목록에서 빠지거나 [제출] 단추가 잠기므로 다시 그린 뒤 결과 줄로 커서를 옮긴다(P3-2)
      return loadTasks().then(loadDetail).then(function () { sv.focus(); });
    }).catch(function () { unlock(doccheck.COPY.err.netSubmit); });
  }

  // 제출 요청 중에는 Esc·바깥 클릭으로 창이 닫히지 않게 window 캡처 단계에서 먼저 막는다(P2-3, dlg.js는 그대로).
  let smGuardWired = false;
  function wireSubmitGuard() {
    if (smGuardWired || !root.addEventListener) return;
    smGuardWired = true;
    root.addEventListener('keydown', function (ev) {
      if (smSubmitting && ev.key === 'Escape' && root.dlg && root.dlg.isOpen(el('dc-submit-modal'))) {
        ev.preventDefault(); ev.stopImmediatePropagation();
      }
    }, true);
    root.addEventListener('click', function (ev) {
      if (smSubmitting && ev.target === el('dc-submit-modal')) { ev.stopImmediatePropagation(); }
    }, true);
  }

  function wireSubmitModal() {
    wireSubmitGuard();
    el('dc-sm-go').onclick = doSubmit;
    el('dc-sm-back').onclick = onSubmitBack;
  }

  function saveDraft() {
    busy = true; paint();
    fetch('/tasks/' + encodeURIComponent(selectedId) + '/draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'web-user' },
      body: JSON.stringify(actorBody({ content: el('dg-memo').value })),
    }).then(function (r) {
      if (!r.ok) { savedMsg('임시저장을 하지 못했습니다. 서버가 저장을 받지 않았습니다. 메모를 지우지 말고 다시 저장하세요.', true); return; }
      savedMsg('임시저장됨 ' + new Date().toLocaleTimeString(), false);
    }).catch(fail('임시저장을 하지 못했습니다. 서버에 연결되지 않았습니다. 메모를 지우지 말고 다시 저장하세요.', savedMsg))
      .then(function () { busy = false; paint(); });
  }

  function submit() {
    const approver = designer.approverLabel(profile().team);
    const id = selectedId;
    busy = true; paint();
    fetch('/tasks/' + encodeURIComponent(id) + '/doc-check').then(function (r) {
      return r.ok ? r.json() : null;   // 요약 실패면 일반 확인(변형 A)
    }).catch(function () { return null; }).then(function (sum) {
      busy = false;
      if (selectedId !== id) { paint(); return; }
      if (sum) dcSum = sum;
      paint();
      openSubmit(doccheck.submitModel(sum, approver), approver);
    });
  }

  designer.mount = function () {
    el('dg-upload').onclick = upload;
    el('dg-save').onclick = saveDraft;
    el('dg-submit').onclick = submit;
    wireSubmitModal();
    dcResetAll();
    el('dg-scope').textContent = designer.headline(profile());
    el('dg-who').textContent = profile().name || '(이름 없음)';
    // 폴링하지 않는다 — 워크플로의 2초 폴링은 그래프가 도는 중이라 필요한 것이고,
    // 디자이너 목록은 조작할 때만 바뀐다.
    loadTasks().then(loadDetail);
  };

  designer.unmount = function () { /* 폴링·스트림이 없어 정리할 것이 없다 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = designer;
  else root.designer = designer;
})(typeof self !== 'undefined' ? self : this);
