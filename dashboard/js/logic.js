(function (root) {
  'use strict';
  const logic = {};

  logic.URGENCY = { RED:'red', ORANGE:'orange', YELLOW:'yellow', BLUE:'blue', GRAY:'gray' };

  logic.daysUntil = function (contractEnd, today) {
    if (!contractEnd) return Infinity;
    const end = new Date(contractEnd + 'T00:00:00');
    if (isNaN(end.getTime())) return Infinity;
    return Math.floor((end - today) / 86400000);
  };

  logic.computeUrgency = function (contractEnd, today) {
    const d = logic.daysUntil(contractEnd, today);
    if (d === Infinity) return logic.URGENCY.GRAY;
    if (d <= 182) return logic.URGENCY.RED;   // 6개월(≈182일) 이내, 과거 포함
    if (d <= 365) return logic.URGENCY.ORANGE;
    if (d <= 730) return logic.URGENCY.YELLOW;
    return logic.URGENCY.BLUE;
  };

  logic.REQUIRED_FIELDS = ['name','type','region','confidence','sources'];

  logic.validateRecord = function (rec) {
    const missing = [];
    logic.REQUIRED_FIELDS.forEach(function (f) {
      if (f === 'sources') {
        if (!Array.isArray(rec.sources) || rec.sources.length === 0) missing.push('sources');
      } else if (rec[f] === undefined || rec[f] === null || rec[f] === '') {
        missing.push(f);
      }
    });
    return { valid: missing.length === 0, missing: missing };
  };

  logic.recordGlyph = function (rec) {
    if (!logic.validateRecord(rec).valid) return '!';
    if (!rec.contractEnd) return '?';
    return '';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  else root.logic = logic;
})(typeof self !== 'undefined' ? self : this);
