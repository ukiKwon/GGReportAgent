(function (root) {
  'use strict';
  const app = {};
  app.enterRegion = function (code) {
    root.render.flyToRegion(code, function () {
      document.getElementById('breadcrumb').style.display = 'block';
      document.getElementById('crumb-region').textContent = root.render.REGION_NAME[code] || code;
    });
  };
  app.backToNational = function () {
    document.getElementById('breadcrumb').style.display = 'none';
    root.render.drawNational();
  };
  app.onTabChange = function (tab) { /* Task 12에서 보강 */ };

  app.init = function () {
    if (window.__d3failed || typeof d3 === 'undefined') { /* Task 14 폴백 */ return; }
    root.render.drawNational();
    document.getElementById('btn-back').addEventListener('click', app.backToNational);
  };
  document.addEventListener('DOMContentLoaded', app.init);

  root.app = app;
})(typeof self !== 'undefined' ? self : this);
