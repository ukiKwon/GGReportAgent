package com.kb.uploader.service;

import com.kb.uploader.dto.PlanCsvResultItem;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.*;

/** NEXT 56 U1 — 사업계획 CSV 업로드. 설계 backend-dev 2026-11-24_1156_ac0b626f, security 반영(P1·P3·P4·P5). */
public class PlanCsvUploadServiceTest {

    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private File plan, receipts;
    private PlanCsvUploadService sut;
    private static final String NAME = "sample-gu_20261118_plan.csv";
    private static final String BOM = String.valueOf((char) 0xFEFF);
    private static final String HEAD =String.join(",", PlanCsvUploadService.HEADERS);

    @Before
    public void setUp() throws Exception {
        plan = tmp.newFolder("plan");
        receipts = tmp.newFolder("receipts");
        sut = new PlanCsvUploadService(plan.getAbsolutePath(), receipts.getAbsolutePath());
    }

    // SCHEMA ⑪-7 의 가상 값 예시 1행(기관ID만 바꿔 쓴다)
    private static String row(String inst) {
        return inst + ",\"가상구 4개년 계획\",FOUR_YEAR,2023,2026,https://example.org/plan.pdf,2026-11-18,"
                + "plan-collector/1.0,,,A-1,\"안전·복지\",1-1,,\"가상 사업 하나\",\"공개 문서 원문 요약\","
                + "AMOUNT,\"1,200\",MIL_KRW,2024:600;2025:600,15~16,CONFIRMED,,,";
    }

    private static byte[] csv(String inst) {
        return (BOM + HEAD + "\r\n" + row(inst) + "\r\n").getBytes(StandardCharsets.UTF_8);
    }

    private static MockMultipartFile mp(String name, byte[] b) {
        return new MockMultipartFile("files", name, "text/csv", b);
    }

    private PlanCsvResultItem up1(String name, byte[] b) {
        return sut.upload(Collections.<MultipartFile>singletonList(mp(name, b)), "tester01", "-", "10.0.0.1").get(0);
    }

    private static List<String> sortedNames(File d) {
        String[] n = d.list();
        Arrays.sort(n);
        return Arrays.asList(n);
    }

    @Test
    public void 정상_저장_이름_그대로_SHA_기록_임시파일_없음() throws Exception {
        byte[] b = csv("sample-gu");
        PlanCsvResultItem r = up1(NAME, b);
        assertTrue(r.getMessage(), r.isSaved());
        assertArrayEquals(b, Files.readAllBytes(new File(plan, NAME).toPath()));
        assertEquals(PlanCsvUploadService.sha256(b), r.getSha256());
        assertEquals(1, plan.list().length);   // .tmp 가 남지 않았다
        List<String> lines = Files.readAllLines(new File(receipts, "plan-csv-receipts.tsv").toPath(), StandardCharsets.UTF_8);
        assertEquals(2, lines.size());   // 머리 + 1행
        assertTrue(lines.get(1).contains(r.getSha256()) && lines.get(1).contains("tester01") && lines.get(1).contains(NAME));
    }

    @Test
    public void 같은_이름_두번째는_거부하고_첫_파일은_그대로() throws Exception {
        byte[] first = csv("sample-gu");
        assertTrue(up1(NAME, first).isSaved());
        byte[] other = (BOM + HEAD + "\n" + row("sample-gu") + "\n\n").getBytes(StandardCharsets.UTF_8);
        PlanCsvResultItem r = up1(NAME, other);
        assertFalse(r.isSaved());
        assertTrue(r.getMessage().contains("같은 이름"));
        assertArrayEquals(first, Files.readAllBytes(new File(plan, NAME).toPath()));
        assertEquals(2, Files.readAllLines(new File(receipts, "plan-csv-receipts.tsv").toPath(), StandardCharsets.UTF_8).size());
        assertEquals(1, plan.list().length);
    }

    @Test
    public void 대소문자만_다른_이름도_거부() {
        assertTrue(up1(NAME, csv("sample-gu")).isSaved());
        assertFalse(up1("Sample-GU_20261118_plan.csv", csv("Sample-GU")).isSaved());
    }

