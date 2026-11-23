(function (root) {
  'use strict';
  // 제안서 점검(NEXT 106) 순수 함수 — 배지 고르기·사유·위치·오류·제출 확인창 내용.
  // 문구 정본: handoff/agents/design-reviewer/2026-11-23_106_점검화면_규격.md 5-1(글자 그대로). DOM은 designer.js 몫.
  const dc = {};
  const WORKING = ['대기', '작성중'];
  const DESIGNER_TEAM = '디자이너';
  const has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  const REASONS = {
    BUSY: { text: '다른 파일을 점검하는 중이라 건너뛰었습니다.', retry: true },
    TIMEOUT: { text: '20초 안에 끝나지 않아 멈췄습니다.', retry: true },
    STALE: { text: '점검 결과가 없거나 지난 결과입니다(파일이나 기관 목록이 바뀜).', retry: true },
    INTERNAL: { text: '점검 중 오류가 났습니다.', retry: true },
    FORMAT_UNSUPPORTED: { text: '옛 파워포인트(ppt)는 읽지 못합니다. pptx나 pdf로 저장해 올리면 점검합니다.', retry: false },
    IMAGE_ONLY: { text: '그림 파일은 글자를 읽지 않습니다.', retry: false },
    ARCHIVE: { text: 'zip 안의 파일은 열어 보지 않습니다.', retry: false },
    FORMAT_MISMATCH: { text: '확장자와 파일 내용이 맞지 않아 읽지 못했습니다.', retry: false },
    ACTIVE_CONTENT: { text: '매크로·스크립트가 들어 있어 읽지 않았습니다.', retry: false },
    ATTACHMENT: { text: 'PDF 안에 첨부 파일이 있어 읽지 않았습니다.', retry: false },
    ENCRYPTED: { text: '암호가 걸려 있어 읽지 못했습니다. 암호를 풀고 다시 올려 주세요.', retry: false },
    BROKEN: { text: '파일이 손상됐거나 형식이 달라 읽지 못했습니다.', retry: false },
    TOO_LARGE: { text: '파일 안 내용이 너무 커서 읽지 않았습니다.', retry: false },
    NO_TEXT: { text: '읽을 수 있는 글자가 없습니다(스캔 PDF·그림만 있는 슬라이드).', retry: false },
    TEXT_CAP: { text: '글자가 너무 많아 앞부분만 점검했습니다.', retry: false },
    TOO_MANY_PAGES: { text: '앞 500쪽만 점검했습니다.', retry: false },
    HIT_CAP: { text: '찾은 곳이 너무 많아 2,000곳까지만 기록했습니다.', retry: false },
  };

  const COPY = {
    loading: '점검 확인 중…',
    detailLoading: '불러오는 중…',
    ctxLoading: '문맥 읽는 중…',
    checking: '점검 중…',
    lockedLine: '제출한 작업이라 표시를 바꿀 수 없습니다.',
    unknownReason: '점검하지 못했습니다.',
    missingInst: '(기관 목록에서 빠진 기관)',
    noteOrder: '슬라이드 번호가 실제 순서와 다를 수 있습니다.',
    noteImages: '그림 속 글자는 보지 않았습니다.',
    noteEmbedded: '끼워 넣은 개체(엑셀 표 등)는 보지 않았습니다.',
    ctxUnavailable: '파일이 바뀌어 문맥을 보여 줄 수 없습니다. [다시 점검] 뒤 다시 보세요.',
    summaryFail: '제안서 점검 결과를 불러오지 못했습니다. 올리기·제출은 그대로 됩니다.',
    err: {
      stale: '그사이 파일이 바뀌어 점검 결과를 새로 불러왔습니다. 다시 표시해 주세요.',
      locked: '제출한 작업이라 파일과 표시를 바꿀 수 없습니다.',
      busy: '지금 다른 파일을 점검하고 있습니다. 1분쯤 뒤 다시 눌러 주세요.',
      busyUpload: '파일을 점검하지 못해 올리지 않았습니다. 잠시 뒤 다시 올려 주세요.',
      active: '매크로·스크립트가 들어 있는 파일은 올릴 수 없습니다. 매크로를 뺀 pptx로 저장해 다시 올려 주세요.',
      auth: '로그인 정보(사번)가 없어 처리하지 못했습니다. 다시 로그인해 주세요.',
      notOwner: '이 작업의 담당자만 표시할 수 있습니다.',
      gone: '파일이 없습니다. 목록을 새로 불러왔습니다.',
      taskGone: '작업을 찾지 못했습니다. 목록을 새로 불러와 주세요.',   // 올리기 404(파일이 아니라 작업이 없는 경우)
      net: '서버에 연결하지 못해 바꾸지 못했습니다.',
      netSubmit: '서버 연결 실패 — 제출되지 않았습니다.',   // 규격에 없는 자리 — 기존 문구 유지
      failUpload: '업로드 실패 (', failSubmit: '제출 실패 (', failDelete: '삭제 실패 (', fail: '처리 실패 (',   // 규격에 없는 자리 — 기존 문구 유지(fail만 새 문구)
    },
  };
  dc.COPY = COPY;

  // ── 사유·배지 ────────────────────────────────────────────────────────
  dc.reasonInfo = function (code) {
    if (code && has(REASONS, code)) return { text: REASONS[code].text, retry: REASONS[code].retry, known: true };
    return { text: COPY.unknownReason, retry: true, known: false };
  };

  // 요약 files[] 한 항목 → 배지. 위에서부터 먼저 맞는 것 하나(규격 5-1). 파일이 요약에 없으면 null(배지 없음).
  dc.badgeFor = function (f, opt) {
    if (opt && opt.checking) return { kind: 'checking', cls: '', text: COPY.checking, extra: null, why: null, retry: false };
    if (!f) return null;
    const un = Number(f.unconfirmed_count) || 0;
    const hits = Number(f.hit_count) || 0;
    const acked = Number(f.acked_count) || 0;
    if (un > 0) {
      return { kind: 'open', cls: 'open', text: '확인 필요 ' + un + '건',
        extra: f.state === 'PARTIAL' ? { kind: 'part', cls: 'part', text: '일부만 점검' } : null, why: null, retry: false };
    }
    if (f.state === 'DONE') {
      return hits > 0
        ? { kind: 'acked', cls: '', text: '확인함 ' + acked + '건', extra: null, why: null, retry: false }
        : { kind: 'none', cls: 'none', text: '찾은 이름 없음', extra: null, why: null, retry: false };
    }
    const r = dc.reasonInfo(f.reason);
    if (f.state === 'PARTIAL') {
      return { kind: 'part', cls: 'part', text: '일부만 점검', extra: null, why: r.known ? r.text : null, retry: false };
    }
    return { kind: 'nc', cls: 'nc', text: '점검 못 함', extra: null, why: r.text, retry: r.retry };
  };

  // 제목 옆 요약 칩. open:true인 항목만 .dc-chip.open. 0인 항목은 뺀다.
  // 모두 0이어도 확인해 둔 건(acked)이 있으면 '확인함 n건'(팀 결정 11-23) — 요약 최상위에는 acked_count가 없어 files[]를 더한다.
  dc.summaryChips = function (sum) {
    if (!sum || typeof sum !== 'object') return [];
    const fc = Number(sum.file_count) || 0;
    if (!fc) return [];
    const out = [];
    if (Number(sum.unconfirmed_count) > 0) out.push({ text: '확인 필요 ' + sum.unconfirmed_count + '건', open: true });
    if (Number(sum.not_checked_count) > 0) out.push({ text: '점검 못 함 ' + sum.not_checked_count + '개', open: false });
    if (Number(sum.partial_count) > 0) out.push({ text: '일부만 점검 ' + sum.partial_count + '개', open: false });
    if (!out.length) {
      let acked = Number(sum.acked_count) || 0;
      if (!acked) (sum.files || []).forEach(function (f) { acked += Number(f && f.acked_count) || 0; });
      out.push({ text: acked > 0 ? '확인함 ' + acked + '건' : '찾은 이름 없음(파일 ' + fc + '개)', open: false });
    }
    return out;
  };

  // ── 위치·기관·시각 ────────────────────────────────────────────────────
  // [앞 글자, 숫자|null, 뒤 글자] — 숫자만 --mono로 칠하려고 쪼갰다.
  dc.locParts = function (kind, no) {
    switch (kind) {
      case 'SLIDE': return ['슬라이드 ', no, ''];
      case 'NOTE': return ['슬라이드 ', no, ' 노트'];
      case 'PAGE': return ['', no, '쪽'];
      case 'MASTER': return ['마스터·레이아웃', null, ''];
      case 'META': return ['문서 정보(제목·작성자)', null, ''];
      default: return ['차트·도표·메모', null, ''];   // OTHER 와 모르는 종류
    }
  };
  dc.locText = function (kind, no) {
    const p = dc.locParts(kind, no);
    return p[0] + (p[1] == null ? '' : p[1]) + p[2];
  };
  dc.instText = function (name) { return name ? String(name) : COPY.missingInst; };
  dc.timeText = function (iso) { return iso ? String(iso).slice(0, 16).replace('T', ' ') : ''; };
  dc.ackedAtText = function (iso) { return iso ? String(iso).slice(5, 16).replace('T', ' ') : ''; };
  dc.hitKey = function (h) { return h.inst_id + '|' + h.loc_kind + '|' + h.loc_no; };
  dc.ackItem = function (h) { return { inst_id: h.inst_id, loc_kind: h.loc_kind, loc_no: h.loc_no }; };
  dc.ackLabel = function (h) { return dc.instText(h.inst_name) + ' ' + dc.locText(h.loc_kind, h.loc_no) + ' 의도한 언급'; };
  dc.ackLive = function (h, want) {
    return dc.instText(h.inst_name) + ' ' + dc.locText(h.loc_kind, h.loc_no) + ' — ' +
      (want ? '의도한 언급으로 표시했습니다.' : '표시를 풀었습니다.');
  };

  // 상세 안내 줄(해당할 때만). PARTIAL이면 사유도 한 줄(행 배지에는 사유가 안 보이므로).
  dc.notes = function (d) {
    const out = [];
    if (!d) return out;
    if (d.state === 'PARTIAL') { const r = dc.reasonInfo(d.reason); if (r.known) out.push(r.text); }
    if (d.order_approx) out.push(COPY.noteOrder);
    if (d.has_images) out.push(COPY.noteImages);
    if (d.has_embedded) out.push(COPY.noteEmbedded);
    return out;
  };

  // 펼침 칸에 찾은 이름(hits)이 없을 때 보일 한 줄 — 사유의 정본 자리(P3-1). 줄(.dg-file)에는 사유를 싣지 않는다(P2-1).
  dc.emptyLine = function (d) {
    if (!d) return null;
    if (d.state === 'DONE') return '찾은 이름 없음';
    if (d.state === 'NOT_CHECKED' || d.state === 'ERROR' || d.state === 'PARTIAL') return dc.reasonInfo(d.reason).text;
    return null;
  };
  // 펼침 칸의 [다시 점검] 보임 여부 — 점검 못 함·오류인데 다시 해도 소용없는 사유(retry:false)면 숨김(P3-2).
  dc.canRecheck = function (d) {
    if (d && (d.state === 'NOT_CHECKED' || d.state === 'ERROR')) return dc.reasonInfo(d.reason).retry;
    return true;
  };

  // ── 잠김·표시 가능 ────────────────────────────────────────────────────
  // 팀 결정(11-23): 화면 계산 — 디자이너 작업 && 상태 ∉ {대기, 작성중}. 서버가 최종 방어(409 TASK_LOCKED).
  dc.isLocked = function (task) {
    return !!task && task.team === DESIGNER_TEAM && WORKING.indexOf(task.status) < 0;
  };
  dc.canAck = function (d) {
    return !!d && !!d.sha256 && (d.state === 'DONE' || d.state === 'PARTIAL');
  };
  dc.headers = function (task, button) {
    return { 'X-Screen-Id': task && task.team === DESIGNER_TEAM ? 'design_work' : 'task_work', 'X-Button-Id': button };
  };

  // ── 오류 ─────────────────────────────────────────────────────────────
  dc.errorCode = function (body) {
    const d = body && body.detail;
    return d && typeof d === 'object' && typeof d.code === 'string' ? d.code : null;
  };
  dc.errorDetailText = function (body) {   // 평문 detail(올리기 규칙 위반 문장 등) — 기존 동작 유지용
    return body && typeof body.detail === 'string' ? body.detail : '';
  };
  // ctx: ack | recheck | ctx | load | upload | delete | submit. reload: 'both'(요약+상세) | 'files'(목록) | null
  dc.errorFor = function (status, code, ctx, detailText) {
    const E = COPY.err;
    if (!status) return { text: ctx === 'submit' ? E.netSubmit : E.net, reload: null };
    if (status === 409 && code === 'DOC_CHECK_STALE') return { text: E.stale, reload: 'both' };
    if (status === 409 && code === 'TASK_LOCKED') return { text: E.locked, reload: null };
    if (status === 503 && code === 'DOC_CHECK_BUSY') return { text: ctx === 'upload' ? E.busyUpload : E.busy, reload: null };
    if (status === 400 && code === 'ACTIVE_CONTENT') return { text: E.active, reload: null };
    if (status === 401) return { text: E.auth, reload: null };
    if (status === 403 && ctx === 'ack') return { text: E.notOwner, reload: null };
    if (status === 404) return ctx === 'upload' ? { text: E.taskGone, reload: null } : { text: E.gone, reload: 'files' };
    if (ctx === 'upload' && detailText) return { text: detailText, reload: null };   // 확장자·크기 등 평문 사유(기존 동작)
    const pre = ctx === 'upload' ? E.failUpload : ctx === 'submit' ? E.failSubmit : ctx === 'delete' ? E.failDelete : E.fail;
    return { text: pre + status + ')', reload: null };
  };

  // 체크칸에 보일 상태 — 표시 요청 중(pend={key,want})이면 요청한 상태, 아니면 서버가 아는 상태(P2-2).
  dc.shownAcked = function (h, pend) {
    return pend && pend.key === dc.hitKey(h) ? !!pend.want : !!h.acked;
  };
  // 오류 줄을 스크린리더가 읽게(role=alert) 할지 — 문구가 새로 생기거나 바뀔 때만(P3-4).
  dc.errAnnounce = function (prev, next) { return !!next && next !== prev; };
  // 목록(파일 배열)에 그 이름이 없는가 — 404 뒤 펼침 칸이 사라졌는지 판단(P2-1).
  dc.fileGone = function (list, name) {
    return !(list || []).some(function (x) { return x && x.name === name; });
  };

  // ── 올리기 결과 한 줄 ─────────────────────────────────────────────────
  // withObj: 조사 도우미(dlg.withObj) — 있으면 을/를을 받침에 맞춘다(팀 결정 11-23). 없으면 '을'.
  dc.uploadResultText = function (name, replaced, badge, withObj) {
    const obj = typeof withObj === 'function' ? withObj(name) : name + '을';
    return obj + ' 올렸습니다.' + (replaced ? ' (같은 이름 파일을 바꿈)' : '') + (badge ? ' ' + badge.text : '');
  };

  // ── 제출 확인창 내용(규격 6-5). sum: 요약 응답 | null(실패) ────────────
  dc.submitModel = function (sum, approver) {
    const who = approver || '결재자';
    const s = sum && typeof sum === 'object' && sum.submit_confirm_needed ? sum : null;
    if (!s) {
      return { variant: 'A', title: '결재 요청', go: '제출', back: '취소', button: 'submit',
        text: '제출하면 ' + who + '에게 결재 요청이 갑니다.' };
    }
    const n = Number(s.unconfirmed_count) || 0;
    const open = (s.files || []).filter(function (f) { return (Number(f.unconfirmed_count) || 0) > 0; });
    const nc = Number(s.not_checked_count) || 0;
    const pt = Number(s.partial_count) || 0;
    let p3 = null;
    if (nc > 0 || pt > 0) {
      const bits = [];
      if (nc > 0) bits.push('점검 못 한 파일 ' + nc + '개');
      if (pt > 0) bits.push('일부만 점검한 파일 ' + pt + '개');
      p3 = bits.join(', ') + '도 있습니다.';
    }
    return {
      variant: 'B', title: '다른 기관 이름 ' + n + '건 미확인',
      go: '미확인 ' + n + '건 무시하고 제출', back: '돌아가서 확인', button: 'doc_check_submit_anyway',
      p1: { pre: '제안서 파일에 이 기관이 아닌 다른 기관의 정식 이름이 ', strong: n + '건', post: " 남아 있고, 아직 '의도한 언급'으로 표시하지 않았습니다." },
      files: open.slice(0, 5).map(function (f) { return { name: f.name, n: Number(f.unconfirmed_count) || 0 }; }),
      more: open.length > 5 ? open.length - 5 : 0,
      p3: p3,
      p4: '그대로 제출하면 확인하지 않은 건수와 제출한 사람·시각이 기록에 남습니다. 제출하면 ' + who + '에게 결재 요청이 갑니다.',
      firstName: open.length ? open[0].name : null,
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = dc;
  else root.doccheck = dc;
})(typeof self !== 'undefined' ? self : this);
