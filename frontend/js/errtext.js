(function (root) {
  'use strict';
  // 서버 오류 본문 detail 해석기(공용).
  // detail은 문자열일 수도 {code,message} 객체일 수도 있다(ApiExceptionHandler: FastAPI와 같은 모양).
  // 문자열이 아닌 값을 그대로 new Error(detail)에 넣으면 화면에 "[object Object]"가 뜬다.
  const errtext = {};

  // → { code, message }. 모르는 모양(배열·숫자·null)은 둘 다 빈 글자 — 지어내지 않는다.
  errtext.parse = function (detail) {
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      return {
        code: typeof detail.code === 'string' ? detail.code : '',
        message: typeof detail.message === 'string' ? detail.message.trim() : '',
      };
    }
    if (typeof detail === 'string') return { code: '', message: detail.trim() };
    return { code: '', message: '' };
  };

  // 화면에 낼 글: message → 없으면 fallback. 항상 문자열.
  errtext.message = function (detail, fallback) {
    return errtext.parse(detail).message || String(fallback == null ? '' : fallback);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = errtext;
  else root.errtext = errtext;
})(typeof self !== 'undefined' ? self : this);
