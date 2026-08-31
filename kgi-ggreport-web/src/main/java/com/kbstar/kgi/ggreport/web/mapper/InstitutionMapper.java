package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.Institution;
import com.kbstar.kgi.ggreport.web.domain.InstitutionImportRow;
import com.kbstar.kgi.ggreport.web.domain.InstitutionUpdateIn;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code INSTITUTIONS}. 출처는 {@code server/repository.py} 전체 +
 * 단일 컬럼을 고치는 서비스 모듈 4곳(아래 각 메서드 주석).
 *
 * <p>SQL 은 {@code src/main/resources/mapper/InstitutionMapper.xml} 에 있다 —
 * 애노테이션 SQL 을 쓰지 않는 이유는 이관 대조가 "원본 SQL 과 나란히 읽기"라서다.
 */
@Mapper
public interface InstitutionMapper {

    /** {@code list_institutions} — 지도·목록이 쓴다. {@code ORDER BY INSTITUTION_ID}. */
    List<Institution> selectAll();

    /** {@code get_institution}. 없으면 null. */
    Institution selectById(@Param("institutionId") String institutionId);

    /** {@code find_id_by_name} — 반입·기관추가의 중복 판정 키다. */
    String selectIdByName(@Param("nameKo") String nameKo);

    /**
     * {@code _insert_institution} — 슬러그는 호출부가 발급한다({@code new-<hex8>}).
     * {@code STAGE} 는 1 로 고정한다(원본과 동일).
     */
    int insert(@Param("institutionId") String institutionId,
               @Param("row") InstitutionImportRow row);

    /**
     * {@code upsert_institution} 의 갱신 쪽 — <b>보낸 값이 있을 때만</b> 덮는다
     * ({@code COALESCE(?, 기존값)}). CSV 반입은 같은 표를 다시 올리는 것이 정상이라
     * 빈 칸이 기존 값을 지우면 안 된다.
     *
     * <p>⚠️ 부분 갱신 API({@link #updateFields})와 규칙이 <b>일부러 다르다</b> —
     * 그쪽은 {@code null} 을 "지움"으로 본다.
     */
    int updateFromImport(@Param("institutionId") String institutionId,
                         @Param("row") InstitutionImportRow row);

    /**
     * {@code update_institution} — 본문에 <b>실제로 담겨 온 필드만</b> 갱신한다.
     *
     * <p>⚠️ 호출부는 {@link InstitutionUpdateIn#nothingSet()} 이면 <b>이 메서드를
     * 부르지 않는다.</b> 갱신할 컬럼이 하나도 없으면 {@code <set>} 이 비어
     * SQL 문법 오류가 난다(원본도 그 경우 UPDATE 를 돌리지 않고 현재 값을 돌려준다).
     */
    int updateFields(@Param("institutionId") String institutionId,
                     @Param("upd") InstitutionUpdateIn upd);

    /**
     * {@code seed_giganlist_districts} 의 신규 행 — 자치구 시드 전용이라
     * {@link #insert} 와 컬럼 구성이 다르다({@code GIGANLIST_DIR} 이 있고
     * {@code TERM}/{@code LAST_BID}/{@code CONTRACT_END} 가 없다).
     */
    int insertSeedDistrict(@Param("institutionId") String institutionId,
                           @Param("nameKo") String nameKo,
                           @Param("giganlistDir") String giganlistDir,
                           @Param("regionCode") String regionCode,
                           @Param("type") String type);

    /**
     * {@code seed_giganlist_districts} 의 백필 — <b>비어 있는</b> 지역·구분만 채운다.
     *
     * <p>재시드는 이미 있는 행을 건너뛰기 때문에, 이 백필이 없으면 먼저 만들어진 DB 는
     * 영영 지도에 안 뜬다({@code region_code} 가 없으면 걸러지고 {@code type} 이 없으면
     * 랭킹 카드가 {@code undefined} 로 찍힌다). 사람이 넣은 값은 덮지 않는다.
     */
    int backfillRegionAndType(@Param("institutionId") String institutionId,
                              @Param("regionCode") String regionCode,
                              @Param("type") String type);

    /** 출처: {@code orchestrator_recorder.py} · {@code routers/bidcases.py} · {@code demo_seed.py}. */
    int updateStage(@Param("institutionId") String institutionId, @Param("stage") int stage);

    /** 출처: {@code routers/institutions.py} (코퍼스 경로 연결). */
    int updateGiganlistDir(@Param("institutionId") String institutionId,
                           @Param("giganlistDir") String giganlistDir);

    /** 출처: {@code inbox_import.py} (반입된 공고문 PDF 연결). */
    int updateRfpPath(@Param("institutionId") String institutionId,
                      @Param("rfpPath") String rfpPath);

    /** 출처: {@code assembler.py} (산출물 PPTX 연결). */
    int updatePptxPath(@Param("institutionId") String institutionId,
                       @Param("pptxPath") String pptxPath);
}