    @Test
    public void publish_는_이미_있는_대상을_덮어쓰지_않는다() throws Exception {
        Path target = new File(plan, NAME).toPath();
        Files.write(target, "first".getBytes(StandardCharsets.UTF_8));
        Path t = new File(plan, ".plan-upload-x.tmp").toPath();
        Files.write(t, "second".getBytes(StandardCharsets.UTF_8));
        try {
            PlanCsvUploadService.publish(t, target);
            fail("overwrote");
        } catch (FileAlreadyExistsException expected) { /* ok */ }
        assertEquals("first", new String(Files.readAllBytes(target), StandardCharsets.UTF_8));
    }

    @Test
    public void publish_정상이면_임시파일이_사라진다() throws Exception {
        Path target = new File(plan, NAME).toPath();
        Path t = new File(plan, ".plan-upload-y.tmp").toPath();
        Files.write(t, "body".getBytes(StandardCharsets.UTF_8));
        PlanCsvUploadService.publish(t, target);
        assertEquals("body", new String(Files.readAllBytes(target), StandardCharsets.UTF_8));
        assertFalse(Files.exists(t));
    }

    @Test
    public void 이름_규칙_위반은_거부() {
        for (String bad : Arrays.asList("plan.csv", "sample-gu_20261118_plan.csv.exe", "a b_20261118_plan.csv",
                "sample-gu_20261301_plan.csv", "sample-gu_20990101_plan.csv", "sample-gu_19991231_plan.csv",
                "sample-gu_2026118_plan.csv", "가상구_20261118_plan.csv")) {
            assertFalse(bad, up1(bad, csv("sample-gu")).isSaved());
        }
        assertEquals(0, plan.list().length);
    }

    @Test
    public void 경로조각이_붙은_이름은_폴더_안에만_저장된다() throws Exception {
        PlanCsvResultItem r = up1("../../x-gu_20261118_plan.csv", csv("x-gu"));
        assertTrue(r.getMessage(), r.isSaved());
        assertTrue(new File(plan, "x-gu_20261118_plan.csv").isFile());
        assertEquals(Arrays.asList("plan", "receipts"), sortedNames(tmp.getRoot()));   // 밖에 아무것도 안 생김
    }

    @Test
    public void cp949_파일은_거부() {
        byte[] b = (HEAD + "\n" + row("sample-gu") + "\n").getBytes(Charset.forName("EUC-KR"));
        PlanCsvResultItem r = up1(NAME, b);
        assertFalse(r.isSaved());
        assertTrue(r.getMessage().contains("UTF-8"));
    }

    @Test
    public void 머리줄_검사() {
        String unknown = HEAD + ",이상한열\n" + row("sample-gu") + ",x\n";
        String dup = HEAD + ",비고\n" + row("sample-gu") + ",x\n";
        String missing = HEAD.replace("사업명,", "") + "\n" + row("sample-gu") + "\n";
        for (String s : Arrays.asList(unknown, dup, missing)) {
            assertFalse(up1(NAME, s.getBytes(StandardCharsets.UTF_8)).isSaved());
        }
        assertEquals(0, plan.list().length);
    }

    @Test
    public void 사업행_없음과_기관ID_불일치와_빈파일_거부() {
        assertFalse(up1(NAME, (HEAD + "\r\n\r\n").getBytes(StandardCharsets.UTF_8)).isSaved());
        assertFalse(up1(NAME, csv("other-gu")).isSaved());
        assertFalse(up1(NAME, new byte[0]).isSaved());
        assertEquals(0, plan.list().length);
    }

    @Test
    public void 크기_5MB_초과는_거부() {
        byte[] big = new byte[(int) PlanCsvUploadService.MAX_BYTES + 1];
        Arrays.fill(big, (byte) 'a');
        PlanCsvResultItem r = up1(NAME, big);
        assertFalse(r.isSaved());
        assertTrue(r.getMessage().contains("5MB"));
        assertEquals(0, plan.list().length);
    }

    @Test(expected = PlanCsvUploadService.PlanCsvException.class)
    public void 설정이_비면_꺼짐() {
        new PlanCsvUploadService("", receipts.getAbsolutePath())
                .upload(Collections.<MultipartFile>singletonList(mp(NAME, csv("sample-gu"))), "tester01", null, null);
    }

