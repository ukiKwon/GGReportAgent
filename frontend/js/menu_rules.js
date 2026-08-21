(function (root) {
  'use strict';
  // 역할별 메뉴 → 탭 노출 규칙 (계획 I Task 3).
  //
  // 예전에는 이 규칙이 app.js에 흩어져 있었다(SERVER_ONLY_IDS 배열 + applyDesignerUI의
  // 소속 문자열 비교). 이제 서버(server/menus.py)가 역할별 값을 주고, 여기서는
  // **"서버가 켠 것 ∩ 지금 열 수 있는 것"** 만 계산한다. DOM을 모르므로 node로 고정된다.
  const menuRules = {};

  // server/menus.py의 MENUS와 같은 순서·같은 목록이어야 한다.
  menuRules.MENU_KEYS = ['map', 'regions', 'workflow', 'chat', 'knowledge',
    'tasks', 'approvals', 'admin'];
  // file://에서는 API가 없어 열 수 없는 것들.
  menuRules.SERVER_ONLY = ['workflow', 'chat', 'knowledge', 'tasks', 'approvals', 'admin'];

  menuRules.tabButtonId = function (key) { return 'tab-btn-' + key; };

  menuRules.visibleTabs = function (menus, serverMode) {
    const src = menus || {};
    const out = {};
    menuRules.MENU_KEYS.forEach(function (key) {
      // 권한을 모를 때(조회 실패·응답 없음)는 **닫는 쪽**으로 기운다 — 열어주는 쪽으로
      // 기울면 서버가 잠깐 흔들린 순간 전원이 관리 화면을 보게 된다.
      let on = src[key] === true;
      if (!serverMode && menuRules.SERVER_ONLY.indexOf(key) >= 0) on = false;
      out[key] = on;
    });
    // 지도·지역별은 서버가 없어도 도는 화면이라, 응답이 없을 때도 남긴다.
    if (!menus) { out.map = true; out.regions = true; }
    return out;
  };

  // `/menus` 조회는 프로필이 바뀔 때마다 나간다. 사람이 소속과 직책을 연달아 고르면
  // 요청이 겹치는데, **응답이 도착하는 순서는 요청 순서와 다를 수 있다.** 먼저 나간
  // 요청의 응답이 나중에 도착하면 옛 역할의 메뉴가 최종 화면이 되고, 다음 프로필
  // 변경 전까지 그대로 남는다 — 2026-08-06 브라우저 검증에서 실제로 재현됐다
  // (저장된 역할은 `영업부장`인데 화면은 `영업팀` 메뉴였다). 역할에 없는 탭이 열린 채
  // 남는다는 뜻이라, 위 visibleTabs의 "닫는 쪽으로 기운다" 원칙과도 어긋난다.
  //
  // 요청마다 번호를 붙여 **이미 더 새 응답을 칠했으면 옛 응답은 버린다.** 요청을
  // 취소하지 않는 이유는 실패 응답도 화면을 칠하기 때문이다(닫는 쪽으로) — 취소하면
  // 그 보호가 같이 사라진다. 버리는 쪽이 안전하다.
  menuRules.latestGuard = function () {
    let issued = 0;
    let applied = 0;
    return {
      next: function () { issued += 1; return issued; },
      accept: function (token) {
        if (token <= applied) return false;
        applied = token;
        return true;
      }
    };
  };

  // 숨긴 탭이 열려 있으면 빈 화면이 남는다 — 어디로 돌려보낼지.
  menuRules.activeFallback = function (activeKey, visible) {
    if (!activeKey) return null;
    if ((visible || {})[activeKey]) return null;
    return 'map';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = menuRules;
  else root.menuRules = menuRules;
})(typeof self !== 'undefined' ? self : this);
