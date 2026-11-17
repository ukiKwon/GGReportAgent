package com.kbstar.kgi.ggreport.web.support;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** checks[] 형식 검사(SCHEMA ④-2) — contract/batch_schema.py 시험과 같은 입력·기대. 작은따옴표는 JSON 따옴표로 바꿔 쓴다. */
public class BatchSchemaChecksTest {

    private static final String ID = "2026-11-17_0700_extcheck-daily";
    private static final String SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String CHECK =
            "{'check_id':'c-0001','institution':{'name_ko':'가구청','region_code':'11'},'status':'found',"
            + "'checked_at':'2026-11-17T07:02:11+09:00','source_kind':'notice','source_slug':'eminwon',"
            + "'match':{'confidence':'high','basis':['domain_match']},"
            + "'notice':{'title':'금고 공고','deadline_at':'2026-12-02'},"
            + "'attachments':[{'path':'files/c-0001_1.pdf','sha256':'" + SHA + "','size':10}]}";

    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private List<String> run(String checksJson, String minorJson, String recordsJson, boolean withFile) throws IOException {
        return runAs(ID, "extcheck-daily", checksJson, minorJson, recordsJson, withFile);
    }
    private List<String> runAs(String id, String slug, String checksJson, String minorJson, String recordsJson, boolean withFile) throws IOException {
        Path dir = tmp.newFolder(id).toPath();
        Files.createDirectories(dir.resolve("files"));
        Files.write(dir.resolve("institutions.csv"), "h\n".getBytes(StandardCharsets.UTF_8));
        if (withFile) {
            Files.write(dir.resolve("files").resolve("c-0001_1.pdf"), new byte[]{'x'});
        }
        String m = "{'schema_version':1," + minorJson + "'batch_id':'" + id + "','collected_at':'2026-11-17T07:00:05+09:00',"
                + "'source':{'slug':'" + slug + "'},'records':" + recordsJson
                + (checksJson == null ? "" : ",'checks':" + checksJson) + "}";
        Files.write(dir.resolve("manifest.json"), m.replace('\'', '"').getBytes(StandardCharsets.UTF_8));
        return BatchSchema.validate(dir);
    }
    private List<String> checks(String checkJson) throws IOException { return run("[" + checkJson + "]", "'schema_minor':1,", "[]", true); }

    @Test public void 정상이면_통과한다() throws Exception {
        assertEquals(java.util.Collections.emptyList(), checks(CHECK));
    }

    @Test public void minor_없음_0_2_문자열은_422_사유다() throws Exception {
        for (String minor : new String[]{"", "'schema_minor':0,", "'schema_minor':2,", "'schema_minor':'1',", "'schema_minor':true,"}) {
            List<String> e = run("[" + CHECK + "]", minor, "[]", true);
            assertEquals(minor, 1, e.size());
            assertTrue(e.get(0).startsWith("UNSUPPORTED_MINOR"));
            tmpReset();
        }
    }

    @Test public void checks_없으면_minor는_보지_않는다() throws Exception {
        assertTrue(run(null, "'schema_minor':9,", "[]", false).isEmpty());
    }

    @Test public void 나쁜_check_id는_거부하고_값을_싣지_않는다() throws Exception {
        for (String bad : new String[]{"../x", "a/b", "한글", "", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "a b"}) {
            List<String> e = checks(CHECK.replace("'c-0001'", "'" + bad + "'"));
            String all = String.join("|", e);
            assertTrue(bad, all.contains("check_id"));
            if (!bad.isEmpty()) {
                assertFalse(bad, all.contains(bad));
            }
            tmpReset();
        }
    }

    @Test public void check_id_중복은_대소문자를_가리지_않는다() throws Exception {
        String second = "{'check_id':'C-0001','institution':{'name_ko':'나구청'},'status':'not_found',"
                + "'checked_at':'2026-11-17T07:03:00+09:00','source_kind':'notice','source_slug':'eminwon'}";
        List<String> e = run("[" + CHECK + "," + second + "]", "'schema_minor':1,", "[]", true);
        assertTrue(String.join("|", e).contains("중복"));
    }

    @Test public void 나쁜_첨부_경로는_거부하고_값을_싣지_않는다() throws Exception {
        String[][] bad = {{"files/한글.pdf", "한글"}, {"files/a:b.pdf", "a:b"}, {"files/CON.pdf", "CON"},
                {"files/a.exe", "a.exe"}, {"files/../zzq.pdf", "zzq"}, {"/etc/zzq.pdf", "zzq"},
                {"files/a b.pdf", "a b"}, {"files/.hid.pdf", ".hid"}, {"files/x.PDF", "x.PDF"}};
        for (String[] b : bad) {
            String all = String.join("|", checks(CHECK.replace("files/c-0001_1.pdf", b[0])));
            assertTrue(b[0], all.contains(".path"));
            assertFalse(b[0], all.contains(b[1]));
            tmpReset();
        }
    }

    @Test public void 없는_파일_나쁜_sha_크기는_거부한다() throws Exception {
        assertTrue(String.join("|", run("[" + CHECK + "]", "'schema_minor':1,", "[]", false)).contains("파일이 없습니다"));
        tmpReset();
        String all = String.join("|", checks(CHECK.replace(SHA, "ZZ").replace("'size':10", "'size':0")));
        assertTrue(all.contains("sha256") && all.contains(".size"));
    }

    @Test public void 기존_records_첨부_문구에도_받은_값이_없다() throws Exception {
        String rec = "[{'notice_id':'N-1','title':'t','institution':{'name_ko':'구청'},'evidence':{'url':'u'},"
                + "'attachments':['files/../../zzq/passwd']}]";
        String all = String.join("|", run(null, "", rec, false));
        assertTrue(all.contains("상위 경로 참조"));
        assertFalse(all.contains("zzq") || all.contains("passwd"));
    }

    @Test public void checks_배치는_slug가_extcheck로_시작해야_하고_값은_싣지_않는다() throws Exception {
        for (String slug : new String[]{"lofin365", "xextcheck", "Extcheck"}) {
            List<String> e = runAs(ID, slug, "[" + CHECK + "]", "'schema_minor':1,", "[]", true);
            String all = String.join("|", e);
            assertTrue(slug, all.contains("source.slug"));
            assertFalse(slug, all.contains(slug));
            tmpReset();
        }
    }

    @Test public void checks_배치는_batch_id에_extcheck가_있어야_한다() throws Exception {
        String id = "2026-11-17_0700_lofin365";
        String all = String.join("|", runAs(id, "extcheck-daily", "[" + CHECK + "]", "'schema_minor':1,", "[]", true));
        assertTrue(all.contains("batch_id"));
        assertFalse(all.contains("lofin365"));
    }

    @Test public void checks_없는_배치는_slug와_batch_id를_가리지_않는다() throws Exception {
        assertTrue(runAs("2026-11-17_0700_lofin365", "lofin365", null, "", "[]", false).isEmpty());
    }

    @Test public void 읽을_수_없는_manifest는_고정_문구뿐이다() throws Exception {
        Path dir = tmp.newFolder(ID).toPath();
        Files.write(dir.resolve("manifest.json"), "{\"zzq\": ".getBytes(StandardCharsets.UTF_8));
        assertEquals(java.util.Collections.singletonList("manifest.json을 읽을 수 없습니다"), BatchSchema.validate(dir));
    }

    private void tmpReset() { tmp.delete(); try { tmp.create(); } catch (IOException e) { throw new IllegalStateException(e); } }
}