    @Test(expected = PlanCsvUploadService.PlanCsvException.class)
    public void 영수증_폴더가_비어도_꺼짐() {
        new PlanCsvUploadService(plan.getAbsolutePath(), "  ")
                .upload(Collections.<MultipartFile>singletonList(mp(NAME, csv("sample-gu"))), "tester01", null, null);
    }

    @Test
    public void 꺼짐_여부() {
        assertTrue(sut.enabled());
        assertFalse(new PlanCsvUploadService("", "").enabled());
        assertFalse(new PlanCsvUploadService(null, receipts.getAbsolutePath()).enabled());
    }

    @Test
    public void 두_폴더가_같거나_겹치면_거부() throws Exception {
        File inner = new File(plan, "r");
        assertTrue(inner.mkdir());
        for (PlanCsvUploadService s : Arrays.asList(
                new PlanCsvUploadService(plan.getAbsolutePath(), plan.getAbsolutePath()),
                new PlanCsvUploadService(plan.getAbsolutePath(), inner.getAbsolutePath()))) {
            try {
                s.upload(Collections.<MultipartFile>singletonList(mp(NAME, csv("sample-gu"))), "tester01", null, null);
                fail("overlap accepted");
            } catch (PlanCsvUploadService.PlanCsvException expected) { /* ok */ }
        }
        assertFalse(new File(plan, NAME).exists());
    }

    @Test
    public void 폴더가_없으면_만들지_않고_거부() {
        File missing = new File(tmp.getRoot(), "nope");
        PlanCsvUploadService s = new PlanCsvUploadService(missing.getAbsolutePath(), receipts.getAbsolutePath());
        try {
            s.upload(Collections.<MultipartFile>singletonList(mp(NAME, csv("sample-gu"))), "tester01", null, null);
            fail();
        } catch (PlanCsvUploadService.PlanCsvException e) {
            assertFalse(missing.exists());
            assertFalse(e.getMessage().contains(missing.getName()));   // 경로를 싣지 않는다
        }
    }

    @Test
    public void 올린사람_이름_규칙() {
        for (String bad : Arrays.asList("", "  ", null, "a\tb", "a\nb", "-A1", ".x", "@x",
                "가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마")) {
            try {
                sut.upload(Collections.<MultipartFile>singletonList(mp(NAME, csv("sample-gu"))), bad, null, null);
                fail("accepted: " + bad);
            } catch (PlanCsvUploadService.PlanCsvException expected) { /* ok */ }
        }
        assertEquals(0, plan.list().length);
        assertTrue(PlanCsvUploadService.UPLOADER.matcher("김전산").matches());
        assertTrue(PlanCsvUploadService.UPLOADER.matcher("rpa-01").matches());
    }

    @Test(expected = PlanCsvUploadService.PlanCsvException.class)
    public void 한번에_51개는_거부() {
        List<MultipartFile> l = new ArrayList<MultipartFile>();
        for (int i = 0; i < 51; i++) l.add(mp("a" + i + "_20261118_plan.csv", csv("a" + i)));
        sut.upload(l, "tester01", null, null);
    }

    @Test
    public void 영수증_쓰기_실패면_파일을_되돌린다() throws Exception {
        Files.createDirectory(new File(receipts, "plan-csv-receipts.tsv").toPath());   // 파일 자리를 폴더가 차지 → append 실패
        PlanCsvResultItem r = up1(NAME, csv("sample-gu"));
        assertFalse(r.isSaved());
        assertEquals(0, plan.list().length);   // 기록 없는 파일이 남지 않고 임시 파일도 없다
    }

    @Test
    public void 영수증_칸_주입_차단() {
        assertEquals("a_b_c", PlanCsvUploadService.clean("a\tb\nc"));
        assertEquals("-", PlanCsvUploadService.clean(null));
        assertEquals("-", PlanCsvUploadService.clean(""));
        assertEquals("_-x", PlanCsvUploadService.clean("-x"));
        assertEquals("_@x", PlanCsvUploadService.clean("@x"));
        assertEquals("10.0.0.1", PlanCsvUploadService.clean("10.0.0.1"));
    }

    @Test
    public void 표시_이름에서_제어문자_제거() {
        assertEquals("a?b", PlanCsvUploadService.shown("a\nb"));
    }
}
