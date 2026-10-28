package com.kbstar.kgi.ggreport.web.mapper;

import com.kbstar.kgi.ggreport.web.domain.UserMenuPerm;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** {@code USER_MENU_PERMS}. upsert 는 {@code RoleMenuMapper} 와 같은 이유로 update → 0행이면 insert 다. */
@Mapper
public interface UserMenuPermMapper {

    List<UserMenuPerm> selectByEmpNo(@Param("empNo") String empNo);

    List<UserMenuPerm> selectAll();

    int update(UserMenuPerm perm);

    int insert(UserMenuPerm perm);
}
