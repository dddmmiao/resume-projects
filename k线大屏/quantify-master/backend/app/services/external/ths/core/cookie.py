from http.cookiejar import CookieJar, Cookie
from typing import List, Optional

from loguru import logger


def load_browser_cookie(browser: str) -> Optional[List[Cookie]]:
    """
    从指定的浏览器中加载同花顺站点的 cookie
    
    注意：此功能仅在本地开发环境有效，生产环境通常无法访问浏览器 Cookie
    """
    
    try:
        import browser_cookie3 as cookie_jar
    except ImportError:
        logger.warning("browser_cookie3 模块未安装，无法从浏览器加载 Cookie。请使用手动配置的 Cookie。")
        return None

    load = None
    browser_lower = browser.lower()
    if browser_lower == "chrome":
        load = cookie_jar.chrome
    elif browser_lower == "firefox":
        load = cookie_jar.firefox
    elif browser_lower == "edge":
        load = cookie_jar.edge
    else:
        logger.error(f"不支持的浏览器: {browser}")
        return None

    try:
        cookies: CookieJar = load(domain_name='.10jqka.com.cn')
        ths_session: List[Cookie] = cookies.__dict__['_cookies']['.10jqka.com.cn']['/']
        return list(ths_session.values())
    except PermissionError as e:
        logger.warning(f"无权限访问 {browser} 浏览器的 Cookie 文件。这在服务器环境是正常的。")
        return None
    except KeyError as e:
        logger.warning(f"在 {browser} 浏览器中未找到同花顺 Cookie。请先在浏览器中登录同花顺网站。")
        return None
    except Exception as e:
        logger.error(f"从 {browser} 浏览器加载 Cookie 时发生错误: {e}")
        return None


if __name__ == "__main__":
    # 测试代码
    cookie = load_browser_cookie('firefox')
    print(cookie)
    # cookie = load_browser_cookie_or_none("chrome")
    # print(cookie)