(function (root) {
  'use strict';
  const logic = {};
  // 이후 태스크에서 채워짐
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  else root.logic = logic;
})(typeof self !== 'undefined' ? self : this);
