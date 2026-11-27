package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.web.ApiException;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;

/** hwpx 의 비-XML 항목(Preview/PrvText.txt 등) 완화와 그 한계(security 11-27 조건). */
public class PrepAttachInspectorHwpxTest {

    private static final String PRV = "<><><><>\r\n<  <>\r\n공고 미리보기 글";

    private static ExtCheckFixtures.Zip hwpx() throws Exception {
        return ExtCheckFixtures.hwpx("공고 본문");
    }

    private static String code(String ext, byte[] zip) {
        try {
            PrepAttachInspector.inspect(ext, zip);
            fail("거절되어야 한다");
            return null;
        } catch (ApiException e) {
            assertEquals(400, e.getStatus());
            return (String) ((Map<?, ?>) e.getDetailObject()).get("code");
        }
    }

    @Test
    public void PrvText_txt가_XML_모양_깨진_글이어도_hwpx는_통과() throws Exception {
        byte[] zip = hwpx().add("Preview/PrvText.txt", PRV).bytes();
        assertNotNull(PrepAttachInspector.inspect("hwpx", zip));
    }

    @Test
    public void UTF16LE_BOM_판_PrvText도_통과() throws Exception {
        byte[] body = PRV.getBytes(StandardCharsets.UTF_16LE);
        byte[] withBom = new byte[body.length + 2];
        withBom[0] = (byte) 0xFF;
        withBom[1] = (byte) 0xFE;
        System.arraycopy(body, 0, withBom, 2, body.length);
        byte[] zip = hwpx().addBytes("Preview/PrvText.txt", withBom).bytes();
        assertNotNull(PrepAttachInspector.inspect("hwpx", zip));
    }

    @Test
    public void 이름이_txt여도_DOCTYPE이_앞에_있으면_거절() throws Exception {
        byte[] zip = hwpx().add("Preview/PrvText.txt", "<!DOCTYPE x [<!ENTITY a \"b\">]><x/>").bytes();
        assertEquals("FILE_REJECTED", code("hwpx", zip));
    }

    @Test
    public void 깨진_section0_xml과_container_rdf는_거절() throws Exception {
        byte[] a = new ExtCheckFixtures.Zip().add("mimetype", "application/hwp+zip")
                .add("Contents/section0.xml", "<sec><p>").bytes();
        assertEquals("FILE_REJECTED", code("hwpx", a));
        byte[] b = hwpx().add("META-INF/container.rdf", "<><><>").bytes();
        assertEquals("FILE_REJECTED", code("hwpx", b));
    }

    @Test
    public void 대소문자만_다른_중복_이름은_거절() throws Exception {
        byte[] zip = hwpx().add("contents/Section0.XML", "<sec/>").bytes();
        assertEquals("FILE_REJECTED", code("hwpx", zip));
    }

    @Test
    public void 같은_PrvText를_넣은_xlsx는_완화_꺼짐이라_거절() throws Exception {
        byte[] zip = new ExtCheckFixtures.Zip().add("[Content_Types].xml", "<Types/>")
                .add("xl/workbook.xml", "<workbook/>").add("Preview/PrvText.txt", PRV).bytes();
        assertEquals("FILE_REJECTED", code("xlsx", zip));
    }

    @Test
    public void 이름에_activex가_든_hwpx는_ACTIVE_CONTENT() throws Exception {
        byte[] zip = hwpx().add("BinData/activex1.bin", "x").add("Preview/PrvText.txt", PRV).bytes();
        assertEquals("ACTIVE_CONTENT", code("hwpx", zip));
    }
}
