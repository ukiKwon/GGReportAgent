(function (root) {
  'use strict';
  const exporter = {};
  exporter.serializeInstitutions = function (list) {
    return 'window.institutions = ' + JSON.stringify(list, null, 2) + ';\n';
  };
  exporter.downloadInstitutions = function (list) {
    const text = '// 편집 반영본 — dashboard/data/institutions.js 로 교체하세요. sources는 1개 이상 필수.\n' +
      exporter.serializeInstitutions(list);
    const blob = new Blob([text], { type:'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'institutions.js';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exporter;
  else root.exporter = exporter;
})(typeof self !== 'undefined' ? self : this);
