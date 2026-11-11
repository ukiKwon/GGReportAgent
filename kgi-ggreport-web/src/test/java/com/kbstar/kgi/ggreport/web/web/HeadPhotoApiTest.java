package com.kbstar.kgi.ggreport.web.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.kbstar.kgi.ggreport.web.AppTest;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * 기관장 사진(NEXT 72·77) — 올리기·이용 조건·형식·크기·교체·내려받기 헤더·무효 자동 복원·복원·최근 변경 목록·무결성 재검사.
 * 사진 폴더는 target/head-photo-test(테스트 프로퍼티). 트랜잭션이 되돌아가면 서비스가 파일도 지운다. 시험 사진은 실행 중에 만든다.
 */
@RunWith(SpringRunner.class)
@AppTest
@Transactional
public class HeadPhotoApiTest extends HeadApiTestBase {

    private static final Path DIR = Paths.get("target/head-photo-test");

    private String storeKey(long photoId) {
        return jdbc.queryForObject("SELECT STORE_KEY FROM INST_HEAD_PHOTO WHERE PHOTO_ID=?", String.class, photoId);
    }

    private Path file(long photoId) {
        return DIR.toAbsolutePath().resolve(storeKey(photoId));
    }

    private String contentPath(String inst, long photoId) {
        return headPath(inst) + "/photos/" + photoId + "/content";
    }

