package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.RoleMenu;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * {@code ROLE_MENUS}(역할별 메뉴 노출). 출처는 {@code server/menu_repository.py}.
 *
 * <p>⚠️ <b>upsert 만 방언이 갈린다</b> — SQLite {@code ON CONFLICT DO UPDATE} ↔
 * Oracle {@code MERGE} ↔ MySQL {@code ON DUPLICATE KEY UPDATE}. 셋 다 안 쓰고
 * <b>"{@link #updateEnabled} 를 먼저 돌리고 0행이면 {@link #insert}"</b> 로 통일해
 * Mapper XML 을 한 벌로 남긴다. 조합은 호출부(서비스)가 한다.
 *
 * <p>동시성: 두 요청이 같은 (역할, 메뉴)를 동시에 처음 저장하면 뒤쪽 INSERT 가 PK 로
 * 튕긴다. 원본(단일 프로세스 SQLite)에는 없던 상황이라 <b>서비스에서 재시도 1회</b>로
 * 흡수한다 — 여기서 잡을 문제가 아니다.
 */
@Mapper
public interface RoleMenuMapper {

    /**
     * {@code load_overrides} — <b>저장된 것만</b> 돌려준다. 행이 없다는 것은 '꺼짐'이
     * 아니라 '아직 정하지 않음'이고, 그때는 앱 기본값이 적용된다.
     */
    List<RoleMenu> selectAll();

    /** upsert 의 앞쪽. 갱신 행 수가 0 이면 호출부가 {@link #insert} 로 넘어간다. */
    int updateEnabled(@Param("role") String role,
                      @Param("menu") String menu,
                      @Param("enabled") boolean enabled);

    /** upsert 의 뒤쪽. */
    int insert(@Param("role") String role,
               @Param("menu") String menu,
               @Param("enabled") boolean enabled);
}
