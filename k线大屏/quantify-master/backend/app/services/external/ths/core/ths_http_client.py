"""
同花顺HTTP API客户端
封装HTTP请求、Cookie管理、错误处理等通用功能
"""

import json
from typing import Dict, Any, Optional, List, TypeVar

import httpx
from loguru import logger

T_HttpApiClient = TypeVar('T_HttpApiClient', bound='THSHttpApiClient')


class THSHttpApiClient:
    """
    一个通用的 HTTP API 客户端，封装了 httpx 请求的发送、
    Cookie 管理、基本头部设置和错误处理。
    """
    _DEFAULT_RETRY_COUNT: int = 3

    def __init__(self,
                 base_url: str,
                 cookies: Optional[Dict[str, str]] = None,
                 headers: Optional[Dict[str, str]] = None,
                 client: Optional[httpx.Client] = None,
                 timeout: float = 10.0,
                 http2: bool = False,
                 ths_account: Optional[str] = None):
        self.base_url: str = base_url.rstrip('/')
        self._internal_cookies: Dict[str, str] = {}
        self.ths_account = ths_account

        if client:
            self._client: httpx.Client = client
            self._is_external_client: bool = True
            # 注意：只要调用方显式传入了 cookies（即便是空字典），就不再自动回退加载
            if cookies is not None:
                self.set_cookies(cookies)
        else:
            self._client = httpx.Client(http2=http2, timeout=timeout)
            self._is_external_client = False
            if cookies is not None:
                # 显式传入 cookies（包括空字典）时，仅使用调用方提供的内容
                self.set_cookies(cookies)
            else:
                # 从 Redis 加载 Cookie
                if self._load_cookies_from_redis():
                    logger.debug("已从 Redis 加载同花顺 Cookie")
                else:
                    logger.warning("未提供cookies，请通过管理后台配置 Cookie。请求可能因缺少认证而失败。")


        # 根据 ths_account 动态构建 User-Agent（包含真实 userid）
        if headers:
            self._default_headers = headers.copy()
        else:
            userid = None
            if ths_account:
                try:
                    from app.services.external.ths.auth.login_service import ths_login_service
                    session_data = ths_login_service.get_session(ths_account)
                    if session_data:
                        userid = session_data.get("ths_uid")
                        if userid:
                            logger.debug(f"从 Redis 获取到 ths_uid: {userid}")
                except Exception as e:
                    logger.warning(f"获取账号 {ths_account} 的 ths_uid 失败: {e}")
            
            # 构建User-Agent
            if userid:
                self._default_headers = {
                    "User-Agent": f"Hexin_Gphone/11.28.03 (Royal Flush) hxtheme/0 innerversion/G037.09.028.1.32 followPhoneSystemTheme/0 userid/{userid} getHXAPPAccessibilityMode/0 hxNewFont/1 isVip/0 getHXAPPFontSetting/normal getHXAPPAdaptOldSetting/0 okhttp/3.14.9"
                }
            else:
                # 没有userid时使用不包含userid的User-Agent
                self._default_headers = {
                    "User-Agent": "Hexin_Gphone/11.28.03 (Royal Flush) hxtheme/0 innerversion/G037.09.028.1.32 followPhoneSystemTheme/0 getHXAPPAccessibilityMode/0 hxNewFont/1 isVip/0 getHXAPPFontSetting/normal getHXAPPAdaptOldSetting/0 okhttp/3.14.9"
                }
        
        logger.debug(f"默认请求头已设置: {self._default_headers}")

    def _parse_cookies_str(self, cookies_str: str) -> Dict[str, str]:
        """将原始 Cookie 字符串解析为字典。

        仅作为工具方法保留，外部通常应直接传入 Dict[str, str]。
        """
        cookie_dict: Dict[str, str] = {}
        if not cookies_str:
            return cookie_dict
        pairs: List[str] = cookies_str.split(';')
        for pair_str in pairs:
            pair_str = pair_str.strip()
            if '=' in pair_str:
                name, value = pair_str.split('=', 1)
                cookie_dict[name.strip()] = value.strip()
        logger.debug(f"从字符串解析得到 {len(cookie_dict)} 个cookies。")
        return cookie_dict

    def set_cookies(self, cookies: Dict[str, str]) -> None:
        """设置内部 Cookie，仅接受字典类型。

        调用方负责保证类型正确，若需要从字符串转换，请显式调用 _parse_cookies_str。
        """
        self._internal_cookies = cookies.copy()

        if hasattr(self, '_client'):
            self._client.cookies.clear()
            self._client.cookies.update(self._internal_cookies)
            logger.debug(f"客户端 cookies 已更新，共 {len(self._internal_cookies)} 个。")
        else:
            logger.warning("尝试设置 cookies，但内部 _client 尚未初始化。")


    def get_cookies(self) -> Dict[str, str]:
        logger.debug(f"获取当前 cookies 副本，共 {len(self._internal_cookies)} 个。")
        return self._internal_cookies.copy()

    def _load_cookies_from_redis(self) -> bool:
        """
        从 Redis 加载同花顺 Cookie
        
        Returns:
            bool: 成功加载返回 True，否则返回 False
        """
        try:
            if not self.ths_account:
                logger.debug("ths_account 未提供，跳过 Redis 加载")
                return False
            
            from app.services.external.ths.auth.login_service import ths_login_service
            cookies = ths_login_service.get_cookies(self.ths_account)

            if cookies:
                self.set_cookies(cookies)
                logger.debug(f"成功从 Redis 加载同花顺 Cookie (ths_account={self.ths_account})，共 {len(cookies)} 个")
                return True
            
            logger.debug(f"Redis 中未找到同花顺 Cookie (ths_account={self.ths_account})")
            return False
        except Exception as e:
            logger.warning(f"从 Redis 加载同花顺 Cookie 失败: {e}")
            return False


    def _prepare_headers(self, additional_headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        final_headers: Dict[str, str] = self._default_headers.copy()
        if additional_headers:
            final_headers.update(additional_headers)
        logger.debug(f"准备请求头: {final_headers}")
        return final_headers

    def request(self,
                method: str,
                endpoint: str,
                params: Optional[Dict[str, Any]] = None,
                data: Optional[Dict[str, Any]] = None,
                json_payload: Optional[Any] = None,
                headers: Optional[Dict[str, str]] = None
               ) -> Dict[str, Any]:
        full_url: str = f"{self.base_url}/{endpoint.lstrip('/')}"
        request_headers: Dict[str, str] = self._prepare_headers(headers)

        logger.debug(f"发送 {method} 请求到 {full_url}")
        logger.debug(f"请求参数: {params}, 表单数据: {data}, JSON载荷: {json_payload is not None}")

        response = None
        try:
            response: httpx.Response = self._client.request(
                method,
                full_url,
                params=params,
                data=data,
                json=json_payload,
                headers=request_headers
            )
            logger.debug(f"收到响应: 状态码 {response.status_code}, URL: {response.url}")
            response.raise_for_status()
            
            # 尝试解析JSON
            # 如果API可能返回空字符串作为成功响应，并且希望将其视为空字典，则需要特殊处理
            if not response.text: # 检查响应体是否为空
                logger.debug(f"请求 {full_url} 成功，但响应体为空。返回空字典。")
                return {}
            
            json_response = response.json()
            logger.debug(f"成功解析响应为JSON: {str(json_response)[:200]}...") # 截断过长的日志
            return json_response

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP错误 ({method} {full_url}): 状态码 {e.response.status_code}, 响应: {e.response.text[:200]}...")
            raise # 重新抛出，让调用者处理
        except httpx.RequestError as e:
            logger.error(f"请求错误 ({method} {full_url}): {e}")
            raise
        except json.JSONDecodeError as e:
            resp_text_preview = ''
            try:
                # 在此作用域中，response 仅在 try 块成功时存在
                resp_text_preview = response.text[:200]  # type: ignore[name-defined]
            except Exception:
                pass
            logger.error(f"JSON解码错误 ({method} {full_url}): {e}. 响应文本: {resp_text_preview}...")
            raise


    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, **kwargs: Any) -> Dict[str, Any]:
        return self.request("GET", endpoint, params=params, **kwargs)

    def post_form_urlencoded(self, endpoint: str, data: Optional[Dict[str, Any]] = None, **kwargs: Any) -> Dict[str, Any]:
        custom_headers: Dict[str, str] = kwargs.pop('headers', {}) or {}
        if 'Content-Type' not in custom_headers and 'content-type' not in custom_headers:
            custom_headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8'
        return self.request("POST", endpoint, data=data, headers=custom_headers, **kwargs)

    def post_json(self, endpoint: str, json_payload: Optional[Any] = None, **kwargs: Any) -> Dict[str, Any]:
        return self.request("POST", endpoint, json_payload=json_payload, **kwargs)

    def close(self) -> None:
        """关闭客户端连接。
        
        只有在此客户端实例拥有 httpx.Client 时才关闭，
        如果是通过构造函数传入的外部客户端，则不关闭。
        """
        if not self._is_external_client and hasattr(self, '_client'):
            logger.debug("关闭内部 HTTP 客户端连接。")
            self._client.close()
        else:
            logger.debug("不关闭外部提供的 HTTP 客户端或客户端已不存在。")

    def __enter__(self: T_HttpApiClient) -> T_HttpApiClient:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
