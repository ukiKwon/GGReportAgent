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
  function acct(id, name, affiliation, position, extra) {
    return Object.assign({
      id: id,
      name: name,
      affiliation: affiliation,
      position: position,
      role: roles.compose(affiliation, position)
    }, extra || {});
  }

  login.MASTER_ID = 'master';

  login.ACCOUNTS = [
    acct('sales.member', '김영업', '영업팀', roles.MEMBER),
    acct('sales.lead', '이영업', '영업팀', roles.LEAD),
    acct('sales.head', '박영업', '영업팀', roles.HEAD),
    acct('designer', '최디자이너', '영업팀', roles.DESIGNER),
    acct('it.member', '권전산', '전산팀', roles.MEMBER),
    acct('it.lead', '오전산', '전산팀', roles.LEAD),
    acct('budget.member', '정예산', '예산팀', roles.MEMBER),
    acct('budget.lead', '한예산', '예산팀', roles.LEAD),
    // 마스터 — **권한관리 탭은 '전산팀'(팀원) 역할에만 열린다**(server/menus.py의
    // ADMIN_MENU). 전산팀장은 결재함은 열리지만 권한관리는 안 열려서 마스터 역할로 못 쓴다.
    // 다른 메뉴가 필요하면 마스터가 권한관리 화면에서 그 역할의 메뉴를 켠다.
    acct(login.MASTER_ID, '마스터', '전산팀', roles.MEMBER, { master: true })
  ];

  login.byId = function (id) {
    const key = String(id || '').trim().toLowerCase();
    if (!key) return null;
    for (let i = 0; i < login.ACCOUNTS.length; i += 1) {
      if (login.ACCOUNTS[i].id === key) return login.ACCOUNTS[i];
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

  // 헤더 칩에 보일 글자.
  login.chipText = function (session, profile) {
    if (!session || session.mode !== 'account') return '로그인';
    const name = (profile && profile.name) || '';
    const team = (profile && profile.team) || '';
    return [name, team].filter(Boolean).join(' · ') || '로그인';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = login;
  else root.login = login;
})(typeof self !== 'undefined' ? self : this);
