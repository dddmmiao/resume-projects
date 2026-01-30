import base64
import json
import time
from pathlib import Path
from typing import Callable, Optional, Dict, Any, Tuple
from urllib.parse import urljoin

import execjs
import requests

from ..login_utils import GGError


def get_hexin_v() -> str:
    base_dir = Path(__file__).resolve().parent.parent
    js_dir = base_dir / 'js'
    with open(js_dir / 'v_new.js', 'r', encoding='utf-8') as f:
        hexin_v = f.read()
    return execjs.compile(hexin_v).call('get_v')


class TongHuaShunQrLogin:
    def __init__(
        self,
        entry_url: str = 'https://www.10jqka.com.cn/',
        login_url: str = 'https://upass.10jqka.com.cn/login?redir=https%3A%2F%2Fwww.10jqka.com.cn%2F',
        qr_output_path: str = None,
        headless: bool = False,
        wait_login_timeout_seconds: int = 180,
        validate_url: str = 'https://t.10jqka.com.cn/user_center/open/api/user/v1/simple_info',
        validate_timeout_seconds: int = 10,
        validate_interval_seconds: int = 2,
        use_system_chrome: bool = True,
        user_agent: Optional[str] = None,
        result_output_path: Optional[str] = None,
        pushplus_token: Optional[str] = None,
        pushplus_friend_token: Optional[str] = None,
        pushplus_api_url: str = 'https://www.pushplus.plus/send',
        pushplus_title: str = '同花顺登录二维码',
        browser_args: Optional[list] = None,
        wechat_login_selector: Optional[str] = 'a.btn_elem[l_type="weixin"]',
        wechat_login_texts: Optional[list] = None,
        qr_selectors: Optional[list] = None,
        popup_wait_timeout_ms: int = 8000,
        on_qr_ready: Optional[Callable[[bytes, str], None]] = None,
    ):
        self.entry_url = entry_url
        self.login_url = login_url
        self.qr_output_path = qr_output_path
        self.headless = headless
        self.wait_login_timeout_seconds = wait_login_timeout_seconds
        self.validate_url = validate_url
        self.validate_timeout_seconds = validate_timeout_seconds
        self.validate_interval_seconds = validate_interval_seconds
        self.use_system_chrome = use_system_chrome
        self.user_agent = user_agent or 'Hexin_Gphone/11.28.03 (Royal Flush) hxtheme/0 innerversion/G037.09.028.1.32 followPhoneSystemTheme/0 getHXAPPAccessibilityMode/0 hxNewFont/1 isVip/0 getHXAPPFontSetting/normal getHXAPPAdaptOldSetting/0 okhttp/3.14.9'
        self.result_output_path = result_output_path
        self.pushplus_token = pushplus_token
        self.pushplus_friend_token = pushplus_friend_token
        self.pushplus_api_url = pushplus_api_url
        self.pushplus_title = pushplus_title
        # 优化的浏览器启动参数 - 显著减少启动时间和资源占用
        self.browser_args = browser_args or [
            '--no-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-blink-features=AutomationControlled',
            # 性能优化参数
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--disable-ipc-flooding-protection',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--disable-domain-reliability',
            # 内存和CPU优化
            '--memory-pressure-off',
            '--max_old_space_size=4096',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            # 网络优化
            '--aggressive-cache-discard',
            '--disable-background-networking',
            # 图形优化  
            '--disable-gpu-sandbox',
            '--disable-software-rasterizer',
            '--disable-threaded-scrolling',
        ]
        self.wechat_login_selector = wechat_login_selector
        self.wechat_login_texts = wechat_login_texts if wechat_login_texts is not None else ['微信', '微信登录', '微信扫码', 'WeChat']
        self.qr_selectors = qr_selectors if qr_selectors is not None else [
            'img.js_qrcode_img',
            'img.web_qrcode_img',
            'img.qrcode',
            'img[src^="/connect/qrcode/"]',
            '#qrcode_pannel .code-box img',
            'img[src*="/scan/creatImg"]',
            'img[src*="qr"]',
            'img[src*="qrcode"]',
            'img[class*="qr"]',
            'img[id*="qr"]',
            '#qrcode img',
            'canvas',
        ]
        self.popup_wait_timeout_ms = popup_wait_timeout_ms
        self.on_qr_ready = on_qr_ready

    def _build_result(self, cookies_dict: Dict[str, str], user_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        headers: Dict[str, str] = {}
        try:
            headers['hexin-v'] = get_hexin_v()
        except Exception:
            headers = {}
        return {'cookies': cookies_dict, 'headers': headers, 'user_info': user_info}

    def _save_result(self, result: Dict[str, Any]) -> None:
        if not self.result_output_path:
            return
        try:
            p = Path(self.result_output_path)
            if not p.parent.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception:
            pass

    def _pushplus_send(self, title: str, content: str, template: str = 'html') -> bool:
        """发送PushPlus推送（支持好友消息模式）"""
        if not self.pushplus_token:
            return False
        # 必须有好友令牌才推送
        if not self.pushplus_friend_token:
            return False
        payload = {
            'token': self.pushplus_token,
            'title': title,
            'content': content,
            'template': template,
            'channel': 'wechat',
            'to': self.pushplus_friend_token,
        }
        try:
            resp = requests.post(self.pushplus_api_url, json=payload, timeout=15)
            if resp.status_code != 200:
                return False
            return True
        except Exception:
            return False

    def _notify_qr(self, qr_bytes: bytes, qr_path: Path, qr_url: Optional[str] = None) -> None:
        if self.pushplus_token:
            if qr_url:
                content = f'<p>请扫码登录（{time.strftime("%Y-%m-%d %H:%M:%S")}）</p><p><a href="{qr_url}">{qr_url}</a></p><p><img src="{qr_url}" style="max-width: 320px;" /></p>'
            else:
                b64 = base64.b64encode(qr_bytes).decode('ascii')
                content = f'<p>请扫码登录（{time.strftime("%Y-%m-%d %H:%M:%S")}）</p><p><img src="data:image/png;base64,{b64}" style="max-width: 320px;" /></p>'
            ok = self._pushplus_send(self.pushplus_title, content, template='html')
            if ok:
                print('二维码已推送到微信')
                return
            print('PushPlus推送失败，已回退为本地保存二维码')
        print(f'二维码已保存: {qr_path.resolve()}')

    def _launch_browser(self, playwright):
        """优化的浏览器启动方法 - 支持快速启动模式"""
        launch_options = {
            'headless': self.headless,
            'args': self.browser_args,
            # 性能优化选项
            'slow_mo': 0,  # 无延迟
            'timeout': 10000,  # 10秒启动超时
        }
        
        if self.use_system_chrome:
            try:
                # 优先使用系统Chrome，通常启动更快
                return playwright.chromium.launch(channel='chrome', **launch_options)
            except Exception:
                # 回退到内置Chromium
                return playwright.chromium.launch(**launch_options)
        return playwright.chromium.launch(**launch_options)

    def _validate_login(self, cookies_dict: Dict[str, str]) -> Tuple[bool, Optional[Dict[str, Any]]]:
        headers = {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': self.user_agent,
        }
        try:
            resp = requests.get(self.validate_url, headers=headers, cookies=cookies_dict, timeout=self.validate_timeout_seconds)
        except Exception:
            return False, None
        try:
            data = resp.json()
        except Exception:
            return False, None
        if isinstance(data, dict) and data.get('status_code') == 0:
            user_info = data.get('data')
            if isinstance(user_info, dict):
                return True, user_info
            return True, None
        return False, None

    def _cookies_to_dict(self, cookies: list) -> Dict[str, str]:
        cookie_dict: Dict[str, str] = {}
        for c in cookies:
            name = c.get('name')
            value = c.get('value')
            if name and value is not None:
                cookie_dict[name] = value
        if 'v' in cookie_dict:
            del cookie_dict['v']
        return cookie_dict

    def _wait_for_qr_element(self, page):
        last_error: Optional[Exception] = None
        targets = [page]
        try:
            targets.extend(page.frames)
        except Exception:
            pass
        for t in targets:
            for sel in self.qr_selectors:
                try:
                    loc = t.locator(sel).first
                    loc.wait_for(state='visible', timeout=15000)
                    return loc
                except Exception as e:
                    last_error = e
        raise GGError(f'未找到二维码元素: {last_error}')

    def _maybe_open_wechat_popup(self, page):
        try:
            page.wait_for_load_state('domcontentloaded', timeout=15000)
        except Exception:
            pass

        def _try_click_with_popup(locator):
            try:
                with page.expect_popup(timeout=self.popup_wait_timeout_ms) as pop:
                    locator.click(timeout=3000)
                return pop.value
            except Exception:
                try:
                    locator.click(timeout=3000)
                except Exception:
                    return None
                return None

        if self.wechat_login_selector:
            try:
                loc = page.locator(self.wechat_login_selector).first
                loc.wait_for(state='visible', timeout=3000)
                popup = _try_click_with_popup(loc)
                if popup:
                    return popup
            except Exception:
                pass

        for text in self.wechat_login_texts:
            try:
                loc = page.get_by_text(text, exact=False).first
                loc.wait_for(state='visible', timeout=1500)
                popup = _try_click_with_popup(loc)
                if popup:
                    return popup
            except Exception:
                continue

        try:
            page.locator('#to_qrcode_login').first.click(timeout=1500)
        except Exception:
            pass
        try:
            page.locator('#qrcode_pannel').wait_for(state='visible', timeout=1500)
        except Exception:
            pass
        return None

    def start(self) -> Dict[str, Any]:
        try:
            from playwright.sync_api import sync_playwright
        except Exception as e:
            raise GGError(f'未安装 playwright 或导入失败: {e}')

        qr_path = Path(self.qr_output_path)
        if not qr_path.parent.exists():
            qr_path.parent.mkdir(parents=True, exist_ok=True)

        with sync_playwright() as p:
            browser = self._launch_browser(p)
            # 优化的浏览器上下文 - 减少资源占用和加载时间
            context = browser.new_context(
                user_agent=self.user_agent,
                locale='zh-CN',
                timezone_id='Asia/Shanghai',
                # 性能优化选项
                java_script_enabled=True,
                bypass_csp=True,  # 绕过内容安全策略，减少加载时间
                ignore_https_errors=True,  # 忽略HTTPS错误，提高兼容性
                # 资源过滤优化
                extra_http_headers={
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'max-age=0',
                },
                # 显示优化
                viewport={'width': 1920, 'height': 1080},  # 1080p分辨率，平衡性能
                device_scale_factor=2,  # 2倍设备像素比，减少资源占用
            )
            context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
            page = context.new_page()

            try:
                try:
                    page.goto(self.entry_url, wait_until='domcontentloaded')
                except Exception:
                    pass

                resp = page.goto(self.login_url, wait_until='domcontentloaded', referer=self.entry_url)
                if resp is not None and resp.status == 403:
                    raise GGError('打开登录页返回403(Nginx forbidden)，可能是IP被风控/封禁或被识别为自动化环境')

                popup = self._maybe_open_wechat_popup(page)
                qr_page = popup or page
                try:
                    qr_page.wait_for_load_state('domcontentloaded', timeout=15000)
                except Exception:
                    pass

                qr_loc = self._wait_for_qr_element(qr_page)
                qr_url: Optional[str] = None
                try:
                    src = qr_loc.get_attribute('src')
                    if src:
                        qr_url = urljoin(qr_page.url, src)
                except Exception:
                    qr_url = None
                
                # 等待图片完全加载（关键修复：确保图片内容完全加载后再截图）
                # 等待img元素的naturalHeight属性大于0（图片已加载）
                qr_page.wait_for_function(
                    "(selector) => { const img = document.querySelector(selector); return img && img.complete && img.naturalHeight > 0; }",
                    arg=self.qr_selectors[0],  # 使用第一个选择器
                    timeout=5000
                )
                
                qr_loc.screenshot(path=str(qr_path), scale='css')  # 使用CSS尺寸，保持高DPI
                qr_bytes = qr_path.read_bytes()
                if self.on_qr_ready:
                    self.on_qr_ready(qr_bytes, str(qr_path))
                else:
                    self._notify_qr(qr_bytes, qr_path, qr_url)

                baseline = {(c.get('name'), c.get('domain')) for c in context.cookies()}
                start_ts = time.time()
                last_cookie_count = len(baseline)
                last_validate_ts = 0.0

                while True:
                    if time.time() - start_ts > self.wait_login_timeout_seconds:
                        raise GGError('等待扫码登录超时')
                    time.sleep(1)

                    current = context.cookies()
                    current_set = {(c.get('name'), c.get('domain')) for c in current}

                    opener_url = ''
                    try:
                        opener_url = page.url
                    except Exception:
                        opener_url = ''

                    popup_closed = False
                    if popup:
                        try:
                            popup_closed = popup.is_closed()
                        except Exception:
                            popup_closed = True

                    if opener_url and (not opener_url.startswith(self.login_url)) and ('login' not in opener_url):
                        cookies_dict = self._cookies_to_dict(current)
                        now = time.time()
                        if now - last_validate_ts >= self.validate_interval_seconds:
                            last_validate_ts = now
                            ok, user_info = self._validate_login(cookies_dict)
                            if ok:
                                result = self._build_result(cookies_dict, user_info)
                                self._save_result(result)
                                return result

                    if popup_closed and len(current_set) >= len(baseline) + 1:
                        cookies_dict = self._cookies_to_dict(current)
                        now = time.time()
                        if now - last_validate_ts >= self.validate_interval_seconds:
                            last_validate_ts = now
                            ok, user_info = self._validate_login(cookies_dict)
                            if ok:
                                result = self._build_result(cookies_dict, user_info)
                                self._save_result(result)
                                return result

                    if len(current_set) > last_cookie_count and len(current_set - baseline) >= 2:
                        cookies_dict = self._cookies_to_dict(current)
                        now = time.time()
                        if now - last_validate_ts >= self.validate_interval_seconds:
                            last_validate_ts = now
                            ok, user_info = self._validate_login(cookies_dict)
                            if ok:
                                result = self._build_result(cookies_dict, user_info)
                                self._save_result(result)
                                return result
                    last_cookie_count = len(current_set)

            finally:
                browser.close()
