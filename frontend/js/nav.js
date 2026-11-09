(function (root) {
  'use strict';
  // 좌측 업무 메뉴 — 3단(대분류 6 + 시스템 관리 / 중분류 = 누를 수 없는 소제목 / 소분류 = 항목).
  // DOM을 모르는 순수 규칙만 둔다. 항목 배열은 평평하고 항목마다 `sub`(중분류 이름) 한 칸만 더한다.
  //
  // 네 가지를 지킨다.
  //  1. **권한은 서버가 정한다.** 구현된 항목(`key`)은 기존 /menus 8개 키(menu_rules의
  //     visibleTabs 결과)가 켠 것만 보인다. 이 파일이 메뉴 권한을 새로 만들지 않는다.
  //  2. **`준비중` 항목은 영업 계열에게만 보인다.** 아직 만들지 않은 기능이 다른 팀 화면까지
  //     어지럽히지 않게 한다(요청: 영업팀 전용 기능). 영업 계열 = 영업팀·영업팀장·영업부장·
  //     디자이너(영업팀 소속) + 마스터. 예외: visibleWithTasks('이사회 자료 작성','팀 간 지원 요청')는 작업함 조회 권한이 있어도 보인다.
  //     키가 있는데 준비중인 항목(pending: AI 대화·지식 검색)은 서버 키(v[key])가 켠 사람에게 보인다.
  //  3. **한 화면은 한 항목에만 둔다.** 같은 탭을 두 곳에 걸면 어느 쪽이 "지금 위치"인지
  //     하이라이트가 모호해진다.
  //  4. **대분류 순서는 정의 순서(업무 1→6) 고정, 시스템 관리(last)는 맨 끝.** 중분류 안에서는 구현 → 준비중 순.
  //     중분류 소제목(showSubs)은 보이는 중분류가 2개 이상이고 각각 보이는 항목이 2개 이상일 때만 모두 보인다.
  const roles = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./roles.js') : root.roles;

  const nav = {};

  // view: 한 화면(key) 안의 하위 보기. 시스템 관리 4항목이 같은 'admin' 탭을 쓴다(항목 id = key:view).
  // sub: 중분류 이름(소제목). pending: 서버 키는 있지만 화면은 아직 준비중 안내만 연다(AI 대화·지식 검색).
  function live(sub, label, key, view, pending) {
    const o = { sub: sub, label: label, key: key };
    if (view) o.view = view;
    if (pending) { o.pending = true; o.tag = '준비중'; o.note = ''; }
    return o;
  }
  // tag: 사이드바 배지·안내 화면에 쓰는 글. 기본 '준비중', 구현 계획이 잡힌 것만 '구현 예정'. 빈 글자('')는 배지 없음(이미 열리는 화면).
  // withTasks: true면 영업 계열이 아니어도 작업함 조회 권한(visible.tasks)이 있으면 보인다(이사회 부의·팀 간 지원 요청).
  // id: 라벨을 고쳐도 열어 둔 탭·화면 연결이 끊기지 않게 고정할 때만 준다(이사회 부의 = board.SOON_ID). 없으면 'soon:'+라벨.
  function soon(sub, label, tag, note, withTasks, id) {
    const o = { sub: sub, label: label, soon: true, tag: tag === '' ? '' : (tag || '준비중'), note: note || '' };
    if (withTasks) o.visibleWithTasks = true;
    if (id) o.id = id;
    return o;
  }
  // 사이드바에 붙일 배지 글(순수). 준비중 항목만, tag가 ''이면 배지 없음.
  function badgeOf(it) { return it && it.soon ? (it.tag === '' ? '' : (it.tag || '준비중')) : ''; }

  // 이사회 부의 항목 id — board.SOON_ID와 같아야 한다(라벨을 고쳐도 실화면 연결·접근 이력 'tasks:board'가 끊기지 않게 고정).
  const BOARD_ID = 'soon:이사회 자료';

  // subs: 중분류 순서. 항목마다 sub로 소속을 가리킨다(시스템 관리는 중분류 없음).
  nav.CATEGORIES = [
    { id: 'scan', title: '기관·입찰 현황', subs: ['기관', '입찰 공고'], items: [
      live('기관', '전국 지도', 'map'), live('기관', '전국 지역별', 'regions'),
      soon('기관', '기관 사업계획'),
      soon('입찰 공고', '입찰 공고 현황'), soon('입찰 공고', '공고 자동 수집')] },
    { id: 'plan', title: '영업 기획', subs: ['대상 분석', '질의·부의'], items: [
      soon('대상 분석', '협약 대상 선정'), soon('대상 분석', '기관 정보 요약서'),
      soon('대상 분석', '배점표 확인 검색'),
      soon('질의·부의', '기관 공식 질의'),
      soon('질의·부의', '이사회 자료 작성', '',
           '수익성 분석표(엑셀)의 수치를 이사회 자료(워드)의 정해진 자리에 자동으로 채웁니다.', true, BOARD_ID)] },
    { id: 'manage', title: '제안서 관리', subs: ['진행·결재', '제안팀'], items: [
      live('진행·결재', '제안서 진행 현황', 'workflow'), live('진행·결재', '결재함', 'approvals'),
      soon('제안팀', '제안팀 구성·배정'),
      soon('제안팀', '팀 간 지원 요청', '준비중', '', true)] },
    { id: 'write', title: '제안서 작성', subs: ['작성', '검토·제출'], items: [
      live('작성', '작업함', 'tasks'), soon('작성', '공동 작성·버전 관리'),
      soon('검토·제출', '내부 검토 의견'), soon('검토·제출', '최종 확인·제출')] },
    { id: 'relate', title: '협약·관계 관리', subs: ['결과·협약', '기관 관계'], items: [
      soon('결과·협약', '입찰 결과 등록'), soon('결과·협약', '협약 등록·이행 관리'),
      soon('기관 관계', '협약 이력'), soon('기관 관계', '영업 메모·활동 이력'),
      soon('기관 관계', '탈락 기관 대응')] },
    { id: 'tools', title: '공통 도구', subs: ['알림·소통', '검색·AI'], items: [
      soon('알림·소통', '일정·마감 알림'), soon('알림·소통', '요청 이력·소통'),
      live('검색·AI', 'AI 대화', 'chat', null, true), live('검색·AI', '지식 검색', 'knowledge', null, true),
      soon('검색·AI', '사내 업무 키워드 조회')] },
    { id: 'sys', title: '시스템 관리', last: true, items: [
      live('', '사용자 관리', 'admin', 'users'), live('', '권한 관리', 'admin', 'perms'),
      live('', '메뉴 관리', 'admin', 'menus'), live('', '접근 이력', 'admin', 'audit')] }
  ];

  nav.badgeOf = badgeOf;
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
  // 결과 카테고리의 showSubs: 보이는 중분류가 2개 이상이고 각각 보이는 항목이 2개 이상일 때만 true.
  nav.build = function (visible, ctx) {
    const v = visible || {};
    const sales = nav.isSales(ctx);
    const out = [];
    const tail = [];
    nav.CATEGORIES.forEach(function (cat) {
      const bySub = {};   // sub → {live:[], soon:[]}
      const subOrder = (cat.subs || ['']).slice();
      subOrder.forEach(function (s) { bySub[s] = { live: [], soon: [] }; });
      cat.items.forEach(function (it) {
        const sub = it.sub || '';
        if (!bySub[sub]) { bySub[sub] = { live: [], soon: [] }; subOrder.push(sub); }
        if (it.key) {
          if (v[it.key] !== true) return;
          const id = it.view ? it.key + ':' + it.view : it.key;
          if (it.pending) {
            bySub[sub].soon.push({ label: it.label, key: it.key, view: null, sub: sub, soon: true, pending: true,
                                   id: id, tag: it.tag, note: it.note });
          } else {
            bySub[sub].live.push({ label: it.label, key: it.key, view: it.view || null, sub: sub, soon: false, id: id });
          }
        } else if (sales || (it.visibleWithTasks && v.tasks === true)) {
          bySub[sub].soon.push({ label: it.label, key: null, sub: sub, id: it.id || 'soon:' + it.label,
                                 soon: true, tag: it.tag, note: it.note });
        }
      });
      const items = [];
      let shownSubs = 0;
      let eachTwo = true;
      subOrder.forEach(function (s) {
        const n = bySub[s].live.length + bySub[s].soon.length;
        if (!n) return;
        shownSubs += 1;
        if (n < 2) eachTwo = false;
        bySub[s].live.concat(bySub[s].soon).forEach(function (i) { items.push(i); });
      });
      if (!items.length) return;
      const built = { id: cat.id, title: cat.title, items: items,
                      showSubs: !!cat.subs && shownSubs >= 2 && eachTwo };
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

  // ── 화면 탭(우측 패널 상단) — 메뉴 항목을 연 순서대로 최대 MAX_TABS개 보관 ─────────
  // tabs: [{id,label}]. 모두 순수 함수(입력을 바꾸지 않는다).
  nav.MAX_TABS = 10;

  // 이미 열려 있으면 활성만 옮기고, 새 탭인데 가득 찼으면 full:true(탭·활성 불변).
  nav.openTab = function (tabs, item, activeId, max) {
    const limit = max || nav.MAX_TABS;
    const list = tabs || [];
    const exists = list.some(function (t) { return t.id === item.id; });
    if (exists) return { tabs: list.slice(), activeId: item.id, full: false };
    if (list.length >= limit) return { tabs: list.slice(), activeId: activeId || null, full: true };
    return { tabs: list.concat([{ id: item.id, label: item.label }]), activeId: item.id, full: false };
  };

  // 닫은 뒤 활성: 닫은 게 활성이 아니면 그대로, 활성이면 오른쪽 이웃 → 왼쪽 이웃 → null.
  nav.closeTab = function (tabs, id, activeId) {
    const list = tabs || [];
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
