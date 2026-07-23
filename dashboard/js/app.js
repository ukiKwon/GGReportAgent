(function (root) {
  'use strict';
  const app = {};
  app.enterRegion = function (code) { /* Task 8에서 구현 */ console.log('enterRegion', code); };
  app.onTabChange = function (tab) { /* Task 12에서 보강 */ };

  app.init = function () {
    if (window.__d3failed || typeof d3 === 'undefined') { /* Task 14 폴백 */ return; }
    root.render.drawNational();
  };
  document.addEventListener('DOMContentLoaded', app.init);

  root.app = app;
})(typeof self !== 'undefined' ? self : this);
