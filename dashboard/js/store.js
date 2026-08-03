(function (root) {
  'use strict';
  const store = {};
  const WATCH_KEY = 'tbd.watchRegions';
  const EDIT_KEY = 'tbd.edits';
  const INTEREST_KEY = 'tbd.interest';
  const DATA_KEY = 'tbd.data';
  const THEME_KEY = 'tbd.mapTheme';
  function LS() { return (typeof localStorage !== 'undefined') ? localStorage : null; }
  function read(key, fallback) {
    const ls = LS(); if (!ls) return fallback;
    try { const v = ls.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) { const ls = LS(); if (ls) ls.setItem(key, JSON.stringify(val)); }

  store.loadWatch = function () { return read(WATCH_KEY, []); };
  store.saveWatch = function (arr) { write(WATCH_KEY, arr); };
  store.isWatched = function (code) { return store.loadWatch().indexOf(code) >= 0; };
  store.toggleWatch = function (code) {
    const a = store.loadWatch(); const i = a.indexOf(code);
    if (i >= 0) a.splice(i, 1); else a.push(code);
    store.saveWatch(a); return a;
  };
  store.reorderWatch = function (from, to) {
    const a = store.loadWatch(); const x = a.splice(from, 1)[0];
    a.splice(to, 0, x); store.saveWatch(a); return a;
  };

  // 서버 registry에 대응 필드가 없는 것들 — 서버 모드에서도 localStorage overlay가
  // 유일한 저장처다. 서버 필드(name·type·region·term·lastBid·contractEnd)를 overlay가
  // 덮으면 타 사용자의 서버 변경이 화면에 영영 안 나온다(계획 B 최종리뷰 F4).
  // logic.ALL_FIELDS의 부분집합이지만 여기 두는 이유: store.js는 다른 모듈을 참조하지
  // 않는 구조라, 전역/require 이중 참조를 만드는 대신 자체 상수로 둔다.
  store.LOCAL_ONLY_FIELDS = ['subRegion', 'confirmed', 'lng', 'lat', 'sources', 'updatedAt'];

  store.loadEdits = function () { return read(EDIT_KEY, {}); };
  // 저장은 필터링하지 않는다 — 서버↔폴백을 오가도 로컬 편집 이력이 보존돼야 하고,
  // 폴백 모드에서는 그 값이 여전히 유일한 진실이기 때문. 필터는 적용(applyEdits) 시점에.
  store.setEdit = function (name, partial) {
    const e = store.loadEdits(); e[name] = Object.assign({}, e[name], partial);
    write(EDIT_KEY, e); return e;
  };
  store.applyEdits = function (list) {
    const e = store.loadEdits();
    const serverMode = store.isServerMode();
    return list.map(function (r) {
      const patch = e[r.name];
      if (!patch) return r;
      if (!serverMode) return Object.assign({}, r, patch);   // file://에선 overlay가 유일 저장소
      const filtered = {};
      store.LOCAL_ONLY_FIELDS.forEach(function (f) {
        if (Object.prototype.hasOwnProperty.call(patch, f)) filtered[f] = patch[f];
      });
      return Object.assign({}, r, filtered);
    });
  };

  store.loadInterest = function () { return read(INTEREST_KEY, []); };
  store.isInterested = function (name) { return store.loadInterest().indexOf(name) >= 0; };
  store.toggleInterest = function (name) {
    const a = store.loadInterest(); const i = a.indexOf(name);
    if (i >= 0) a.splice(i, 1); else a.push(name);
    write(INTEREST_KEY, a); return a;
  };
  let serverList = null;   // 서버 모드 in-memory — localStorage에 절대 쓰지 않는다
  store.setServerData = function (list) { serverList = list; };
  // 폴백 모드로 되돌린다 — 테스트가 서버 모드를 남기지 않게 하는 용도(계획 B 이월).
  store.clearServerData = function () { serverList = null; };
  store.isServerMode = function () { return serverList !== null; };
  store.loadData = function () { return serverList || read(DATA_KEY, null); };
  store.saveData = function (list) { write(DATA_KEY, list); };

  // 지도 테마(임박 5색 + 물결/깜빡임 색·주기) — IT 담당자가 화면에서 바꾼 값을 보존.
  // 저장값은 부분(partial)일 수 있어 render.applyTheme이 기본값 위에 덮어쓴다.
  store.loadTheme = function () { return read(THEME_KEY, {}); };
  store.saveTheme = function (theme) { write(THEME_KEY, theme || {}); return store.loadTheme(); };
  store.resetTheme = function () { const ls = LS(); if (ls) ls.removeItem(THEME_KEY); return {}; };

  if (typeof module !== 'undefined' && module.exports) module.exports = store;
  else root.store = store;
})(typeof self !== 'undefined' ? self : this);
