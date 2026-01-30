import hashlib
import time
from typing import Any, Dict, List, Optional
from uuid import uuid4

from loguru import logger

from app.services.core.cache_service import cache_service, service_cached
from app.services.external.ths.auth.login_service import ths_login_service
from app.services.external.ths.core.decorators import ths_auth_required
from .ths_user_favorite import THSUserFavorite


class ThsFavoriteService:
    def _get_cookies(self, ths_account: Optional[str]) -> Dict[str, Any]:
        """获取指定账号的同花顺 Cookie。
        
        Args:
            ths_account: 同花顺账号
            
        Returns:
            Cookie 字典，不存在时返回空字典
        """
        if not ths_account:
            return {}
        
        cookies = ths_login_service.get_cookies(ths_account)
        return cookies

    @service_cached(
        "ths:favorites:groups",
        key_fn=lambda self, ths_account: self._cookie_fingerprint(self._get_cookies(ths_account)) or "",
        ttl_seconds=60,
    )
    @ths_auth_required
    def list_groups(self, ths_account: str) -> List[Dict[str, Any]]:
        """获取同花顺自选分组列表。

        使用 Cookie 指纹作为缓存键后缀，通过 service_cached 统一管理 TTL 缓存。
        当 Cookie 变化（重新登录）时，指纹变化自动命中新的缓存桶。
        """
        cookies = self._get_cookies(ths_account)

        with THSUserFavorite(cookies=cookies, ths_account=ths_account) as client:
            groups = client.get_all_groups()
            result: List[Dict[str, Any]] = []

            for name, group in groups.items():
                items: List[Dict[str, Any]] = []
                for fav in group.items:
                    code = getattr(fav, "code", None)
                    if not code:
                        continue
                    ts_code = code
                    items.append(
                        {
                            "code": code,
                            "ts_code": ts_code,
                        }
                    )

                result.append(
                    {
                        "group_name": name,
                        "group_id": getattr(group, "group_id", ""),
                        "items": items,
                    }
                )

            logger.debug(f"获取到 {len(result)} 个同花顺自选分组")
            return result

    @ths_auth_required
    def add_to_group(self, group_name_or_id: str, ts_code: str, ths_account: str) -> None:
        cookies = self._get_cookies(ths_account)
        with THSUserFavorite(cookies=cookies, ths_account=ths_account) as client:
            logger.debug(f"向同花顺分组 {group_name_or_id} 添加 {ts_code}")
            client.add_item_to_group(group_name_or_id, ts_code)
        self._invalidate_groups_cache(ths_account)

    @ths_auth_required
    def remove_from_group(self, group_name_or_id: str, ts_code: str, ths_account: str) -> None:
        cookies = self._get_cookies(ths_account)
        with THSUserFavorite(cookies=cookies, ths_account=ths_account) as client:
            logger.debug(f"从同花顺分组 {group_name_or_id} 删除 {ts_code}")
            client.delete_item_from_group(group_name_or_id, ts_code)
        self._invalidate_groups_cache(ths_account)

    @ths_auth_required
    def add_group(self, group_name_or_id: str, ths_account: str) -> None:
        """创建同花顺自选分组。"""
        cookies = self._get_cookies(ths_account)
        with THSUserFavorite(cookies=cookies, ths_account=ths_account) as client:
            logger.debug(f"创建同花顺分组 {group_name_or_id}")
            client.add_group(group_name_or_id)
        self._invalidate_groups_cache(ths_account)

    @ths_auth_required
    def delete_group(self, group_name_or_id: str, ths_account: str) -> None:
        """删除同花顺自选分组。"""
        cookies = self._get_cookies(ths_account)
        with THSUserFavorite(cookies=cookies, ths_account=ths_account) as client:
            logger.debug(f"删除同花顺分组 {group_name_or_id}")
            client.delete_group(group_name_or_id)
        self._invalidate_groups_cache(ths_account)
    def _normalize_cookie_dict(self, cookies: Dict[str, Any]) -> str:
        """将 Cookie 字典标准化为稳定字符串：按 key 排序、去除空值与空白。"""
        if not isinstance(cookies, dict) or not cookies:
            return ""
        parts: List[str] = []
        for k in sorted(cookies.keys(), key=lambda x: str(x).lower()):
            v = cookies.get(k)
            if v is None:
                continue
            ks = str(k).strip()
            vs = str(v).strip()
            if not ks or not vs:
                continue
            parts.append(f"{ks}={vs}")
        return ";".join(parts)

    def _cookie_fingerprint(self, cookies: Dict[str, Any]) -> Optional[str]:
        norm = self._normalize_cookie_dict(cookies)
        if not norm:
            return None
        return hashlib.sha256(norm.encode("utf-8")).hexdigest()

    def _invalidate_groups_cache(self, ths_account: Optional[str]) -> None:
        """根据 Cookie 指纹精确失效自选分组缓存。"""
        if not ths_account:
            return
        try:
            cookies = self._get_cookies(ths_account)
            fp = self._cookie_fingerprint(cookies)
            if not fp:
                return
            cache_key = f"ths:favorites:groups:{fp}"
            cache_service.delete(cache_key)
        except Exception as e:
            logger.warning(f"清理同花顺自选分组缓存失败 ths_account={ths_account}: {e}")

    @ths_auth_required
    def _reset_group_for_account(self, group_name_or_id: str, ts_codes: List[str], ths_account: str, rebuild: bool = False, reverse_add: bool = False) -> bool:
        """为指定同花顺账号重置分组内容（带分布式锁）。
        
        注意：此方法带有 @ths_auth_required 装饰器，登录态失效时会：
        1. 自动触发补登录
        2. 抛出 ThsSessionExpiredException
        调用方需要捕获此异常。
        
        锁机制：使用 Redis 分布式锁，避免同一 Cookie 指纹的并发同步产生版本冲突。
        """
        cookies = self._get_cookies(ths_account)
        if not cookies:
            logger.warning(f"同花顺账号 {ths_account} 未配置有效的 Cookie，跳过分组 {group_name_or_id} 同步")
            return False

        # 获取 Cookie 指纹用于分布式锁
        fp = self._cookie_fingerprint(cookies)
        if not fp:
            logger.warning(f"账号 {ths_account} 无有效 Cookie 指纹，跳过分组 {group_name_or_id} 同步")
            return False
        
        # 分布式锁：避免同一 Cookie 指纹的并发同步
        redis_client = cache_service.redis_client
        lock_key = f"ths:favorites:lock:{fp}"
        lock_token = str(uuid4())
        acquired = True
        
        if redis_client is not None:
            max_wait_seconds = 60
            wait_interval = 0.5
            waited = 0
            
            while waited < max_wait_seconds:
                try:
                    acquired = bool(redis_client.set(lock_key, lock_token, nx=True, ex=120))
                    if acquired:
                        break
                    time.sleep(wait_interval)
                    waited += wait_interval
                except Exception as e:
                    logger.warning(f"获取 Cookie 指纹 {fp[:8]}... 的同步锁失败: {e}")
                    acquired = True  # 无锁模式继续
                    lock_token = None
                    break
            
            if not acquired:
                logger.warning(f"Cookie 指纹 {fp[:8]}... 等待同步锁超时，跳过分组 {group_name_or_id}")
                return False
        
        try:
            with THSUserFavorite(cookies=cookies, ths_account=ths_account) as client:
                logger.debug(f"为账号 {ths_account} 重置同花顺分组 {group_name_or_id} 到 {len(ts_codes)} 个代码")
                # 如果分组不存在则先创建
                target_group_id = client._get_group_id_by_identifier(group_name_or_id)
                if not target_group_id:
                    try:
                        client.add_group(group_name_or_id)
                    except Exception as ce:
                        logger.warning(f"自动创建同花顺分组 {group_name_or_id} 失败: {ce}")
                client.reset_group_items(group_name_or_id, ts_codes, rebuild=rebuild, reverse_add=reverse_add)
                self._invalidate_groups_cache(ths_account)
                return True
        finally:
            # 释放锁
            if redis_client is not None and lock_token:
                try:
                    current = redis_client.get(lock_key)
                    if current == lock_token:
                        redis_client.delete(lock_key)
                except Exception as e:
                    logger.warning(f"释放 Cookie 指纹 {fp[:8]}... 的同步锁失败: {e}")

    def reset_group_to_ts_codes(self, group_name_or_id: str, ts_codes: List[str], ths_account: str, rebuild: bool = False, reverse_add: bool = False) -> bool:
        """将指定同花顺账号的目标分组重置为给定 ts_codes（单账号操作）。
        
        Args:
            group_name_or_id: 分组名称或ID
            ts_codes: 股票代码列表
            ths_account: 同花顺账号
            rebuild: 是否重建分组
            reverse_add: 是否逆序添加
        
        Returns:
            bool: 是否同步成功
        """
        return self._reset_group_for_account(group_name_or_id, ts_codes, ths_account, rebuild, reverse_add)

    def reset_group_to_ts_codes_for_all_accounts(self, group_name_or_id: str, ts_codes: List[str], rebuild: bool = False, reverse_add: bool = False) -> bool:
        """将所有已登录账号的目标分组重置为给定 ts_codes（多账号批量操作）。
        
        复用 reset_group_to_ts_codes 方法，为每个账号分别执行。
        
        Args:
            group_name_or_id: 分组名称或ID
            ts_codes: 股票代码列表
            rebuild: 是否重建分组
            reverse_add: 是否逆序添加
        
        Returns:
            bool: 是否至少有一个账号同步成功
        """
        from app.dao.ths_account_dao import ths_account_dao
        from app.utils.concurrent_utils import process_concurrently
        
        target_accounts = ths_account_dao.get_most_recent_accounts_per_user()
        if not target_accounts:
            logger.warning(f"未配置任何同花顺账号，跳过分组 {group_name_or_id} 同步")
            return False
        
        logger.info(f"为 {len(target_accounts)} 个用户并发同步分组 {group_name_or_id}")
        
        results = process_concurrently(
            target_accounts,
            lambda acc: self._reset_group_for_account(group_name_or_id, ts_codes, acc, rebuild=rebuild, reverse_add=reverse_add),
            max_workers=min(5, len(target_accounts)),
            error_handler=lambda acc, e: False
        )
        return any(results)

    def reset_group_with_date_suffix(
        self, 
        base_group_name: str, 
        ts_codes: List[str], 
        date_suffix: str,
        ths_account: str, 
        rebuild: bool = False, 
        reverse_add: bool = False
    ) -> bool:
        """将指定账号的目标分组重置为给定 ts_codes，同时删除同前缀的旧分组（单账号操作）。
        
        Args:
            base_group_name: 分组基础名称（不含日期后缀）
            ts_codes: 股票代码列表
            date_suffix: 日期后缀，格式如"0118"（MMDD）
            ths_account: 同花顺账号（必需）
            rebuild: 是否重建分组
            reverse_add: 是否逆序添加
            
        Returns:
            bool: 是否推送成功
        """
        import re
        
        # 目标分组名 = 基础名 + 日期后缀
        target_group_name = f"{base_group_name}{date_suffix}"
        
        # 匹配"基础名+4位数字"格式的旧分组
        pattern = re.compile(rf"^{re.escape(base_group_name)}(\d{{4}})$")
        
        # 获取所有分组，找出需要删除的旧分组
        try:
            # 先清除缓存，确保获取最新分组列表
            self._invalidate_groups_cache(ths_account)
            groups = self.list_groups(ths_account)
            for group in groups:
                group_name = group.get("group_name", "")
                match = pattern.match(group_name)
                if match and group_name != target_group_name:
                    # 删除旧分组
                    try:
                        self.delete_group(group_name, ths_account)
                        logger.info(f"删除旧分组: {group_name}")
                    except Exception as e:
                        logger.warning(f"删除旧分组 {group_name} 失败: {e}")
        except Exception as e:
            logger.warning(f"获取分组列表失败: {e}")
        
        # 创建/更新目标分组
        try:
            success = self._reset_group_for_account(target_group_name, ts_codes, ths_account, rebuild=rebuild, reverse_add=reverse_add)
            if success:
                logger.info(f"推送到分组: {target_group_name}")
            return success
        except Exception as e:
            logger.warning(f"推送到分组 {target_group_name} 失败: {e}")
            return False

    def reset_group_with_date_suffix_for_all_accounts(
        self, 
        base_group_name: str, 
        ts_codes: List[str], 
        date_suffix: str,
        rebuild: bool = False, 
        reverse_add: bool = False
    ) -> bool:
        """将所有已登录账号的目标分组重置为给定 ts_codes，同时删除同前缀的旧分组（多账号批量操作）。
        
        复用 reset_group_with_date_suffix 方法，为每个账号分别执行。
        
        Args:
            base_group_name: 分组基础名称（不含日期后缀）
            ts_codes: 股票代码列表
            date_suffix: 日期后缀，格式如"0118"（MMDD）
            rebuild: 是否重建分组
            reverse_add: 是否逆序添加
            
        Returns:
            bool: 是否至少有一个账号推送成功
        """
        from app.dao.ths_account_dao import ths_account_dao
        from app.utils.concurrent_utils import process_concurrently
        
        target_group_name = f"{base_group_name}{date_suffix}"
        target_accounts = ths_account_dao.get_most_recent_accounts_per_user()
        if not target_accounts:
            logger.warning(f"未配置任何同花顺账号，跳过分组 {target_group_name} 同步")
            return False
        
        logger.info(f"为 {len(target_accounts)} 个用户并发同步分组 {target_group_name}")
        
        # 使用统一的并发工具，复用单账号方法
        results = process_concurrently(
            target_accounts,
            lambda acc: self.reset_group_with_date_suffix(base_group_name, ts_codes, date_suffix, acc, rebuild, reverse_add),
            max_workers=min(5, len(target_accounts))
        )
        return any(results)


ths_favorite_service = ThsFavoriteService()
