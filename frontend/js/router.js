(function (root) {
  'use strict';
  // 화면 주소(#/…) 규칙(NEXT 135) — DOM·location을 모르는 순수 함수만 둔다.
  // 나중에 경로 방식(/proposals)으로 바꿀 때는 이 파일의 parse·format만 갈아 끼운다(이름 표는 그대로).
  // 표·이름 규칙은 planner 2026-11-27_0957 §4: 소문자·숫자·하이픈, 시스템 관리만 admin/ 아래 2단,
  // 서버 API 맨 앞 경로(accounts·menus·tasks…)와 첫 마디가 겹치지 않는다(router.test.js가 대조).
  // 표는 이 모듈 안의 Map에만 있다 — 밖에서 고치지 못하고, '__proto__'·'constructor'가 조회에 걸리지 않는다.
  const router = {};
  const TITLE_SUFFIX = '기관영업지원 시스템';
  const HASH_RE = /^#\/((?:[a-z][a-z0-9-]{0,31})(?:\/[a-z][a-z0-9-]{0,31})?)?$/;   // 디코드하지 않는다 — %가 든 값은 모양 검사에서 떨어진다

  // [주소 이름, nav 항목 id, 화면 이름]. id는 nav.js가 만드는 값과 같아야 한다(준비중 라벨을 고치면 router.test.js가 알린다).
  // 내 정보(myinfo)는 메뉴 항목이 아니라 숨은 탭 버튼으로 열린다 — 이 표에는 이름 대응만 둔다.
  const SCREENS = [
    ['home', 'soon:시작화면', '시작화면'],
    ['bid-status', 'soon:현황판', '입찰 현황판'],
    ['org-plans', 'soon:기관 사업계획', '기관 사업계획'],
    ['regions', 'regions', '전국 지역별'],
    ['notice-forecast', 'map', '예상 공고현황'],
    ['notices', 'soon:입찰 공고 현황', '입찰 공고 현황'],
    ['notice-collect', 'soon:공고 자동 수집', '공고 자동 수집'],
    ['proposal-prep', 'soon:사전준비', '제안 준비 현황'],
    ['board-writing', 'soon:이사회 자료', '이사회 자료 작성'],
    ['proposals', 'workflow', '제안서 진행 현황'],
    ['my-tasks', 'tasks', '작업함'],
    ['proposal-team', 'soon:제안팀', '제안팀 구성·배정'],
    ['co-writing', 'soon:공동 작성·버전 관리', '공동 작성·버전 관리'],
    ['internal-review', 'soon:내부 검토 의견', '내부 검토 의견'],
    ['final-submit', 'soon:최종 확인·제출', '최종 확인·제출'],
    ['bid-results', 'soon:입찰 결과 등록', '입찰 결과 등록'],
    ['contract-history', 'soon:협약 이력', '협약 이력'],
    ['contract-performance', 'soon:협약 성과 관리', '협약 성과 관리'],
    ['deadlines', 'soon:일정·마감 알림', '일정·마감 알림'],
    ['request-log', 'soon:요청 이력·소통', '요청 이력·소통'],
    ['ai-chat', 'chat', 'AI 대화'],
    ['knowledge', 'knowledge', '지식 검색'],
    ['keyword-search', 'soon:사내 업무 키워드 조회', '사내 업무 키워드 조회'],
    ['approval-box', 'approvals', '결재함'],
    ['my-info', 'myinfo', '내 정보'],
    ['admin/users', 'admin:users', '사용자 관리'],
    ['admin/permissions', 'admin:perms', '권한 관리'],
    ['admin/menus', 'admin:menus', '메뉴 관리'],
    ['admin/access-log', 'admin:audit', '접근 이력'],
    ['admin/plan-collect', 'admin:collect', '사업계획 수집 요청']
  ];
  const ID_BY_NAME = new Map();
  const NAME_BY_ID = new Map();
  const LABEL_BY_NAME = new Map();
  SCREENS.forEach(function (s) { ID_BY_NAME.set(s[0], s[1]); NAME_BY_ID.set(s[1], s[0]); LABEL_BY_NAME.set(s[0], s[2]); });
  // 그룹: 권한 있는 첫 하위 화면으로 보낸다(시스템 관리).
  const GROUPS = new Map([['admin', Object.freeze(['admin/users', 'admin/permissions', 'admin/menus', 'admin/access-log', 'admin/plan-collect'])]]);
  LABEL_BY_NAME.set('admin', '시스템 관리');
  // 메뉴 항목이 아닌 화면: 서비스 소개(랜딩)·로그인. nav id가 없다.
  LABEL_BY_NAME.set('intro', '서비스 소개');
  LABEL_BY_NAME.set('login', '로그인');

  router.TITLE_SUFFIX = TITLE_SUFFIX;
  router.NAMES = Object.freeze(Array.from(LABEL_BY_NAME.keys()));

  router.has = function (name) { return typeof name === 'string' && LABEL_BY_NAME.has(name); };
  router.idOf = function (name) { return typeof name === 'string' && ID_BY_NAME.has(name) ? ID_BY_NAME.get(name) : null; };
  router.nameOf = function (id) { return typeof id === 'string' && NAME_BY_ID.has(id) ? NAME_BY_ID.get(id) : null; };
  router.labelOf = function (name) { return router.has(name) ? LABEL_BY_NAME.get(name) : ''; };
  router.titleOf = function (name) {
    const l = router.labelOf(name);
    return l ? l + ' - ' + TITLE_SUFFIX : TITLE_SUFFIX;
  };
  // 우리 주소인가 — '#/'로 시작하는 값만. 랜딩 안 앵커(#ld-ai)·#main은 해당 없다.
  router.isRoute = function (hash) { return typeof hash === 'string' && hash.charAt(0) === '#' && hash.charAt(1) === '/'; };

  // hash → {name}. '#/'는 기본 주소({name:''}). 모양이 틀렸거나 표에 없으면 null — 예외를 내지 않는다.
  router.parse = function (hash) {
    if (typeof hash !== 'string') return null;
    const m = HASH_RE.exec(hash);
    if (!m) return null;
    const name = m[1] || '';
    if (name === '') return { name: '' };
    return router.has(name) ? { name: name } : null;
  };
  // 이름 → hash. 모르는 이름은 기본 주소('#/') — 예외 없음.
  router.format = function (name) { return name && router.has(name) ? '#/' + name : '#/'; };

  // 열 수 있는 화면 이름으로 좁힌다. canOpen(name) = 지금 이 사람에게 그 화면이 있는가(호출자가 정한다).
  // 그룹은 열 수 있는 첫 하위 화면, 메뉴 화면이 아닌 이름(intro·login)·모르는 이름은 null.
  router.resolve = function (name, canOpen) {
    if (typeof name !== 'string' || typeof canOpen !== 'function') return null;
    if (GROUPS.has(name)) {
      const list = GROUPS.get(name);
      for (let i = 0; i < list.length; i += 1) { if (canOpen(list[i])) return list[i]; }
      return null;
    }
    return ID_BY_NAME.has(name) && canOpen(name) ? name : null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = router;
  else root.router = router;
})(typeof self !== 'undefined' ? self : this);
