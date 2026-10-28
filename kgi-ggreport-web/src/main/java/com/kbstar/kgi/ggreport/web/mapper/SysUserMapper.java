package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** {@code USERS}. 삭제는 없다 — 퇴직({@code RETIRED}) 처리로 이력을 남긴다. */
@Mapper
public interface SysUserMapper {

    List<SysUser> selectAll();

    SysUser selectByEmpNo(@Param("empNo") String empNo);

    int insert(SysUser user);

    int updateProfile(@Param("empNo") String empNo, @Param("name") String name, @Param("role") String role,
                      @Param("positionTitle") String positionTitle, @Param("approvalGrade") String approvalGrade,
                      @Param("now") String now);

    /** 상태 변경. {@code resetFailed} 면 실패 횟수도 0 으로(잠금 해제). */
    int updateStatus(@Param("empNo") String empNo, @Param("status") String status,
                     @Param("resetFailed") boolean resetFailed, @Param("now") String now);

    /** 상위 결재자 갱신. {@code manual} 은 지정(1)/자동(0). */
    int updateApprover(@Param("empNo") String empNo, @Param("approverEmpNo") String approverEmpNo,
                       @Param("manual") int manual, @Param("now") String now);

    int recordLoginOk(@Param("empNo") String empNo, @Param("now") String now);
}
