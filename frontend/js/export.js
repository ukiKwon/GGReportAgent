(function (root) {
  'use strict';
  const exporter = {};
  const logic = (typeof require !== 'undefined') ? require('./logic.js') : root.logic;
  exporter.serializeInstitutions = function (list) {
    return 'window.institutions = ' + JSON.stringify(list, null, 2) + ';\n';
  };
  exporter.downloadInstitutions = function (list) {
    const text = '// 편집 반영본 — frontend/data/institutions.js 로 교체하세요.\n' +
      exporter.serializeInstitutions(list);
    const blob = new Blob([text], { type:'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'institutions.js';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  exporter.buildTemplateText = function () { return logic.buildCsvTemplate(); };
  exporter._download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  exporter.downloadCsvTemplate = function () {
    exporter._download('입찰정보_템플릿.csv', exporter.buildTemplateText(), 'text/csv;charset=utf-8');
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exporter;
  else root.exporter = exporter;
})(typeof self !== 'undefined' ? self : this);
