package com.kbstar.kgi.ggreport.web.service;

import com.kbstar.kgi.ggreport.web.config.AppProperties;
import com.kbstar.kgi.ggreport.web.domain.ChatMessage;
import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.dto.ChatIn;
import com.kbstar.kgi.ggreport.web.mapper.ChatMessageMapper;
import com.kbstar.kgi.ggreport.web.mapper.InstitutionMapper;
import org.junit.Before;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 대화 스트리밍의 <b>저장 규칙</b>을 고정한다 — Task 4.3 의 본체다.
 *
 * <p>스프링 컨텍스트를 띄우지 않는다. {@code @MockBean} 을 쓰면 컨텍스트가 갈라져
 * {@code @AppTest} 가 막으려는 문제가 되살아난다({@code AppTest} javadoc).
 *
 * <p>여기서 고정하는 네 갈래는 전부 원본 {@code server/routers/chat.py} 의
 * {@code finally} 블록에서 온 것이고, <b>하나씩 실제 사고에 대응</b>한다:
 * 반쪽 이력 / 빈 말풍선 / 오류 문구의 맥락 오염 / 중단과 실패의 혼동.
 */
public class ChatServiceTest {

    private static final String INSTITUTION_ID = "nowon";

    private ChatMessageMapper messages;
    private List<ChatMessage> inserted;
    private List<ChatMessage> existing;

    @Before
    public void setUp() {
        inserted = new ArrayList<>();
        existing = new ArrayList<>();
        messages = mock(ChatMessageMapper.class);
        when(messages.selectByInstitution(anyString())).thenAnswer(call -> existing);
        when(messages.insert(org.mockito.ArgumentMatchers.any(ChatMessage.class))).thenAnswer(call -> {
            inserted.add(call.getArgument(0));
            return 1;
        });
    }

    private ChatService serviceWith(ConsultReply reply) {
        Institution institution = new Institution();
        institution.setInstitutionId(INSTITUTION_ID);
        institution.setNameKo("노원구");
        institution.setGiganlistDir("corpus/institutions/nowon");

        InstitutionMapper institutionMapper = mock(InstitutionMapper.class);
        when(institutionMapper.selectById(INSTITUTION_ID)).thenReturn(institution);

        return new ChatService(new InstitutionService(institutionMapper), messages, reply,
                new AppProperties());
    }

    private ChatIn ask(String content) {
        ChatIn in = new ChatIn();
        in.setContent(content);
        in.setAuthor("김영업");
        return in;
    }

    /** 답변 조각을 그대로 내보내는 생성기. */
    private ConsultReply chunks(String... parts) {
        return new ConsultReply() {
            @Override
            public void stream(Request request, ChunkSink sink) throws Exception {
                for (String part : parts) {
                    sink.accept(part);
                }
            }

            @Override
            public String failureNotice(Exception exc) {
                return "[답변 실패] " + exc.getMessage();
            }
        };
    }

    /** 조각 몇 개를 내보낸 뒤 터지는 생성기. */
    private ConsultReply chunksThenFail(String... parts) {
        return new ConsultReply() {
            @Override
            public void stream(Request request, ChunkSink sink) throws Exception {
                for (String part : parts) {
                    sink.accept(part);
                }
                throw new IllegalStateException("엔드포인트 없음");
            }

            @Override
            public String failureNotice(Exception exc) {
                return "[답변 실패] " + exc.getMessage();
            }
        };
    }

    private String body(ChatService service, ChatService.Pending pending) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.writeReply(pending, out);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    @Test
    public void 정상완료하면_조각을_이어붙여_저장하고_꼬리표를_달지_않는다() {
        ChatService service = serviceWith(chunks("노원구는 ", "청년 정책이 ", "많습니다."));

        String out = body(service, service.begin(INSTITUTION_ID, ask("노원구 알려줘")));

        assertEquals("노원구는 청년 정책이 많습니다.", out);
        // 질문 1건 + 답변 1건.
        assertEquals(2, inserted.size());
        ChatMessage answer = inserted.get(1);
        assertEquals("agent", answer.getRole());
        assertEquals("노원구는 청년 정책이 많습니다.", answer.getContent());
        assertFalse("정상 완료에는 중단 꼬리표가 붙으면 안 된다",
                answer.getContent().contains(ChatService.INTERRUPTED));
    }

    @Test
    public void 도중에_실패하면_사유가_본문과_이력_양쪽에_붙는다() {
        ChatService service = serviceWith(chunksThenFail("여기까지는 답했다."));

        String out = body(service, service.begin(INSTITUTION_ID, ask("질문")));

        assertEquals("여기까지는 답했다.\n\n[답변 실패] 엔드포인트 없음", out);
        assertEquals(2, inserted.size());
        // 받은 만큼은 남긴다 — 안 그러면 질문만 있고 답이 사라진 반쪽 이력이 된다.
        assertEquals("여기까지는 답했다.\n\n[답변 실패] 엔드포인트 없음",
                inserted.get(1).getContent());
    }

