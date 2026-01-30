"""
同花顺用户自选股管理类
重新实现的简化版本，使用重组后的核心组件
"""

from typing import Dict, Any, List, Optional, TypeVar, Tuple

from loguru import logger

from .favorite_models import THSFavorite, THSFavoriteGroup
from ..core.constants import market_abbr, parse_ts_code, ThsAuthError
from ..core.ths_http_client import THSHttpApiClient

T_UserFavorite = TypeVar('T_UserFavorite', bound='THSUserFavorite')


class THSUserFavorite:
    """
    管理同花顺用户自选股的服务类。
    提供获取分组、添加/删除自选项目等功能，并支持缓存。
    """
    _API_BASE_URL: str = "https://ugc.10jqka.com.cn"
    _QUERY_ENDPOINT: str = "/optdata/selfgroup/open/api/group/v1/query"
    _ADD_ITEM_ENDPOINT: str = "/optdata/selfgroup/open/api/content/v1/add"
    _DELETE_ITEM_ENDPOINT: str = "/optdata/selfgroup/open/api/content/v1/delete"
    _ADD_GROUP_ENDPOINT: str = "/optdata/selfgroup/open/api/group/v1/add"
    _DELETED_GROUP_ENDPOINT: str = "/optdata/selfgroup/open/api/group/v1/delete"

    def __init__(self,
                 cookies: Optional[Dict[str, str]] = None,
                 api_client: Optional[THSHttpApiClient] = None,
                 ths_account: Optional[str] = None):
        if api_client:
            self.api_client: THSHttpApiClient = api_client
            self._is_external_api_client: bool = True
        else:
            self.api_client = THSHttpApiClient(
                base_url=self._API_BASE_URL,
                cookies=cookies,
                ths_account=ths_account
            )
            self._is_external_api_client = False

        self._current_version: Optional[str] = None
        self._groups_cache: Dict[str, THSFavoriteGroup] = {}
        self._max_version_retry: int = 3  # version outdated 最大重试次数
        self._load_cache()

    def _handle_version_outdated(self, response: Dict[str, Any]) -> bool:
        """处理 version outdated 错误，刷新版本号
        
        Args:
            response: API响应
            
        Returns:
            True 如果是 version outdated 错误并已刷新版本，False 其他情况
        """
        if response and response.get("status_code") == 1 and "outdated" in response.get("status_msg", "").lower():
            # version outdated，刷新缓存获取最新版本号
            data = response.get("data", {})
            if data and "version" in data:
                self._current_version = data["version"]
                logger.debug(f"version outdated，已更新版本号: {self._current_version}")
            else:
                # 重新获取分组数据以刷新版本号
                self.refresh_cache()
                logger.debug(f"version outdated，已刷新缓存，新版本号: {self._current_version}")
            return True
        return False

    def get_all_groups(self) -> Dict[str, THSFavoriteGroup]:
        """获取所有自选股分组"""
        try:
            raw_data = self._get_raw_group_data()
            if not raw_data:
                return {}
            
            groups = {}
            group_list = raw_data.get("group_list", [])
            
            for group_data in group_list:
                group_name = group_data.get("name", "")
                group_id = group_data.get("id", "")
                
                items = []
                # 🚀 解析content字段（参考原始ths-favorite项目的parse_group_list方法）
                # 格式：'代码1|代码2|...,市场1|市场2|...'
                # 示例：'000016|,33|' → 按第一个逗号分隔 → ['000016|', '33|']
                content = group_data.get("content", "")
                if content and content != ",":
                    # 按第一个逗号分隔：前面是代码，后面是市场类型
                    parts = content.split(",", 1)
                    codes_segment = parts[0]  # '000016|'
                    markets_segment = parts[1] if len(parts) > 1 else ""  # '33|'
                    
                    # 按|分隔提取列表
                    codes_list = [c for c in codes_segment.split("|") if c]
                    markets_list = [m for m in markets_segment.split("|") if m]
                    
                    # 按索引一一对应
                    for i, code in enumerate(codes_list):
                        api_market_type = markets_list[i] if i < len(markets_list) else None
                        # 🚀 修复：将API市场类型转换为市场缩写（如 '33' → 'SZ'）
                        market_short = market_abbr(api_market_type) if api_market_type else None
                        items.append(THSFavorite(code=code, market=market_short))
                
                groups[group_name] = THSFavoriteGroup(
                    name=group_name,
                    group_id=group_id,
                    items=items
                )
            
            self._groups_cache = groups
            return groups
            
        except Exception as e:
            # 重新抛出 ThsAuthError，让上层处理
            if isinstance(e, ThsAuthError):
                logger.error(f"获取自选股分组失败: {e}")
                raise
            logger.error(f"获取自选股分组失败: {e}")
            return {}

    def add_items_to_group_batch(self, group_name_or_id: str, ts_codes: List[str]) -> int:
        """批量向分组添加股票（单次API调用）
        
        Args:
            group_name_or_id: 分组名称或ID
            ts_codes: 股票代码列表，如 ['000016.SZ', '002345.SZ']
            
        Returns:
            成功添加的数量
        """
        if not ts_codes:
            return 0
            
        try:
            group_id = self._get_group_id_by_identifier(group_name_or_id)
            if not group_id:
                logger.error(f"批量添加失败: 未能找到分组 '{group_name_or_id}'")
                return 0
            
            if self._current_version is None:
                self.get_all_groups()
                if self._current_version is None:
                    logger.error("无法获取版本号")
                    return 0
            
            # 构造批量格式: 代码1|代码2|...,市场1|市场2|...
            codes_list = []
            markets_list = []
            for ts_code in ts_codes:
                item_code, api_market_type = parse_ts_code(ts_code)
                if item_code:
                    codes_list.append(item_code)
                    markets_list.append(api_market_type or "")
            
            if not codes_list:
                return 0
            
            # 格式: "代码1|代码2|,市场1|市场2|"
            content = f"{'|'.join(codes_list)}|,{'|'.join(markets_list)}|"
            
            params = {
                "version": str(self._current_version),
                "from": "sjcg_gphone",
                "id": group_id,
                "content": content,
                "num": str(len(codes_list))
            }
            
            logger.debug(f"批量添加 {len(codes_list)} 个代码到分组 {group_name_or_id}")
            response = self.api_client.post_form_urlencoded(self._ADD_ITEM_ENDPOINT, data=params)
            
            status_code = response.get("status_code") if response else None
            
            if status_code == 0:
                logger.debug(f"批量添加成功: {len(codes_list)} 个代码")
                data = response.get("data")
                if data and "version" in data:
                    self._current_version = data["version"]
                self._update_cache_after_modification()
                return len(codes_list)
            elif status_code == -200:
                # 部分或全部已存在
                logger.debug(f"分组中部分代码已存在")
                data = response.get("data")
                if data and "version" in data:
                    self._current_version = data["version"]
                return len(codes_list)
            else:
                logger.warning(f"批量添加失败: {response}")
                return 0
                
        except Exception as e:
            if isinstance(e, ThsAuthError):
                raise
            logger.error(f"批量添加失败: {e}")
            return 0

    def add_item_to_group(self, group_name_or_id: str, ts_code: str) -> bool:
        """向分组添加股票（单个）
        
        Args:
            group_name_or_id: 分组名称或ID
            ts_code: 股票代码，如 '000016.SZ' 或 '000016'
        """
        try:
            # 🚀 修复：获取分组ID
            group_id = self._get_group_id_by_identifier(group_name_or_id)
            if not group_id:
                logger.error(f"添加项目失败: 未能找到分组 '{group_name_or_id}'")
                return False
            
            # 🚀 修复：解析ts_code为(代码, 市场类型)
            item_code, api_market_type = parse_ts_code(ts_code)
            logger.debug(f"[add] ts_code={ts_code} -> item_code={item_code}, market_type={api_market_type}")
            if not item_code:
                logger.error(f"添加项目失败: 无效的代码 '{ts_code}'")
                return False
            
            # 🚀 修复：确保版本号存在
            if self._current_version is None:
                logger.info("版本号未知，先获取分组数据...")
                self.get_all_groups()
                if self._current_version is None:
                    logger.error("无法获取版本号")
                    return False
            
            # 🚀 修复：使用正确的API参数格式
            params = {
                "version": str(self._current_version),
                "from": "sjcg_gphone",
                "id": group_id,
                "content": f"{item_code},{api_market_type}" if api_market_type else item_code,
                "num": "1"
            }
            
            response = self.api_client.post_form_urlencoded(self._ADD_ITEM_ENDPOINT, data=params)
            
            status_code = response.get("status_code") if response else None
            
            if status_code == 0:
                logger.debug(f"成功向分组 {group_name_or_id} 添加 {ts_code}")
                # 更新版本号
                data = response.get("data")
                if data and "version" in data:
                    self._current_version = data["version"]
                # 修改操作成功后更新缓存
                self._update_cache_after_modification()
                return True
            elif status_code == -200:
                # 内容已存在，视为成功
                logger.debug(f"分组 {group_name_or_id} 中已存在 {ts_code}，跳过")
                data = response.get("data")
                if data and "version" in data:
                    self._current_version = data["version"]
                return True
            elif status_code == -10003:
                # 无效的代码格式（概念/行业代码可能不被支持），静默跳过
                logger.debug(f"代码 {ts_code} 格式无效，跳过添加")
                return True
            else:
                logger.warning(f"添加失败: {response}")
                return False
                
        except Exception as e:
            # 重新抛出 ThsAuthError，让上层处理
            if isinstance(e, ThsAuthError):
                raise
            logger.error(f"向分组添加股票失败: {e}")
            return False

    def delete_item_from_group(self, group_name_or_id: str, ts_code: str) -> bool:
        """从分组删除股票
        
        Args:
            group_name_or_id: 分组名称或ID
            ts_code: 股票代码，如 '000016.SZ' 或 '000016'
        """
        try:
            # 🚀 修复：获取分组ID
            group_id = self._get_group_id_by_identifier(group_name_or_id)
            if not group_id:
                logger.error(f"删除项目失败: 未能找到分组 '{group_name_or_id}'")
                return False
            
            # 🚀 修复：解析ts_code为(代码, 市场类型)
            item_code, api_market_type = parse_ts_code(ts_code)
            logger.debug(f"[delete] ts_code={ts_code} -> item_code={item_code}, market_type={api_market_type}")
            if not item_code:
                logger.error(f"删除项目失败: 无效的代码 '{ts_code}'")
                return False
            
            # 🚀 修复：确保版本号存在
            if self._current_version is None:
                logger.info("版本号未知，先获取分组数据...")
                self.get_all_groups()
                if self._current_version is None:
                    logger.error("无法获取版本号")
                    return False
            
            # 🚀 修复：使用正确的API参数格式
            params = {
                "version": str(self._current_version),
                "from": "sjcg_gphone",
                "id": group_id,
                "content": f"{item_code},{api_market_type}" if api_market_type else item_code,
                "num": "1"
            }
            
            response = self.api_client.post_form_urlencoded(self._DELETE_ITEM_ENDPOINT, data=params)
            
            status_code = response.get("status_code") if response else None
            
            if status_code == 0:
                logger.debug(f"成功从分组 {group_name_or_id} 删除 {ts_code}")
                # 更新版本号
                data = response.get("data")
                if data and "version" in data:
                    self._current_version = data["version"]
                # 修改操作成功后更新缓存
                self._update_cache_after_modification()
                return True
            elif status_code == -300:
                # 内容不存在，视为成功（已删除或本来就不存在）
                logger.debug(f"分组 {group_name_or_id} 中不存在 {ts_code}，跳过删除")
                data = response.get("data")
                if data and "version" in data:
                    self._current_version = data["version"]
                return True
            elif status_code == -10003:
                # 无效的代码格式（概念/行业代码可能不被支持），静默跳过
                logger.debug(f"代码 {ts_code} 格式无效，跳过删除")
                return True
            else:
                logger.warning(f"删除失败: {response}")
                return False
                
        except Exception as e:
            # 重新抛出 ThsAuthError，让上层处理
            if isinstance(e, ThsAuthError):
                raise
            logger.error(f"从分组删除股票失败: {e}")
            return False

    def add_group(self, group_name: str) -> bool:
        """创建新分组（支持 version outdated 自动重试）"""
        for retry in range(self._max_version_retry):
            try:
                # 确保版本号存在
                if self._current_version is None:
                    logger.info("版本号未知，先获取分组数据...")
                    self.get_all_groups()
                    if self._current_version is None:
                        logger.error("无法获取版本号")
                        return False
                
                params = {
                    "version": str(self._current_version),
                    "from": "sjcg_gphone",
                    "name": group_name,
                    "type": "0"  # 0表示普通自选分组
                }
                
                response = self.api_client.post_form_urlencoded(self._ADD_GROUP_ENDPOINT, data=params)
                
                if response and response.get("status_code") == 0:
                    logger.debug(f"成功创建分组 {group_name}")
                    data = response.get("data")
                    if data and "version" in data:
                        self._current_version = data["version"]
                    self._update_cache_after_modification()
                    return True
                elif self._handle_version_outdated(response):
                    # version outdated，重试
                    logger.info(f"创建分组 {group_name} version outdated，重试 {retry + 1}/{self._max_version_retry}")
                    continue
                else:
                    logger.warning(f"创建分组失败: {response}")
                    return False
                    
            except Exception as e:
                if isinstance(e, ThsAuthError):
                    raise
                logger.error(f"创建分组失败: {e}")
                return False
        
        logger.warning(f"创建分组 {group_name} 重试次数已用完")
        return False

    def delete_group(self, group_name_or_id: str) -> bool:
        """删除分组（支持 version outdated 自动重试）
        
        Args:
            group_name_or_id: 分组名称或ID
        """
        group_id = self._get_group_id_by_identifier(group_name_or_id)
        if not group_id:
            logger.error(f"删除分组失败: 未找到分组 '{group_name_or_id}'")
            return False
        
        for retry in range(self._max_version_retry):
            try:
                # 确保版本号存在
                if self._current_version is None:
                    logger.info("版本号未知，先获取分组数据...")
                    self.get_all_groups()
                    if self._current_version is None:
                        logger.error("无法获取版本号")
                        return False
                
                params = {
                    "version": str(self._current_version),
                    "from": "sjcg_gphone",
                    "ids": group_id
                }
                
                response = self.api_client.post_form_urlencoded(self._DELETED_GROUP_ENDPOINT, data=params)
                
                if response and response.get("status_code") == 0:
                    logger.debug(f"成功删除分组 {group_name_or_id} (id={group_id})")
                    data = response.get("data")
                    if data and "version" in data:
                        self._current_version = data["version"]
                    self._update_cache_after_modification()
                    return True
                elif self._handle_version_outdated(response):
                    # version outdated，重试
                    logger.info(f"删除分组 {group_name_or_id} version outdated，重试 {retry + 1}/{self._max_version_retry}")
                    continue
                else:
                    logger.warning(f"删除分组失败: {response}")
                    return False
                    
            except Exception as e:
                if isinstance(e, ThsAuthError):
                    raise
                logger.error(f"删除分组失败: {e}")
                return False
        
        logger.warning(f"删除分组 {group_name_or_id} 重试次数已用完")
        return False

    def reset_group_items(self, group_name_or_id: str, ts_codes: List[str], rebuild: bool = False, reverse_add: bool = False) -> bool:
        """重置分组内容
        
        Args:
            group_name_or_id: 分组名称或ID
            ts_codes: 要设置的代码列表
            rebuild: 是否重建分组（清空现有内容）
            reverse_add: 是否反向添加（从后往前添加）
            
        Returns:
            bool: 操作是否成功
        """
        try:
            # 验证输入参数
            if not self._validate_group_identifier(group_name_or_id):
                logger.error(f"无效的分组标识符: {group_name_or_id}")
                return False
                
            if not ts_codes:
                logger.warning("代码列表为空，无需重置")
                return True
            
            # 验证所有ts_code
            valid_codes = []
            for ts_code in ts_codes:
                if self._validate_ts_code(ts_code):
                    valid_codes.append(ts_code)
                else:
                    logger.warning(f"跳过无效的代码: {ts_code}")
            
            if not valid_codes:
                logger.error("没有有效的代码可以添加")
                return False
            
            # 如果需要重建，直接删除分组再创建（比逐个删除项目更快）
            if rebuild:
                groups = self.get_all_groups()
                target_group = None
                group_name = group_name_or_id  # 保存分组名用于重建
                
                for group in groups.values():
                    if group.name == group_name_or_id or group.group_id == group_name_or_id:
                        target_group = group
                        group_name = group.name  # 使用分组名而非ID
                        break
                
                if target_group and len(target_group.items) > 0:
                    logger.debug(f"删除分组 {group_name} 并重建（原有 {len(target_group.items)} 个项目）")
                    # 删除整个分组（1次API调用，比逐个删除N个项目更快）
                    self.delete_group(target_group.group_id)
                    
                    # 重新创建分组
                    if not self.add_group(group_name):
                        logger.error(f"重建分组 {group_name} 失败")
                        return False
                    # 更新 group_name_or_id 为新分组名
                    group_name_or_id = group_name
            
            # 确保分组存在（分组不存在或刚删除重建的情况）
            group_id = self._get_group_id_by_identifier(group_name_or_id)
            if not group_id:
                logger.info(f"分组 {group_name_or_id} 不存在，尝试创建")
                if not self.add_group(group_name_or_id):
                    logger.error(f"创建分组 {group_name_or_id} 失败")
                    return False
            
            # 添加新项目（使用批量API，1次调用添加所有代码）
            # 注意：批量API直接保持传入顺序，不需要倒序（单个添加时需要倒序是因为后加的在前面）
            codes_to_add = valid_codes
            logger.debug(f"批量添加 {len(codes_to_add)} 个代码（保持原始顺序）")
            
            success_count = self.add_items_to_group_batch(group_name_or_id, codes_to_add)
            
            logger.info(f"重置分组 {group_name_or_id} 完成，成功添加 {success_count}/{len(valid_codes)} 个代码")
            return success_count > 0
            
        except Exception as e:
            # 重新抛出 ThsAuthError，让上层处理
            if isinstance(e, ThsAuthError):
                raise
            logger.error(f"重置分组内容失败: {e}")
            return False

    def _get_group_id_by_identifier(self, identifier: str) -> Optional[str]:
        """根据名称或ID获取分组ID"""
        # 优先使用缓存，避免重复API调用
        groups = self._groups_cache if self._groups_cache else self.get_all_groups()
        
        for group in groups.values():
            if group.name == identifier or group.group_id == identifier:
                return group.group_id
        
        return None

    def _get_raw_group_data(self) -> Optional[Dict[str, Any]]:
        """获取原始分组数据"""
        try:
            params = {
                "from": "sjcg_gphone",
                "types": "0"
            }
            
            response = self.api_client.get(self._QUERY_ENDPOINT, params=params)
            
            if response and response.get("status_code") == 0:
                data = response.get("data")
                if data and "version" in data:
                    self._current_version = data["version"]
                return data
            elif response and response.get("status_code") == 401:
                # 登录态失效，抛出认证异常
                raise ThsAuthError(message="同花顺登录态已失效", code="THS_AUTH_FAILED")
            else:
                logger.warning(f"获取分组数据失败: {response}")
                return None
        
        except Exception as e:
            # 重新抛出 ThsAuthError，不要被通用异常捕获
            if isinstance(e, ThsAuthError):
                raise
            logger.error(f"获取原始分组数据失败: {e}")
            return None

    def close(self) -> None:
        """关闭连接"""
        if not self._is_external_api_client and hasattr(self, 'api_client'):
            self.api_client.close()

    def __enter__(self: T_UserFavorite) -> T_UserFavorite:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def _load_cache(self) -> None:
        """加载缓存数据"""
        # 初始化时先尝试获取远程数据来填充缓存
        try:
            self.get_all_groups()
        except Exception as e:
            logger.warning(f"初始化时加载分组缓存失败: {e}")

    def refresh_cache(self) -> None:
        """刷新缓存"""
        try:
            self._groups_cache.clear()
            self._current_version = None
            self.get_all_groups()
            logger.debug("缓存刷新成功")
        except Exception as e:
            logger.error(f"刷新缓存失败: {e}")

    def get_version(self) -> Optional[str]:
        """获取当前数据版本"""
        return self._current_version

    def is_cache_valid(self) -> bool:
        """检查缓存是否有效"""
        return bool(self._groups_cache and self._current_version)

    def _update_cache_after_modification(self) -> None:
        """修改操作后更新缓存"""
        try:
            # API返回的version已是最新，无需等待直接刷新缓存
            self.refresh_cache()
        except Exception as e:
            logger.warning(f"修改后更新缓存失败: {e}")

    def _validate_group_identifier(self, identifier: str) -> bool:
        """验证分组标识符是否有效"""
        if not identifier or not isinstance(identifier, str):
            return False
        return len(identifier.strip()) > 0

    def _validate_ts_code(self, ts_code: str) -> bool:
        """验证ts_code格式是否有效"""
        if not ts_code or not isinstance(ts_code, str):
            return False
        code = ts_code.strip()
        return len(code) > 0 and not any(c in code for c in [' ', '\t', '\n'])

    def get_group_by_name(self, group_name: str) -> Optional[THSFavoriteGroup]:
        """根据分组名称获取分组"""
        groups = self.get_all_groups()
        return groups.get(group_name)

    def get_group_by_id(self, group_id: str) -> Optional[THSFavoriteGroup]:
        """根据分组ID获取分组"""
        groups = self.get_all_groups()
        for group in groups.values():
            if group.group_id == group_id:
                return group
        return None

    def list_group_names(self) -> List[str]:
        """获取所有分组名称列表"""
        groups = self.get_all_groups()
        return list(groups.keys())

    def get_group_items_count(self, group_name_or_id: str) -> int:
        """获取分组中的项目数量"""
        group = self.get_group_by_name(group_name_or_id) or self.get_group_by_id(group_name_or_id)
        return len(group.items) if group else 0

    def is_item_in_group(self, group_name_or_id: str, ts_code: str) -> bool:
        """检查某个代码是否在分组中"""
        group = self.get_group_by_name(group_name_or_id) or self.get_group_by_id(group_name_or_id)
        if not group:
            return False
        
        for item in group.items:
            if item.code == ts_code or item.code == ts_code.split('.')[0]:
                return True
        return False
