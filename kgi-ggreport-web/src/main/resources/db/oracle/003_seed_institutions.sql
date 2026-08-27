--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 스키마 정본 (003) : 서울 25개 자치구 시드
--
-- ⚠️ 이 파일이 **정본**이다. db/mysql/003_seed_institutions.sql 은 외부망 로컬 미러다.
--
-- ── 무엇을 옮긴 것인가 ────────────────────────────────────────────────────────
-- Python 원본의 `py -3 -m server.seed`(server/seed.py → repository.seed_giganlist_districts).
-- 원본은 `corpus/institutions/` 밑의 폴더를 훑어 **미리 정해 둔 25개 이름표**에 있는
-- 것만 넣는다. 즉 폴더 스캔은 필터일 뿐이고 **넣는 값 25행은 코드에 박혀 있다** —
-- 그래서 SQL 로 옮길 수 있다.
--
-- ── 왜 Java CLI 가 아니라 SQL 인가 ────────────────────────────────────────────
-- 내부망에서 001·002 를 적용하는 사람이 그대로 003 을 한 번 더 돌리면 끝이다.
-- Java CLI 로 만들면 WAR 과 별개로 실행 경로(클래스패스·ojdbc·접속정보)를 하나 더
-- 만들어야 하는데, 넣는 값이 고정 25행이라 그럴 이유가 없다.
--
-- ⚠️ **원본과 한 가지 다르다.** 원본은 폴더가 없는 자치구를 건너뛰지만 이 스크립트는
--    항상 25행을 넣는다. 골든 `00`(기관 목록)이 25건이므로 이쪽이 골든에 맞고,
--    `GIGANLIST_DIR` 는 어차피 "이 경로를 보라"는 문자열일 뿐 존재 검사는 조회할 때
--    한다. 코퍼스를 덜 반입한 상태에서도 지도가 25구를 그린다.
--
-- ── 멱등하다 (001·002 와 다른 점) ─────────────────────────────────────────────
-- 원본 시드가 "있으면 건너뛰고 **비어 있는 지역·구분만** 채운다"라서 여러 번 돌려도
-- 안전하다. 그 성질을 MERGE 로 그대로 옮겼다 — 사람이 나중에 채운 값(계약만료일·
-- 차기입찰 등)은 **덮지 않는다.**
--
-- ⚠️ 한글이 들어 있다. SQL*Plus 로 돌린다면 세션 인코딩을 맞출 것
--    (`chcp 65001` + `NLS_LANG=KOREAN_KOREA.AL32UTF8`). 깨진 채로 들어가면 지도의
--    구 이름과 산출물 폴더명(`{output_root}/{NAME_KO}/`)이 함께 어긋난다.
--------------------------------------------------------------------------------

MERGE INTO INSTITUTIONS t
USING (
    SELECT 'dobong'       AS INSTITUTION_ID, '도봉구'   AS NAME_KO FROM DUAL UNION ALL
    SELECT 'dongdaemun',      '동대문구'   FROM DUAL UNION ALL
    SELECT 'dongjak',         '동작구'     FROM DUAL UNION ALL
    SELECT 'eunpyeong',       '은평구'     FROM DUAL UNION ALL
    SELECT 'gangbuk',         '강북구'     FROM DUAL UNION ALL
    SELECT 'gangdong',        '강동구'     FROM DUAL UNION ALL
    SELECT 'gangnam',         '강남구'     FROM DUAL UNION ALL
    SELECT 'gangseo',         '강서구'     FROM DUAL UNION ALL
    SELECT 'geumcheon',       '금천구'     FROM DUAL UNION ALL
    SELECT 'guro',            '구로구'     FROM DUAL UNION ALL
    SELECT 'gwanak',          '관악구'     FROM DUAL UNION ALL
    SELECT 'gwangjin',        '광진구'     FROM DUAL UNION ALL
    SELECT 'jongno',          '종로구'     FROM DUAL UNION ALL
    SELECT 'jung',            '중구'       FROM DUAL UNION ALL
    SELECT 'jungnang',        '중랑구'     FROM DUAL UNION ALL
    SELECT 'mapo',            '마포구'     FROM DUAL UNION ALL
    SELECT 'nowon',           '노원구'     FROM DUAL UNION ALL
    SELECT 'seocho',          '서초구'     FROM DUAL UNION ALL
    SELECT 'seodaemun',       '서대문구'   FROM DUAL UNION ALL
    SELECT 'seongbuk',        '성북구'     FROM DUAL UNION ALL
    SELECT 'seongdong',       '성동구'     FROM DUAL UNION ALL
    SELECT 'songpa',          '송파구'     FROM DUAL UNION ALL
    SELECT 'yangcheon',       '양천구'     FROM DUAL UNION ALL
    SELECT 'yeongdeungpo',    '영등포구'   FROM DUAL UNION ALL
    SELECT 'yongsan',         '용산구'     FROM DUAL
) s
ON (t.INSTITUTION_ID = s.INSTITUTION_ID)
-- 이미 있는 행은 **비어 있는 두 칸만** 채운다. 이 백필이 없으면 REGION_CODE 가 없어
-- 지도의 institutionsByRegion 에서 걸러져 아예 안 뜨고, TYPE 이 없으면 랭킹 카드의
-- 기관구분이 'undefined' 로 찍힌다(원본 주석 — 실제로 그렇게 보였다).
WHEN MATCHED THEN UPDATE SET
    t.REGION_CODE = COALESCE(t.REGION_CODE, '11'),
    t.TYPE        = COALESCE(t.TYPE, '지자체')
WHEN NOT MATCHED THEN INSERT
    (INSTITUTION_ID, NAME_KO, REGION_CODE, TYPE, STAGE, GIGANLIST_DIR)
VALUES
    (s.INSTITUTION_ID, s.NAME_KO, '11', '지자체', 1,
     'corpus/institutions/' || s.INSTITUTION_ID);

COMMIT;