    /**
     * ⚠️ 이 규칙이 이 클래스에서 가장 중요하다. 한 조각도 못 받았으면 <b>저장하지 않는다</b> —
     * 오류 문구가 {@code agent} 발언으로 남으면 다음 질문 때 그것이 대화 맥락으로 모델에
     * 다시 들어간다.
     */
    @Test
    public void 한조각도_못받고_실패하면_사유는_보내되_이력에는_남기지_않는다() {
        ChatService service = serviceWith(chunksThenFail());

        String out = body(service, service.begin(INSTITUTION_ID, ask("질문")));

        // 앞에 보낸 조각이 없으므로 빈 줄 없이 사유만 나간다.
        assertEquals("[답변 실패] 엔드포인트 없음", out);
        assertEquals("질문만 저장되어야 한다", 1, inserted.size());
        assertEquals("user", inserted.get(0).getRole());
    }

    @Test
    public void 클라이언트가_끊으면_실패가_아니라_중단으로_남는다() {
        ChatService service = serviceWith(chunks("첫 조각", "둘째 조각"));
        ChatService.Pending pending = service.begin(INSTITUTION_ID, ask("질문"));

        // 첫 쓰기 뒤에 끊긴 소켓을 흉내 낸다.
        service.writeReply(pending, new OutputStream() {
            private int writes;

            @Override
            public void write(int b) {
            }

            @Override
            public void write(byte[] b, int off, int len) throws IOException {
                if (writes++ > 0) {
                    throw new IOException("Broken pipe");
                }
            }
        });

        assertEquals(2, inserted.size());
        String saved = inserted.get(1).getContent();
        // 조각은 **만들어진 시점에** 기록된다(원본도 append 뒤에 yield 한다). 그래서
        // 전달에 실패한 '둘째 조각'도 이력에는 남는다 — 만든 것을 버리지 않는다는 쪽이
        // "반쪽 이력"을 막는다는 이 규칙의 취지에 맞다.
        assertEquals("첫 조각둘째 조각\n\n" + ChatService.INTERRUPTED, saved);
        assertFalse("중단은 실패가 아니다 — 실패 문구가 붙으면 안 된다",
                saved.contains("[답변 실패]"));
    }

    /**
     * 이력을 먼저 읽고 질문을 나중에 넣는다. 뒤집으면 방금 한 질문이 "이전 대화"에
     * 섞여 모델에 두 번 들어간다.
     */
    @Test
    public void 이력은_이번_질문을_포함하지_않는다() {
        ChatMessage before = new ChatMessage();
        before.setRole("user");
        before.setContent("예전 질문");
        existing = new ArrayList<>(Collections.singletonList(before));

        ChatService service = serviceWith(chunks("답"));
        ChatService.Pending pending = service.begin(INSTITUTION_ID, ask("이번 질문"));

        List<String> historyContents = new ArrayList<>();
        for (ChatMessage m : pending.getRequest().getHistory()) {
            historyContents.add(m.getContent());
        }
        assertEquals(Collections.singletonList("예전 질문"), historyContents);
        assertEquals("이번 질문", pending.getRequest().getUserMessage());
    }

    /**
     * 조각마다 flush 한다. 빠뜨리면 응답 내용은 같지만 끝에 한 번에 도착해
     * "조금씩 나타나는" 동작이 사라진다 — 화면에서만 보이는 회귀라 테스트로 못 박는다.
     */
    @Test
    public void 조각마다_즉시_flush한다() {
        ChatService service = serviceWith(chunks("가", "나", "다"));
        ChatService.Pending pending = service.begin(INSTITUTION_ID, ask("질문"));

        List<String> events = new ArrayList<>();
        service.writeReply(pending, new OutputStream() {
            @Override
            public void write(int b) {
            }

            @Override
            public void write(byte[] b, int off, int len) {
                events.add("write");
            }

            @Override
            public void flush() {
                events.add("flush");
            }
        });

        assertEquals(Arrays.asList("write", "flush", "write", "flush", "write", "flush"), events);
    }

    @Test
    public void 빈_조각은_보내지도_저장하지도_않는다() {
        ChatService service = serviceWith(chunks("", "실제 답"));

        String out = body(service, service.begin(INSTITUTION_ID, ask("질문")));

        assertEquals("실제 답", out);
        assertTrue(inserted.get(1).getContent().equals("실제 답"));
    }
}
