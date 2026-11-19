package com.kbstar.kgi.ggreport.web.minutes;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 회의록 파싱·가림 오류. 코드·칸(slot)·줄 번호만 담는다 — 원문 줄·가림 단어·파일명은 절대 싣지 않는다(security R5·R6).
 * 메시지는 코드별 고정 문구다. 서비스 계층이 {@code ApiException.withDetail(status, toDetail())} 로 감쌀 수 있다.
 */
public final class MinutesException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final int status;
    private final String code;
    private final String slot;
    private final int line;
    private final Map<String, Integer> kinds;

    public MinutesException(int status, String code, String slot, int line) {
        this(status, code, slot, line, null);
    }

    public MinutesException(int status, String code, String slot, int line, Map<String, Integer> kinds) {
        super(code);
        this.status = status;
        this.code = code;
        this.slot = slot;
        this.line = line;
        this.kinds = kinds == null ? Collections.<String, Integer>emptyMap() : new LinkedHashMap<String, Integer>(kinds);
    }

    /** 422 — 입력 내용이 규칙에 맞지 않음. */
    public static MinutesException unprocessable(String code, String slot, int line) {
        return new MinutesException(422, code, slot, line);
    }

    /** 400 — 요청 값(가림 단어·해제 목록)이 잘못됨. */
    public static MinutesException badRequest(String code) {
        return new MinutesException(400, code, null, 0);
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    /** transcript / timeline / summary / title / edit 등. 없으면 null. */
    public String getSlot() {
        return slot;
    }

    /** 1부터 세는 줄 번호. 해당 없으면 0. */
    public int getLine() {
        return line;
    }

    /** MASK_REQUIRED 일 때 종류별 건수(pii·name·title). 값은 없다. */
    public Map<String, Integer> getKinds() {
        return Collections.unmodifiableMap(kinds);
    }

    /** 응답 detail 용 — {code, message(고정 문구), slot, line, kinds}. */
    public Map<String, Object> toDetail() {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("code", code);
        m.put("message", messageFor(code));
        if (slot != null) {
            m.put("slot", slot);
        }
        if (line > 0) {
            m.put("line", Integer.valueOf(line));
        }
        if (!kinds.isEmpty()) {
            m.put("kinds", new LinkedHashMap<String, Integer>(kinds));
        }
        return m;
    }

    /** 코드별 고정 문구. 입력 값을 되돌려 주지 않는다. */
    public static String messageFor(String code) {
        if (code == null) {
            return "요청을 처리할 수 없습니다.";
        }
        switch (code) {
            case "EMPTY_FILE": return "빈 파일입니다.";
            case "NOT_TXT": return "텍스트(.txt) 파일만 올릴 수 있습니다.";
            case "BINARY_SIGNATURE": return "텍스트 파일이 아닙니다.";
            case "NUL_BYTE": return "텍스트 파일이 아닙니다(제어 바이트 포함).";
            case "ENCODING_UTF16": return "UTF-8 또는 CP949 텍스트로 내보낸 파일을 올리세요.";
            case "ENCODING_UNKNOWN": return "글자 인코딩을 알 수 없습니다. UTF-8 또는 CP949 텍스트를 올리세요.";
            case "CONTROL_CHAR": return "허용되지 않는 제어 문자가 있습니다.";
            case "LIMIT_LINES": return "줄 수가 너무 많습니다.";
            case "LIMIT_LINE": return "한 줄이 너무 깁니다.";
            case "LIMIT_UTTERANCES": return "발언 수가 너무 많습니다.";
            case "LIMIT_SEGMENTS": return "시간 구간 수가 너무 많습니다.";
            case "LIMIT_ITEMS": return "요약 항목 수가 너무 많습니다.";
            case "LIMIT_ITEM_LEN": return "요약 항목 하나가 너무 깁니다.";
            case "PARSE_TIMEOUT": return "처리 시간이 너무 오래 걸려 중단했습니다.";
            case "TRANSCRIPT_NO_UTTERANCE": return "원문에서 발언을 찾지 못했습니다.";
            case "TIMELINE_FORMAT": return "시간대별 요약 형식을 읽지 못했습니다.";
            case "TIMELINE_RANGE": return "시간 구간의 시작이 끝보다 늦습니다.";
            case "TIMELINE_LOOKS_TRANSCRIPT": return "시간대별 요약 칸에 원문을 올린 것 같습니다. 파일 칸을 확인하세요.";
            case "SUMMARY_NO_ITEMS": return "'- ' 항목으로 다시 내보낸 파일을 올리세요.";
            case "SUMMARY_LOOKS_TIMELINE": return "맞춤 요약 칸에 시간대별 요약을 올린 것 같습니다. 파일 칸을 확인하세요.";
            case "MASK_REQUIRED": return "개인정보 또는 이름이 들어 있어 저장할 수 없습니다. 가려서 다시 입력하세요.";
            case "TERMS_INVALID": return "추가로 가릴 단어가 올바르지 않습니다.";
            case "RELEASE_INVALID": return "해제할 수 없는 항목이 있습니다.";
            default: return "요청을 처리할 수 없습니다.";
        }
    }
}
