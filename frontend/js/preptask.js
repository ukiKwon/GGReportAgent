(function (root) {
  'use strict';
  // 영업 추진 준비 › 제안 준비 현황 › 기관 상세의 '구간·단계' 틀(NEXT 113 2단계, 사용자 11-25).
  // 기관을 누르면 화면은 하나다 — 옛 '사전준비 상세'(담당자 지정·준비 과제·승인)와 '23단계 틀'을 합쳤다.
  //   구간 3개(입찰 자료확인 → 제안 준비 → 협약 이행 준비) 안에 단계가 순서대로 놓이고, 단계 본문에서 그 단계의 일을 바로 한다.
  //   · 담당자 지정·준비 과제·승인·작성 시작 = prep.js의 조각(endHtml·taskItemHtml)을 그 단계 본문에 그대로 싣는다(동작은 prep.js가 처리).
  //   · 손으로 체크하는 칸 = 본문의 상태 단추(data-act="mark") — 제안 준비 현황 표와 같은 주소로 저장한다(prep.js onMark).
  // 이 파일은 순수 함수만 둔다(node 시험 대상). 상태·요청·이벤트는 prep.js가 가진다(paintCase가 caseHtml을 부른다).
  const pt = {};
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const pb = isNode ? require('./prepboard.js') : root.prepboard;
  const prep = isNode ? require('./prep.js') : root.prep;

  function esc(s) { return logic.esc(s == null ? '' : s); }
  function str(v) { return v == null ? '' : String(v); }
  // 주제 조사: 받침이 있으면 '은', 없으면 '는'(dlg.withObj의 을/를과 같은 방식)
  function scriptEunNeun(w) {
    const s = String(w == null ? '' : w);
    const c = s.charCodeAt(s.length - 1) - 0xAC00;
    return c >= 0 && c < 11172 && c % 28 ? '은' : '는';
  }

  // ── 구간·단계 정본 ───────────────────────────────────────────────
  // 구간 이름은 사용자 11-25 "입찰 자료확인 · 제안 준비 · 협약 이행 준비"(담당자 지정~이사회 / 제안서~PT / 결과발표~협약식 — 제안서를 쓰려면 앞 단계가 모두 끝나야 하고, 결과 발표가 나야 협약 이행을 준비한다). 단계 순서는 엑셀 칸 순서 그대로(협약식이 맨 끝 — 사용자 11-25 확정).
  // 어느 단계가 어느 구간인지는 아래 ph 값으로 바꾼다.
  pt.PHASES = [
    { key: 'bid', label: '입찰 자료확인' },
    { key: 'prep', label: '제안 준비' },
    { key: 'agree', label: '협약 이행 준비' },
  ];
  // cd = 서버 PrepBoardColumns 칸 코드(묶음은 묶음 코드, 칸이 아닌 단계는 ''). tasks = 이 단계 본문에 싣는 사전준비 과제 코드.
  // kind: start(담당자 지정)·notice(읽기만)·auto(과제가 채움)·board(이사회 준비 한 묶음)·proposal(제안서)·manual(담당 영업 체크)·group(묶음 체크)
  // 사용자 11-25: '이사회 자료 작성'과 '이사회 발표 대본'은 한 단계(이사회 준비 = 자료 작성·일정 등록·추가 자료 등록·발표 대본), '이사회'는 '이사회 개최 및 결과'(결과 등록·결과 문서 보관).
  function step(cd, label, kind, ph, o) {
    return Object.assign({ cd: cd, id: cd, label: label, kind: kind, ph: ph, tasks: [], subs: null }, o || {});
  }
  function sub(cd, label) { return { cd: cd, label: label }; }
  pt.STEPS = [
    step('', '담당자 지정', 'start', 'bid', { id: 'START' }),
    step('NOTICE_CHECK', '입찰공고확인', 'notice', 'bid'),
    step('INST_ANALYSIS', '기관 정보 분석', 'auto', 'bid', { tasks: ['T1', 'T2'] }),
    step('PROFIT', '수익성분석', 'auto', 'bid', { tasks: ['T3'] }),
    step('FIN_COMMITTEE', '가결위(재무)', 'manual', 'bid'),
    step('BIZ_COMMITTEE', '출심위(사업부)', 'manual', 'bid'),
    step('', '이사회 준비', 'board', 'bid', { id: 'BOARD_DOC', tasks: ['T5', 'T6'] }),
    step('BOARD', '이사회 개최 및 결과', 'group', 'bid', { result: true, subs: [sub('BOARD_SECRETARIAT', '사무국'), sub('BOARD_AUDIT', '감사·감시'), sub('BOARD_COMPLIANCE', '준법')] }),
    step('PROPOSAL', '제안서', 'proposal', 'prep'),
    step('PRESENT_DOC', '발표자료', 'manual', 'prep'),
    step('SUBMIT_DOCS', '제출서류', 'manual', 'prep', { tasks: ['T4'] }),
    step('SUBMIT_APPR', '제안서제출품의', 'group', 'prep', { subs: [sub('SUBMIT_MONITOR', '감시'), sub('SUBMIT_PROPERTY', '재산상이익')] }),
    step('PT', 'PT', 'manual', 'prep'),
    step('RESULT', '결과발표', 'manual', 'agree'),
    step('PRIORITY_NEGO', '우선협상', 'manual', 'agree'),
    step('AGREE_LEGAL', '협약서(법률)', 'manual', 'agree'),
    step('CONTRACT_APPR', '협약체결품의', 'group', 'agree', { subs: [sub('CONTRACT_AUDIT', '감사·감시'), sub('CONTRACT_STRATEGY', '전략'), sub('CONTRACT_PROPERTY', '재산상이익'), sub('CONTRACT_BRANCH', '영업점안내')] }),
    step('ATM', 'ATM', 'manual', 'agree'),
    step('KB_CARD', 'KB카드', 'manual', 'agree'),
    step('IT_BUILD', '전산구축', 'manual', 'agree'),
    step('VIP', 'VIP 지정', 'manual', 'agree'),
    step('RATE_APPROVAL', '금리승인', 'manual', 'agree'),
    step('CEREMONY', '협약식', 'manual', 'agree'),
  ];
  pt.clampIdx = function (i) {
    const n = Number(i);
    return n >= 0 && n < pt.STEPS.length ? Math.floor(n) : 0;
  };
  pt.phaseOf = function (idx) { return pt.STEPS[pt.clampIdx(idx)].ph; };
  pt.phaseLabel = function (key) {
    const p = pt.PHASES.filter(function (x) { return x.key === key; })[0];
    return p ? p.label : '';
  };
  // 그 구간에 든 단계 번호(전체 순번) 목록
  pt.phaseIdxs = function (key) {
    const out = [];
    pt.STEPS.forEach(function (s, i) { if (s.ph === key) out.push(i); });
    return out;
  };

  // 칸 코드 → 사람이 읽는 이름('묶음 › 칸'). 저장 알림·오류 문구에 쓴다.
  pt.colLabel = function (cd) {
    for (let i = 0; i < pt.STEPS.length; i += 1) {
      const s = pt.STEPS[i];
      if (s.cd && s.cd === cd && !s.subs) return s.label;
      const x = (s.subs || []).filter(function (y) { return y.cd === cd; })[0];
      if (x) return s.label + ' › ' + x.label;
    }
    return str(cd);
  };

  // ── 문구 ─────────────────────────────────────────────────────────
  const T = {
    phasesNav: '진행 구간',
    stepsNav: function (phaseLabel) { return phaseLabel + ' 단계'; },
    prev: function (label) { return '이전: ' + label; },
    next: function (label) { return '다음: ' + label; },
    prevNone: '이전 단계 없음',
    nextNone: '마지막 단계',
    startHint: '이 기관을 맡을 담당자를 정합니다. 담당자가 정해지면 준비 과제와 체크 칸이 열립니다.',
    startDone: '담당자 지정이 끝났습니다.',
    startEnded: '끝난 건이라 담당자를 지정하지 않습니다.',
    manualHint: '이 단계를 마쳤으면 상태를 고릅니다. 고르면 바로 저장되고 제안 준비 현황 표에도 같이 보입니다.',
    groupHint: '칸마다 상태를 고릅니다. 고르면 바로 저장되고 제안 준비 현황 표에도 같이 보입니다.',
    boardHint: '이사회 자료는 이사회 자료 작성 화면에서 만들고 확정합니다. 확정되면 이 단계가 완료됩니다.',
    proposalHint: '필수 준비 과제를 마친 뒤 제안서 작성을 시작합니다. 작성은 [제안서 진행 현황]에서 세 팀이 함께 합니다.',
    proposalLater: '담당자 지정이 끝나면 여기에서 제안서 작성을 시작합니다.',
    openBefore: function (names) { return '입찰 자료확인 구간에 아직 안 끝난 단계가 있습니다: ' + names.join(', ') + '. 작성 시작을 막지는 않으니 확인만 하세요.'; },
    openBoard: '이사회 자료 작성 열기',
    openBoardMat: '이사회 자료 열기',
    boardGoCheck: '표별 확인·제출하러 가기',
    boardCheckHint: '아래는 수익성 분석표로 채운 지금 버전입니다. 표마다 원본과 대조해 확인하고 제출하는 일은 [표별 확인·제출하러 가기]에서 합니다.',
    boardConfirmed: '확정된 이사회 자료입니다. 확정본 워드는 이사회 자료 화면에서 내려받습니다.',
    boardNone: '아직 이 기관의 이사회 자료가 없습니다. 4단계에서 수익성 분석표(xlsx)를 올리면 초안이 자동으로 만들어집니다.',
    boardErr: '이사회 자료를 불러오지 못했습니다. 이사회 자료 작성 화면에서 확인하세요.',
    // 이사회 준비 단계의 번호·이름은 STEPS에서 가져온다(이름이 바뀌어도 안내가 어긋나지 않게)
    get profitHint() {
      const at = pt.STEPS.findIndex(function (s) { return s.id === 'BOARD_DOC'; });
      return '수익성 분석표(xlsx)를 올리면 이사회 자료 초안이 자동으로 만들어집니다. 표별 확인은 ' + (at + 1) + '단계 \'' + pt.STEPS[at].label + '\'에서 합니다.';
    },
    draftSaved: function (n) { return '이사회 자료 초안을 버전 ' + n + '(으)로 저장했습니다. 7단계에서 표별로 확인하세요.'; },
    draftSame: '이사회 자료는 지금 버전과 값이 같아 새로 만들지 않았습니다.',
    draftLocked: '이사회 자료가 이미 제출·확정되어 초안은 바꾸지 않았습니다.',
    draftFail: '이사회 자료 초안은 자동으로 만들지 못했습니다. 7단계에서 이사회 자료 작성을 열어 엑셀을 직접 올려 주세요.',
    noRow: '제안 준비 현황 표의 체크 기록을 불러오지 못해 보기만 합니다. [← 제안 준비 현황으로] 돌아가 다시 여세요.',
    rowLoading: '체크 기록을 불러오는 중…',
    ended: '끝난 건이라 체크할 수 없습니다.',
    saving: '저장 중…',
    lastCheck: function (date, by) { return '마지막 체크 ' + date + (by ? ' ' + by : ''); },
    taskNone: '이 단계에 걸린 준비 과제가 없습니다.',
    foldHint: '아래 내용을 읽고, 비어 있으면 [작성 시작], 고칠 것이 있으면 [수정하기]로 고친 뒤 과제마다 [완료로 표시]를 누릅니다.',
    foldCheckHint: '내용을 확인했으면 [완료로 표시]를 누르세요.',
    docEdit: '수정하기',
    docWrite: '작성 시작',
    docWriteNote: '누르면 원본 자료로 기관명·기관장·현 거래 은행·주요 사업을 채운 첫 판이 바로 저장됩니다.',
    docView: '보기',
    docShow: '다시 보기',
    docFold: '접기',
    docLoading: '내용을 불러오는 중…',
    docErr: '내용을 불러오지 못했습니다. [수정하기]로 열어 확인하세요.',
    sumEmpty: '아직 작성하지 않았습니다. [작성 시작]을 누르면 첫 판이 저장되고 작성 창이 열립니다.',
    sumNone: '적은 내용 없음',
    changeAssignee: '담당자 변경…',
    changeAssigneeNote: '담당자는 여러 명을 둘 수 있습니다. 바꾸면 바로 반영되고, 새 담당자·빠진 담당자·남은 담당자·영업팀장에게 쪽지함으로 알립니다.',
    changeAssigneeView: '담당자 변경은 지금 담당자나 영업팀장이 요청합니다.',
    assigneeCount: function (n) { return '담당 ' + n + '명'; },
    // 2단계 확인 항목(사용자 11-25: 공고 진행·원본 파일을 확인, 마감 같은 사실은 붉은 글씨 + 체크 모양)
    chkHead: '확인 항목',
    chkProgress: '공고 진행',
    chkFile: '공고 원본 파일',
    fileHas: function (n) { return '있음 · ' + n + '개'; },
    fileNone: '없음 — 아래에서 올려 주세요.',
    fileNoneView: '없음 — 이 기관의 담당 영업이 올립니다.',
    fileUnknown: '담당자 지정 뒤에 올릴 수 있습니다.',
    chkBank: '금고 은행',
    chkTerm: '약정 기간',
    chkChief: '기관장',
    instUnknown: '미확인',   // 기관 정보 팝업의 '미확인' 칩(dashboard chip())과 같은 말
    progReceiving: function (to, dd) { return '접수 중' + (to ? ' · 마감 ' + to : '') + (dd ? ' (' + dd + ')' : ''); },
    progUnknown: function (since) { return '공고 진행 중 · 접수 마감일 미확인(공고 후 ' + since + '일)'; },
    progPast: function (to) { return '마감 — 접수 마감이 지났습니다' + (to ? '(마감 ' + to + ')' : '') + '.'; },
    progLate: function (since) { return '마감일을 모르는 채로 공고 후 ' + since + '일이 지났습니다. 결과 공고를 확인하세요.'; },
    progNone: '진행 중인 공고가 없습니다.',
    progRec: { CLOSED: '마감 — 이번 회차 공고가 끝난 것으로 기록돼 있습니다.', NO_BID: '입찰 없음으로 기록돼 있습니다.', DELAYED: '지연·재공고 대기로 기록돼 있습니다.' },
    noticeFilesTitle: '공고 원본 파일',
    noticeFilesHint: '공고문·제안요청서(RFP) 원본을 올려 둡니다. PDF·HWPX·DOCX·XLSX (HWP는 HWPX나 PDF로 저장해 올립니다).',
    noticeFilesEmpty: '아직 올린 공고 원본 파일이 없습니다.',
    // 7단계 이사회 준비 · 8단계 이사회 개최 및 결과
    secDoc: '이사회 자료 작성',
    secSched: '이사회 일정 등록',
    secAdd: '이사회 추가 자료 등록',
    secScript: '이사회 발표 대본',
    secResult: '이사회 결과 등록',
    secResDoc: '이사회 결과 문서 보관',
    secMarks: '부서별 확인',
    schedNone: '아직 등록한 이사회 일정이 없습니다.',
    schedNeedDoc: '이사회 자료가 확정된 뒤에 결과를 등록합니다.',
    schedResultSet: '의결 결과가 등록됐습니다. 개최일은 8단계 \'이사회 개최 및 결과\'에서 고칩니다.',
    // 샘플을 받으면 이어서 만들 것(사용자 11-25: 잊지 않게 화면에 적어 둔다)
    needTag: '샘플 필요!',
    needSummary: '\'기관 선정 입찰참여 관련 요약\' Word 양식 샘플(1쪽 추진배경·기대효과, 2쪽 선정 평가표)을 받으면 아래 양식을 그 구성으로 바꿉니다.',
    // 7단계 이사회 발표 대본 Word(NEXT 113 ⑤, design-reviewer 11-26 1107_a6e734b8) — 서버에 저장하지 않고 만들어 바로 내려받는다
    scriptHint: '이사회 자료의 숫자와 기관 정보를 넣어 발표 대본 Word 초안을 만듭니다.',
    scriptTaskNote: '대본을 다 쓰고 나면 아래 과제에서 [완료로 표시]를 누르세요.',
    scriptOpen: '대본 Word 만들기…',
    scriptLater: '담당자 지정 뒤에 만들 수 있습니다.',
    scriptViewNote: '이사회 숫자(승인 금액·순이익)는 담당 영업과 영업부장에게만 채워집니다. 지금 만들면 그 자리가 〔확인 필요〕로 남습니다.',
    scriptBoardOk: function (n) { return '숫자는 확정된 이사회 자료(버전 ' + n + ')에서 가져옵니다.'; },
    scriptBoardDraft: function (n) { return '이사회 자료가 아직 확정 전이라, 지금 버전(' + n + ')의 숫자로 \'[확정 전 초안]\' 대본이 만들어집니다.'; },
    scriptBoardNone: '이사회 자료가 없어 승인 금액·순이익 자리는 〔이사회 자료 없음 — 확인 필요〕로 남습니다.',
    scriptBoardErr: '이사회 자료 상태를 불러오지 못했습니다. 만들 수는 있지만 숫자 자리가 비어 나올 수 있습니다.',
    scriptTitle: function (name) { return '발표 대본 Word 만들기 — ' + name; },
    scriptGo: 'Word 만들기',
    scriptBusy: '만드는 중…',
    scriptCancel: '취소',
    scriptHint1: '모든 칸은 선택입니다. 비운 칸은 Word에 〔… 입력 필요〕로 남아 Word에서 채울 수 있습니다.',
    scriptHint2: '적은 내용은 저장되지 않습니다. 이 건을 보는 동안만 창에 남아 있습니다.',
    scriptAutoHead: '만들 때 자동으로 들어가는 값',
    scriptAutoNote: '값이 없거나 볼 수 없으면 숫자를 지어내지 않고 〔… 확인 필요〕로 남깁니다.',
    scriptBusyLine: '대본 Word를 만드는 중…',
    scriptDone: '대본 Word를 내려받았습니다. 〔…〕로 남은 자리는 Word에서 채우세요.',
    scriptDoneDraft: '대본 Word를 [확정 전 초안]으로 만들었습니다. 이사회 자료나 기관 선정 입찰참여 관련 요약이 아직 확정 전입니다. 확정한 뒤 다시 만들면 \'[확정 전 초안]\'이 빠집니다.',
    scriptErrRound: '차수는 1~999 사이 숫자로 적으세요.',
    scriptErrTerm: '약정기간은 1~30 사이 숫자(년)로 적으세요.',
    scriptErrMeeting: '회의 이름을 다시 고르세요.',
    scriptErrAmount: '승인 금액 기준을 다시 고르세요.',
    scriptErrShort: function (label, max) { return label + scriptEunNeun(label) + ' ' + max + '자까지 적을 수 있습니다.'; },
    scriptErrArea: function (label) { return label + ' 칸은 12줄, 한 줄 300자, 합계 1,000자까지 적을 수 있습니다.'; },
    scriptErrLines: function (n) { return '12줄까지 적을 수 있습니다(지금 ' + n + '줄).'; },
    scriptErrLineLen: function (k, n) { return '한 줄은 300자까지입니다(' + k + '번째 줄이 ' + n + '자).'; },
    scriptErrTotal: '1,000자까지 적을 수 있습니다.',
    scriptErr400: '대본 Word를 만들지 못했습니다. 보낸 값을 서버가 받지 않았습니다. 창을 닫았다가 다시 여세요.',
    scriptErr401: '로그인이 풀렸습니다. 다시 로그인한 뒤 만드세요.',
    scriptErr403: '대본 Word를 만들지 못했습니다. 이 사번은 지금 쓸 수 없습니다(비활성·미등록). 시스템 관리자에게 문의하세요.',
    scriptErr404: '대본 Word를 만들지 못했습니다. 이 건을 볼 수 없거나 없어진 건입니다. [← 제안 준비 현황으로] 돌아가 다시 여세요.',
    scriptErr413: '대본 Word를 만들지 못했습니다. 적은 글이 너무 깁니다. 기관별 서술 칸을 줄인 뒤 다시 누르세요.',
    scriptErr500: '대본 Word를 만들지 못했습니다. 서버에서 오류가 났습니다. 잠시 뒤 다시 누르고, 계속되면 개발부서에 알려 주세요.',
    // 3단계 선정 평가표(공고 원본에서 글자 그대로 옮겨 옴 — LLM 없음)
    secScoring: '선정 평가표 (공고 원본에서 옮겨 옴)',
    scLoading: '공고 원본에서 선정 평가표를 찾는 중…',
    scErr: '선정 평가표를 불러오지 못했습니다. 잠시 뒤 화면을 다시 여세요.',
    scNoFile: '아직 읽을 공고 원본이 없습니다. 2단계 \'입찰공고확인\'에서 공고문·제안요청서를 HWPX나 PDF로 올리면 여기에 평가표가 나타납니다.',
    scNotFound: function (n) { return '올려 둔 파일 ' + n + '개에서 배점 표를 찾지 못했습니다. 평가표가 든 파일(신청 안내서·제안요청서)을 HWPX로 올려 보세요. 그림으로 된(스캔) PDF는 읽지 못합니다.'; },
    scFrom: function (file, page) { return '출처: ' + file + (page ? ' · ' + page + '쪽' : ''); },
    scTotal: function (n) { return '총점 ' + n + '점'; },
    scCheck: '파일의 글자를 그대로 옮긴 것입니다. 원문과 대조해 확인하세요.',
    scLines: '이 파일(PDF)은 표의 칸 구분을 알 수 없어 줄 단위로 옮겼습니다. HWPX로 올리면 표 모양 그대로 나옵니다.',
    scHidden: '선정 평가표는 담당 영업·영업팀장·영업부장에게 보입니다.',
    schedNoMat: '이사회 자료가 만들어진 뒤에 등록합니다.',
    schedView: '일정·결과는 이 기관의 담당 영업이 등록합니다.',
    schedSave: '일정 등록',
    schedEdit: '일정 바꾸기',
    schedDate: '이사회 날짜',
    resNone: '아직 등록한 결과가 없습니다.',
    resSave: '결과 등록',
    resLabel: '의결 결과',
    resDate: '개최일',
    resNames: { SCHEDULED: '의결 예정', PASSED: '가결', REJECTED: '부결' },
    addFilesHint: '이사회에 함께 올리는 설명 자료·별첨을 올려 둡니다. PDF·HWPX·DOCX·XLSX.',
    addFilesEmpty: '아직 올린 추가 자료가 없습니다.',
    resFilesHint: '이사회 의결서·결과 통보 같은 결과 문서를 올려 보관합니다. PDF·HWPX·DOCX·XLSX.',
    resFilesEmpty: '아직 올린 결과 문서가 없습니다.',
    filesLater: '담당자 지정이 끝나면 담당 영업이 올리고, 담당 영업·영업팀장·영업부장이 봅니다.',
    nextAskTitle: '다음 단계로',
    nextAsk: function (label) { return '현재 상태를 저장하고 다음 단계(' + label + ')로 넘어갑니다.'; },
    nextNo: '닫기',
    nextOk: '확인',
    noticeGuide: '이 화면에서는 고치지 않습니다. 고칠 것이 있으면 아래 화면 중 한 곳에서 고친 뒤 돌아오세요.',
    noticeNav: [['board', '입찰 현황판'], ['notice', '입찰 공고 현황']],
    noticeOk: '공고 자료(입찰 예정일·공고일·접수 마감일·공고 링크)에 빠진 것이 없습니다. [다음]을 누르면 \'확인 완료\'로 기록됩니다(누가·언제 확인했는지 남습니다).',
    noticeOkView: '공고 자료(입찰 예정일·공고일·접수 마감일·공고 링크)에 빠진 것이 없습니다. 확인 기록은 이 기관의 담당 영업이 [다음]을 누를 때 남습니다.',
    noticeNote: function (n) { return '공고 자료(입찰 예정일·공고일·접수 마감일·공고 링크)에 빠진 것은 없습니다. 위에 붉게 표시한 ' + n + '건은 확인만 하면 되고, [다음]을 누르면 \'확인 완료\'로 기록됩니다.'; },
    noticeNoteView: function (n) { return '공고 자료(입찰 예정일·공고일·접수 마감일·공고 링크)에 빠진 것은 없습니다. 위에 붉게 표시한 ' + n + '건을 확인하세요. 확인 기록은 이 기관의 담당 영업이 [다음]을 누를 때 남습니다.'; },
    noticeGapsNo: '이 항목들이 남아 있으면 [다음]으로 넘어가도 확인으로 기록되지 않습니다.',
    noticeUndo: '확인 취소',
    stNoticeTodo: '확인 전',
    noticeGapsHead: function (n) { return '확인이 필요한 항목 ' + n + '건'; },
    noticeNoRec: '이 기관의 입찰 공고 자료를 찾지 못했습니다. 입찰 공고 현황에서 기관을 확인하세요.',
    noticeLoading: '입찰 공고 자료를 불러오는 중…',
    stNoticeOk: '확인 완료',
    stNoticeGap: '확인 필요',
    stTodo: '할 일',
    stWait: '승인 대기',
    stDone: '완료',
    stWriting: '작성 중',
  };
  pt.T = T;

  // ── 칸 값 읽기 ───────────────────────────────────────────────────
  const MARK_CODES = ['DONE', 'IN_PROGRESS', 'NA', 'NONE'];
  // → { mark, name, glyph, date(YYYY-MM-DD), by, notice, revNo }
  pt.cellState = function (row, cd, marks) {
    const c = row && row.cells && row.cells[cd] && typeof row.cells[cd] === 'object' ? row.cells[cd] : {};
    const m = MARK_CODES.indexOf(c.mark_cd) >= 0 ? c.mark_cd : 'NONE';
    return { mark: m, name: pb.markName(marks, m), glyph: pb.glyphKind(m), date: pb.fullDate(c.marked_on), by: str(c.by_name).trim(),
             notice: str(c.notice_status_name).trim(), revNo: Number(c.rev_no) || 0 };
  };
  pt.groupCount = function (row, s) {
    const subs = s && s.subs ? s.subs : [];
    const st = subs.map(function (x) { return pt.cellState(row, x.cd).mark; });
    return { done: st.filter(function (k) { return k === 'DONE'; }).length, na: st.filter(function (k) { return k === 'NA'; }).length,
             touched: st.filter(function (k) { return k !== 'NONE'; }).length, total: subs.length };
  };
  function tasksOf(view, s) {
    const by = prep.tasksByCd((view && view.tasks) || []);
    return (s.tasks || []).map(function (cd) { return by[cd]; }).filter(Boolean);
  }
  // 체크할 수 있는가 — 서버 can_check(담당 영업)·끝난 건·개설 전을 그대로 따른다. → { can, why }
  pt.markGate = function (view, row, rowState) {
    if (!row) return { can: false, why: rowState === 'loading' ? T.rowLoading : T.noRow };
    if (row.ended || (view && view.state_cd === 'CANCELLED')) return { can: false, why: T.ended };
    const sc = view && view.state_cd ? str(view.state_cd) : str(row.state_cd);
    if (pb.PRE_OPEN_STATES.indexOf(sc) >= 0) return { can: false, why: pb.T.infoPre };
    if (row.can_check !== true) return { can: false, why: pb.T.infoNotMine };
    return { can: true, why: '' };
  };

  // 입찰공고확인 판정: true(누락 없음)·false(확인 필요)·undefined(아직 모름 — 공고 자료를 못 봄)
  pt.noticeOk = function (row) {
    const c = row && row.cells && row.cells.NOTICE_CHECK;
    return c && typeof c.notice_ok === 'boolean' ? c.notice_ok : undefined;
  };
  // 표의 그 줄을 못 받았으면 입찰공고확인 단계를 '지금 할 단계'·구간 숫자·안내에서 뺀다(확인했는지 알 수 없다).
  function skipNotice(s, row) { return s.kind === 'notice' && !row; }
  // [다음]을 누를 때 '확인'을 적어야 하는가 — 입찰공고확인 단계이고, 체크할 수 있는 담당이고, 누락·미확인이 없고, 아직 확인 전일 때만.
  pt.noticeConfirmDue = function (idx, view, row, rowState, notice) {
    const s = pt.STEPS[pt.clampIdx(idx)];
    if (s.kind !== 'notice' || !notice || notice.state !== 'ok' || (notice.gaps || []).length) return false;
    return pt.markGate(view, row, rowState).can && pt.cellState(row, s.cd).mark !== 'DONE';
  };
  // 공고 자료(dashboard.js의 항목 it)에서 누락·미확인 항목 이름을 뽑는다. o: { hasLink, unhandled(예정일이 지났는데 공고 상태 기록이 없음) }
  pt.noticeGaps = function (it, o) {
    const x = o || {};
    if (!it) return ['입찰 공고 자료 없음'];
    const g = [];
    if (it.unknown) g.push('입찰 예정일 미상');
    if (it.check) g.push('공고일 확인 필요');
    if (it.notice && !it.receiveTo) g.push('접수 마감일 미확인');
    if (it.notice && !x.hasLink) g.push('공고 링크 없음');
    if (x.unhandled) g.push('예정일이 지났는데 공고 상태 기록이 없음');
    return g;
  };

  // 2단계 '확인 항목' 줄(사용자 11-25): 공고 진행과 공고 원본 파일. 마감·입찰 없음처럼 꼭 알아야 하는 사실과 원본 파일 없음은 bad(붉은 글씨).
  //   ns = logic.noticeState 결과(없으면 null), recCd = 담당자가 적은 공고 상태 기록 코드, files = { known, n }, o = { canUpload }
  // → [{ label, text, bad }]. bad는 '확인 필요'(gaps)와 다르다 — 넘어가는 것을 막지 않고 사실만 알린다.
  //   inst = { bank, term, chief } — 기관 정보의 값이 있으면 true, '미확인'이면 false, 아직 못 불러왔으면 undefined(셈에서 뺀다). false인 것만 붉은 줄을 더한다(값이 있으면 줄 없음).
  pt.noticeChecks = function (ns, recCd, files, o, inst) {
    const x = o || {}, fl = files || {};
    const out = [];
    const rec = T.progRec[str(recCd)];
    if (rec) out.push({ label: T.chkProgress, text: rec, bad: true });
    else if (!ns) out.push({ label: T.chkProgress, text: T.progNone, bad: false });
    else if (ns.phase === 'receiving') {
      const dl = Number(ns.deadlineDays);
      out.push({ label: T.chkProgress, text: T.progReceiving(str(ns.receiveTo), dl === 0 ? 'D-day' : dl > 0 ? 'D-' + dl : ''), bad: false });
    } else if (ns.phase === 'awaiting') out.push({ label: T.chkProgress, text: T.progPast(str(ns.receiveTo)), bad: true });
    else if (ns.late) out.push({ label: T.chkProgress, text: T.progLate(Number(ns.since) || 0), bad: true });
    else out.push({ label: T.chkProgress, text: T.progUnknown(Number(ns.since) || 0), bad: false });
    if (!fl.known) out.push({ label: T.chkFile, text: T.fileUnknown, bad: false });
    else if (Number(fl.n) > 0) out.push({ label: T.chkFile, text: T.fileHas(Number(fl.n)), bad: false });
    else out.push({ label: T.chkFile, text: x.canUpload ? T.fileNone : T.fileNoneView, bad: true });
    const ii = inst || {};
    if (ii.bank === false) out.push({ label: T.chkBank, text: T.instUnknown, bad: true });
    if (ii.term === false) out.push({ label: T.chkTerm, text: T.instUnknown, bad: true });
    if (ii.chief === false) out.push({ label: T.chkChief, text: T.instUnknown, bad: true });
    return out;
  };
  // 체크 모양(네모 안의 ✓) — 글자색을 따른다.
  pt.CK_SVG = '<svg class="ts-ck" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.4 8.3l2.4 2.4 4.8-5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  pt.noticeChecksHtml = function (checks) {
    const list = Array.isArray(checks) ? checks : [];
    if (!list.length) return '';
    return '<div class="ts-chk" role="group" aria-label="' + esc(T.chkHead) + '"><ul>' + list.map(function (c) {
      return '<li' + (c.bad ? ' class="is-bad"' : '') + '>' + pt.CK_SVG + '<span class="ts-chk-l">' + esc(c.label) + '</span><span class="ts-chk-t">' + esc(c.text) +
        (c.bad ? '<span class="sr-only"> (확인하세요)</span>' : '') + '</span></li>';
    }).join('') + '</ul></div>';
  };

  // ── 단계 상태(왼쪽 목록의 글리프·구간 숫자·'지금 할 단계') ────────────
  // → { glyph: 'done'|'prog'|'na'|'', text, cnt, closed(끝났거나 대상 아님) }
  pt.stepState = function (s, view, row, marks) {
    const v = view || {};
    const out = { glyph: '', text: '', cnt: '', closed: false };
    function fromCell(cd) {
      const c = pt.cellState(row, cd, marks);
      out.glyph = c.glyph; out.text = c.name; out.closed = c.mark === 'DONE' || c.mark === 'NA';
      return c;
    }
    if (s.kind === 'start') {
      const sc = str(v.state_cd);
      if (sc === 'CONFIRMED' || sc === '') out.text = T.stTodo;
      else if (sc === 'OPEN_PENDING') { out.glyph = 'prog'; out.text = T.stWait; }
      else if (sc === 'CANCELLED') out.text = '';
      else { out.glyph = 'done'; out.text = T.stDone; out.closed = true; }
    } else if (s.kind === 'notice') {
      // 입찰 공고 자료에 누락·미확인이 없으면 완료(사용자 11-25). 판정(notice_ok)은 prep.js가 공고 자료를 보고 그 줄에 적어 둔다 — 모르면 상태 없음.
      // 완료 = 담당 영업이 [다음]으로 확인을 적은 것(서버 칸 mark DONE — 누가·언제 이력). 누락·미확인이 있으면 '확인 필요'.
      const ok = pt.noticeOk(row);
      const cs = pt.cellState(row, s.cd, marks), nm = cs.notice;
      if (cs.mark === 'DONE') { out.glyph = 'done'; out.closed = true; out.text = (nm ? nm + ', ' : '') + T.stNoticeOk; }
      else if (ok === false) out.text = (nm ? nm + ', ' : '') + T.stNoticeGap;
      else out.text = (nm ? nm + ', ' : '') + T.stNoticeTodo;
    } else if (s.kind === 'group') {
      const g = pt.groupCount(row, s);
      out.cnt = '완료 ' + g.done + '/' + g.total;
      out.closed = g.total > 0 && g.done + g.na === g.total;
      out.glyph = out.closed ? (g.done > 0 ? 'done' : 'na') : g.touched > 0 ? 'prog' : '';
      out.text = out.cnt;
    } else if (s.kind === 'manual') {
      fromCell(s.cd);
    } else if (s.kind === 'proposal') {
      const c = fromCell(s.cd);
      if (c.mark === 'NONE' && v.state_cd === 'WRITING') { out.glyph = 'prog'; out.text = T.stWriting; }
    } else {   // auto·board — 과제 상태가 먼저, 과제가 아직 없으면(담당자 지정 전) 표의 칸
      // 선택 과제(이사회 발표 대본)는 필수 과제와 한 단계에 있을 때 단계의 끝남을 막지 않는다.
      const live = tasksOf(v, s).filter(function (t) { return t.state !== 'PREPARING'; });
      const must = live.filter(function (t) { return t.kind_cd !== 'OPTIONAL'; });
      const ts = must.length ? must : live;
      if (ts.length) {
        const done = ts.filter(function (t) { return t.state === 'DONE'; }).length;
        const na = ts.filter(function (t) { return t.state === 'NOT_APPLICABLE'; }).length;
        out.closed = done + na === ts.length;
        out.glyph = out.closed ? (done > 0 ? 'done' : 'na') : done > 0 ? 'prog' : '';
        out.text = out.closed ? (done > 0 ? T.stDone : prep.T.na) : T.stTodo;
        if (ts.length > 1) out.cnt = '완료 ' + done + '/' + ts.length;
      } else if (s.cd) fromCell(s.cd);
    }
    return out;
  };
  // 처음 열 때 보일 단계 = 순서대로 가다 처음 만나는 '안 끝난 단계'(읽기만 하는 입찰공고확인은 건너뛴다). 다 끝났으면 마지막 단계.
  pt.defaultIdx = function (view, row, marks) {
    if (view && view.state_cd === 'CANCELLED') return 0;
    for (let i = 0; i < pt.STEPS.length; i += 1) {
      const s = pt.STEPS[i];
      if (skipNotice(s, row)) continue;
      if (!pt.stepState(s, view, row, marks).closed) return i;
    }
    return pt.STEPS.length - 1;
  };
  // 제안서 작성 전에 끝나 있어야 하는 '입찰 자료확인' 구간의 안 끝난 단계 이름(사용자 11-25: 업무상 그렇게 되므로 시스템은 막지 않고 알리기만 한다).
  // 표의 그 줄을 못 받았으면 손 칸의 값을 모르므로 빈 목록(잘못 알리지 않는다). 읽기만 하는 입찰공고확인과 선택 과제인 이사회 발표 대본은 뺀다.
  pt.openBefore = function (view, row, marks) {
    if (!row) return [];
    return pt.STEPS.filter(function (s) { return s.ph === 'bid' && !skipNotice(s, row) && s.kind !== 'script' && !pt.stepState(s, view, row, marks).closed; })
      .map(function (s) { return s.label; });
  };
  // 구간 단추를 눌렀을 때 갈 단계 = 그 구간의 첫 '안 끝난 단계', 없으면 구간 첫 단계
  pt.phaseEntryIdx = function (key, view, row, marks) {
    const ids = pt.phaseIdxs(key);
    if (!ids.length) return 0;
    for (let k = 0; k < ids.length; k += 1) {
      const s = pt.STEPS[ids[k]];
      if (!skipNotice(s, row) && !pt.stepState(s, view, row, marks).closed) return ids[k];
    }
    return ids[0];
  };

  // ── 구간 줄 ──────────────────────────────────────────────────────
  // → [{ key, label, no, done, total, current }] — 숫자는 '끝난 단계 / 구간 단계'(읽기만 하는 입찰공고확인은 세지 않는다)
  pt.phaseModel = function (view, row, marks, idx) {
    const cur = pt.phaseOf(idx);
    return pt.PHASES.map(function (p, n) {
      const steps = pt.STEPS.filter(function (s) { return s.ph === p.key && !skipNotice(s, row); });
      return { key: p.key, label: p.label, no: n + 1, total: steps.length, current: p.key === cur,
               done: steps.filter(function (s) { return pt.stepState(s, view, row, marks).closed; }).length };
    });
  };
  pt.phasesHtml = function (model) {
    return '<div class="ts-phases" role="group" aria-label="' + esc(T.phasesNav) + '">' + model.map(function (p) {
      return '<button type="button" class="ts-phase" data-act="ts-phase" data-ph="' + esc(p.key) + '" aria-pressed="' + (p.current ? 'true' : 'false') + '">' +
        '<span class="ts-pno">' + p.no + '</span><span class="ts-pname">' + esc(p.label) + '</span>' +
        '<span class="ts-cnt">' + p.done + '/' + p.total + '<span class="sr-only"> 단계 완료</span></span></button>';
    }).join('') + '</div>';
  };

  // ── 단계 목록(지금 구간만) ────────────────────────────────────────
  // → [{ i, no, id, label, ro, glyph, sr, cnt, current }]
  pt.stepsModel = function (view, row, marks, idx) {
    const cur = pt.clampIdx(idx);
    return pt.phaseIdxs(pt.phaseOf(cur)).map(function (i) {
      const s = pt.STEPS[i];
      const st = pt.stepState(s, view, row, marks);
      return { i: i, no: i + 1, id: s.id, label: s.label, ro: s.kind === 'notice', glyph: st.glyph, sr: st.cnt ? '' : st.text, cnt: st.cnt, current: i === cur };
    });
  };
  // 목록은 탭 정지 1개(roving) — 지금 단계가 탭 정지다.
  pt.stepsHtml = function (model) {
    return '<ol>' + model.map(function (m) {
      return '<li><button type="button" class="ts-step' + (m.ro ? ' is-ro' : '') + '" data-i="' + m.i + '" tabindex="' + (m.current ? '0' : '-1') + '"' + (m.current ? ' aria-current="step"' : '') + '>' +
        '<span class="ts-no">' + m.no + '</span><span class="ts-gl">' + pb.glyphSvg(m.glyph) + '</span><span class="ts-name">' + esc(m.label) + '</span>' +
        '<span class="ts-cnt">' + esc(m.cnt) + '</span>' + (m.sr ? '<span class="sr-only">, ' + esc(m.sr) + '</span>' : '') + '</button></li>';
    }).join('') + '</ol>';
  };
  // ↑↓·Home·End → 포커스를 옮길 단계 번호(같은 구간 안). 그 밖의 키는 null.
  pt.stepKey = function (i, key) {
    const ids = pt.phaseIdxs(pt.phaseOf(i));
    const k = ids.indexOf(pt.clampIdx(i));
    switch (key) {
      case 'ArrowDown': return ids[Math.min(ids.length - 1, k + 1)];
      case 'ArrowUp': return ids[Math.max(0, k - 1)];
      case 'Home': return ids[0];
      case 'End': return ids[ids.length - 1];
      default: return null;
    }
  };
  // 바뀐 단계 알림(sr-only role=status): "{기관}, {구간} {n}단계 {이름}, {상태}"
  pt.liveText = function (view, row, marks, idx) {
    const i = pt.clampIdx(idx);
    const s = pt.STEPS[i];
    const st = pt.stepState(s, view, row, marks);
    const name = str(view && view.institution_name) || str(row && row.institution_name);
    return name + ', ' + pt.phaseLabel(s.ph) + ' ' + (i + 1) + '단계 ' + s.label + (st.text ? ', ' + st.text : '');
  };

  // ── 본문 조각 ────────────────────────────────────────────────────
  function note(text) { return text ? '<p class="ts-note">' + esc(text) + '</p>' : ''; }
  function stateSpan(c) {
    return '<span class="ts-cell">' + (pb.glyphSvg(c.glyph) || '<span class="pb-g"></span>') + '<span>' + esc(c.name) + '</span></span>';
  }
  function lastLine(c) {
    return c.mark !== 'NONE' && c.date ? T.lastCheck(c.date, c.by) : pb.T.infoNoCheck;
  }
  // 상태 단추 한 줄. o: { can, busy }
  pt.marksHtml = function (cd, label, c, marks, o) {
    const x = o || {};
    if (!x.can) return stateSpan(c);
    const order = (Array.isArray(marks) && marks.length ? marks.map(function (k) { return k.mark_cd; }) : pb.MARK_ORDER)
      .filter(function (k) { return MARK_CODES.indexOf(k) >= 0; });
    return '<div class="ts-marks" role="group" aria-label="' + esc(label + ' 상태') + '">' + order.map(function (k) {
      return '<button type="button" class="ts-mk" data-act="mark" data-col="' + esc(cd) + '" data-mk="' + k + '" aria-pressed="' + (k === c.mark ? 'true' : 'false') + '"' +
        (x.busy ? ' aria-disabled="true"' : '') + '>' + (pb.glyphSvg(pb.glyphKind(k)) || '<span class="pb-g"></span>') + '<span>' + esc(pb.markName(marks, k)) + '</span></button>';
    }).join('') + (x.busy ? '<span class="ts-saving">' + esc(T.saving) + '</span>' : '') + '</div>';
  };
  function markBlock(m, s, gate) {
    const busy = m.markBusy || {};
    if (s.kind === 'group') {
      return '<ul class="ts-subs">' + s.subs.map(function (x) {
        const c = pt.cellState(m.row, x.cd, m.marks);
        return '<li data-col="' + esc(x.cd) + '"><span class="ts-sl">' + esc(x.label) + '</span>' +
          pt.marksHtml(x.cd, s.label + ' › ' + x.label, c, m.marks, { can: gate.can, busy: !!busy[x.cd] }) +
          '<span class="ts-last">' + esc(lastLine(c)) + '</span></li>';
      }).join('') + '</ul>';
    }
    const c = pt.cellState(m.row, s.cd, m.marks);
    return '<div class="ts-markrow" data-col="' + esc(s.cd) + '">' + pt.marksHtml(s.cd, s.label, c, m.marks, { can: gate.can, busy: !!busy[s.cd] }) +
      '<span class="ts-last">' + esc(lastLine(c)) + '</span></div>';
  }
  function tasksBlock(m, s) {
    const v = m.view || {};
    const all = Array.isArray(v.tasks) ? v.tasks : [];
    const by = prep.tasksByCd(all);
    const mine = (s.tasks || []).filter(function (cd) { return !!by[cd]; });
    if (!all.length) return (s.tasks || []).length && pb.PRE_OPEN_STATES.indexOf(str(v.state_cd)) >= 0
      ? note(prep.isNewStartFlow(v.viewer) ? prep.T.tasksLaterStart : prep.T.tasksLater) : '';
    if (!mine.length) return '';
    const vw = v.viewer || {};
    let h = '';
    if (prep.TASK_STATES.indexOf(v.state_cd) >= 0 && !vw.is_assignee) h += note(prep.T.readonly);
    return h + '<ol class="pp-tasks" aria-label="준비 과제">' + mine.map(function (cd) {
      return prep.taskItemHtml(prep.taskModel(by[cd], by, vw, all.indexOf(by[cd])), m);
    }).join('') + '</ol>';
  }
  // ── 3단계 기관 정보 분석: 펼침형(사용자 11-25 시안 B) ──────────────────
  // 과제마다 내용을 본문에 펼쳐 보이고(길면 그 안에서 스크롤), [수정하기]로 고친 뒤 [완료로 표시]. 완료한 과제는 한 줄로 접히고 [다시 보기]로 편다.
  // '기관 정보 요약' 양식(서버 GET …/prep/forms/INST_SUMMARY 응답)을 읽기용 표로. 값은 모두 이스케이프한다.
  pt.summaryHtml = function (view) {
    const isn = isNode ? require('./instsummary.js') : root.instSummary;
    if (!isn || !view || !view.tpl) return '';
    if (!(Number(view.cur_ver) > 0)) return note(T.sumEmpty);
    const m = isn.modelFromView(view);
    const f = (view.content && view.content.fields) || {};
    let h = '', rows = [];
    function flush() {
      if (rows.length) h += '<table class="ts-doc"><tbody>' + rows.join('') + '</tbody></table>';
      rows = [];
    }
    function lines(a) { return a.filter(function (x) { return str(x).trim() !== ''; }).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }
    (Array.isArray(view.tpl.keys) ? view.tpl.keys : []).forEach(function (k) {
      if (!k || !k.key) return;
      const label = str(k.label) || str(k.key);
      if (k.key === 'biz') {
        flush();
        const body = m.biz.map(function (r) { return '<tr><th scope="row">' + esc(r.group) + '</th><td>' + esc(r.sub) + '</td><td><ul>' + lines(r.lines) + '</ul></td></tr>'; }).join('');
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>' + (body ? '<table class="ts-doc"><tbody>' + body + '</tbody></table>' : note(T.sumNone));
      } else if (k.key === 'fund') {
        flush();
        const body = m.fund.map(function (r) {
          return '<tr><th scope="row">' + esc(r.kind) + '</th><td><ul>' + lines(r.lines.map(function (x) { return (x.lv === 1 ? '- ' : '') + x.text; })) + '</ul></td></tr>';
        }).join('');
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>' + (body ? '<table class="ts-doc"><tbody>' + body + '</tbody></table>' : note(T.sumNone));
      } else if (k.key === 'years') {
        flush();
        const y = m.years;
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>';
        if (!y) { h += note(T.sumNone); return; }
        const ys = Object.keys(Object.assign({}, y.mmda, y.income)).sort();
        h += ys.length ? '<table class="ts-doc ts-doc-y"><thead><tr><th scope="col">(' + esc(y.unit) + ')</th>' + ys.map(function (yy) { return '<th scope="col">' + esc(yy) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          [['mmda', 'MMDA 연평잔'], ['income', '자금수익']].map(function (r) {
            return '<tr><th scope="row">' + r[1] + '</th>' + ys.map(function (yy) { return '<td class="m">' + esc(y[r[0]][yy] || '') + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table>' : note(T.sumNone);
        const nt = lines(y.notes);
        if (nt) h += '<ul class="ts-doc-l">' + nt + '</ul>';
      } else if (k.kind === 'LIST') {
        flush();
        const li = lines(m.lists[k.key] || []);
        h += '<h4 class="ts-doc-h">' + esc(label) + '</h4>' + (li ? '<ul class="ts-doc-l">' + li + '</ul>' : note(T.sumNone));
      } else {   // TEXT·FACT — 이름표와 값 한 줄
        const x = f[k.key] && typeof f[k.key] === 'object' ? f[k.key] : {};
        const val = str(x.val).trim(), nt = str(x.note).trim();
        rows.push('<tr><th scope="row">' + esc(label) + '</th><td>' + (val ? esc(val) : '<span class="ts-note">' + esc(T.sumNone) + '</span>') +
          (nt ? ' <span class="ts-note">(' + esc(nt) + ')</span>' : '') + '</td></tr>');
      }
    });
    flush();
    return h;
  };
  // m.docs = { T1: { state: 'loading'|'ok'|'err', html }, T2: {…} } — prep.js가 채운다. m.foldOpen = { T1: true } — 완료한 과제를 다시 편 상태.
  function foldBlock(m, s) {
    const v = m.view || {};
    const all = Array.isArray(v.tasks) ? v.tasks : [];
    const by = prep.tasksByCd(all);
    const mine = (s.tasks || []).filter(function (cd) { return !!by[cd]; });
    if (!all.length || !mine.length) return tasksBlock(m, s);
    const vw = v.viewer || {};
    const docs = m.docs || {}, fo = m.foldOpen || {};
    let h = prep.TASK_STATES.indexOf(v.state_cd) >= 0 && !vw.is_assignee ? note(prep.T.readonly) : note(T.foldHint);
    return h + '<ol class="pp-tasks ts-folds" aria-label="준비 과제">' + mine.map(function (cd) {
      const t = prep.taskModel(by[cd], by, vw, all.indexOf(by[cd]));
      const d = docs[cd] || {};
      if (t.act === 'check') t.sub = T.foldCheckHint;   // 옛 문구('작성 화면은 준비 중')를 대신한다
      const live = t.state === 'TODO' || t.state === 'DONE';
      const open = live && (t.state !== 'DONE' || !!fo[cd]);
      let acts = '';
      const wnote = live && vw.is_assignee && d.empty && cd === 'T1';   // 판이 없을 때만 — [작성 시작]이 첫 판을 바로 저장한다고 알린다
      const wnId = 'ts-wn-' + cd;
      if (live && vw.is_assignee) acts += '<button type="button" class="pp-act" data-act="doc-edit" data-task="' + esc(cd) + '"' + (wnote ? ' aria-describedby="' + wnId + '"' : '') + ' aria-label="\'' + esc(t.name) + '\' ' + esc(d.empty ? T.docWrite : T.docEdit) + '">' + esc(d.empty ? T.docWrite : T.docEdit) + '</button>';
      if (t.state === 'DONE') acts += '<button type="button" class="pp-act" data-act="doc-toggle" data-task="' + esc(cd) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' + esc(open ? T.docFold : T.docShow) + '</button>';
      const wn = wnote ? '<p class="ts-note" id="' + wnId + '">' + esc(T.docWriteNote) + '</p>' : '';
      const body = wn + (!open ? '' : '<div class="ts-fold" tabindex="0" role="region" aria-label="' + esc(t.name + ' 내용') + '">' +
        (d.state === 'ok' ? str(d.html) || note(T.sumNone) : note(d.state === 'err' ? T.docErr : T.docLoading)) + '</div>');
      return prep.taskItemHtml(t, m, { acts: acts, tail: body });
    }).join('') + '</ol>';
  }

  // ── 7단계 이사회 자료 작성: 이 건의 이사회 자료(수익성 분석표가 채운 결과)를 읽기용으로 ──
  // b = { state: 'loading'|'ok'|'none'|'err', id, statusName, snapNo, saved, confirmed, html } — prep.js stepBoard가 만든다(html은 board-material.js readOnlyHtml).
  pt.boardBlockHtml = function (b) {
    const x = b || {};
    const go = function (label, id, strong) {
      return '<div class="ts-acts"><button type="button"' + (strong ? ' class="pp-next-btn"' : '') + ' data-act="to-board-doc"' + (id != null ? ' data-mat="' + esc(id) + '"' : '') + '>' + esc(label) + '</button></div>';
    };
    if (x.state === 'ok') {
      return '<dl class="ts-facts"><div><dt>자료 상태</dt><dd>' + esc(x.statusName || '') + '</dd></div>' +
        '<div><dt>버전</dt><dd><span class="m">' + (Number(x.snapNo) || 0) + '</span></dd></div>' +
        (x.saved ? '<div><dt>마지막 저장</dt><dd>' + esc(x.saved) + '</dd></div>' : '') + '</dl>' +
        note(x.confirmed ? T.boardConfirmed : T.boardCheckHint) +
        go(x.confirmed ? T.openBoardMat : T.boardGoCheck, x.id, !x.confirmed) +
        '<div class="ts-fold ts-board" tabindex="0" role="region" aria-label="이사회 자료 내용">' + (str(x.html) || note(T.sumNone)) + '</div>';
    }
    if (x.state === 'none') return note(T.boardNone) + go(T.openBoard, null, false);
    if (x.state === 'err') return note(T.boardErr) + go(T.openBoard, null, false);
    return note(T.docLoading);
  };

  function need(text) { return '<p class="ts-need" role="note"><b>' + esc(T.needTag) + '</b><span>' + esc(text) + '</span></p>'; }
  // 3단계 선정 평가표: sc = { state: 'loading'|'ok'|'err'|'hidden', data: GET …/prep/notice-scoring 응답 }. 값은 모두 이스케이프한다.
  pt.scoringHtml = function (sc) {
    const x = sc || {};
    if (x.state === 'hidden') return note(T.scHidden);
    if (x.state === 'err') return note(T.scErr);
    if (x.state !== 'ok' || !x.data) return note(T.scLoading);
    const d = x.data;
    if (d.found !== true) return note(d.reason === 'NO_FILE' ? T.scNoFile : T.scNotFound(Number(d.files) || 0));
    const rows = (Array.isArray(d.rows) ? d.rows : []).filter(Array.isArray);
    const cell = function (v) { return esc(str(v)).replace(/\n/g, '<br>'); };
    const lines = d.kind !== 'TABLE';
    const body = rows.map(function (r, i) {
      const tag = !lines && i === 0 ? 'th scope="col"' : 'td';
      return '<tr>' + r.map(function (c) { return '<' + tag + '>' + cell(c) + '</' + tag.slice(0, 2) + '>'; }).join('') + '</tr>';
    });
    const head = !lines && body.length ? '<thead>' + body.shift() + '</thead>' : '';
    return '<dl class="ts-facts"><div><dd>' + esc(T.scFrom(str(d.file), Number(d.page) || 0)) + '</dd></div>' +
      (d.total != null ? '<div><dd><b>' + esc(T.scTotal(Number(d.total))) + '</b></dd></div>' : '') + '</dl>' +
      note(T.scCheck) + (lines ? note(T.scLines) : '') +
      '<div class="ts-fold ts-score" tabindex="0" role="region" aria-label="선정 평가표"><table class="ts-doc' + (lines ? ' ts-score-l' : '') + '">' + head + '<tbody>' + body.join('') + '</tbody></table></div>';
  };
  function sec(title, inner) { return '<div class="ts-sec"><h4 class="ts-sec-h">' + esc(title) + '</h4>' + inner + '</div>'; }
  // 이사회 일정·결과(이사회 자료의 '의결 결과·개최일' 칸을 그대로 쓴다 — 서버 규칙: 확정된 자료에만, 담당 영업만).
  // b = stepBoard 결과 + { resultCd, meeting(YYYY-MM-DD), canResult, resBusy, resErr }
  function resultFact(b) {
    const nm = T.resNames[str(b.resultCd)] || '';
    return '<dl class="ts-facts"><div><dt>' + esc(T.schedDate) + '</dt><dd><span class="m">' + esc(b.meeting || '—') + '</span></dd></div>' +
      '<div><dt>' + esc(T.resLabel) + '</dt><dd>' + esc(nm || '—') + '</dd></div></dl>';
  }
  function resultGate(b) {
    if (!b || b.state === 'loading') return note(T.docLoading);
    if (b.state !== 'ok') return note(b.state === 'err' ? T.boardErr : T.schedNoMat);
    if (!b.confirmed) return note(T.schedNeedDoc);
    return '';
  }
  // 일정은 자료가 확정되기 전에도 담당 영업이 날짜만 먼저 적는다(사용자 11-25 b안, 서버 viewer.can_set_meeting). 상태·결과는 바뀌지 않는다.
  pt.boardSchedHtml = function (b) {
    if (!b || b.state === 'loading') return note(T.docLoading);
    if (b.state !== 'ok') return note(b.state === 'err' ? T.boardErr : T.schedNoMat);
    let h = b.meeting ? resultFact(b) : note(T.schedNone);
    // 결과(가결·부결)가 등록된 뒤에는 개최일을 8단계 결과 등록에서 고친다.
    if (str(b.resultCd) === 'PASSED' || str(b.resultCd) === 'REJECTED') return h + note(T.schedResultSet);
    if (!b.canMeeting) return h + note(T.schedView);
    return h + '<div class="ts-form"><label for="ts-sched-date">' + esc(T.schedDate) + '</label>' +
      '<input type="date" id="ts-sched-date" value="' + esc(b.meeting || '') + '">' +
      '<button type="button" data-act="board-sched"' + (b.resBusy ? ' aria-disabled="true"' : '') + '>' + esc(b.meeting ? T.schedEdit : T.schedSave) + '</button>' +
      (b.resBusy ? '<span class="ts-saving">' + esc(T.saving) + '</span>' : '') + '</div>' +
      (b.resErr ? '<p class="ap-err" role="alert">' + esc(b.resErr) + '</p>' : '');
  };
  pt.boardResultHtml = function (b) {
    const g = resultGate(b);
    if (g) return g;
    const cur = str(b.resultCd);
    let h = cur ? resultFact(b) : note(T.resNone);
    if (!b.canResult) return h + note(T.schedView);
    return h + '<div class="ts-form"><label for="ts-res-cd">' + esc(T.resLabel) + '</label><select id="ts-res-cd">' +
      ['SCHEDULED', 'PASSED', 'REJECTED'].map(function (k) { return '<option value="' + k + '"' + (k === (cur || 'PASSED') ? ' selected' : '') + '>' + esc(T.resNames[k]) + '</option>'; }).join('') + '</select>' +
      '<label for="ts-res-date">' + esc(T.resDate) + '</label><input type="date" id="ts-res-date" value="' + esc(b.meeting || '') + '">' +
      '<button type="button" data-act="board-result"' + (b.resBusy ? ' aria-disabled="true"' : '') + '>' + esc(T.resSave) + '</button>' +
      (b.resBusy ? '<span class="ts-saving">' + esc(T.saving) + '</span>' : '') + '</div>' +
      (b.resErr ? '<p class="ap-err" role="alert">' + esc(b.resErr) + '</p>' : '');
  };

  // ── 7단계 이사회 발표 대본 Word(NEXT 113 ⑤, design-reviewer 11-26 1107_a6e734b8) ──
  // 서버(POST …/prep/board-script-docx)는 아무것도 저장하지 않고 docx를 돌려준다. 칸은 모두 선택이다.
  // 칸 id ↔ 서버 본문 키의 짝은 SCRIPT_FIELDS 하나가 정본이다(400 key → 칸 id도 여기서 찾는다).
  const SCRIPT_AREA_MAX = { lines: 12, line: 300, total: 1000 };
  function sf(key, id, kind, label, o) { return Object.assign({ key: key, id: id, kind: kind, label: label }, o || {}); }
  pt.SCRIPT_FIELDS = [
    sf('meeting', 'bs-meeting', 'radio', '회의 이름', { def: 'BOARD', opts: [['BOARD', '이사회'], ['COMMITTEE', '출연금심의위원회']], help: '대본 제목과 첫 문장의 회의 이름이 바뀝니다.' }),
    sf('round', 'bs-round', 'affix', '차수', { pre: '제', post: '차', max: 3, ph: '12', aria: '차수, 숫자', help: '숫자만 적습니다.' }),
    sf('agenda_no', 'bs-agenda', 'text', '의안번호', { max: 30, ph: '제 2026-○○-○○호', help: '공문에 적힌 그대로 \'의안번호\' 뒤에 들어갑니다.' }),
    sf('speaker_dept', 'bs-sdept', 'text', '소속', { max: 40, ph: '예: ○○영업본부', help: '시스템에 소속이 없어 직접 적습니다.' }),
    sf('speaker_name', 'bs-sname', 'text', '이름', { max: 30, ph: '비우면 내 이름', help: '비우면 대본을 만드는 사람의 이름이 들어갑니다.' }),
    sf('speaker_title', 'bs-stitle', 'text', '직함', { max: 30, ph: '비우면 내 직위', help: '비우면 대본을 만드는 사람의 직위가 들어갑니다.' }),
    sf('term_years', 'bs-term', 'affix', '약정기간', { pre: '총', post: '년', max: 2, ph: '4', aria: '약정기간, 숫자(년)', help: '1~30 사이 숫자. 공고문의 약정기간을 적습니다. 약정 시작일은 협약 개시일에서 자동으로 들어갑니다.' }),
    sf('review_when', 'bs-when', 'text', '심의·평가 예상 시기', { max: 40, ph: '10월 중', help: '문장에 그대로 들어갑니다. \'10월 중\'처럼 끝까지 적으세요.' }),
    sf('amount_mode', 'bs-amt', 'radio', '승인 금액 기준', { def: 'EXCL_IT', opts: [['EXCL_IT', '출연금+예비비'], ['TOTAL', '표 합계(전산 구축·운영비 포함)']], help: '이사회 자료 첫 표 \'재산상 이익제공 및 기부금(안)\'에서 어느 합을 쓸지 고릅니다.' }),
    sf('accounting', 'bs-acct', 'text', '회계처리 방식', { max: 40, ph: '무형자산', help: '비우면 \'무형자산\'으로 들어갑니다.' }),
    sf('intro', 'bs-intro', 'area', '보고 전 사전 설명', { ph: '예: 신설 구로 행정구역이 바뀐 배경', help: '인사 뒤, 의안 소개 앞에 들어갑니다. 비우면 이 문단을 뺍니다.' }),
    sf('status_note', 'bs-status', 'area', '기관 현황 덧붙임', { ph: '예: 과거 우리 은행이 금고였던 이력', help: '임직원 수·예산·현 거래 은행 문장 뒤에 이어 붙습니다.' }),
    sf('effect', 'bs-effect', 'area', '기대효과', { ph: '비우면 요약서의 \'우리 회사 기대효과\'', help: '비우면 \'기관 선정 입찰참여 관련 요약\'의 기대효과가 들어갑니다. 그것도 비었으면 〔기대효과 입력 필요〕로 남습니다.' }),
    sf('profit_note', 'bs-profit', 'area', '수익성 덧붙임', { ph: '예: 보수적으로 잡은 산출 근거', help: '순이익 문장 뒤에 이어 붙습니다.' }),
  ];
  pt.SCRIPT_GROUPS = [
    { name: '회의', keys: ['meeting', 'round', 'agenda_no'] },
    { name: '발표자', keys: ['speaker_dept', 'speaker_name', 'speaker_title'] },
    { name: '약정·일정', keys: ['term_years', 'review_when'] },
    { name: '금액·회계', keys: ['amount_mode', 'accounting'] },
    { name: '기관별 서술', keys: ['intro', 'status_note', 'effect', 'profit_note'] },
  ];
  function scriptField(key) {
    for (let i = 0; i < pt.SCRIPT_FIELDS.length; i += 1) if (pt.SCRIPT_FIELDS[i].key === key) return pt.SCRIPT_FIELDS[i];
    return null;
  }
  // 400 BAD_VALUE의 key → 칸 id(모르는 key는 '')
  pt.scriptKeyToId = function (key) { const f = scriptField(str(key)); return f ? f.id : ''; };
  pt.scriptCountText = function (n) { return (Number(n) || 0) + '/1,000'; };

  // 구간(단계 본문 안): 설명 · 이사회 자료 상태 한 줄 · 숫자 안내 · [대본 Word 만들기…] · 결과 줄 · T6
  // m.script = { line, err }(결과 줄 — prep.js가 가진다). 단추는 끝난 건·담당자 지정 전 건에서는 감춘다(서버는 막지 않음 — 기획 확인 대기).
  pt.scriptBlockHtml = function (m) {
    const v = m.view || {}, vw = v.viewer || {}, sc = str(v.state_cd);
    const t6 = tasksBlock(m, { tasks: ['T6'] });
    if (sc === 'CANCELLED' || sc === 'CONFIRMED' || sc === 'OPEN_PENDING') return note(T.scriptHint) + note(T.scriptLater) + (t6 || note(T.taskNone));
    const b = m.board || {};
    // 이사회 자료는 담당 영업·영업부장만 목록에서 볼 수 있다 — 그 밖의 사람에게 '없음'은 '볼 수 없음'일 수 있어 없다고 말하지 않는다(불러오지 못함 문구로).
    const canSee = vw.is_assignee === true || vw.is_head === true;
    let state;
    if (b.state === 'loading' || !b.state) state = T.docLoading;
    else if (!canSee && b.state !== 'ok') state = T.scriptBoardErr;
    else if (b.state === 'ok') state = b.confirmed ? T.scriptBoardOk(b.snapNo) : T.scriptBoardDraft(b.snapNo);
    else if (b.state === 'none') state = T.scriptBoardNone;
    else state = T.scriptBoardErr;
    const s = m.script || {};
    return note(T.scriptHint) + (t6 && vw.is_assignee === true ? note(T.scriptTaskNote) : '') + note(state) +
      (canSee ? '' : note(T.scriptViewNote)) +
      '<div class="ts-acts"><button type="button" data-act="script-open">' + esc(T.scriptOpen) + '</button></div>' +
      '<p class="st-line' + (s.line && s.err ? ' st-err' : '') + '" id="ts-script-line" role="' + (s.line && s.err ? 'alert' : 'status') + '">' + esc(s.line || '') + '</p>' +
      (t6 || note(T.taskNone));
  };

  function scriptRadio(f, cur) {
    return '<fieldset class="dlg-f bs-wide" id="' + f.id + '-g" aria-describedby="' + f.id + '-h"><legend>' + esc(f.label) + '</legend><div class="bs-radios">' +
      f.opts.map(function (o) {
        return '<label><input type="radio" name="' + f.id + '" value="' + o[0] + '"' + (cur === o[0] ? ' checked' : '') + '> ' + esc(o[1]) + '</label>';
      }).join('') + '</div><p class="tm-note" id="' + f.id + '-h">' + esc(f.help) + '</p></fieldset>';
  }
  function scriptInput(f, val) {
    const input = '<input type="text" id="' + f.id + '"' + (f.kind === 'affix' ? ' inputmode="numeric" aria-label="' + esc(f.aria) + '"' : '') +
      ' maxlength="' + f.max + '" placeholder="' + esc(f.ph) + '" value="' + esc(val) + '" aria-describedby="' + f.id + '-h">';
    const field = f.kind === 'affix' ? '<span class="bs-affix"><span aria-hidden="true">' + esc(f.pre) + '</span>' + input + '<span aria-hidden="true">' + esc(f.post) + '</span></span>' : input;
    return '<div class="dlg-f"><label for="' + f.id + '">' + esc(f.label) + '</label>' + field + '<p class="tm-note" id="' + f.id + '-h">' + esc(f.help) + '</p></div>';
  }
  function scriptArea(f, val) {
    return '<div class="dlg-f bs-wide"><div class="bs-lrow"><label for="' + f.id + '">' + esc(f.label) + '</label><span id="' + f.id + '-n" class="tm-count">' + esc(pt.scriptCountText(val.length)) + '</span></div>' +
      '<textarea id="' + f.id + '" rows="3" maxlength="1000" placeholder="' + esc(f.ph) + '" aria-describedby="' + f.id + '-h ' + f.id + '-n">' + esc(val) + '</textarea>' +
      '<p class="tm-note" id="' + f.id + '-h">' + esc(f.help) + '</p></div>';
  }
  // 입력 창 전체(덮개 포함, 숨김 상태). o = { name(기관명), vals(건별로 간직한 값 — 없으면 기본값) }. prep.js가 body 직계로 붙이고 dlg.open으로 연다.
  pt.scriptDialogHtml = function (o) {
    const x = o || {}, vals = x.vals || {};
    const auto = ['기관명·지역(시·도): 기관 정보', '임직원 수·예산·현 거래 은행: 기관 선정 입찰참여 관련 요약(볼 수 있는 사람에게만)',
      '승인 금액·순이익·연도: 이사회 자료(담당 영업·영업부장에게만)', '약정 시작일: 협약 개시일'];
    const groups = pt.SCRIPT_GROUPS.map(function (g) {
      return '<fieldset class="bs-grp"><legend>' + esc(g.name) + '</legend><div class="bs-grid">' + g.keys.map(function (k) {
        const f = scriptField(k), val = str(vals[k]);
        if (f.kind === 'radio') return scriptRadio(f, val || f.def);
        return f.kind === 'area' ? scriptArea(f, val) : scriptInput(f, val);
      }).join('') + '</div></fieldset>';
    }).join('');
    return '<div id="bs-dlg" class="modal-overlay" style="display:none"><div class="dlg dlg--wide" role="dialog" aria-modal="true" aria-labelledby="bs-t" aria-describedby="bs-hint">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="bs-t" tabindex="-1">' + esc(T.scriptTitle(str(x.name))) + '</h2>' +
      '<div class="dlg-acts"><button type="button" id="bs-cancel">' + esc(T.scriptCancel) + '</button><button type="button" id="bs-go" class="dlg-go">' + esc(T.scriptGo) + '</button></div></header>' +
      '<div class="dlg-note"><p class="dlg-hint" id="bs-hint">' + esc(T.scriptHint1) + '<br>' + esc(T.scriptHint2) + '</p>' +
      '<p class="dlg-hint" id="bs-busy" role="status"></p><p class="dlg-err" id="bs-err" role="alert"></p></div>' +
      '<div class="dlg-body"><section class="bs-auto" aria-labelledby="bs-auto-h"><h3 id="bs-auto-h">' + esc(T.scriptAutoHead) + '</h3><ul>' +
      auto.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul><p>' + esc(T.scriptAutoNote) + '</p></section>' + groups + '</div></div></div>';
  };
  // 여러 줄 칸 사전 검사(서버 규칙과 같음: 12줄·줄당 300자·합계 1,000자). → [{ key, id, msg }] (칸마다 첫 문제 하나)
  pt.scriptCheck = function (vals) {
    const out = [];
    pt.SCRIPT_FIELDS.forEach(function (f) {
      if (f.kind !== 'area') return;
      const val = str(vals && vals[f.key]).replace(/\r\n?/g, '\n');
      if (!val.trim()) return;
      const lines = val.split('\n');
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      let msg = '';
      if (lines.length > SCRIPT_AREA_MAX.lines) msg = T.scriptErrLines(lines.length);
      else {
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].length > SCRIPT_AREA_MAX.line) { msg = T.scriptErrLineLen(i + 1, lines[i].length); break; }
        }
      }
      if (!msg && val.length > SCRIPT_AREA_MAX.total) msg = T.scriptErrTotal;
      if (msg) out.push({ key: f.key, id: f.id, msg: msg });
    });
    return out;
  };
  // 입력값 → 요청 본문. 비운 칸은 키를 뺀다(서버 기본값·생략 규칙이 살도록). 라디오는 늘 값이 있다. 숫자 칸은 숫자 모양이면 숫자로 보낸다.
  pt.scriptBody = function (vals) {
    const body = {};
    pt.SCRIPT_FIELDS.forEach(function (f) {
      const v = str(vals && vals[f.key]).trim();
      if (f.kind === 'radio') { body[f.key] = v || f.def; return; }
      if (!v) return;
      body[f.key] = f.kind === 'affix' && /^\d+$/.test(v) ? Number(v) : v;
    });
    return body;
  };
  // 실패 응답 → { id(칸 id, 없으면 ''), msg }. detail = 응답 JSON의 detail. 400 BAD_VALUE만 칸을 가리킨다.
  pt.scriptError = function (status, detail) {
    const d = detail && typeof detail === 'object' ? detail : {};
    if (status === 400 && str(d.code) === 'BAD_VALUE') {
      const f = scriptField(str(d.key));
      if (f) {
        let msg;
        if (f.key === 'round') msg = T.scriptErrRound;
        else if (f.key === 'term_years') msg = T.scriptErrTerm;
        else if (f.key === 'meeting') msg = T.scriptErrMeeting;
        else if (f.key === 'amount_mode') msg = T.scriptErrAmount;
        else if (f.kind === 'area') msg = T.scriptErrArea(f.label);
        else msg = T.scriptErrShort(f.label, f.max);
        return { id: f.id, msg: msg };
      }
    }
    if (status === 400) return { id: '', msg: T.scriptErr400 };
    if (status === 401) return { id: '', msg: T.scriptErr401 };
    if (status === 403) return { id: '', msg: T.scriptErr403 };
    if (status === 404) return { id: '', msg: T.scriptErr404 };
    if (status === 413) return { id: '', msg: T.scriptErr413 };
    return { id: '', msg: T.scriptErr500 };
  };
  pt.scriptDoneText = function (draft) { return draft ? T.scriptDoneDraft : T.scriptDone; };
  // Content-Disposition의 filename*=UTF-8''… → 파일 이름(읽을 수 없거나 경로·제어 문자가 있으면 기본 이름)
  pt.SCRIPT_FILE_DEFAULT = '발표대본.docx';
  pt.scriptFileName = function (disposition) {
    const m = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(str(disposition));
    let n = '';
    if (m) { try { n = decodeURIComponent(m[1]); } catch (e) { n = ''; } }
    n = n.replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    return n || pt.SCRIPT_FILE_DEFAULT;
  };

  const PROPOSAL_STATES = ['IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING'];

  // m: prep.caseHtml과 같은 모델 + { row, marks, rowState, idx, markBusy }
  pt.bodyHtml = function (m) {
    const v = m.view || {};
    const idx = pt.clampIdx(m.idx);
    const s = pt.STEPS[idx];
    const n = pt.STEPS.length;
    const gate = pt.markGate(v, m.row, m.rowState);
    const ctx = { confirm: m.confirm, withdrawing: m.withdrawing };
    let h = '<div class="ts-pos">' + esc(pt.phaseLabel(s.ph)) + ' · ' + (idx + 1) + ' / ' + n + '</div>' +
      '<h3 class="ts-step-title" id="ts-step-title" tabindex="-1">' + esc(s.label) + '</h3>';
    if (s.kind === 'start') {
      const sc = str(v.state_cd);
      if (sc === 'CONFIRMED' || sc === 'OPEN_PENDING') h += note(T.startHint) + prep.endHtml(v, ctx);
      else if (sc === 'CANCELLED') h += note(T.startEnded);
      else {
        // 담당자는 여러 명일 수 있다. 변경은 이 화면에서(사용자 11-25) — 담당자 고르기 창을 지금 담당자가 골라진 채로 연다.
        const as = (Array.isArray(v.assignees) ? v.assignees : []).filter(function (a) { return a && str(a.name); });
        const vw = v.viewer || {};
        // 기획 승인 대기 중에는 서버가 막는다(409) — 단추도 내지 않는다. 팀장은 이 건의 팀장일 때만 서버가 받아 준다.
        const canChange = ['IN_PROGRESS', 'WRITABLE', 'WRITING'].indexOf(sc) >= 0 && (vw.is_assignee === true || m.role === prep.LEAD);
        h += note(T.startDone) + '<div class="ts-sec"><h4 class="ts-sec-h">' + esc(T.assigneeCount(as.length)) + '</h4>' +
          (as.length ? '<ul class="ts-people">' + as.map(function (a) {
            return '<li><b>' + esc(a.name) + '</b>' + (str(a.position) ? '<span class="ts-note">' + esc(a.position) + '</span>' : '') + '</li>';
          }).join('') + '</ul>' : note(prep.T.noAssignees)) +
          (canChange ? '<div class="ts-acts"><button type="button" data-act="assignee-change">' + esc(T.changeAssignee) + '</button></div>' : '') +
          note(canChange ? T.changeAssigneeNote : (sc === 'CANCELLED' ? '' : T.changeAssigneeView)) + '</div>';
      }
    } else if (s.kind === 'notice') {
      // 기관정보 팝업과 같은 내용을 읽기 전용으로(m.notice = { state: 'ok'|'none'|'loading', html, gaps } — prep.js가 dashboard.js로 만든다)
      const ni = m.notice || {};
      // 확인 기록(누가·언제) — 서버 칸의 mark DONE. 확인 취소는 체크할 수 있는 담당만.
      const nc = pt.cellState(m.row, s.cd, m.marks);
      const craw = m.row && m.row.cells && m.row.cells[s.cd] ? m.row.cells[s.cd] : {};
      const done = nc.mark === 'DONE';
      if (done) {
        h += '<div class="ts-markrow" data-col="' + esc(s.cd) + '"><span class="ts-cell">' + pb.glyphSvg('done') + '<span>' + esc(T.stNoticeOk) + '</span></span>' +
          '<span class="ts-last">' + esc([nc.by, pb.fullDate(craw.confirmed_on) || nc.date].filter(Boolean).join(' ')) + '</span>' +
          (gate.can ? '<button type="button" data-act="mark" data-col="' + esc(s.cd) + '" data-mk="NONE"' + ((m.markBusy || {})[s.cd] ? ' aria-disabled="true"' : '') + '>' + esc(T.noticeUndo) + '</button>' : '') + '</div>';
      }
      h += pt.noticeChecksHtml(ni.checks);
      if (ni.state === 'ok') {
        const gaps = Array.isArray(ni.gaps) ? ni.gaps : [];
        const nBad = (Array.isArray(ni.checks) ? ni.checks : []).filter(function (c) { return c && c.bad; }).length;
        h += gaps.length
          ? '<div class="ts-gaps" role="note"><b>' + esc(T.noticeGapsHead(gaps.length)) + '</b><ul>' + gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>' +
            (done ? '' : '<p>' + esc(T.noticeGapsNo) + '</p>') + '</div>'
          : (done ? '' : (nBad > 0
            ? '<p class="ts-okline is-note" role="note"><span>' + esc(gate.can ? T.noticeNote(nBad) : T.noticeNoteView(nBad)) + '</span></p>'
            : '<p class="ts-okline" role="note">' + pt.CK_SVG + '<span>' + esc(gate.can ? T.noticeOk : T.noticeOkView) + '</span></p>'));
        h += '<div class="ts-notice">' + str(ni.html) + '</div>';   // dashboard.js가 이스케이프해 만든 마크업
      } else {
        h += note(ni.state === 'loading' ? T.noticeLoading : T.noticeNoRec);
      }
      h += '<div class="ts-sec"><h4 class="ts-sec-h">' + esc(T.noticeFilesTitle) + '</h4>' + (m.noticeFiles ? str(m.noticeFiles) : note(T.filesLater)) + '</div>';
      h += note(T.noticeGuide) + '<div class="ts-acts">' + T.noticeNav.map(function (n) {
        return '<button type="button" data-act="go-nav" data-nav="' + n[0] + '">' + esc(n[1]) + '</button>';
      }).join('') + '</div>';
    } else if (s.kind === 'group' && s.result) {
      // 8단계 이사회 개최 및 결과: 결과 등록 → 결과 문서 보관 → 부서별 확인(표의 체크 칸)
      h += sec(T.secResult, pt.boardResultHtml(m.board)) +
        sec(T.secResDoc, m.resFiles ? str(m.resFiles) : note(T.filesLater)) +
        sec(T.secMarks, note(T.groupHint) + markBlock(m, s, gate) + note(gate.why));
    } else if (s.kind === 'manual' || s.kind === 'group') {
      h += note(s.kind === 'group' ? T.groupHint : T.manualHint) + markBlock(m, s, gate) + note(gate.why) + tasksBlock(m, s);
    } else if (s.kind === 'proposal') {
      const open = v.state_cd === 'CANCELLED' ? [] : pt.openBefore(v, m.row, m.marks);
      h += note(T.proposalHint) + (open.length ? '<p class="pp-next" role="note">' + esc(T.openBefore(open)) + '</p>' : '') + '<dl class="ts-facts"><div><dt>제안서(디자인 최종)</dt><dd>' + stateSpan(pt.cellState(m.row, s.cd, m.marks)) + '</dd></div></dl>' +
        (PROPOSAL_STATES.indexOf(str(v.state_cd)) >= 0 ? prep.endHtml(v, ctx) : (v.state_cd === 'CANCELLED' ? '' : note(T.proposalLater)));
    } else if (s.kind === 'board') {
      // 7단계 이사회 준비(사용자 11-25): 자료 작성 · 일정 등록 · 추가 자료 등록 · 발표 대본을 한 묶음으로
      h += sec(T.secDoc, note(T.boardHint) + (tasksBlock(m, { tasks: ['T5'] }) || '') + pt.boardBlockHtml(m.board)) +
        sec(T.secSched, pt.boardSchedHtml(m.board)) +
        sec(T.secAdd, m.addFiles ? str(m.addFiles) : note(T.filesLater)) +
        sec(T.secScript, pt.scriptBlockHtml(m));
    } else {   // auto — 준비 과제를 여기에서 처리한다
      if (s.id === 'PROFIT') h += note(T.profitHint);
      if (s.id === 'INST_ANALYSIS') h += need(T.needSummary);
      const tb = s.id === 'INST_ANALYSIS' ? foldBlock(m, s) : tasksBlock(m, s);
      h += tb || note(T.taskNone);
      if (s.id === 'INST_ANALYSIS') h += sec(T.secScoring, pt.scoringHtml(m.scoring));
    }
    const prev = idx > 0 ? { label: T.prev(pt.STEPS[idx - 1].label), off: false } : { label: T.prevNone, off: true };
    const next = idx < n - 1 ? { label: T.next(pt.STEPS[idx + 1].label), off: false } : { label: T.nextNone, off: true };
    return h + '<div class="ts-pager"><button type="button" data-act="ts-prev"' + (prev.off ? ' disabled' : '') + '>' + esc(prev.label) + '</button>' +
      '<button type="button" class="ts-go" data-act="ts-next"' + (next.off ? ' disabled' : '') + '>' + esc(next.label) + '</button></div>';
  };
  // [다음] 확인 팝업(사용자 11-25: 단계마다 공통). 첫 포커스는 [확인].
  pt.nextAskHtml = function (idx) {
    const s = pt.STEPS[pt.clampIdx(idx) + 1];
    if (!s) return '';
    return '<div class="modal-box tm-modal-box ts-ask" role="dialog" aria-modal="true" aria-labelledby="ts-ask-t" aria-describedby="ts-ask-d">' +
      '<h3 id="ts-ask-t">' + esc(T.nextAskTitle) + '</h3><p id="ts-ask-d" class="ts-ask-d">' + esc(T.nextAsk(s.label)) + '</p>' +
      '<div class="tm-m-actions"><button type="button" id="pp-nx-no">' + esc(T.nextNo) + '</button>' +
      '<button type="button" id="pp-nx-ok" class="ts-go">' + esc(T.nextOk) + '</button></div></div>';
  };

  // ── 상세 전체 ────────────────────────────────────────────────────
  // 머리(기관·상태·확정 취소/중단)와 알림 줄은 prep.js 것을 그대로 쓰고, 옛 5칸 단계 막대·과제 목록 자리에 구간·단계 틀이 들어간다.
  pt.caseHtml = function (m) {
    const v = m.view || {};
    const idx = pt.clampIdx(m.idx);
    return prep.caseHeadHtml(m) + prep.caseNoticeHtml(m) +
      pt.phasesHtml(pt.phaseModel(v, m.row, m.marks, idx)) +
      '<div class="ts-detail"><nav class="ts-steps" id="ts-steps" aria-label="' + esc(T.stepsNav(pt.phaseLabel(pt.phaseOf(idx)))) + '">' +
      pt.stepsHtml(pt.stepsModel(v, m.row, m.marks, idx)) + '</nav>' +
      '<section class="ts-body" id="ts-body" aria-labelledby="ts-step-title">' + pt.bodyHtml(m) + '</section></div>' +
      '<div id="ts-live" class="sr-only" role="status"></div>';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = pt;
  else root.preptask = pt;
})(typeof self !== 'undefined' ? self : this);