    @Test
    public void 사진을_올리면_ACTIVE로_저장되고_디스크에_32자리_16진수_이름의_파일이_생긴다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        MvcResult r = upload(INST, T1, head, "원래 이름 홍길동.jpg", jpeg(300, 400), "KOGL1");
        assertEquals(text(r), 201, r.getResponse().getStatus());
        long photo = json(r).path("photo_id").asLong();
        assertEquals("ACTIVE", photoState(photo));
        String key = storeKey(photo);
        assertTrue(key, key.matches("[0-9a-f]{32}"));
        assertTrue("저장 폴더에 파일이 있다", Files.isRegularFile(file(photo)));
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_PHOTO WHERE SRC_TITLE LIKE '%원래 이름%' OR STORE_KEY LIKE '%.jpg'"));
        assertEquals("원본이 아니라 다시 만든 JPEG 해시", 64, jdbc.queryForObject("SELECT LENGTH(SHA256) FROM INST_HEAD_PHOTO WHERE PHOTO_ID=?",
                Integer.class, photo).intValue());
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='PHOTO_ADD' AND PHOTO_ID=? AND SELF_FLAG=1", photo));
        assertEquals(1, act("PHOTO_UPLOAD", "OK"));
        assertEquals("원래 파일 이름은 어디에도 없다", 0, count("SELECT COUNT(*) FROM ACCESS_LOG WHERE DETAIL LIKE '%원래%' OR REQ_PATH LIKE '%원래%'"));
    }

    @Test
    public void 이용_조건은_KOGL1과_INST_PERMIT만_받는다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        for (String bad : new String[]{"KOGL2", "KOGL3", "KOGL4", "PRESS_PERMIT", "NO_SUCH", ""}) {
            MvcResult r = upload(INST, T1, head, "a.jpg", jpeg(300, 400), bad);
            assertEquals(bad + " " + text(r), 422, r.getResponse().getStatus());
            assertEquals("LICENSE_NOT_ALLOWED", code(json(r)));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM INST_HEAD_PHOTO WHERE HEAD_ID=?", head));
        MvcResult ok = upload(INST, T1, head, "a.jpg", jpeg(300, 400), "INST_PERMIT");
        assertEquals(text(ok), 201, ok.getResponse().getStatus());
    }

    @Test
    public void 형식_확장자_크기_검사() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        MvcResult mismatch = upload(INST, T1, head, "a.png", jpeg(300, 400), "KOGL1");
        assertEquals(text(mismatch), 400, mismatch.getResponse().getStatus());
        assertEquals("FORMAT_MISMATCH", code(json(mismatch)));
        for (String name : new String[]{"a.gif", "a.svg", "a.heic", "a.webp", "noext", "a.jpg.exe"}) {
            MvcResult r = upload(INST, T1, head, name, jpeg(300, 400), "KOGL1");
            assertEquals(name + " " + text(r), 400, r.getResponse().getStatus());
            assertEquals(name, "UNSUPPORTED_FORMAT", code(json(r)));
        }
        MvcResult big = upload(INST, T1, head, "big.jpg", new byte[6 * 1024 * 1024], "KOGL1");
        assertEquals(413, big.getResponse().getStatus());
        assertEquals("FILE_TOO_LARGE", code(json(big)));
        MvcResult noFile = mockMvc.perform(as(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .multipart(headPath(INST) + "/photos").param("head_id", String.valueOf(head)), T1)).andReturn();
        assertEquals(400, noFile.getResponse().getStatus());
        MvcResult png = upload(INST, T1, head, "ok.png", png(300, 400), "KOGL1");
        assertEquals(text(png), 201, png.getResponse().getStatus());
        MvcResult tiny = upload(INST, T1, head, "tiny.jpg", jpeg(100, 100), "KOGL1");
        assertEquals(400, tiny.getResponse().getStatus());
        assertEquals("IMAGE_TOO_SMALL", code(json(tiny)));
        MvcResult broken = upload(INST, T1, head, "broken.jpg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3, 4, 5, 6, 7, 8}, "KOGL1");
        assertEquals(text(broken), 400, broken.getResponse().getStatus());
        assertEquals("IMAGE_UNREADABLE", code(json(broken)));
        MvcResult noHead = upload(INST, T1, null, "a.jpg", jpeg(300, 400), "KOGL1");
        assertEquals(400, noHead.getResponse().getStatus());
    }

    @Test
    public void 현_기관장이_없거나_번호가_현_기관장이_아니면_409다() throws Exception {
        MvcResult none = upload(INST2, T1, 1L, "a.jpg", jpeg(300, 400), "KOGL1");
        assertEquals(text(none), 409, none.getResponse().getStatus());
        assertEquals("NO_HEAD", code(json(none)));
        addHeadOk(INST, T1, "홍길동", "구청장");
        long cand = json(postJson(headsPath(INST), T2, headJson("김철수", "구청장"))).path("head_id").asLong();
        MvcResult notCurrent = upload(INST, T1, cand, "a.jpg", jpeg(300, 400), "KOGL1");
        assertEquals(text(notCurrent), 409, notCurrent.getResponse().getStatus());
        assertEquals("STATE_CHANGED", code(json(notCurrent)));
    }

    @Test
    public void 교체하면_옛_사진은_REPLACED이고_열람은_팀장_부장만_가능하며_응답_헤더가_갖춰진다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long p1 = photoOk(INST, T1, head);
        long p2 = photoOk(INST, T2, head);
        assertEquals("REPLACED", photoState(p1));
        assertEquals("ACTIVE", photoState(p2));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='PHOTO_REPLACE' AND PHOTO_ID=? AND FROM_PHOTO_ID=?", p2, p1));

        assertEquals("옛 사진은 팀원에게 404", 404, getAs(contentPath(INST, p1), T1).getResponse().getStatus());
        assertEquals("옛 사진은 팀장에게 200", 200, getAs(contentPath(INST, p1), L1).getResponse().getStatus());

        MvcResult r = getAs(contentPath(INST, p2), T1);
        assertEquals(200, r.getResponse().getStatus());
        byte[] body = r.getResponse().getContentAsByteArray();
        assertTrue(body.length > 100);
        assertEquals(body.length, Integer.parseInt(r.getResponse().getHeader("Content-Length")));
        assertEquals("image/jpeg", r.getResponse().getContentType());
        assertTrue(r.getResponse().getHeader("Content-Disposition").startsWith("inline"));
        assertEquals("no-store", r.getResponse().getHeader("Cache-Control"));
        assertEquals("no-cache", r.getResponse().getHeader("Pragma"));
        assertEquals("nosniff", r.getResponse().getHeader("X-Content-Type-Options"));
        assertEquals("default-src 'none'; sandbox", r.getResponse().getHeader("Content-Security-Policy"));
        assertEquals("same-origin", r.getResponse().getHeader("Cross-Origin-Resource-Policy"));
        assertEquals((byte) 0xFF, body[0]);
        assertEquals((byte) 0xD8, body[1]);
        assertEquals("팀장의 옛 사진 열람 1건 + 팀원의 새 사진 열람 1건", 2, act("PHOTO_VIEW", "OK"));
        assertEquals("팀원의 옛 사진 열람은 HIDDEN", 1, act("PHOTO_VIEW", "HIDDEN"));
    }

    @Test
    public void 무효로_하면_직전_사진이_자동으로_복원된다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long p1 = photoOk(INST, T1, head);
        long p2 = photoOk(INST, T2, head);
        MvcResult other = postJson(headPath(INST) + "/photos/" + p2 + "/void", T1, reason("잘못 올림"));
        assertEquals(text(other), 403, other.getResponse().getStatus());
        assertEquals("NOT_OWNER", code(json(other)));
        MvcResult mine = postJson(headPath(INST) + "/photos/" + p2 + "/void", T2, reason("잘못 올림"));
        assertEquals(text(mine), 200, mine.getResponse().getStatus());
        assertEquals(p1, json(mine).path("restored_photo_id").asLong());
        assertEquals("VOIDED", photoState(p2));
        assertEquals("ACTIVE", photoState(p1));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='PHOTO_VOID' AND PHOTO_ID=?", p2));
        assertEquals(1, count("SELECT COUNT(*) FROM INST_HEAD_LOG WHERE EVENT_CD='PHOTO_RESTORE' AND PHOTO_ID=? AND FROM_PHOTO_ID=?", p1, p2));
        assertEquals(p1, json(getAs(headPath(INST), T1)).path("head").path("photo").path("photo_id").asLong());
        assertEquals("VOIDED 사진은 아무도 못 본다", 404, getAs(contentPath(INST, p2), L1).getResponse().getStatus());
    }

    @Test
    public void 자동_복원은_직전에_쓰던_사진이다_교체_이력_기준_qa_P3_3() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long p1 = photoOk(INST, T1, head);
        Thread.sleep(5);
        long p2 = photoOk(INST, T1, head);
        Thread.sleep(5);
        long p3 = photoOk(INST, T1, head);
        Thread.sleep(5);
        assertEquals(200, postJson(headPath(INST) + "/photos/" + p1 + "/restore", L1, "{}").getResponse().getStatus());   // p3 → REPLACED, p1 ACTIVE
        Thread.sleep(5);
        assertEquals(200, postJson(headPath(INST) + "/photos/" + p2 + "/restore", L1, "{}").getResponse().getStatus());   // p1 → REPLACED, p2 ACTIVE
        Thread.sleep(5);
        MvcResult r = postJson(headPath(INST) + "/photos/" + p2 + "/void", L1, reason("잘못 올림"));
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("번호가 큰 p3 가 아니라 직전에 쓰던 p1 이 복원된다", p1, json(r).path("restored_photo_id").asLong());
        assertEquals("ACTIVE", photoState(p1));
        assertEquals("REPLACED", photoState(p3));
    }

    @Test
    public void 직전_사진_파일이_없으면_다음_후보를_복원한다_qa_P3_3() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long p1 = photoOk(INST, T1, head);
        Thread.sleep(5);
        long p2 = photoOk(INST, T1, head);
        Thread.sleep(5);
        long p3 = photoOk(INST, T1, head);
        Files.delete(file(p2));   // 직전(p2)의 파일이 없다
        MvcResult r = postJson(headPath(INST) + "/photos/" + p3 + "/void", T1, reason("잘못 올림"));
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertEquals("p2 는 건너뛰고 p1 을 복원", p1, json(r).path("restored_photo_id").asLong());
        assertEquals("REPLACED", photoState(p2));
    }

    @Test
    public void 직전_사진_파일이_없으면_복원하지_않고_사진_없음이_된다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long p1 = photoOk(INST, T1, head);
        long p2 = photoOk(INST, T2, head);
        Files.delete(file(p1));
        MvcResult r = postJson(headPath(INST) + "/photos/" + p2 + "/void", T2, reason("잘못 올림"));
        assertEquals(text(r), 200, r.getResponse().getStatus());
        assertTrue(json(r).path("restored_photo_id").isNull());
        assertEquals("REPLACED", photoState(p1));
        assertTrue(json(getAs(headPath(INST), T1)).path("head").path("photo").isNull());
    }

    @Test
    public void 복원은_팀장_부장만_하고_VOIDED는_복원할_수_없다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long p1 = photoOk(INST, T1, head);
        long p2 = photoOk(INST, T2, head);
        MvcResult member = postJson(headPath(INST) + "/photos/" + p1 + "/restore", T1, "{}");
        assertEquals(text(member), 403, member.getResponse().getStatus());
        MvcResult swap = postJson(headPath(INST) + "/photos/" + p1 + "/restore", L1, "{}");
        assertEquals(text(swap), 200, swap.getResponse().getStatus());
        assertEquals("ACTIVE", photoState(p1));
        assertEquals("REPLACED", photoState(p2));
        assertEquals("ACTIVE 하나만", 1, count("SELECT COUNT(*) FROM INST_HEAD_PHOTO WHERE HEAD_ID=? AND STATE_CD='ACTIVE'", head));
        // p1 을 무효 처리하면 직전 REPLACED(p2)가 복원되고, p1(VOIDED)은 복원할 수 없다
        assertEquals(200, postJson(headPath(INST) + "/photos/" + p1 + "/void", L1, reason("잘못 올림")).getResponse().getStatus());
        assertEquals("VOIDED", photoState(p1));
        MvcResult voided = postJson(headPath(INST) + "/photos/" + p1 + "/restore", L1, "{}");
        assertEquals(text(voided), 409, voided.getResponse().getStatus());
    }

    @Test
    public void 최근_사진_변경_목록은_팀장_부장만_보고_이름은_가려진다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        photoOk(INST, T1, head);
        photoOk(INST, T2, head);
        MvcResult member = getAs("/institution-heads/photo-changes?days=30", T1);
        assertEquals(text(member), 403, member.getResponse().getStatus());
        MvcResult lead = getAs("/institution-heads/photo-changes?days=30", L1);
        assertEquals(text(lead), 200, lead.getResponse().getStatus());
        String body = text(lead);
        assertTrue(body, body.contains("홍*동"));
        assertFalse(body.contains("홍길동"));
        JsonNode items = json(lead).path("items");
        assertTrue(items.size() >= 2);
        assertEquals("PHOTO_REPLACE", items.get(0).path("event_cd").asText());
        for (String bad : new String[]{"0", "91", "abc", "-1"}) {
            assertEquals(bad, 400, getAs("/institution-heads/photo-changes?days=" + bad, L1).getResponse().getStatus());
        }
        assertEquals(200, getAs("/institution-heads/photo-changes", D1).getResponse().getStatus());
    }

    @Test
    public void 읽을_때_저장_키와_해시를_다시_검사한다() throws Exception {
        long head = addHeadOk(INST, T1, "홍길동", "구청장");
        long photo = photoOk(INST, T1, head);
        Path f = file(photo);
        assertEquals(200, getAs(contentPath(INST, photo), T1).getResponse().getStatus());

        byte[] original = Files.readAllBytes(f);
        Files.write(f, new byte[]{1, 2, 3, 4});   // 파일 내용이 바뀜 — SHA256 불일치
        MvcResult hash = getAs(contentPath(INST, photo), T1);
        assertEquals(500, hash.getResponse().getStatus());
        assertFalse("사진 본문이 나가지 않는다", text(hash).contains("JFIF"));
        Files.write(f, original);
        assertEquals(200, getAs(contentPath(INST, photo), T1).getResponse().getStatus());

        jdbc.update("UPDATE INST_HEAD_PHOTO SET STORE_KEY='../../x' WHERE PHOTO_ID=?", photo);   // 경로 이탈 키
        MvcResult key = getAs(contentPath(INST, photo), T1);
        assertEquals(500, key.getResponse().getStatus());
        assertEquals("해시 불일치 1건 + 경로 이탈 키 1건", 2, act("PHOTO_VIEW", "ERROR"));
        assertEquals("정상 열람 두 번", 2, act("PHOTO_VIEW", "OK"));
    }

    @Test
    public void 이전_기관장의_사진은_열람할_수_없다() throws Exception {
        long old = addHeadOk(INST, T1, "홍길동", "구청장");
        long photo = photoOk(INST, T1, old);
        long cand = json(postJson(headsPath(INST), L1, headJson("김철수", "구청장"))).path("head_id").asLong();
        assertEquals(200, postJson(headsPath(INST) + "/" + cand + "/confirm", L2, "{}").getResponse().getStatus());
        assertEquals("FORMER", headStatus(old));
        assertEquals(404, getAs(contentPath(INST, photo), L1).getResponse().getStatus());
        assertNotEquals("새 기관장에게는 사진이 아직 없다", photo, json(getAs(headPath(INST), L1)).path("head").path("photo").path("photo_id").asLong());
        MvcResult upload = upload(INST, T1, cand, "new.jpg", jpeg(300, 400), "KOGL1");
        assertEquals(text(upload), 201, upload.getResponse().getStatus());
    }
}
