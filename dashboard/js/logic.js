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

  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  else root.logic = logic;
})(typeof self !== 'undefined' ? self : this);
