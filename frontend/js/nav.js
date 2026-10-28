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

  function live(label, key) { return { label: label, key: key }; }
  // tag: 사이드바 배지·안내 화면에 쓰는 글. 기본 '준비중', 구현 계획이 잡힌 것만 '구현 예정'.
  function soon(label, tag, note) { return { label: label, soon: true, tag: tag || '준비중', note: note || '' }; }

  nav.CATEGORIES = [
    { id: 'opp', title: '기관 영업기회 관리', items: [
      live('전국 지도', 'map'), live('전국 지역별', 'regions'),
      soon('과거 영업 이력·협약 현황'), soon('영업 메모·활동 이력')] },
    { id: 'bid', title: '입찰 공고 통합 현황', items: [
      soon('공고 자동 수집(RPA)'), soon('일정·마감 알림'),
      soon('공고 검색'), soon('관심 공고·담당자 공유')] },
    { id: 'match', title: '과제 매칭', items: [
      soon('업무 매칭 요청·일정'), soon('기술·데이터 지원 요청'),
      soon('담당자 지정·진행 알림'), soon('요청 이력·소통')] },
    { id: 'docs', title: '제안서 자료 관리', items: [
      live('지식 검색', 'knowledge'), live('대화(질의)', 'chat'),
      soon('질의사항 정리·내부 검토'), soon('검토 의견·대응 방향'),
      soon('엑셀 → 워드 자동 기입', '구현 예정',
           '수익성 분석표(엑셀)의 수치를 이사회 자료(워드)의 정해진 자리에 자동으로 채웁니다.')] },
    { id: 'collab', title: '제안서 협업 및 결재', items: [
      live('워크플로', 'workflow'), live('작업함', 'tasks'), live('결재함', 'approvals'),
      soon('공동 작성·버전 관리')] },
    { id: 'result', title: '결과 이력 관리', items: [
      soon('최종 확인·제출'), soon('제출 결과·평가 대응'),
      soon('협약 등록·사후관리'), soon('기관별 전체 이력')] },
    { id: 'sys', title: '시스템', items: [live('권한관리', 'admin')] }
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
          if (v[it.key] === true) items.push({ label: it.label, key: it.key, id: it.key, soon: false });
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

  // topbar(기관 분류·CSV·지도 색상)와 임박 TOP5는 지도·지역별에서만 의미가 있다.
  nav.SHOWS_MAP_CONTROLS = ['map', 'regions'];
  nav.showsMapControls = function (tab) { return nav.SHOWS_MAP_CONTROLS.indexOf(tab) >= 0; };

  if (typeof module !== 'undefined' && module.exports) module.exports = nav;
  else root.nav = nav;
})(typeof self !== 'undefined' ? self : this);
