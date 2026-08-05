(function (root) {
  'use strict';
  // 소속·직책 어휘 — backend/teams.py의 화면 쪽 짝.
  //
  // **소속은 3그룹뿐이다**(영업팀·전산팀·예산팀). 팀장·부장은 소속이 아니라 그 안의
  // 직책이다 — 예전에는 프로필 '소속' 목록에 `전산팀장`이 섞여 있었고, 사용자가
  // "잘못된 표기"라고 짚었다.
  //
  // 저장·전송은 여전히 **합쳐진 문자열 하나**다(`영업팀`·`영업팀장`·`영업부장`·
  // `디자이너`). 프로필을 둘로 쪼개 저장하면 이미 쌓인 알림 수신자와 role_menus의
  // 키가 전부 갈라진다. 화면에서만 두 칸으로 고르고 compose/split이 그 사이를 잇는다.
  const roles = {};

  roles.AFFILIATIONS = ['영업팀', '전산팀', '예산팀'];
  roles.DESIGNER = '디자이너';
  roles.DESIGNER_HOME = '영업팀';          // 디자이너는 영업팀 소속(사용자 확정)
  roles.MEMBER = '팀원';
  roles.LEAD = '팀장';
  roles.HEAD = '부장';
  roles.FINAL_APPROVER = '영업부장';       // 흐름의 마지막 결재자

  // 접미사를 떼는 **순서가 규칙의 전부다** — `영업팀장`에서 `팀`을 먼저 떼면
  // `영업장`이라는 없는 팀이 된다. 긴 것부터 본다(backend/teams.py의 team_of와 같음).
  const SUFFIXES = [roles.LEAD, roles.HEAD, '팀'];

  roles.teamOf = function (role) {
    const text = (role || '').trim();
    for (let i = 0; i < SUFFIXES.length; i += 1) {
      const s = SUFFIXES[i];
      if (text.length > s.length && text.slice(-s.length) === s) return text.slice(0, -s.length);
    }
    return text;
  };

  // 부장과 디자이너는 **영업팀에만** 둔다 — 사용자가 말한 조직에 `전산부장`은 없고,
  // 있지도 않은 자리를 고를 수 있게 두면 그 사람의 결재가 갈 곳을 잃는다.
  roles.positionsFor = function (affiliation) {
    if (affiliation === roles.DESIGNER_HOME) {
      return [roles.MEMBER, roles.DESIGNER, roles.LEAD, roles.HEAD];
    }
    return [roles.MEMBER, roles.LEAD];
  };

  roles.compose = function (affiliation, position) {
    const team = roles.teamOf(affiliation);
    if (position === roles.DESIGNER) return roles.DESIGNER;
    if (position === roles.LEAD) return team + roles.LEAD;
    if (position === roles.HEAD) return team + roles.HEAD;
    return team + '팀';
  };

  // 역할 문자열 → {affiliation, position}. 모르는 값이면 null — **지어내지 않는다.**
  // 화면은 null을 받으면 저장된 값을 그대로 보여줘야 한다. 임의로 `영업팀/팀원`을
  // 끼워 넣으면 사용자의 신원이 조용히 바뀐다(옛 `본부장` 프로필이 그런 값이다).
  roles.split = function (role) {
    const text = (role || '').trim();
    if (text === roles.DESIGNER) {
      return { affiliation: roles.DESIGNER_HOME, position: roles.DESIGNER };
    }
    const team = roles.teamOf(text);
    const affiliation = team + '팀';
    if (roles.AFFILIATIONS.indexOf(affiliation) < 0) return null;
    const allowed = roles.positionsFor(affiliation);
    if (text === affiliation) return { affiliation: affiliation, position: roles.MEMBER };
    for (let i = 0; i < allowed.length; i += 1) {
      const p = allowed[i];
      if (p !== roles.MEMBER && p !== roles.DESIGNER && text === team + p) {
        return { affiliation: affiliation, position: p };
      }
    }
    return null;
  };

  // 그 역할의 작업물을 1차로 결재하는 사람. backend/teams.py의 lead_of와 같은 규칙이다.
  // **디자이너도 영업팀장**이 받는다 — 영업팀 소속이기 때문이다.
  roles.approverOf = function (role) {
    const team = roles.teamOf(role);
    if (['영업', '전산', '예산'].indexOf(team) >= 0) return team + roles.LEAD;
    if (team === roles.DESIGNER) return roles.teamOf(roles.DESIGNER_HOME) + roles.LEAD;
    return null;                            // 모르면 지어내지 않는다
  };

  // 전체 역할 목록(권한관리 표의 행 순서) — backend/teams.py의 ROLES와 같아야 한다.
  roles.ALL = roles.AFFILIATIONS
    .concat(roles.AFFILIATIONS.map(function (a) { return roles.teamOf(a) + roles.LEAD; }))
    .concat([roles.DESIGNER, roles.FINAL_APPROVER]);

  if (typeof module !== 'undefined' && module.exports) module.exports = roles;
  else root.roles = roles;
})(typeof self !== 'undefined' ? self : this);
