export interface UserInfo {
    username: string;
    nickname?: string;
    is_active: boolean;
    is_admin: boolean;
    is_super_admin: boolean;
    created_at?: string;
    last_login_at?: string | null;
    pushplus_friend_token?: string | null;
}

/**
 * 角色类型
 */
export type UserRole = 'user' | 'admin' | 'super_admin';

/**
 * 获取用户角色 - 优先级: super_admin > admin > user
 */
export function getUserRole(user: UserInfo | null): UserRole {
    if (!user) return 'user';
    // 超级管理员优先级最高
    if (user.is_super_admin) return 'super_admin';
    if (user.is_admin) return 'admin';
    return 'user';
}

/**
 * 检查是否有管理后台访问权限 (管理员或超级管理员)
 */
export function hasAdminAccess(user: UserInfo | null): boolean {
    if (!user) return false;
    return user.is_admin || user.is_super_admin;
}

/**
 * 检查是否有修改权限 (仅超级管理员有权修改，管理员为只读)
 */
export function hasWritePermission(user: UserInfo | null): boolean {
    if (!user) return false;
    // 只有超级管理员才有写权限
    return user.is_super_admin;
}
