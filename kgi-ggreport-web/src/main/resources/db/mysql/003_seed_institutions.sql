-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 8.0 미러 (003) : 서울 25개 자치구 시드
--
-- ⚠️ **정본은 db/oracle/003_seed_institutions.sql 이다.** 이 파일은 외부망 로컬
--    개발용 미러다. 값이 갈리면 정본을 따른다 — 배경·판단 근거도 정본에 적혀 있다.
--
-- 정본과 다른 점은 문법 하나뿐이다: MySQL 에 MERGE 가 없어 같은 뜻을
-- `INSERT ... ON DUPLICATE KEY UPDATE` 로 쓴다(둘 다 "없으면 넣고, 있으면 비어
-- 있는 지역·구분만 채운다" — 사람이 넣은 값은 덮지 않는다).
--
-- ⚠️ `VALUES(컬럼)` 은 MySQL 8.0.20 부터 deprecated 다(경고만 뜨고 동작한다).
--    8.0.19 이하와 함께 쓰려고 이 형태로 둔다. 새 문법은 행 별칭이다:
--        INSERT INTO ... VALUES (...) AS new
--          ON DUPLICATE KEY UPDATE REGION_CODE = COALESCE(INSTITUTIONS.REGION_CODE, new.REGION_CODE)
-- ---------------------------------------------------------------------------

INSERT INTO INSTITUTIONS
    (INSTITUTION_ID, NAME_KO, REGION_CODE, TYPE, STAGE, GIGANLIST_DIR)
VALUES
    ('dobong',       '도봉구',   '11', '지자체', 1, 'corpus/institutions/dobong'),
    ('dongdaemun',   '동대문구', '11', '지자체', 1, 'corpus/institutions/dongdaemun'),
    ('dongjak',      '동작구',   '11', '지자체', 1, 'corpus/institutions/dongjak'),
    ('eunpyeong',    '은평구',   '11', '지자체', 1, 'corpus/institutions/eunpyeong'),
    ('gangbuk',      '강북구',   '11', '지자체', 1, 'corpus/institutions/gangbuk'),
    ('gangdong',     '강동구',   '11', '지자체', 1, 'corpus/institutions/gangdong'),
    ('gangnam',      '강남구',   '11', '지자체', 1, 'corpus/institutions/gangnam'),
    ('gangseo',      '강서구',   '11', '지자체', 1, 'corpus/institutions/gangseo'),
    ('geumcheon',    '금천구',   '11', '지자체', 1, 'corpus/institutions/geumcheon'),
    ('guro',         '구로구',   '11', '지자체', 1, 'corpus/institutions/guro'),
    ('gwanak',       '관악구',   '11', '지자체', 1, 'corpus/institutions/gwanak'),
    ('gwangjin',     '광진구',   '11', '지자체', 1, 'corpus/institutions/gwangjin'),
    ('jongno',       '종로구',   '11', '지자체', 1, 'corpus/institutions/jongno'),
    ('jung',         '중구',     '11', '지자체', 1, 'corpus/institutions/jung'),
    ('jungnang',     '중랑구',   '11', '지자체', 1, 'corpus/institutions/jungnang'),
    ('mapo',         '마포구',   '11', '지자체', 1, 'corpus/institutions/mapo'),
    ('nowon',        '노원구',   '11', '지자체', 1, 'corpus/institutions/nowon'),
    ('seocho',       '서초구',   '11', '지자체', 1, 'corpus/institutions/seocho'),
    ('seodaemun',    '서대문구', '11', '지자체', 1, 'corpus/institutions/seodaemun'),
    ('seongbuk',     '성북구',   '11', '지자체', 1, 'corpus/institutions/seongbuk'),
    ('seongdong',    '성동구',   '11', '지자체', 1, 'corpus/institutions/seongdong'),
    ('songpa',       '송파구',   '11', '지자체', 1, 'corpus/institutions/songpa'),
    ('yangcheon',    '양천구',   '11', '지자체', 1, 'corpus/institutions/yangcheon'),
    ('yeongdeungpo', '영등포구', '11', '지자체', 1, 'corpus/institutions/yeongdeungpo'),
    ('yongsan',      '용산구',   '11', '지자체', 1, 'corpus/institutions/yongsan')
ON DUPLICATE KEY UPDATE
    REGION_CODE = COALESCE(INSTITUTIONS.REGION_CODE, VALUES(REGION_CODE)),
    TYPE        = COALESCE(INSTITUTIONS.TYPE,        VALUES(TYPE));
