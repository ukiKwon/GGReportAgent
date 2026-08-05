(function (root) {
  'use strict';
  // 역할별 메뉴 → 탭 노출 규칙 (계획 I Task 3).
  //
  // 예전에는 이 규칙이 app.js에 흩어져 있었다(SERVER_ONLY_IDS 배열 + applyDesignerUI의
  // 소속 문자열 비교). 이제 서버(backend/menus.py)가 역할별 값을 주고, 여기서는
  // **"서버가 켠 것 ∩ 지금 열 수 있는 것"** 만 계산한다. DOM을 모르므로 node로 고정된다.
  const menuRules = {};

  // backend/menus.py의 MENUS와 같은 순서·같은 목록이어야 한다.
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

  // 숨긴 탭이 열려 있으면 빈 화면이 남는다 — 어디로 돌려보낼지.
  menuRules.activeFallback = function (activeKey, visible) {
    if (!activeKey) return null;
    if ((visible || {})[activeKey]) return null;
    return 'map';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = menuRules;
  else root.menuRules = menuRules;
})(typeof self !== 'undefined' ? self : this);
