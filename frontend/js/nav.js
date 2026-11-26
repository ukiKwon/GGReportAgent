(function (root) {
  'use strict';
  // 좌측 업무 메뉴 — 3단(대분류 5 + 시스템 관리 / 중분류 = 누를 수 없는 소제목 / 소분류 = 항목).
  // DOM을 모르는 순수 규칙만 둔다. 항목 배열은 평평하고 항목마다 `sub`(중분류 이름) 한 칸만 더한다.
  //
  // 네 가지를 지킨다.
  //  1. **권한은 서버가 정한다.** 구현된 항목(`key`)은 기존 /menus 8개 키(menu_rules의
  //     visibleTabs 결과)가 켠 것만 보인다. 이 파일이 메뉴 권한을 새로 만들지 않는다.
  //  2. **`준비중` 항목은 영업 계열에게만 보인다.** 아직 만들지 않은 기능이 다른 팀 화면까지
  //     어지럽히지 않게 한다(요청: 영업팀 전용 기능). 영업 계열 = 영업팀·영업팀장·영업부장·
  //     디자이너(영업팀 소속) + 마스터. 예외: visibleWithTasks('이사회 자료 작성')는 작업함 조회 권한이 있어도 보인다.
  //     키가 있는데 준비중인 항목(pending: AI 대화·지식 검색)은 서버 키(v[key])가 켠 사람에게 보인다.
  //     onlyRoles가 있는 항목(제안팀 구성·배정·제안서 사전준비)은 그 역할(영업팀·영업팀장·영업부장)에게만 보인다 — 디자이너·마스터 제외.
  //     영업 추진 준비의 단위 task(협약준비 업무 21칸)는 메뉴가 없다(사용자 11-24) — 제안 준비 현황에서 기관을 눌러 들어가는 상세(preptask.js)에서 단계별로 진행한다. 소제목 '제안 준비'는 하나뿐이라 그리지 않는다(soloSubs 없음).
  //     withKey가 있는 항목(입찰 현황판·입찰 공고 현황)은 그 서버 키(map)가 켜진 사람 전원에게 보이고, front면 같은 중분류의 맨 앞에 놓인다.
  //     공고 자동 수집(onlyRoles+allowMaster, 서버 키 없음)은 전산팀·전산팀장과 관리자(마스터)에게만 보인다 — 영업 계열·디자이너·재무 제외(사용자 11-23).
  //     withKey와 onlyRoles를 함께 쓴 항목(시작화면, 11-19 결정)은 서버 키(map)가 켜져 있고 그 역할(마스터 제외)인 사람에게만 보인다.
  //     withKey와 onlyTeams를 함께 쓴 항목(기관 사업계획, 11-17 결정)은 서버 키(map)가 켜져 있고 그 팀 소속(영업팀·전산팀 전원, 디자이너는 영업팀 소속, 마스터 포함)인 사람에게만 보인다 — 예산팀 제외.
  //  3. **한 화면은 한 항목에만 둔다.** 같은 탭을 두 곳에 걸면 어느 쪽이 "지금 위치"인지
  //     하이라이트가 모호해진다.
  //  4. **대분류 순서는 정의 순서(업무 1→5) 고정, 시스템 관리(last)는 맨 끝.** 중분류 안에서는 구현 → 준비중 순.
  //     중분류 소제목(showSubs)은 보이는 중분류가 2개 이상이고 각각 보이는 항목이 2개 이상일 때만 모두 보인다.
  const roles = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./roles.js') : root.roles;

  const nav = {};

  // view: 한 화면(key) 안의 하위 보기. 시스템 관리 5항목이 같은 'admin' 탭을 쓴다(항목 id = key:view).
  // sub: 중분류 이름(소제목). pending: 서버 키는 있지만 화면은 아직 준비중 안내만 연다(AI 대화·지식 검색).
  function live(sub, label, key, view, pending) {
    const o = { sub: sub, label: label, key: key };
    if (view) o.view = view;
    if (pending) { o.pending = true; o.tag = '준비중'; o.note = ''; }
    return o;
  }
  // tag: 사이드바 배지·안내 화면에 쓰는 글. 기본 '준비중', 구현 계획이 잡힌 것만 '구현 예정'. 빈 글자('')는 배지 없음(이미 열리는 화면).
  // withTasks: true면 영업 계열이 아니어도 작업함 조회 권한(visible.tasks)이 있으면 보인다(이사회 부의).
  // id: 라벨을 고쳐도 열어 둔 탭·화면 연결이 끊기지 않게 고정할 때만 준다(이사회 부의 = board.SOON_ID). 없으면 'soon:'+라벨.
  function soon(sub, label, tag, note, withTasks, id, onlyRoles, withKey, front, onlyTeams) {
    const o = { sub: sub, label: label, soon: true, tag: tag === '' ? '' : (tag || '준비중'), note: note || '' };
    if (withTasks) o.visibleWithTasks = true;
    if (id) o.id = id;
    if (onlyRoles) o.onlyRoles = onlyRoles;   // 지정하면 그 역할에게만 보인다(영업 계열 일반 규칙을 대신한다)
    if (withKey) o.withKey = withKey;         // 지정하면 서버 메뉴 키(v[withKey])가 켜진 사람 전원에게 보인다(역할 제한 없음)
    if (front) o.front = true;                // 지정하면 같은 중분류 안에서 구현 항목보다 앞에 놓는다
    if (onlyTeams) o.onlyTeams = onlyTeams;   // withKey와 함께 쓰면 키 AND 팀(팀 이름 = roles.teamOf 결과, 마스터는 통과)
    return o;
  }
  // 사이드바에 붙일 배지 글(순수). 준비중 항목만, tag가 ''이면 배지 없음.
  function badgeOf(it) { return it && it.soon ? (it.tag === '' ? '' : (it.tag || '준비중')) : ''; }

  // 이사회 부의 항목 id — board.SOON_ID와 같아야 한다(라벨을 고쳐도 실화면 연결·접근 이력 'tasks:board'가 끊기지 않게 고정).
  const BOARD_ID = 'soon:이사회 자료';
  // 제안팀 구성·배정 — team.SOON_ID와 같아야 한다. 영업팀·영업팀장·영업부장에게만 보인다(디자이너·마스터·타 팀 숨김, 서버 열람 규칙과 같음).
  const TEAM_ID = 'soon:제안팀';
  const TEAM_ROLES = ['영업팀', '영업팀장', '영업부장'];
  // 제안서 사전준비 프로세스 — NEXT 70에서 실화면이 된다. 라벨을 다듬어도 탭·순서 저장이 끊기지 않게 id를 고정한다.
  const PREP_ID = 'soon:사전준비';
  // 입찰 현황판 — 본체는 kbboard.js(root.kbboard.mount, 국민은행 상태). 서버 메뉴 키 8개가 동결이라 새 키 없이 고정 id의 soon 항목으로 둔다.
  // 노출 = 서버 map 키가 켜진 사람 전원(영업 계열 제한 없음), 배지 없음, 기관 소분류 맨 앞.
  const DASH_ID = 'soon:현황판';
  // 입찰 공고 현황 — 고정 id. 라벨이 바뀌어도 id(경과 팝업·화면 연결의 기준)가 따라 바뀌지 않게 한다(11-16 이름 논의 뒤).
  const NOTICE_ID = 'soon:입찰 공고 현황';
  // 기관 사업계획 — plans.SOON_ID와 같아야 한다. 노출 = 서버 map 키 AND 영업팀·전산팀 소속(예산팀 제외, 11-17 결정).
  const PLANS_ID = 'soon:기관 사업계획';
  const PLANS_TEAMS = [roles.DESIGNER_HOME, '전산팀'].map(function (a) { return roles.teamOf(a); });
  // 공고 자동 수집 — 아직 만들지 않은 기능(준비중 배지). 노출 = 전산팀·전산팀장 + 관리자(allowMaster, 사용자 11-23 '관리자도 당연히'). 서버 메뉴 키는 쓰지 않는다.
  const COLLECT_NOTICE_ID = 'soon:공고 자동 수집';
  const COLLECT_NOTICE_ROLES = ['전산팀', '전산팀장'];
  // 협약 성과 관리(NEXT 104, results.js) — results.SOON_ID와 같아야 한다. 노출 = map 키 AND 영업팀·전산팀(서버 canView와 같음, 재무 제외).
  const RESULTS_ID = 'soon:협약 성과 관리';
  // 시작화면(포털, portal.js) — 사이드바 메뉴에는 그리지 않는다(headOnly). 머리 띠 제목 '기관영업지원 시스템'과 탭 맨 앞 고정 탭으로만 연다.
  // 노출 = 서버 map 키 AND HOME_ROLES(마스터 제외). 사용자 확정 11-19(이름 '첫 화면' → '시작화면', 메뉴에서 제거).
  // id 값 'soon:첫 화면' → 'soon:시작화면': 이 id는 메모리 탭 목록에만 있다(localStorage·서버·접근 이력에 저장 안 함) → 마이그레이션 없음.
  const HOME_ID = 'soon:시작화면';
  const HOME_CAT = 'home';
  const APPR_CAT = 'apprbox';   // 결재함 — 머리 띠 [결재함 n] 단추로만 연다(headOnly). 권한·탭·pruneTabs 판정은 이 단독 항목으로(사용자 11-23)
  // 시스템 전체를 보되 고치지는 못하는 역할(사용자 11-19: 전산팀·전산팀장 + 디자이너). 지도·현황판·입찰 공고 현황·시작화면의 쓰기 버튼과 도구줄 [기관 추가]·[CSV]를 숨긴다(nav.isViewOnly). 예외: 사업계획 수집 요청·시스템 관리 화면(전산팀 업무).
  const VIEW_ONLY_ROLES = ['전산팀', '전산팀장', roles.DESIGNER];   // 디자이너도 기관 추가·편집은 서버 403(main 11-19 requireInstitutionEditSales, 디자이너 기본값 '보기')
  // 시작화면 대상 역할 — 역할을 바꾸려면 이 두 줄(HOME_ROLES·VIEW_ONLY_ROLES)만 고친다. 재무(예산팀)는 '이사회 자료 작성'(homeIdFor), 마스터는 지도로 시작한다.
  const HOME_ROLES = TEAM_ROLES.concat([roles.DESIGNER], VIEW_ONLY_ROLES);
  // 재무(예산팀·예산팀장)의 시작화면은 포털이 아니라 '이사회 자료 작성'(BOARD_ID, 사용자 11-19). 값은 서버 계약대로 '예산팀'·'예산팀장'(화면 표기만 재무팀).
  const FINANCE_ROLES = ['예산팀', '예산팀장'];
  // 역할별로 사이드바에 보일 대분류(사용자 11-19). 서버 메뉴 키가 못 만드는 '기본 메뉴'를 프런트가 한 겹 더 좁힌다(nav.limitToRole).
  // 목록에 없는 역할(영업 계열·전산팀·마스터·역할 없음)은 제한이 없다. 시스템 관리(sys)는 서버 admin 키가 정하므로 항상 통과한다.
  // 재무팀장은 결재함·작업함(제안서 작성·관리, manage) 때문에 manage가 더해진다(사용자 11-19 '권장안대로').
  const ROLE_CATS = {};
  ROLE_CATS[roles.DESIGNER] = ['home', 'scan', 'manage', 'relate', 'tools', APPR_CAT];   // relate = 협약 성과 관리(05 규격 P1, 11-20) — 준비중 두 항목도 함께 보임(규격에서 수용). 순서는 표시 순서와 무관(limitToRole은 build 순서를 따른다)
  // 결재함은 머리 띠 단추(apprbox, 11-23) — 제한 목록이 있는 역할 모두에 더한다(재무팀원도 '내가 올린 요청'을 본다). 재무팀장의 manage는 뺐다(사용자 11-23 '묶음 닫기').
  ROLE_CATS['예산팀'] = ['plan', APPR_CAT];
  ROLE_CATS['예산팀장'] = ['plan', APPR_CAT];

  // subs: 중분류 순서. 항목마다 sub로 소속을 가리킨다(시스템 관리는 중분류 없음).
  nav.CATEGORIES = [
    { id: HOME_CAT, title: '시작화면', headOnly: true, items: [   // headOnly = 사이드바에 그리지 않는다(app.drawNav가 거른다). 권한·탭·pruneTabs 판정은 이 항목으로 한다
      soon('', '시작화면', '', '', false, HOME_ID, HOME_ROLES, 'map', true)] },
    // 소제목 순서 = 대시보드 → 기관 → 입찰 공고(사용자 11-23). soloSubs: 대시보드처럼 항목이 하나인 소제목도 그린다(showSubs의 '각 2개 이상' 규칙 면제).
    { id: 'scan', title: '기관·입찰 현황', subs: ['대시보드', '기관', '입찰 공고'], soloSubs: true, items: [
      soon('대시보드', '입찰 현황판', '', '', false, DASH_ID, undefined, 'map', true),
      soon('기관', '기관 사업계획', '', '', false, PLANS_ID, undefined, 'map', true, PLANS_TEAMS),   // 실제 화면(plans.js) — 배지 없음, 노출 = map 키 AND 영업팀·전산팀(디자이너·마스터 포함). front = 구현 항목(전국 지역별)보다 앞
      live('기관', '전국 지역별', 'regions'),
      live('입찰 공고', '예상 공고현황', 'map'),   // 옛 '전국 지도' — 화면·키(map)·id는 그대로, 이름만 바뀌어 입찰 공고로 옮김(사용자 11-23) (11-25 '예상 공고현황' — 지도는 아직 공고 전인 기관의 예상 시기만)
      soon('입찰 공고', '입찰 공고 현황', '', '', false, NOTICE_ID, undefined, 'map'),   // 실제 화면(dashboard.js, #notice-root) — 배지 없음, 노출은 입찰 현황판과 같이 서버 map 키 전원(11-09 타팀 공유)
      Object.assign(soon('입찰 공고', '공고 자동 수집', undefined, '', false, COLLECT_NOTICE_ID, COLLECT_NOTICE_ROLES), { allowMaster: true })] },   // 준비중 배지 — 전산팀·전산팀장·관리자(사용자 11-23)
    // 소제목 '제안 준비'는 하나뿐이라 사이드바에 그리지 않는다(soloSubs 없음). 협약준비 단위 task는 메뉴 없이 제안 준비 현황 → 기관 상세 단계에서 진행한다(사용자 11-24).
    { id: 'plan', title: '영업 추진 준비', subs: ['제안 준비'], items: [
      soon('제안 준비', '제안 준비 현황', '', '', false, PREP_ID, TEAM_ROLES),   // 메뉴 이름 제안 준비 현황(사용자 11-24), id는 고정
      soon('제안 준비', '이사회 자료 작성', '',
           '수익성 분석표(엑셀)의 수치를 이사회 자료(워드)의 정해진 자리에 자동으로 채웁니다.', true, BOARD_ID)] },
    // 결재함이 머리 띠로 가며(11-23) '진행·결재'에 한 항목만 남아 소제목이 사라지지 않게 '진행·작성'으로 합쳤다(팀 기본값).
    { id: 'manage', title: '제안서 작성·관리', subs: ['진행·작성', '검토·제출'], items: [
      live('진행·작성', '제안서 진행 현황', 'workflow'),
      live('진행·작성', '작업함', 'tasks'),
      soon('진행·작성', '제안팀 구성·배정', '', '', false, TEAM_ID, TEAM_ROLES),
      soon('진행·작성', '공동 작성·버전 관리'),
      soon('검토·제출', '내부 검토 의견'), soon('검토·제출', '최종 확인·제출')] },
    { id: 'relate', title: '협약·관계 관리', items: [
      soon('', '입찰 결과 등록'), soon('', '협약 이력'),
      soon('', '협약 성과 관리', '', '', false, RESULTS_ID, undefined, 'map', false, PLANS_TEAMS)] },   // 실제 화면(results.js, 05)
    { id: 'tools', title: '공통 도구', subs: ['알림·소통', '검색·AI'], items: [
      soon('알림·소통', '일정·마감 알림'), soon('알림·소통', '요청 이력·소통'),
      live('검색·AI', 'AI 대화', 'chat', null, true), live('검색·AI', '지식 검색', 'knowledge', null, true),
      soon('검색·AI', '사내 업무 키워드 조회')] },
    { id: APPR_CAT, title: '결재함', headOnly: true, items: [   // 머리 띠 [결재함 n] 단추(사이드바에 그리지 않음, 사용자 11-23)
      live('', '결재함', 'approvals')] },
    { id: 'sys', title: '시스템 관리', last: true, items: [
      live('', '사용자 관리', 'admin', 'users'), live('', '권한 관리', 'admin', 'perms'),
      live('', '메뉴 관리', 'admin', 'menus'), live('', '접근 이력', 'admin', 'audit'),
      live('', '사업계획 수집 요청', 'admin', 'collect')] }   // 개발부서 처리 화면(plancollect.js) — 대기 배지는 plancollect.paintNavBadge
  ];

  nav.badgeOf = badgeOf;
  nav.TEAM_ID = TEAM_ID;
  nav.TEAM_ROLES = TEAM_ROLES;
  nav.PREP_ID = PREP_ID;
  nav.DASH_ID = DASH_ID;
  nav.HOME_ID = HOME_ID;
  nav.BOARD_ID = BOARD_ID;
  nav.FINANCE_ROLES = FINANCE_ROLES;
  nav.ROLE_CATS = ROLE_CATS;
  nav.HOME_CAT = HOME_CAT;
  nav.APPR_CAT = APPR_CAT;
  nav.NOTICE_ID = NOTICE_ID;
  nav.PLANS_ID = PLANS_ID;
  nav.PLANS_TEAMS = PLANS_TEAMS;
  nav.RESULTS_ID = RESULTS_ID;
  nav.COLLECT_NOTICE_ID = COLLECT_NOTICE_ID;
  nav.COLLECT_NOTICE_ROLES = COLLECT_NOTICE_ROLES;
  nav.COLLECT_ID = 'admin:collect';   // plancollect.NAV_ID 와 같다 — overdue.paintNavBadge 가 이 항목의 배지를 지우지 않게 알아본다
  // 로그인 뒤 시작화면(포털)을 보는 역할 — 영업팀·영업팀장·영업부장 + 디자이너 + 전산팀·전산팀장(보기 전용, 사용자 결정 11-19). 마스터·재무는 지도.
  nav.isHomeRole = function (ctx) { return nav.roleIn(HOME_ROLES, ctx); };
  // 보기 전용 판정은 이 함수 하나다. 화면은 app.isViewOnly()·dashboard.isViewOnly()로만 읽는다(역할 문자열을 따로 비교하지 않는다).
  nav.VIEW_ONLY_ROLES = VIEW_ONLY_ROLES;
  nav.isViewOnly = function (ctx) { return nav.roleIn(VIEW_ONLY_ROLES, ctx); };
  // 로그인 뒤 시작화면: 시작화면 항목이 보이는 대상 역할이고 아직 지도만 보고 있으면 HOME_ID, 아니면 null(지금 화면 유지).
  // 이미 다른 화면을 열었거나 탭을 연 뒤라면 건드리지 않는다.
  // 로그인 순간(메뉴 권한이 오기 전) 시작화면이 포털일 것으로 보는가 — 본체(portal.mount)가 있고 대상 역할일 때만.
  // 경과 요약 팝업은 이때 잠시 미루고, 실제로 포털이 열리지 않으면(homeItemId가 null) 그때 띄운다.
  // 계정의 시작화면 항목 id(맨 앞 고정 탭이자 제목 클릭 목적지): 대상 역할 = HOME_ID(포털), 재무 = BOARD_ID(이사회 자료 작성), 마스터·그 밖 = null(없음, 제목은 지도로).
  nav.homeIdFor = function (ctx) {
    if (nav.roleIn(HOME_ROLES, ctx)) return HOME_ID;
    if (nav.roleIn(FINANCE_ROLES, ctx)) return BOARD_ID;
    return null;
  };
  // 재무는 포털 본체가 필요 없다(이사회 자료 화면이 따로 있다) — 포털 본체 여부는 HOME_ID일 때만 따진다.
  nav.expectsHome = function (ctx, portalReady) {
    const hid = nav.homeIdFor(ctx);
    if (hid === BOARD_ID) return true;
    return !!portalReady && hid === HOME_ID;
  };
  nav.homeItemId = function (built, activeId, tabs, ctx) {
    const hid = nav.homeIdFor(ctx);
    if (!hid) return null;
    if (nav.categoryOf(built, hid) === null) return null;
    if (activeId === hid) return null;   // 이미 시작화면
    if (activeId && activeId !== 'map') return null;
    const open = tabs || [];
    for (let i = 0; i < open.length; i += 1) { if (open[i].id !== 'map' && open[i].id !== hid) return null; }
    return hid;
  };
  // nav.build 결과에서 그 역할에게 허용된 대분류만 남긴다(ROLE_CATS). build 자체는 바꾸지 않는다 — 호출자(app.paintNav)가 감싼다.
  nav.limitToRole = function (built, ctx) {
    const c = ctx || {};
    const list = c.master ? null : ROLE_CATS[(c.role || '').trim()];
    if (!list) return built;
    return (built || []).filter(function (cat) { return cat.id === 'sys' || list.indexOf(cat.id) >= 0; });
  };
  // 아코디언 분류 id — 단독 항목(시작화면)은 펼칠 분류가 없어 null. 화면 이동이 다른 분류의 열림을 닫지 않게 한다.
  nav.accordionOf = function (built, itemId) {
    const c = nav.categoryOf(built, itemId);
    return (c === HOME_CAT || c === APPR_CAT) ? null : c;
  };
  // 역할 목록에 드는가. 마스터는 영업팀 소속이 아니라 서버가 열람을 막으므로 항상 false.
  nav.roleIn = function (list, ctx) {
    const c = ctx || {};
    if (c.master) return false;
    return list.indexOf((c.role || '').trim()) >= 0;
  };
  // 팀 이름 목록(roles.teamOf 결과)에 드는가. 디자이너는 영업팀 소속으로 본다. 마스터는 통과.
  nav.teamIn = function (teams, ctx) {
    const c = ctx || {};
    if (c.master) return true;
    const role = (c.role || '').trim();
    if (!role) return false;
    return teams.indexOf(roles.teamOf(role === roles.DESIGNER ? roles.DESIGNER_HOME : role)) >= 0;
  };
  nav.isSales = function (ctx) {
    const c = ctx || {};
    if (c.master) return true;
    const role = (c.role || '').trim();
    if (!role) return false;
    return role === roles.DESIGNER || roles.teamOf(role) === roles.teamOf(roles.DESIGNER_HOME);
  };

  // visible = menu_rules.visibleTabs 결과({map:true,...}). 보일 항목이 하나도 없는 카테고리는 뺀다.
  // 준비중 항목에는 id를 붙여 하이라이트·탭에 쓴다: 명시 id가 있으면 그것(이사회 부의), 없으면 `soon:<라벨>`.
  // 정렬: 대분류는 정의 순서 그대로(시스템 관리 last는 맨 끝), 중분류 순서는 cat.subs, 중분류 안에서는 구현 → 준비중(안정 분할).
  // 결과 카테고리의 showSubs: 보이는 중분류가 2개 이상이고 각각 보이는 항목이 2개 이상일 때만 true(cat.soloSubs면 항목 수 조건 면제).
  nav.build = function (visible, ctx) {
    const v = visible || {};
    const sales = nav.isSales(ctx);
    const out = [];
    const tail = [];
    nav.CATEGORIES.forEach(function (cat) {
      const bySub = {};   // sub → {front:[], live:[], soon:[]}
      const subOrder = (cat.subs || ['']).slice();
      subOrder.forEach(function (s) { bySub[s] = { front: [], live: [], soon: [] }; });
      cat.items.forEach(function (it) {
        const sub = it.sub || '';
        if (!bySub[sub]) { bySub[sub] = { front: [], live: [], soon: [] }; subOrder.push(sub); }
        if (it.key) {
          if (v[it.key] !== true) return;
          const id = it.view ? it.key + ':' + it.view : it.key;
          if (it.pending) {
            bySub[sub].soon.push({ label: it.label, key: it.key, view: null, sub: sub, soon: true, pending: true,
                                   id: id, tag: it.tag, note: it.note });
          } else {
            bySub[sub].live.push({ label: it.label, key: it.key, view: it.view || null, sub: sub, soon: false, id: id });
          }
        } else if (it.withKey ? (v[it.withKey] === true && (!it.onlyTeams || nav.teamIn(it.onlyTeams, ctx)) && (!it.onlyRoles || nav.roleIn(it.onlyRoles, ctx)))
                   : it.onlyRoles ? (nav.roleIn(it.onlyRoles, ctx) || (it.allowMaster === true && !!(ctx && ctx.master))) : (sales || (it.visibleWithTasks && v.tasks === true))) {
          const built = { label: it.label, key: null, sub: sub, id: it.id || 'soon:' + it.label,
                          soon: true, tag: it.tag, note: it.note };
          if (it.front) { built.front = true; bySub[sub].front.push(built); } else bySub[sub].soon.push(built);
        }
      });
      const items = [];
      let shownSubs = 0;
      let eachTwo = true;
      subOrder.forEach(function (s) {
        const n = bySub[s].front.length + bySub[s].live.length + bySub[s].soon.length;
        if (!n) return;
        shownSubs += 1;
        if (n < 2) eachTwo = false;
        bySub[s].front.concat(bySub[s].live, bySub[s].soon).forEach(function (i) { items.push(i); });
      });
      if (!items.length) return;
      const built = { id: cat.id, title: cat.title, items: items,
                      showSubs: !!cat.subs && shownSubs >= 2 && (cat.soloSubs === true || eachTwo) };
      if (cat.headOnly) built.headOnly = true;
      (cat.last ? tail : out).push(built);
    });
    return out.concat(tail);
  };

  // 어느 카테고리가 이 항목을 품고 있는가(열어 둘 카테고리를 정할 때).
  nav.categoryOf = function (built, itemId) {
    for (let i = 0; i < built.length; i += 1) {
      for (let j = 0; j < built[i].items.length; j += 1) {
        if (built[i].items[j].id === itemId) return built[i].id;
      }
    }
    return null;
  };

  // ── 사이드바 아코디언(한 번에 하나만 열림 + 마지막 상태 기억, 사용자 결정 11-11) — 순수 규칙 ──
  // 화면 이동: 그 분류를 연다(하나만이므로 다른 분류는 닫힌다). cat이 없으면 지금 상태 유지.
  nav.openOnNavigate = function (open, cat) { return cat || open || null; };
  // 제목 클릭: 열린 걸 다시 누르면 닫고, 다른 걸 누르면 그쪽으로 옮긴다.
  nav.toggleCat = function (open, id) { return open === id ? null : id; };
  // 저장값은 지금 보이는 분류 id일 때만 쓴다(모르는 id·권한으로 사라진 분류는 버린다).
  nav.validOpen = function (built, id) {
    if (!id) return null;
    return (built || []).some(function (c) { return c.id === id; }) ? id : null;
  };
  // 열림 상태 기계(팀 결정 11-11). state = {open: 분류 id|null, fixed: 저장값·사용자 선택이 정했는가, pending: 아직 안 보이는 저장값}.
  //  - 저장값은 사용자가 분류를 직접 펼치거나 접을 때만 쓴다('none' = 모두 접음). 화면 이동·홈 자동 열림은 저장하지 않는다.
  //  - 로그인·새로고침 때 저장값이 있으면 그것이 우선이고, 홈(현황판) 자동 열림이 덮어쓰지 않는다. 없으면 현재 화면의 분류.
  //  - 사용자가 바뀌면 호출자가 새 state({open:null,fixed:false,pending:저장값})로 시작한다(앞 사용자의 open을 쓰지 않는다).
  nav.NONE_OPEN = 'none';
  nav.newOpenState = function (saved) { return { open: null, fixed: false, pending: saved || null }; };
  nav.settleOpen = function (state, built, activeCat) {
    const s = { open: state.open, fixed: state.fixed, pending: state.pending };
    if (s.pending) {
      if (s.pending === nav.NONE_OPEN) { s.open = null; s.fixed = true; s.pending = null; return s; }
      const ok = nav.validOpen(built, s.pending);
      if (ok) { s.open = ok; s.fixed = true; s.pending = null; return s; }
    }
    if (!s.fixed && s.open === null) s.open = activeCat || null;   // 저장값이 없거나 아직 안 보이면 현재 화면 분류
    return s;
  };
  // 화면이 바뀌었다. auto = 홈 자동 열림(사용자가 연 화면이 아님).
  nav.navigatedOpen = function (state, cat, auto) {
    if (!cat) return state;
    if (!auto) return { open: cat, fixed: true, pending: null };            // 사용자가 연 화면의 분류를 연다(저장은 안 함)
    if (state.pending || state.fixed) return state;                         // 자동 열림은 저장값·선택을 덮지 않는다
    return { open: cat, fixed: false, pending: null };
  };
  nav.toggledOpen = function (state, id) { return { open: nav.toggleCat(state.open, id), fixed: true, pending: null }; };

  // 접힌 분류 제목 오른쪽 배지 = 그 분류 안 배지 숫자의 합. 숫자가 아닌 값·0 이하는 세지 않는다.
  nav.catBadgeSum = function (values) {
    let sum = 0;
    (values || []).forEach(function (v) { const n = parseInt(v, 10); if (n > 0) sum += n; });
    return sum;
  };

  // ── 화면 탭(우측 패널 상단) — 메뉴 항목을 연 순서대로 최대 MAX_TABS개 보관 ─────────
  // tabs: [{id,label}]. 모두 순수 함수(입력을 바꾸지 않는다).
  nav.MAX_TABS = 10;

  // 이미 열려 있으면 활성만 옮기고, 새 탭인데 가득 찼으면 full:true(탭·활성 불변).
  // pinId: 맨 앞 고정 탭의 id. 생략(undefined)하면 HOME_ID, null이면 고정 탭 없음(마스터), 재무는 BOARD_ID.
  nav.openTab = function (tabs, item, activeId, max, pinId) {
    const limit = max || nav.MAX_TABS;
    const pin = pinId === undefined ? HOME_ID : pinId;
    const list = tabs || [];
    const exists = list.some(function (t) { return t.id === item.id; });
    if (exists) return { tabs: list.slice(), activeId: item.id, full: false };
    const tab = { id: item.id, label: item.label };
    if (pin && item.id === pin) return { tabs: [tab].concat(list), activeId: item.id, full: false };   // 시작화면: 맨 앞 고정, 개수 제한에 세지 않는다
    const used = list.filter(function (t) { return t.id !== pin; }).length;
    if (used >= limit) return { tabs: list.slice(), activeId: activeId || null, full: true };
    return { tabs: list.concat([tab]), activeId: item.id, full: false };
  };

  // 닫은 뒤 활성: 닫은 게 활성이 아니면 그대로, 활성이면 오른쪽 이웃 → 왼쪽 이웃 → null.
  nav.closeTab = function (tabs, id, activeId, pinId) {
    const list = tabs || [];
    const pin = pinId === undefined ? HOME_ID : pinId;
    if (pin && id === pin) return { tabs: list.slice(), activeId: activeId || null };   // 시작화면 탭은 닫을 수 없다
    const i = list.findIndex(function (t) { return t.id === id; });
    if (i < 0) return { tabs: list.slice(), activeId: activeId || null };
    const rest = list.slice(0, i).concat(list.slice(i + 1));
    if (id !== activeId) return { tabs: rest, activeId: activeId || null };
    const next = rest[i] || rest[i - 1] || null;
    return { tabs: rest, activeId: next ? next.id : null };
  };

  // 권한·로그아웃으로 사라진 항목의 탭을 걷어 낸다(built = nav.build 결과).
  nav.pruneTabs = function (tabs, built) {
    return (tabs || []).filter(function (t) { return nav.categoryOf(built, t.id) !== null; });
  };

  // topbar(기관 분류·CSV·지도 색상)와 임박 TOP5는 지도·지역별에서만 의미가 있다.
  nav.SHOWS_MAP_CONTROLS = ['map', 'regions'];
  nav.showsMapControls = function (tab) { return nav.SHOWS_MAP_CONTROLS.indexOf(tab) >= 0; };

  // 접근 이력에 보낼 화면 이름. 서버(/auth/screen)는 메뉴 키 꼴만 받는다: 이사회 자료는 업무 메뉴 'tasks'의 하위 'tasks:board',
  // 그 밖의 준비중 화면('soon:…')과 빈 값은 기록하지 않는다(null).
  nav.screenName = function (id, boardId) {
    if (!id) return null;
    if (boardId && id === boardId) return 'tasks:board';
    if (String(id).indexOf('soon:') === 0) return null;
    return id;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = nav;
  else root.nav = nav;
})(typeof self !== 'undefined' ? self : this);
