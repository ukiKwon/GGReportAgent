(function (root) {
  'use strict';
  // 좌측 업무 메뉴 — 6개 카테고리와 그 아래 기능. DOM을 모르는 순수 규칙만 둔다.
  //
  // 세 가지를 지킨다.
  //  1. **권한은 서버가 정한다.** 구현된 항목(`key`)은 기존 /menus 8개 키(menu_rules의
  //     visibleTabs 결과)가 켠 것만 보인다. 이 파일이 메뉴 권한을 새로 만들지 않는다.
  //  2. **`준비중` 항목은 영업 계열에게만 보인다.** 아직 만들지 않은 기능이 다른 팀 화면까지
  //     어지럽히지 않게 한다(요청: 영업팀 전용 기능). 영업 계열 = 영업팀·영업팀장·영업부장·
  //     디자이너(영업팀 소속) + 마스터.
  //  3. **한 화면은 한 항목에만 둔다.** 같은 탭을 두 곳에 걸면 어느 쪽이 "지금 위치"인지
  //     하이라이트가 모호해진다.
  const roles = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./roles.js') : root.roles;

  const nav = {};

  // view: 한 화면(key) 안의 하위 보기. 시스템 관리 4항목이 같은 'admin' 탭을 쓴다(항목 id = key:view).
  function live(label, key, view) { return view ? { label: label, key: key, view: view } : { label: label, key: key }; }
  // tag: 사이드바 배지·안내 화면에 쓰는 글. 기본 '준비중', 구현 계획이 잡힌 것만 '구현 예정'.
  function soon(label, tag, note) { return { label: label, soon: true, tag: tag || '준비중', note: note || '' }; }

  nav.CATEGORIES = [
    { id: 'opp', title: '기관영업 기획 관리', items: [
      live('전국 지도', 'map'), live('전국 지역별', 'regions'),
      soon('과거 영업 이력·협약 현황'), soon('영업 메모·활동 이력'),
      soon('이사회 자료', '구현 예정',
           '수익성 분석표(엑셀)의 수치를 이사회 자료(워드)의 정해진 자리에 자동으로 채웁니다.')] },
    { id: 'bid', title: '입찰 공고 통합 현황', items: [
      soon('공고 자동 수집(RPA)'), soon('일정·마감 알림'),
      soon('공고 검색'), soon('관심 공고·담당자 공유')] },
    { id: 'match', title: '과제 매칭', items: [
      soon('업무 매칭 요청·일정'), soon('기술·데이터 지원 요청'),
      soon('담당자 지정·진행 알림'), soon('요청 이력·소통')] },
    { id: 'docs', title: '제안서 자료 관리', items: [
      live('지식 검색', 'knowledge'), live('대화(질의)', 'chat'),
      soon('질의사항 정리·내부 검토'), soon('검토 의견·대응 방향')] },
    { id: 'collab', title: '제안서 협업 및 결재', items: [
      live('워크플로', 'workflow'), live('작업함', 'tasks'), live('결재함', 'approvals'),
      soon('공동 작성·버전 관리')] },
    { id: 'result', title: '결과 이력 관리', items: [
      soon('최종 확인·제출'), soon('제출 결과·평가 대응'),
      soon('협약 등록·사후관리'), soon('기관별 전체 이력')] },
    { id: 'sys', title: '시스템 관리', items: [
      live('사용자 관리', 'admin', 'users'), live('권한 관리', 'admin', 'perms'),
      live('메뉴 관리', 'admin', 'menus'), live('접근 이력', 'admin', 'audit')] }
  ];

  nav.isSales = function (ctx) {
    const c = ctx || {};
    if (c.master) return true;
    const role = (c.role || '').trim();
    if (!role) return false;
    return role === roles.DESIGNER || roles.teamOf(role) === roles.teamOf(roles.DESIGNER_HOME);
  };

  // visible = menu_rules.visibleTabs 결과({map:true,...}). 보일 항목이 하나도 없는 카테고리는 뺀다.
  // 준비중 항목에는 안정적인 id(`soon:<카테고리>:<순번>`)를 붙여 하이라이트에 쓴다.
  nav.build = function (visible, ctx) {
    const v = visible || {};
    const sales = nav.isSales(ctx);
    const out = [];
    nav.CATEGORIES.forEach(function (cat) {
      const items = [];
      cat.items.forEach(function (it, i) {
        if (it.key) {
          if (v[it.key] === true) {
            items.push({ label: it.label, key: it.key, view: it.view || null, soon: false,
                         id: it.view ? it.key + ':' + it.view : it.key });
          }
        } else if (sales) {
          items.push({ label: it.label, key: null, id: 'soon:' + cat.id + ':' + i, soon: true, tag: it.tag, note: it.note });
        }
      });
      if (items.length) out.push({ id: cat.id, title: cat.title, items: items });
    });
    return out;
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

  if (typeof module !== 'undefined' && module.exports) module.exports = nav;
  else root.nav = nav;
})(typeof self !== 'undefined' ? self : this);
