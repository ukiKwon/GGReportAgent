# 기관장 정보·사진 옮기기 (다른 PC로)

사진은 git에 올리지 않는다. 언론·나무위키 사진이 많고, 이 PC 전용 조건(LOCAL_ONLY)으로 넣었다(사용자 11-13·11-24 결정). 그래서 묶음 zip은 USB나 사내 공유 폴더로만 옮긴다. 이 폴더의 도구는 git에 있으므로, 받는 PC에서 `git pull` 하면 생긴다.

## 보내는 PC

```
node kgi-ggreport-web/tools/head-transfer/export.mjs --out <묶음 폴더>
```

8080 API로 기관장 기록(이름·직위·임기·생년월일·학력·경력·출처)과 사진을 꺼낸다. DB 비밀번호는 필요 없다. 시작 연도가 없는 옛 학력·경력 줄은 `old-items.sql`로 함께 만든다.

꺼낸 묶음은 10MB 단위 zip 여러 개(`head-bundle-1.zip` …)로 나눠 옮긴다.

## 받는 PC (시연 PC)

1. `git pull` 한다.
2. 받는 PC의 8080을 띄운다.
3. 사진 이용 조건 코드 LOCAL_ONLY를 한 번만 켠다. 비밀번호를 묻는다.
   ```
   mysql -u root -p --default-character-set=utf8mb4 ggreportdb < kgi-ggreport-web/tools/db/local-only/L01_photo_license_local.sql
   ```
   이 코드를 켜지 않으면 사진이 '허용되지 않는 이용 조건'(422)으로 거절된다. 이 코드는 로컬 PC 전용이다. 내부망·운영 DB에는 켜지 않는다.
4. zip을 모두 **같은 폴더**에 푼다. 그 폴더에 `heads.json`과 `photos/`가 생겨야 한다.
5. 시험 실행으로 무엇이 들어갈지 확인한다. 아무것도 쓰지 않는다.
   ```
   node kgi-ggreport-web/tools/head-transfer/import.mjs --dir <푼 폴더>
   ```
6. 실제로 넣는다.
   ```
   node kgi-ggreport-web/tools/head-transfer/import.mjs --dir <푼 폴더> --go
   ```
   다시 돌려도 안전하다. 이미 있는 값은 건너뛴다.
7. 날짜 없는 옛 학력·경력 줄(11-13~11-20 입력분)을 넣는다. 6단계 다음에 한 번 실행하며, 비밀번호를 묻는다.
   ```
   mysql -u root -p --default-character-set=utf8mb4 ggreportdb < <푼 폴더>/old-items.sql
   ```
   시작 연도가 없는 줄은 지금 API 규칙(시작 필수)으로 다시 넣을 수 없어서 SQL로 넣는다. 그 기관의 현 기관장에 확정 줄로 들어간다. 같은 값이 이미 있으면 넣지 않으므로 다시 실행해도 안전하다. API를 거치지 않아 입력 감사 기록은 남지 않는다(자료 이전용).

## 결과 읽는 법

- **이름 다름**: 그 PC에 이미 다른 이름의 기관장이 있다. 덮어쓰지 않는다.
- **기관 없음**: 그 PC DB에 그 기관 행이 없다. 기관 데이터부터 맞춘다.
- **옛줄_SQL로**: 시작 연도가 없는 옛 학력·경력 줄이다. 7단계의 `old-items.sql`로 넣는다.
- **실패 LICENSE_NOT_ALLOWED**: 3단계를 하지 않았다.

입력자 사번은 기본 5047192(로컬 시험용 영업팀장)다. 받는 PC에 그 사번이 없으면 `--emp <사번>`으로 바꾼다.
