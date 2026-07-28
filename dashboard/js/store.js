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

  store.loadEdits = function () { return read(EDIT_KEY, {}); };
  store.setEdit = function (name, partial) {
    const e = store.loadEdits(); e[name] = Object.assign({}, e[name], partial);
    write(EDIT_KEY, e); return e;
  };
  store.applyEdits = function (list) {
    const e = store.loadEdits();
    return list.map(function (r) { return e[r.name] ? Object.assign({}, r, e[r.name]) : r; });
  };

  store.loadInterest = function () { return read(INTEREST_KEY, []); };
  store.isInterested = function (name) { return store.loadInterest().indexOf(name) >= 0; };
  store.toggleInterest = function (name) {
    const a = store.loadInterest(); const i = a.indexOf(name);
    if (i >= 0) a.splice(i, 1); else a.push(name);
    write(INTEREST_KEY, a); return a;
  };
  store.loadData = function () { return read(DATA_KEY, null); };
  store.saveData = function (list) { write(DATA_KEY, list); };

  // 지도 테마(임박 5색 + 물결/깜빡임 색·주기) — IT 담당자가 화면에서 바꾼 값을 보존.
  // 저장값은 부분(partial)일 수 있어 render.applyTheme이 기본값 위에 덮어쓴다.
  store.loadTheme = function () { return read(THEME_KEY, {}); };
  store.saveTheme = function (theme) { write(THEME_KEY, theme || {}); return store.loadTheme(); };
  store.resetTheme = function () { const ls = LS(); if (ls) ls.removeItem(THEME_KEY); return {}; };

  if (typeof module !== 'undefined' && module.exports) module.exports = store;
  else root.store = store;
})(typeof self !== 'undefined' ? self : this);
