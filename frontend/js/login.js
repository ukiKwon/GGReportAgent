(function (root) {
  'use strict';
  // 로그인(프로토타입) — 임시 계정 고정 목록과 세션 규칙. DOM을 모르는 순수 함수만 둔다.
  //
  // **진짜 인증이 아니다.** 비밀번호는 확인하지 않고, 서버도 이 로그인을 모른다.
  // 로그인은 기존 프로필(`store.saveProfile({name, team})`)을 채우는 입구일 뿐이라
  // 쪽지함·결재자 기본값·`/menus?role=` 같은 소비처는 그대로다.
  // 역할 문자열은 roles.compose가 만든다 — 여기서 손으로 적으면 서버(teams.py)와 갈라진다.
  const roles = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./roles.js') : root.roles;

  const login = {};

  // 계정 = 사람 한 명. 같은 역할의 계정이 둘 이상일 수 있어(master·권전산 모두 전산팀장)
  // 드롭다운은 역할이 아니라 계정을 고른다.
  function acct(id, empNo, name, affiliation, position, extra) {
    return Object.assign({
      id: id,
      empNo: empNo || '',
      name: name,
      affiliation: affiliation,
      position: position,
      role: roles.compose(affiliation, position)
    }, extra || {});
  }

  login.MASTER_ID = 'master';

  login.ACCOUNTS = [
    acct('sales.member', '3918264', '김영업', '영업팀', roles.MEMBER),
    acct('sales.lead', '5047192', '이영업', '영업팀', roles.LEAD),
    acct('sales.head', '2674805', '박영업', '영업팀', roles.HEAD),
    acct('designer', '7130526', '최디자이너', '영업팀', roles.DESIGNER),
    acct('it.member', '4482971', '권전산', '전산팀', roles.MEMBER),
    acct('it.lead', '6295038', '오전산', '전산팀', roles.LEAD),
    acct('budget.member', '1857403', '정예산', '예산팀', roles.MEMBER),
    acct('budget.lead', '9026715', '한예산', '예산팀', roles.LEAD),
    // 마스터 — **권한관리 탭은 '전산팀'(팀원) 역할에만 열린다**(server/menus.py의
    // ADMIN_MENU). 전산팀장은 결재함은 열리지만 권한관리는 안 열려서 마스터 역할로 못 쓴다.
    // 다른 메뉴가 필요하면 마스터가 권한관리 화면에서 그 역할의 메뉴를 켠다.
    acct(login.MASTER_ID, '8203417', '마스터', '전산팀', roles.MEMBER, { master: true })
  ];

  // 계정 ID(별칭) 또는 사번 7자리로 찾는다. 사번은 DB 시드(009)의 가상 사번과 같다.
  login.EMP_NO = /^[0-9]{7}$/;
  login.isEmpNo = function (v) { return login.EMP_NO.test(String(v == null ? '' : v).trim()); };

  login.byId = function (id) {
    const key = String(id || '').trim().toLowerCase();
    if (!key) return null;
    for (let i = 0; i < login.ACCOUNTS.length; i += 1) {
      if (login.ACCOUNTS[i].id === key || (login.ACCOUNTS[i].empNo && login.ACCOUNTS[i].empNo === key)) {
        return login.ACCOUNTS[i];
      }
    }
    return null;
  };

  // 비밀번호는 보지 않는다(프로토타입). 모르는 ID면 null.
  login.authenticate = function (id /* , password */) {
    return login.byId(id);
  };

  // 드롭다운 라벨: "영업팀 · 팀장 (이영업)". 디자이너·마스터는 직위 자리에 그 이름을 쓴다.
  login.label = function (a) {
    if (a.master) return '관리자 · 마스터';
    return a.affiliation + ' · ' + a.position + ' (' + a.name + ')';
  };

  // 소속별 묶음 — <optgroup>용. 마스터는 따로 "관리자" 묶음.
  login.groups = function () {
    const out = [];
    roles.AFFILIATIONS.forEach(function (aff) {
      const items = login.ACCOUNTS.filter(function (a) { return !a.master && a.affiliation === aff; });
      if (items.length) out.push({ title: aff, accounts: items });
    });
    const masters = login.ACCOUNTS.filter(function (a) { return a.master; });
    if (masters.length) out.push({ title: '관리자', accounts: masters });
    return out;
  };

  // 서버에 보낼 사번 — 입력이 사번이면 그대로, 아니면 임시 계정의 사번. 모르면 ''.
  login.empNoFor = function (input) {
    const v = String(input == null ? '' : input).trim();
    if (login.isEmpNo(v)) return v;
    const a = login.byId(v);
    return a ? a.empNo : '';
  };

  // 같은 출처 요청에 붙일 신원 헤더(X-Emp-No). 자기신고 값이라 서버는 "검증 안 됨"으로 기록한다.
  // 입력(headers)은 바꾸지 않고 새 객체를 돌려준다. Headers 인스턴스·평범한 객체·배열·undefined 모두 받는다.
  login.withIdentity = function (headers, empNo) {
    const out = {};
    if (headers && typeof headers.forEach === 'function' && !Array.isArray(headers)) {
      headers.forEach(function (v, k) { out[k] = v; });
    } else if (Array.isArray(headers)) {
      headers.forEach(function (p) { out[p[0]] = p[1]; });
    } else if (headers && typeof headers === 'object') {
      Object.keys(headers).forEach(function (k) { out[k] = headers[k]; });
    }
    if (login.isEmpNo(empNo)) out['X-Emp-No'] = String(empNo).trim();
    return out;
  };

  // 헤더 칩에 보일 글자.
  login.chipText = function (session, profile) {
    if (!session || session.mode !== 'account') return '로그인';
    const name = (profile && profile.name) || '';
    const team = (profile && profile.team) || '';
    return [name, team].filter(Boolean).join(' · ') || '로그인';
  };

  // 로그인 상태 헤더 우측의 "{소속} {이름}" 글자(칩과 달리 누르는 것이 아니다).
  login.userLabel = function (profile) {
    const name = ((profile && profile.name) || '').trim();
    const team = ((profile && profile.team) || '').trim();
    return [team, name].filter(Boolean).join(' ');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = login;
  else root.login = login;
})(typeof self !== 'undefined' ? self : this);
