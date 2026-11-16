-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (033) : 전산팀장 역할에 권한관리(admin) 켜기 (NEXT 84 ①)
-- 사용자 답 ⓐ(2026-11-15): 전산팀원·전산팀장 모두 시스템 관리자.
-- 코드 기본 격자(Menus.java)는 바꾸지 않는다 — 골든 04·05·server/menus.py 가 그 값이다.
-- 결과는 권한관리 화면에서 '전산팀장 × 권한관리'를 켠 것과 같다. 032 뒤에 한 번 돌린다(관리자가 화면에서 끈 뒤 다시 돌리면 다시 켜진다).
-- 되돌리기: DELETE FROM ROLE_MENUS WHERE ROLE = '전산팀장' AND MENU = 'admin';
-- ---------------------------------------------------------------------------
SET NAMES utf8mb4;

UPDATE ROLE_MENUS SET ENABLED = 1 WHERE ROLE = '전산팀장' AND MENU = 'admin';
INSERT INTO ROLE_MENUS (ROLE, MENU, ENABLED)
SELECT '전산팀장', 'admin', 1 FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM ROLE_MENUS WHERE ROLE = '전산팀장' AND MENU = 'admin');
