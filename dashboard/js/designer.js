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
  // (backend/routers/tasks.py의 같은 규칙), 없으면 팀별 working 플래그로 만든다.
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

  designer.renderFiles = function (container, files) {
    const rows = designer.fileRows(files);
    container.innerHTML = rows.length ? rows.map(function (f) {
      return '<div class="dg-file"><a href="#" class="dg-dl" data-name="' + esc(f.name) + '">' +
        esc(f.name) + '</a><span class="dg-size">' + esc(f.sizeText) + '</span>' +
        '<span class="dg-at">' + esc(f.uploadedAt) + '</span>' +
        '<button class="dg-rm" data-name="' + esc(f.name) + '">삭제</button></div>';
    }).join('') : '<p class="wf-empty">올린 작업물이 없습니다.</p>';
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  let tasks = [];
  let selectedId = null;
  let handoff = null;
  let files = [];
  let busy = false;

  function profile() { return root.store.loadProfile(); }

  // 소속(역할) → tasks.team. `영업팀`·`영업팀장` 둘 다 `영업`을 본다 —
  // backend/teams.py의 team_of와 **같은 규칙**이고, 접미사를 떼는 순서가 전부다
  // ('영업팀장'에서 '팀'을 먼저 떼면 '영업장'이라는 없는 팀이 된다).
  designer.teamOf = function (role) {
    const text = (role || '').trim();
    const suffixes = ['팀장', '팀'];
    for (let i = 0; i < suffixes.length; i += 1) {
      const s = suffixes[i];
      if (text.length > s.length && text.slice(-s.length) === s) return text.slice(0, -s.length);
    }
    return text;
  };

  function myTeam() { return designer.teamOf(profile().team); }

  // 작업함은 더 이상 디자이너 전용이 아니다(계획 I) — 화면 문구도 소속을 따라간다.
  // 예전에는 '디자이너 작업함'으로 굳어 있어 영업팀 담당자가 들어와도 그렇게 보였다.
  designer.headline = function (prof) {
    const team = ((prof || {}).team || '').trim();
    return team ? team + ' 작업함' : '작업함';
  };

  // 제출하면 누구에게 가는지 — backend/teams.py의 lead_of와 같은 규칙이다.
  // 모르는 소속에 결재자를 지어내지 않는다(틀린 이름을 대면 더 나쁘다).
  designer.approverLabel = function (role) {
    const team = designer.teamOf(role);
    if (['영업', '전산', '예산'].indexOf(team) >= 0) return team + '팀장';
    if (team === '디자이너') return '본부장';
    return '결재자';
  };

  // 한글 이름은 헤더에 못 실으므로 by로 보낸다(X-User-Id는 ASCII만 — A1 F10).
  function actorBody(extra) {
    return Object.assign({ by: profile().name || null }, extra || {});
  }

  function fail(msg) { return function () { alert(msg); }; }

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
    }).catch(fail('작업 목록을 불러오지 못했습니다.'));
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
    ]).then(function (res) {
      if (selectedId !== id) return;        // 그 사이 다른 것을 골랐으면 버린다
      handoff = res[0]; files = res[1];
      const detail = res[2];
      if (detail) el('dg-memo').value = detail.draft_content || '';
      paint();
    }).catch(fail('작업 상세를 불러오지 못했습니다.'));
  }

  function selected() {
    return tasks.filter(function (t) { return t.task_id === selectedId; })[0] || null;
  }

  function paint() {
    const today = new Date();
    designer.renderList(el('dg-list'), tasks, today, selectedId);
    el('dg-list').querySelectorAll('.dg-item').forEach(function (node) {
      node.onclick = function () { selectedId = node.dataset.id; loadDetail(); };
    });

    const task = selected();
    el('dg-detail').style.display = task ? '' : 'none';
    el('dg-empty').style.display = task ? 'none' : '';
    if (!task) return;

    el('dg-title').textContent = task.institution_name + ' — 이관 패키지';
    designer.renderHandoff(el('dg-pkg'), handoff);
    designer.renderFiles(el('dg-files'), files);
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
    el('dg-pkg').querySelectorAll('.dg-body').forEach(function (pre) {
      pre.onclick = function () { pre.classList.toggle('open'); };
    });
    el('dg-files').querySelectorAll('.dg-dl').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        window.open('/tasks/' + encodeURIComponent(selectedId) + '/files/' +
          encodeURIComponent(a.dataset.name), '_blank');
      };
    });
    el('dg-files').querySelectorAll('.dg-rm').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm(btn.dataset.name + ' 을(를) 삭제할까요?')) return;
        fetch('/tasks/' + encodeURIComponent(selectedId) + '/files/' +
          encodeURIComponent(btn.dataset.name) +
          '?by=' + encodeURIComponent(profile().name || ''), {
          method: 'DELETE', headers: { 'X-User-Id': 'web-user' },
        }).then(function (r) {
          if (!r.ok && r.status !== 204) { alert('삭제 실패 (' + r.status + ')'); return; }
          return loadDetail().then(loadTasks);
        }).catch(fail('서버 연결 실패 — 삭제되지 않았습니다.'));
      };
    });
  }

  function upload() {
    const input = el('dg-file-input');
    const file = input.files && input.files[0];
    if (!file) { alert('올릴 파일을 먼저 고르세요.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('by', profile().name || '');
    busy = true; paint();
    fetch('/tasks/' + encodeURIComponent(selectedId) + '/files', {
      method: 'POST', body: fd, headers: { 'X-User-Id': 'web-user' },
    }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.detail || ('업로드 실패 (' + r.status + ')'));
        // 조용히 덮어쓰지 않는다 — 같은 이름이면 사실을 알린다.
        if (body.replaced) alert(body.name + ' 을(를) 새 파일로 교체했습니다.');
        input.value = '';
      });
    }).then(function () { return loadDetail().then(loadTasks); })
      .catch(function (e) { alert(e.message || '서버 연결 실패 — 올리지 못했습니다.'); })
      .then(function () { busy = false; paint(); });
  }

  function saveDraft() {
    busy = true; paint();
    fetch('/tasks/' + encodeURIComponent(selectedId) + '/draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'web-user' },
      body: JSON.stringify(actorBody({ content: el('dg-memo').value })),
    }).then(function (r) {
      if (!r.ok) { alert('임시저장 실패 (' + r.status + ')'); return; }
      el('dg-saved').textContent = '임시저장됨 ' + new Date().toLocaleTimeString();
    }).catch(fail('서버 연결 실패 — 저장되지 않았습니다.'))
      .then(function () { busy = false; paint(); });
  }

  function submit() {
    const approver = designer.approverLabel(profile().team);
    if (!confirm('제출하면 ' + approver + '에게 결재 요청이 갑니다. 진행할까요?')) return;
    busy = true; paint();
    fetch('/tasks/' + encodeURIComponent(selectedId) + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'web-user' },
      body: JSON.stringify(actorBody()),
    }).then(function (r) {
      if (!r.ok) { alert('제출 실패 (' + r.status + ')'); return; }
      alert('제출했습니다 — ' + approver + '에게 결재 요청을 보냈습니다.');
      return loadTasks().then(loadDetail);
    }).catch(fail('서버 연결 실패 — 제출되지 않았습니다.'))
      .then(function () { busy = false; paint(); });
  }

  designer.mount = function () {
    el('dg-upload').onclick = upload;
    el('dg-save').onclick = saveDraft;
    el('dg-submit').onclick = submit;
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
