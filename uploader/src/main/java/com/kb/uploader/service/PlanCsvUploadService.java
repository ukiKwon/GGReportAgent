package com.kb.uploader.service;

import com.kb.uploader.dto.PlanCsvResultItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryIteratorException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 사업계획 CSV 업로드 (NEXT 56 U1, collector/SCHEMA.md ⑪).
 *
 * <p>DB·파싱을 거치지 않는다. 검사를 통과한 파일을 <b>원래 이름 그대로</b> 전용 폴더({@code upload.plan-csv-dir})에
 * 놓고, 기록은 별도 폴더({@code upload.plan-csv-receipt-dir})의 추가 전용 TSV 에 남긴다.
 * kgi-ggreport-web 의 PlanInboxService(설정 ggreport.plan-inbox.location)가 같은 폴더를 읽어 반입한다.
 * web 은 이 폴더를 읽기만 하고, 이름이 {@link #FILE_NAME} 에 안 맞는 파일(.tmp 포함)은 무시한다.
 *
 * <p>⚠️ {@link #FILE_NAME}·{@link #HEADERS}·{@link #REQUIRED} 는 web 의 PlanCsv.java 사본이다.
 * 어긋나면 web 쪽이 맞다 — 한쪽을 고치면 다른 쪽도 고친다. 여기 검사는 빠른 거름망이고 최종 판정은 web 이다
 * (수식 시작 문자·서식 문자·칸 규칙은 web PlanCsv 가 칸 단위로 거부한다).
 *
 * <p>⚠️ 올린 사람은 화면 입력(자기신고)이고 client_ip 는 참고값이다(프록시·WebLogic Plug-In 구성에 따라 바뀔 수 있음).
 * 이 앱에는 로그인이 없다 — 영수증은 "검증된 신원"이 아니라 대조 보조 기록이다.
 * <p>로그·응답에는 이름(정규식 통과분)·크기·SHA·결과 코드만 싣는다. 본문·경로·예외 메시지·올린 사람은 로그에 싣지 않는다.
 */
@Service
public class PlanCsvUploadService {

    private static final Logger log = LoggerFactory.getLogger(PlanCsvUploadService.class);

    public static final Pattern FILE_NAME = Pattern.compile("([A-Za-z0-9-]{1,64})_(\\d{8})_plan\\.csv");
    public static final long MAX_BYTES = 5L * 1024 * 1024;   // web CsvLimits.MAX_FILE_BYTES 와 같다
    public static final int MAX_FILES = 50;                  // SCHEMA ⑪-5
    static final int MAX_ENTRIES = 100000;                   // 중복 이름 확인 때 훑는 상한(넘으면 닫힌 채 거부)
    static final int MAX_HEADER_CHARS = 2000;
    static final String RECEIPT_FILE = "plan-csv-receipts.tsv";
    /** 첫 글자는 글자·숫자 — '-'·'.' 시작은 TSV 를 엑셀로 열 때 수식으로 읽힌다. */
    static final Pattern UPLOADER = Pattern.compile("[\\p{L}\\p{N}][\\p{L}\\p{N}._ -]{0,29}");
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DAY =
            DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);
    private static final LocalDate MIN_DAY = LocalDate.of(2000, 1, 1);
    private static final String MSG_EXISTS =
            "같은 이름의 파일이 이미 있습니다. 덮어쓰지 않습니다. 새로 내려면 확인일(파일 이름 날짜)을 바꿔 다시 만드세요.";

    static final List<String> HEADERS = Collections.unmodifiableList(Arrays.asList(
            "기관ID", "문서명", "원천종류", "대상기간시작", "대상기간끝", "출처URL", "확인일", "수집자",
            "문서쪽범위", "문서비고", "분야번호", "분야명", "사업번호", "상위사업번호", "사업명", "내용",
            "예산상태", "예산금액", "예산단위", "연차예산", "원문쪽", "확인상태", "진행상태", "이행률", "비고"));
    static final Set<String> REQUIRED = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "기관ID", "문서명", "원천종류", "대상기간시작", "대상기간끝", "출처URL", "확인일", "수집자",
            "사업번호", "사업명", "예산상태")));

    /** 화면에 그대로 보여 줄 수 있는 고정 문구만 담는다. */
    public static class PlanCsvException extends RuntimeException {
        public PlanCsvException(String message) { super(message); }
    }

    private final String dir;
    private final String receiptDir;
    private final Object lock = new Object();

    public PlanCsvUploadService(@Value("${upload.plan-csv-dir:}") String dir,
                                @Value("${upload.plan-csv-receipt-dir:}") String receiptDir) {
        this.dir = dir == null ? "" : dir.trim();
        this.receiptDir = receiptDir == null ? "" : receiptDir.trim();
    }

    /** 폴더 두 개가 모두 설정돼야 켜진다 — 기록(④) 없이 파일만 쌓이는 일을 막는다. */
    public boolean enabled() { return !dir.isEmpty() && !receiptDir.isEmpty(); }

    public List<PlanCsvResultItem> upload(List<MultipartFile> files, String uploaderRaw,
                                          String remoteUser, String clientIp) {
        if (!enabled()) {
            throw new PlanCsvException("사업계획 CSV 폴더가 설정되지 않아 올릴 수 없습니다. 개발부서에 문의해 주세요.");
        }
        String uploader = uploaderRaw == null ? "" : uploaderRaw.trim();
        if (!UPLOADER.matcher(uploader).matches()) {
            throw new PlanCsvException("올린 사람 이름을 입력해 주세요(글자·숫자로 시작, 글자·숫자·공백·점·밑줄·하이픈, 30자 이내).");
        }
        if (files == null || files.isEmpty() || files.size() > MAX_FILES) {
            throw new PlanCsvException("파일은 1~" + MAX_FILES + "개여야 합니다.");
        }
        Path root = realDir(dir);
        Path receipts = realDir(receiptDir);
        if (root.startsWith(receipts) || receipts.startsWith(root)) {
            // 영수증(이름·IP)이 web 이 읽는 폴더에 놓이지 않게 한다
            log.error("plan-csv folders overlap");
            throw new PlanCsvException("사업계획 CSV 폴더 설정이 올바르지 않습니다. 개발부서 설정을 확인해 주세요.");
        }
        List<PlanCsvResultItem> out = new ArrayList<PlanCsvResultItem>();
        for (MultipartFile f : files) {
            String orig = f.getOriginalFilename();
            if (orig == null || orig.trim().isEmpty()) continue;   // 파일을 고르지 않은 빈 파트
            out.add(one(root, receipts, f, FileStorageService.safeFileName(orig), uploader, remoteUser, clientIp));
        }
        if (out.isEmpty()) throw new PlanCsvException("파일을 선택해 주세요.");
        return out;
    }

    private PlanCsvResultItem one(Path root, Path receipts, MultipartFile f, String name,
                                  String uploader, String remoteUser, String clientIp) {
        String shown = shown(name);
        Matcher m = FILE_NAME.matcher(name);
        if (!m.matches()) {
            return reject(shown, "NAME", "파일 이름은 {기관ID}_{YYYYMMDD}_plan.csv 형식이어야 합니다.");
        }
        String inst = m.group(1);
        LocalDate day;
        try {
            day = LocalDate.parse(m.group(2), DAY);
        } catch (DateTimeParseException e) {
            return reject(shown, "DATE", "파일 이름의 날짜가 실제 날짜가 아닙니다.");
        }
        if (day.isBefore(MIN_DAY) || day.isAfter(LocalDate.now(SEOUL))) {
            return reject(shown, "DATE", "파일 이름의 날짜는 2000-01-01부터 오늘까지여야 합니다.");
        }
        byte[] raw;
        try {
            raw = readCapped(f);
        } catch (IOException e) {
            return fail(shown, "READ", e, "파일을 읽지 못했습니다.");
        }
        if (raw == null) {
            return reject(shown, "SIZE", "파일은 5MB 이하여야 합니다.");
        }
        String why = checkContent(raw, inst);
        if (why != null) return reject(shown, "CONTENT", why);

        String sha = sha256(raw);
        Path target = root.resolve(name);
        Path tmp = root.resolve(".plan-upload-" + UUID.randomUUID() + ".tmp");
        try {
            try (OutputStream o = Files.newOutputStream(tmp, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                o.write(raw);
            }
            synchronized (lock) {
                boolean exists;
                try {
                    exists = existsIgnoreCase(root, name);
                } catch (IOException e) {
                    return fail(shown, "LIST", e, "폴더 확인에 실패해 저장하지 않았습니다(파일이 너무 많거나 읽을 수 없음). 개발부서에 문의해 주세요.");
                }
                if (exists) {
                    return reject(shown, "EXISTS", MSG_EXISTS);
                }
                try {
                    publish(tmp, target);
                } catch (FileAlreadyExistsException e) {
                    return reject(shown, "EXISTS", MSG_EXISTS);
                }
                try {
                    appendReceipt(receipts, name, sha, raw.length, inst, day, uploader, remoteUser, clientIp);
                } catch (IOException e) {
                    // 방금 우리가 공개한 파일이다(publish 는 덮어쓰지 않는다). 기록 없는 파일이 폴더에 남아 web 이 읽지 않게 되돌린다.
                    try {
                        Files.deleteIfExists(target);
                    } catch (IOException e2) {
                        // 되돌리기까지 실패 — 기록 없는 파일이 남았다. 사람이 지워야 하므로 문구로 분명히 알린다(qa P3).
                        return fail(shown, "RECEIPT_ROLLBACK", e2,
                                "올린 기록을 남기지 못했고 파일 되돌리기도 실패했습니다. 반입하지 말고 개발부서에 파일 삭제를 요청해 주세요.");
                    }
                    return fail(shown, "RECEIPT", e, "올린 기록을 남기지 못해 저장하지 않았습니다. 개발부서에 문의해 주세요.");
                }
            }
            log.info("plan-csv saved name={} size={} sha256={}", name, raw.length, sha);
            return new PlanCsvResultItem(shown, true, sha, "저장했습니다. 웹에서 폴더 확인 후 반입하세요.");
        } catch (IOException e) {
            return fail(shown, "WRITE", e, "저장하지 못했습니다. 개발부서에 문의해 주세요.");
        } finally {
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignore) {
                log.warn("plan-csv tmp cleanup failed");
            }
        }
    }

    /**
     * 덮어쓰지 않고 공개한다. Files.move 는 POSIX 에서 '대상 확인 후 rename(2)' 이라 그 사이 덮어쓸 수 있다.
     * link(2)·CreateHardLink 는 대상이 있으면 원자적으로 실패한다(FileAlreadyExistsException).
     */
    static void publish(Path tmp, Path target) throws IOException {
        try {
            Files.createLink(target, tmp);
        } catch (FileAlreadyExistsException e) {
            throw e;
        } catch (UnsupportedOperationException | FileSystemException e) {
            log.warn("plan-csv hardlink unavailable, fallback move err={}", e.getClass().getSimpleName());
            Files.move(tmp, target);   // 하드링크 불가 파일시스템(SMB 등) — JVM 락 + 확인 후 이동(단일 노드 한정 보장)
            return;
        }
        // 공개는 이미 끝났다 — 임시 파일 삭제 실패를 저장 실패로 올리면 '기록 없는 파일'이 남는다(qa P2).
        // 여기서 삼키고 finally 가 한 번 더 지운다. 남아도 .tmp 라 web 이 무시한다.
        try {
            Files.deleteIfExists(tmp);
        } catch (IOException e) {
            log.warn("plan-csv tmp cleanup after publish failed err={}", e.getClass().getSimpleName());
        }
    }

    // ── 검사 ─────────────────────────────────────────────

    /** 5MB 이하면 바이트, 넘으면 null. getSize() 를 믿지 않고 스트림으로 센다. */
    static byte[] readCapped(MultipartFile f) throws IOException {
        try (InputStream in = f.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            long total = 0;
            int r;
            while ((r = in.read(buf)) > 0) {
                total += r;
                if (total > MAX_BYTES) return null;
                out.write(buf, 0, r);
            }
            return out.toByteArray();
        }
    }

    /** 통과면 null, 아니면 고정 문구. 칸 원문은 문구에 싣지 않는다. */
    static String checkContent(byte[] raw, String instId) {
        if (raw.length == 0) return "빈 파일입니다.";
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(raw)).toString();
        } catch (CharacterCodingException e) {
            return "UTF-8 파일이 아닙니다. 엑셀이면 'CSV UTF-8'로 저장해 주세요.";
        }
        if (text.indexOf('\0') >= 0) return "CSV 파일이 아닙니다.";
        if (!text.isEmpty() && text.charAt(0) == 0xFEFF) text = text.substring(1);   // BOM
        int eol = firstEol(text, 0);
        String head = eol < 0 ? text : text.substring(0, eol);
        if (head.length() > MAX_HEADER_CHARS) return "머리줄이 너무 깁니다.";
        List<String> cols = splitSimple(head);
        Set<String> seen = new HashSet<String>();
        for (String c : cols) {
            if (!HEADERS.contains(c)) return "머리줄에 모르는 열 이름이 있습니다.";
            if (!seen.add(c)) return "머리줄에 같은 열 이름이 겹칩니다.";
        }
        if (!seen.containsAll(REQUIRED)) return "머리줄에 필수 열이 빠져 있습니다.";
        int pos = eol;
        while (pos >= 0 && pos < text.length()) {
            int s = pos;
            while (s < text.length() && (text.charAt(s) == '\r' || text.charAt(s) == '\n')) s++;
            if (s >= text.length()) break;
            int e = firstEol(text, s);
            String line = e < 0 ? text.substring(s) : text.substring(s, e);
            if (!line.trim().isEmpty()) {
                if (cols.indexOf("기관ID") == 0) {
                    List<String> cells = splitSimple(line);
                    if (cells.isEmpty() || !cells.get(0).equalsIgnoreCase(instId)) {
                        return "1열 기관ID가 파일 이름의 기관ID와 다릅니다.";
                    }
                }
                return null;
            }
            pos = e;
            if (e < 0) break;
        }
        return "사업 행이 없습니다.";
    }

    private static int firstEol(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\n' || c == '\r') return i;
        }
        return -1;
    }

    /** 머리줄·기관ID 열 용도의 단순 분리(쉼표, 양끝 따옴표 제거). 본문 칸 해석이 아니다. */
    static List<String> splitSimple(String line) {
        List<String> out = new ArrayList<String>();
        for (String p : line.split(",", -1)) {
            String t = p.trim();
            if (t.length() >= 2 && t.startsWith("\"") && t.endsWith("\"")) t = t.substring(1, t.length() - 1);
            out.add(t);
        }
        return out;
    }

    // ── 파일·기록 ─────────────────────────────────────────

    private static Path realDir(String configured) {
        try {
            Path real = Paths.get(configured).toRealPath();
            if (!Files.isDirectory(real)) throw new IOException("not a directory");
            return real;
        } catch (IOException | InvalidPathException e) {
            log.error("plan-csv folder unavailable");   // 경로는 싣지 않는다
            throw new PlanCsvException("사업계획 CSV 폴더를 사용할 수 없습니다. 개발부서 설정을 확인해 주세요.");
        }
    }

    /** 대소문자만 다른 이름도 같은 이름으로 본다(web 은 기관ID 대소문자를 무시한다). 너무 많으면 닫힌 채 거부. */
    private static boolean existsIgnoreCase(Path root, String name) throws IOException {
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(root)) {
            int n = 0;
            for (Path p : ds) {
                if (++n > MAX_ENTRIES) throw new IOException("too many entries");
                if (p.getFileName().toString().equalsIgnoreCase(name)) return true;
            }
        } catch (DirectoryIteratorException e) {
            throw new IOException("list failed");
        }
        return false;
    }

    private static void appendReceipt(Path receipts, String name, String sha, int size, String inst, LocalDate day,
                                      String uploader, String remoteUser, String clientIp) throws IOException {
        Path file = receipts.resolve(RECEIPT_FILE);
        StringBuilder sb = new StringBuilder();
        if (!Files.exists(file)) {
            sb.append("#uploaded_at\tfile_name\tsha256\tsize\tinstitution_id\tfile_date\tuploader_self\tremote_user\tclient_ip\n");
        }
        sb.append(ZonedDateTime.now(SEOUL).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)).append('\t')
          .append(name).append('\t').append(sha).append('\t').append(size).append('\t')
          .append(inst).append('\t').append(day).append('\t')
          .append(uploader).append('\t').append(clean(remoteUser)).append('\t').append(clean(clientIp)).append('\n');
        Files.write(file, sb.toString().getBytes(StandardCharsets.UTF_8),
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    /** 탭·줄바꿈·제어 문자 주입을 막는다. 없으면 '-'. '-'·'@' 로 시작하면 '_' 를 붙인다(엑셀 수식 해석 방지). */
    static String clean(String s) {
        if (s == null) return "-";
        String v = s.replaceAll("[^\\p{L}\\p{N}._:@-]", "_");
        if (v.length() > 45) v = v.substring(0, 45);
        if (v.isEmpty()) return "-";
        if (v.startsWith("-") || v.startsWith("@")) v = "_" + v;
        return v;
    }

    /** 화면에 되돌려 줄 이름 — 제어 문자를 지우고 길이를 줄인다(th:text 로 이스케이프됨). */
    static String shown(String name) {
        String v = name.replaceAll("\\p{Cntrl}", "?");
        return v.length() > 80 ? v.substring(0, 80) + "…" : v;
    }

    static String sha256(byte[] data) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(data);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : h) sb.append(String.format("%02x", b & 0xff));   // web 과 같은 소문자 hex
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static PlanCsvResultItem reject(String shown, String code, String message) {
        log.info("plan-csv rejected code={}", code);
        return new PlanCsvResultItem(shown, false, null, message);
    }

    private static PlanCsvResultItem fail(String shown, String code, Exception e, String message) {
        log.error("plan-csv failed code={} err={}", code, e.getClass().getSimpleName());   // 메시지·경로 없음
        return new PlanCsvResultItem(shown, false, null, message);
    }
}
