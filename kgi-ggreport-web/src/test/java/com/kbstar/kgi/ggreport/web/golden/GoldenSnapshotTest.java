package com.kbstar.kgi.ggreport.web.golden;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 골든 파일을 <b>실물로</b> 읽어 하네스가 다룰 수 있는 형태인지 확인한다.
 *
 * <p>단계 2에서 스냅샷을 하나씩 물릴 때 "파일이 안 읽힌다"로 시간을 쓰지 않게 하려는
 * 것이다. 응답 내용이 맞는지는 여기서 보지 않는다 — 그건 컨트롤러가 생긴 뒤의 일이다.
 */
public class GoldenSnapshotTest {

    @Test
    public void 골든_34건을_읽는다() {
        List<GoldenSnapshot> all = GoldenSnapshot.loadAll();
        assertEquals("골든 파일 개수가 바뀌었다면 capture.py 재실행 결과인지 확인할 것",
                34, all.size());
    }

    @Test
    public void 파일명_순서로_돌려준다() {
        // ⚠️ 뒤 번호는 앞의 상태 변경을 전제한다(결재 시나리오). 순서가 곧 계약이다.
        List<GoldenSnapshot> all = GoldenSnapshot.loadAll();
        List<String> names = new ArrayList<>();
        for (GoldenSnapshot s : all) {
            names.add(s.name());
        }
        assertEquals("00_institutions_list", names.get(0));
        assertEquals("01_institution_detail", names.get(1));
        assertEquals("33_search_2_청년_창업", names.get(names.size() - 1));

        List<String> sorted = new ArrayList<>(names);
        java.util.Collections.sort(sorted);
        assertEquals("이름순이 아니다", sorted, names);
    }

    @Test
    public void 모든_스냅샷이_필수_항목을_갖는다() {
        for (GoldenSnapshot s : GoldenSnapshot.loadAll()) {
            assertNotNull(s.name() + ": method 없음", s.method());
            assertNotNull(s.name() + ": url 없음", s.url());
            assertTrue(s.name() + ": url 이 / 로 시작하지 않는다: " + s.url(),
                    s.url().startsWith("/"));
            assertTrue(s.name() + ": status 가 비정상: " + s.status(),
                    s.status() >= 200 && s.status() < 600);
            assertNotNull(s.name() + ": body 없음", s.body());
        }
    }

    @Test
    public void 읽기_스냅샷과_상태변경_스냅샷이_모두_있다() {
        boolean sawGet = false;
        boolean sawPost = false;
        for (GoldenSnapshot s : GoldenSnapshot.loadAll()) {
            if ("GET".equals(s.method())) sawGet = true;
            if ("POST".equals(s.method())) sawPost = true;
        }
        assertTrue("GET 스냅샷이 없다", sawGet);
        assertTrue("POST 스냅샷이 없다", sawPost);
    }

    @Test
    public void POST_스냅샷은_요청_본문을_들고_온다() {
        // 러너가 재생하려면 요청 본문이 있어야 한다. 하나라도 실려 있는지 확인한다.
        boolean any = false;
        for (GoldenSnapshot s : GoldenSnapshot.loadAll()) {
            if ("POST".equals(s.method()) && s.requestBody() != null) {
                any = true;
                break;
            }
        }
        assertTrue("요청 본문을 가진 POST 스냅샷이 하나도 없다 — capture.py 형식 확인", any);
    }

    @Test
    public void 상태코드_404_스냅샷이_있다() {
        // 오류 응답도 계약이다. 정상 경로만 맞추고 넘어가지 않게 고정한다.
        boolean found = false;
        for (GoldenSnapshot s : GoldenSnapshot.loadAll()) {
            if (s.status() == 404) {
                found = true;
                assertFalse(s.name() + ": 404 인데 body 가 비었다",
                        s.body().isMissingNode());
            }
        }
        assertTrue("404 스냅샷이 없다", found);
    }

    @Test
    public void 리포_루트를_찾는다() {
        assertTrue(GoldenSnapshot.goldenApiDir().toFile().isDirectory());
    }
}
