package com.kbstar.kgi.ggreport.web.llm;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** NEXT 129 ⑤ — 로컬 Ollama 켜는 조건의 단일 판정(OllamaGuard). 순수 단위 시험. */
public class OllamaGuardTest {

    private static final String MYSQL = "jdbc:mysql://localhost:3306/x";

    private static OllamaProperties on() {
        OllamaProperties p = new OllamaProperties();
        p.setEnabled(true);
        p.setModel("test-model");
        p.setBaseUrl("http://127.0.0.1:11434");
        return p;
    }

    private static String reason(OllamaProperties p, String ds, String jndi) {
        OllamaGuard.Check c = OllamaGuard.check(p, ds, jndi);
        assertEquals(OllamaGuard.State.BAD_CONFIG, c.getState());
        return c.getReason();
    }

    @Test
    public void 꺼져_있으면_OFF() {
        OllamaProperties p = on();
        p.setEnabled(false);
        assertEquals(OllamaGuard.State.OFF, OllamaGuard.check(p, MYSQL, "").getState());
        assertEquals(OllamaGuard.State.OFF, OllamaGuard.check(null, MYSQL, "").getState());
    }

    @Test
    public void 내부망_신호는_막는다_JNDI_또는_오라클() {
        assertEquals("INTERNAL_ENV", reason(on(), MYSQL, "java:comp/env/jdbc/x"));
        assertEquals("INTERNAL_ENV", reason(on(), "jdbc:oracle:thin:@x:1521/y", ""));
        assertEquals("INTERNAL_ENV", reason(on(), "", ""));
        assertEquals("INTERNAL_ENV", reason(on(), null, null));
    }

    @Test
    public void MySQL_H2는_READY이고_채팅_주소는_루프백_고정() {
        OllamaGuard.Check c = OllamaGuard.check(on(), MYSQL, "");
        assertEquals(OllamaGuard.State.READY, c.getState());
        assertEquals("http://127.0.0.1:11434/api/chat", c.getChat().toString());
        assertEquals("http://127.0.0.1:11434/api/tags", c.getTags().toString());
        assertEquals(OllamaGuard.State.READY, OllamaGuard.check(on(), "jdbc:h2:mem:t", "").getState());
        OllamaProperties p = on();
        p.setBaseUrl("http://localhost:9999/");
        assertEquals("http://127.0.0.1:9999/api/chat", OllamaGuard.check(p, MYSQL, "").getChat().toString());
    }

    @Test
    public void 주소가_루프백이_아니거나_모양이_틀리면_막는다() {
        String[][] cases = {
                {"http://10.0.0.5:11434", "NOT_LOOPBACK"},
                {"http://localhost.evil.com:11434", "NOT_LOOPBACK"},
                {"http://127.0.0.1.nip.io:11434", "NOT_LOOPBACK"},
                {"http://[::1]:11434", "NOT_LOOPBACK"},
                {"https://127.0.0.1:11434", "URL_SCHEME"},
                {"http://127.0.0.1:11434/v1", "URL_PATH"},
                {"http://u@127.0.0.1:11434", "URL_EXTRA"},
                {"http://127.0.0.1:11434?a=1", "URL_EXTRA"},
                {"http://127.0.0.1", "URL_PORT"},
        };
        for (String[] c : cases) {
            OllamaProperties p = on();
            p.setBaseUrl(c[0]);
            assertEquals(c[0], c[1], reason(p, MYSQL, ""));
        }
    }

    @Test
    public void 모델_이름과_수치_범위를_검사한다() {
        OllamaProperties p = on();
        p.setModel("");
        assertEquals("NO_MODEL", reason(p, MYSQL, ""));
        p.setModel("a b");
        assertEquals("MODEL_FORMAT", reason(p, MYSQL, ""));
        p = on();
        p.setReadTimeoutMs(0);
        assertEquals("TIMEOUT_RANGE", reason(p, MYSQL, ""));
        p.setReadTimeoutMs(700_000);
        assertEquals("TIMEOUT_RANGE", reason(p, MYSQL, ""));
        p = on();
        p.setCooldownSeconds(601);
        assertEquals("COOLDOWN_RANGE", reason(p, MYSQL, ""));
        p.setCooldownSeconds(-1);
        assertEquals("COOLDOWN_RANGE", reason(p, MYSQL, ""));
        p = on();
        p.setMaxResponseBytes(10);
        assertEquals("BODY_RANGE", reason(p, MYSQL, ""));
        p = on();
        p.setNumCtx(-1);
        assertEquals("NUM_CTX_RANGE", reason(p, MYSQL, ""));
    }

    @Test
    public void 기본값은_꺼짐이고_시간제한_480초_쿨다운_60초() {
        OllamaProperties p = new OllamaProperties();
        assertFalse(p.isEnabled());
        assertEquals("", p.getModel());
        assertEquals(480_000, p.getReadTimeoutMs());
        assertEquals(60, p.getCooldownSeconds());
    }

    @Test
    public void toString에_주소가_없다() {
        OllamaGuard.Check c = OllamaGuard.check(on(), MYSQL, "");
        assertFalse(c.toString(), c.toString().contains("127.0.0.1") || c.toString().contains("11434"));
        assertTrue(c.toString().contains("READY"));
    }
}
