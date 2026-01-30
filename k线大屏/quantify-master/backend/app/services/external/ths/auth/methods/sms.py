import json
import os
import re
import time
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from urllib.parse import parse_qs

import execjs
import requests
from ddddocr import DdddOcr
from requests.utils import dict_from_cookiejar

from ..login_utils import GGError, get_random


class TongHuaShunSmsLogin:
    def __init__(
        self,
        mobile: str,
        login_url: str = 'https://upass.10jqka.com.cn/login?redir=https%3A%2F%2Fwww.10jqka.com.cn%2F',
        validate_url: str = 'https://t.10jqka.com.cn/user_center/open/api/user/v1/simple_info',
        validate_timeout_seconds: int = 10,
        user_agent: Optional[str] = None,
        result_output_path: Optional[str] = None,
        sms_code: Optional[str] = None,
        sms_code_env_key: str = 'THS_SMS_CODE',
    ):
        self.mobile = mobile
        self.login_url = login_url
        self.validate_url = validate_url
        self.validate_timeout_seconds = validate_timeout_seconds
        self.user_agent = user_agent or "Hexin_Gphone/11.28.03 (Royal Flush) hxtheme/0 innerversion/G037.09.028.1.32 followPhoneSystemTheme/0 getHXAPPAccessibilityMode/0 hxNewFont/1 isVip/0 getHXAPPFontSetting/normal getHXAPPAdaptOldSetting/0 okhttp/3.14.9"
        self.result_output_path = result_output_path
        self.sms_code = sms_code
        self.sms_code_env_key = sms_code_env_key
        self.last_sms_send_error: Optional[str] = None
        
        self.session = requests.Session()
        # 修正路径：JS文件在ths根目录下，而不是auth目录下
        base_dir = Path(__file__).resolve().parent.parent.parent
        js_dir = base_dir / 'js'
        with open(js_dir / 'core' / 'encrypt.js', 'r', encoding='utf-8') as f:
            self.js_content = f.read()
        with open(js_dir / 'utils' / 'v_new.js', 'r', encoding='utf-8') as f:
            self.hexin_v = f.read()
        with open(js_dir / 'core' / 'encryption.js', 'r', encoding='utf-8') as f:
            self.encrypt = f.read()
        self.dct = DdddOcr(det=False, ocr=False, show_ad=False)
        
        # 验证码相关状态（用于人工验证）
        self.captcha_required = False
        self.captcha_params: Optional[Dict[str, str]] = None
        self.captcha_images: Optional[Dict[str, str]] = None  # base64编码的图片
        self.pending_sms_data: Optional[Dict[str, Any]] = None
        self.pending_sms_headers: Optional[Dict[str, str]] = None

    def _get_v(self) -> Dict[str, str]:
        try:
            return {'v': execjs.compile(self.hexin_v).call('get_v')}
        except Exception:
            return {}

    def _auto_pass_captcha(self) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        try:
            from loguru import logger
            max_attempts = 3
            x_scan = 3

            url = "https://captcha.10jqka.com.cn/getPreHandle"
            headers = {
                "Accept": "*/*",
                "Referer": "https://upass.10jqka.com.cn/",
                "User-Agent": self.user_agent
            }

            img_headers = {
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Referer": "https://upass.10jqka.com.cn/",
                "User-Agent": self.user_agent
            }

            for attempt in range(1, max_attempts + 1):
                params = {
                    "captcha_type": "4",
                    "appid": "registernew",
                    "random": get_random(),
                    "callback": "PreHandle"
                }

                v = self._get_v()
                if v:
                    self.session.cookies.set('v', v['v'])
                    headers['hexin-v'] = v['v']
                    img_headers['hexin-v'] = v['v']

                try:
                    response = self.session.get(url, headers=headers, params=params, timeout=15)
                except Exception as e:
                    continue

                payload: Optional[Dict[str, Any]] = None
                try:
                    m = re.search(r'\((\{.*\})\)\s*;?\s*$', response.text, flags=re.S)
                    if m:
                        payload = json.loads(m.group(1))
                except Exception:
                    payload = None

                if not payload:
                    try:
                        url_params = ''.join(re.findall(r'urlParams":"(.*?)"', response.text))
                        imgs_str = ''.join(re.findall(r'"imgs":(.*?),"initx', response.text))
                        if url_params and imgs_str:
                            imgs = eval(imgs_str)
                            if isinstance(imgs, list):
                                payload = {'data': {'urlParams': url_params, 'imgs': imgs}}
                    except Exception:
                        payload = None

                if not payload:
                    continue

                data_obj = payload.get('data') if isinstance(payload, dict) else None
                if not isinstance(data_obj, dict):
                    continue

                url_params = data_obj.get('urlParams')
                imgs = data_obj.get('imgs')
                if (not isinstance(url_params, str)) or (not url_params) or (not isinstance(imgs, list)) or (len(imgs) < 2):
                    continue

                p = parse_qs(url_params)
                sig = ''
                try:
                    sig = (p.get('signature') or [''])[0]
                except Exception:
                    sig = ''
                if not sig:
                    continue

                try:
                    rand = (p.get('rand') or [''])[0]
                    ts = (p.get('time') or [''])[0]
                except Exception:
                    rand, ts = '', ''
                if (not rand) or (not ts):
                    continue

                img_bytes: list = []
                ok_imgs = True
                for iuk in imgs[:2]:
                    img_url = "https://captcha.10jqka.com.cn/getImg"
                    img_params = {
                        "rand": rand,
                        "time": ts,
                        "appid": "registernew",
                        "captcha_type": "4",
                        "signature": sig,
                        "iuk": iuk
                    }
                    try:
                        resp = self.session.get(img_url, headers=img_headers, params=img_params, timeout=15)
                    except Exception as e:
                        ok_imgs = False
                        break
                    if resp.status_code != 200 or (not resp.content) or len(resp.content) < 200:
                        ok_imgs = False
                        break
                    img_bytes.append(resp.content)
                if not ok_imgs or len(img_bytes) < 2:
                    continue

                try:
                    res = self.dct.slide_match(img_bytes[1], img_bytes[0], simple_target=True)
                    target = res['target']
                except Exception as e:
                    continue

                if isinstance(target, (list, tuple)) and len(target) >= 2:
                    x, y = target[0], target[1]
                else:
                    continue

                ticket_url = "https://captcha.10jqka.com.cn/getTicket"
                y_scaled = y / 195 * 177.22058823529412
                base_x = int(x * 0.908)

                for dx in range(-x_scan, x_scan + 1):
                    phrase = f"{base_x + dx};{y_scaled};309;177.22058823529412"
                    ticket_params = {
                        "rand": rand,
                        "time": ts,
                        "appid": "registernew",
                        "captcha_type": "4",
                        "signature": sig,
                        "phrase": phrase,
                        "callback": "verify"
                    }

                    v2 = self._get_v()
                    if v2:
                        self.session.cookies.set('v', v2['v'])
                        headers['hexin-v'] = v2['v']

                    try:
                        resp = self.session.get(ticket_url, headers=headers, params=ticket_params, timeout=15)
                    except Exception as e:
                        continue

                    ticket: Optional[str] = None
                    try:
                        m2 = re.search(r'\((\{.*\})\)\s*;?\s*$', resp.text, flags=re.S)
                        if m2:
                            j2 = json.loads(m2.group(1))
                            if isinstance(j2, dict):
                                ticket = j2.get('ticket')
                    except Exception:
                        ticket = None

                    if not ticket:
                        try:
                            ticket = ''.join(re.findall(r'"ticket":"(.*?)"', resp.text))
                        except Exception:
                            ticket = None

                    if ticket:
                        signature = sig
                        logger.info("滑块验证成功")
                        return ticket, phrase, signature

                try:
                    time.sleep(0.2)
                except Exception:
                    pass

            return None, None, None
        except Exception as e:
            return None, None, None

    def _get_captcha_mode(self) -> str:
        """获取滑块验证模式配置：combined(组合), auto(自动), manual(手动)"""
        try:
            from app.services.core.system_config_service import system_config_service
            return system_config_service.get_captcha_mode()
        except Exception:
            pass
        return 'combined'  # 默认组合模式

    def _get_captcha_data(self) -> Optional[Dict[str, Any]]:
        """获取验证码数据（用于人工验证），返回背景图和滑块图的base64"""
        import base64
        from loguru import logger
        
        try:
            logger.debug("开始获取验证码数据")
            url = "https://captcha.10jqka.com.cn/getPreHandle"
            headers = {"Accept": "*/*", "Referer": "https://upass.10jqka.com.cn/", "User-Agent": self.user_agent}
            params = {"captcha_type": "4", "appid": "registernew", "random": get_random(), "callback": "PreHandle"}
            
            v = self._get_v()
            if v:
                self.session.cookies.set('v', v['v'])
                headers['hexin-v'] = v['v']
            
            response = self.session.get(url, headers=headers, params=params, timeout=15)
            logger.debug(f"getPreHandle响应: {response.status_code}")
            m = re.search(r'\((\{.*\})\)\s*;?\s*$', response.text, flags=re.S)
            payload = json.loads(m.group(1)) if m else None
            
            if not payload:
                logger.error("解析payload失败")
                return None
            
            data_obj = payload.get('data', {})
            url_params = data_obj.get('urlParams', '')
            imgs = data_obj.get('imgs', [])
            # 获取滑块初始位置（用于前端定位）
            init_x = data_obj.get('initx', 0)
            init_y = data_obj.get('inity', 0)
            if not url_params or len(imgs) < 2:
                logger.error(f"验证码参数不完整: urlParams={bool(url_params)}, imgs={len(imgs)}")
                return None
            
            p = parse_qs(url_params)
            sig, rand, ts = (p.get('signature') or [''])[0], (p.get('rand') or [''])[0], (p.get('time') or [''])[0]
            if not sig or not rand or not ts:
                return None
            
            # 下载图片并转base64
            img_b64 = []
            for iuk in imgs[:2]:
                img_url = "https://captcha.10jqka.com.cn/getImg"
                img_params = {"rand": rand, "time": ts, "appid": "registernew", "captcha_type": "4", "signature": sig, "iuk": iuk}
                resp = self.session.get(img_url, headers=headers, params=img_params, timeout=15)
                if resp.status_code != 200:
                    return None
                img_b64.append(base64.b64encode(resp.content).decode('ascii'))
            
            self.captcha_params = {"rand": rand, "time": ts, "signature": sig, "init_x": init_x, "init_y": init_y}
            self.captcha_images = {"background": img_b64[0], "slider": img_b64[1], "init_y": init_y}
            logger.debug("验证码数据获取成功")
            return {"params": self.captcha_params, "images": self.captcha_images}
        except Exception as e:
            logger.error(f"获取验证码数据失败: {e}")
            return None

    def _submit_captcha_with_position(self, x: int, track_width: int = 340) -> Optional[Tuple[str, str, str]]:
        """使用用户提供的x坐标提交验证码"""
        from loguru import logger
        
        if not self.captcha_params:
            logger.error("无验证码参数")
            return None
        
        try:
            headers = {"Accept": "*/*", "Referer": "https://upass.10jqka.com.cn/", "User-Agent": self.user_agent}
            v = self._get_v()
            if v:
                self.session.cookies.set('v', v['v'])
                headers['hexin-v'] = v['v']
            
            # 构造phrase - 根据官方JS代码分析
            # 官方: opt.width = 309, opt.height = 309/340*195
            # 官方: opt.scale = 309/340 (用于缩放坐标)
            # 前端轨道宽度动态传入，需要缩放到官方309
            init_y = self.captcha_params.get("init_y", 0)
            
            # 官方公式 - 使用动态track_width
            opt_width = 309.0
            opt_height = opt_width / 340.0 * 195.0  # = 177.22058823529412
            scale = opt_width / float(track_width)  # 动态计算缩放因子
            
            # x 需要缩放：从前端轨道宽度缩放到官方309
            x_scaled = x * scale
            # inity = API的inity / 195 * opt.height
            inity = init_y / 195.0 * opt_height
            
            # phrase格式: x;inity;309;opt_height
            phrase = f"{x_scaled};{inity};{opt_width};{opt_height}"
            logger.debug(f"提交验证: x={x}, x_scaled={x_scaled:.2f}, inity={inity:.2f}")
            
            ticket_params = {
                "rand": self.captcha_params["rand"],
                "time": self.captcha_params["time"],
                "appid": "registernew",
                "captcha_type": "4",
                "signature": self.captcha_params["signature"],
                "phrase": phrase,
                "callback": "verify"
            }
            
            resp = self.session.get("https://captcha.10jqka.com.cn/getTicket", headers=headers, params=ticket_params, timeout=15)
            logger.debug(f"getTicket响应: {resp.status_code}")
            m = re.search(r'\((\{.*\})\)\s*;?\s*$', resp.text, flags=re.S)
            if m:
                j = json.loads(m.group(1))
                ticket = j.get('ticket')
                if ticket:
                    logger.info("人工验证码验证成功")
                    return ticket, phrase, self.captcha_params["signature"]
            
            logger.warning(f"验证码验证失败, phrase={phrase}")
            return None
        except Exception as e:
            logger.error(f"提交验证码失败: {e}")
            return None

    def _risk_init_device_cookie(self) -> None:
        try:
            headers = {
                'Accept': '*/*',
                'Referer': 'https://upass.10jqka.com.cn/',
                'User-Agent': self.user_agent,
            }
            try:
                self.session.get(self.login_url, headers=headers, timeout=10)
            except Exception:
                pass

            resp = self.session.get('https://upass.10jqka.com.cn/common/getFingerprintRsaInfo?', headers=headers, timeout=10)
            pubkey = None
            try:
                j = resp.json()
                pubkey = j.get('pubkey') if isinstance(j, dict) else None
            except Exception:
                pubkey = None
            if not pubkey:
                return

            collections = execjs.compile(self.js_content).call('get_collections', pubkey)
            v = self._get_v()
            if v:
                self.session.cookies.set('v', v['v'])
                headers['hexin-v'] = v['v']

            data = {
                'pass_code': '',
                'user_id': 'null',
                'source_type': 'web',
                'collections': collections,
                'protocol': 'fingerprint_1',
            }
            r = self.session.post('https://hawkeye.10jqka.com.cn/v1/hawkeye/generate', headers=headers, data=data, timeout=15)
            try:
                jr = r.json()
            except Exception:
                return
            if (not isinstance(jr, dict)) or (not isinstance(jr.get('data'), dict)):
                return
            pass_code = jr['data'].get('pass_code')
            expires_time = jr['data'].get('expires_time')
            device_code = jr['data'].get('device_code')
            if not pass_code or not expires_time or not device_code:
                return

            v2 = self._get_v()
            if v2:
                self.session.cookies.set('v', v2['v'])
                headers['hexin-v'] = v2['v']

            data2 = {
                'u_dpass': pass_code,
                'u_did': device_code,
                'u_uver': '1.0.0',
                'expires_time': str(expires_time),
            }
            try:
                self.session.post('https://upass.10jqka.com.cn/common/setDeviceCookie', headers=headers, data=data2, timeout=15)
            except Exception:
                return
        except Exception:
            return

    def _send_sms_with_auto_captcha(self) -> bool:
        try:
            self.last_sms_send_error = None
            mobile_rsa = execjs.compile(self.js_content).call('rsa', self.mobile)
            headers = {
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Origin": "https://upass.10jqka.com.cn",
                "Referer": self.login_url,
                "User-Agent": self.user_agent,
                "X-Requested-With": "XMLHttpRequest"
            }
            v = self._get_v()
            if v:
                self.session.cookies.set('v', v['v'])
                headers['hexin-v'] = v['v']
            
            data = {
                "mobile": mobile_rsa,
                "rsa_version": "default_5",
                "country_code": "86",
                "request_type": "login",
                "source": "pc_web",
                "ttype": "WEB",
                "sdtis": "C22",
                "timestamp": str(int(time.time()))
            }
            
            resp = self.session.post("https://upass.10jqka.com.cn/smslogin/sendSms", headers=headers, data=data)
            try:
                result = resp.json()
            except Exception as e:
                self.last_sms_send_error = f"响应解析失败，请稍后重试"
                return False
            
            if result.get('errorcode') == -11400:
                # 需要滑块验证 - 根据配置决定验证模式
                captcha_mode = self._get_captcha_mode()
                ticket, phrase, signature = None, None, None
                
                if captcha_mode in ('combined', 'auto'):
                    # 组合模式或自动模式：先尝试自动识别
                    ticket, phrase, signature = self._auto_pass_captcha()
                
                if not ticket:
                    if captcha_mode == 'auto':
                        # 纯自动模式：自动识别失败则直接报错
                        self.last_sms_send_error = "滑块自动识别失败，请稍后重试"
                        return False
                    
                    # 组合模式或手动模式：获取验证码数据供人工验证
                    captcha_data = self._get_captcha_data()
                    if captcha_data:
                        self.captcha_required = True
                        self.pending_sms_data = data
                        self.pending_sms_headers = headers
                        self.last_sms_send_error = "需要人工验证滑块"
                    else:
                        self.last_sms_send_error = "滑块验证获取失败，请稍后重试"
                    return False
                
                data['captcha_type'] = '4'
                data['captcha_ticket'] = ticket
                data['captcha_phrase'] = phrase
                data['captcha_signature'] = signature
                
                v2 = self._get_v()
                if v2:
                    self.session.cookies.set('v', v2['v'])
                    headers['hexin-v'] = v2['v']
                
                resp = self.session.post("https://upass.10jqka.com.cn/smslogin/sendSms", headers=headers, data=data)
                try:
                    result = resp.json()
                except Exception as e:
                    self.last_sms_send_error = "响应解析失败，请稍后重试"
                    return False

            if result.get('errorcode') != 0:
                self.last_sms_send_error = result.get('errormsg') or f"发送失败(错误码: {result.get('errorcode')})"
                return False

            return True
        except Exception as e:
            self.last_sms_send_error = "发送验证码异常，请稍后重试"
            return False

    def _send_sms_with_manual_captcha(self, x: int, track_width: int = 340) -> bool:
        """使用人工验证的x坐标发送短信"""
        from loguru import logger
        
        if not self.pending_sms_data or not self.pending_sms_headers:
            self.last_sms_send_error = "无待处理的短信请求"
            return False
        
        try:
            result = self._submit_captcha_with_position(x, track_width)
            if not result:
                self.last_sms_send_error = "验证码验证失败"
                return False
            
            ticket, phrase, signature = result
            data = self.pending_sms_data.copy()
            headers = self.pending_sms_headers.copy()
            
            data['captcha_type'] = '4'
            data['captcha_ticket'] = ticket
            data['captcha_phrase'] = phrase
            data['captcha_signature'] = signature
            
            v2 = self._get_v()
            if v2:
                self.session.cookies.set('v', v2['v'])
                headers['hexin-v'] = v2['v']
            
            resp = self.session.post("https://upass.10jqka.com.cn/smslogin/sendSms", headers=headers, data=data)
            result = resp.json()
            
            # 重置状态
            self.captcha_required = False
            self.pending_sms_data = None
            self.pending_sms_headers = None
            
            if result.get('errorcode') != 0:
                self.last_sms_send_error = result.get('errormsg') or f"发送失败"
                return False
            
            logger.info("人工验证后短信发送成功")
            return True
        except Exception as e:
            logger.error(f"人工验证发送短信失败: {e}")
            self.last_sms_send_error = "发送验证码异常"
            return False

    def _check_sms_with_auto_captcha(self, sms_code: str) -> bool:
        try:
            mobile_rsa = execjs.compile(self.js_content).call('rsa', self.mobile)
            signcode_rsa = execjs.compile(self.js_content).call('rsa', sms_code)
            headers = {
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Origin": "https://upass.10jqka.com.cn",
                "Referer": self.login_url,
                "User-Agent": self.user_agent,
                "X-Requested-With": "XMLHttpRequest"
            }
            v = self._get_v()
            if v:
                self.session.cookies.set('v', v['v'])
                headers['hexin-v'] = v['v']

            data = {
                'mobile': mobile_rsa,
                'signcode': signcode_rsa,
                'rsa_version': 'default_5',
                'source': 'pc_web',
                'request_type': 'login',
                'country_code': '86',
                'longLogin': 'on',
            }

            resp = self.session.post("https://upass.10jqka.com.cn/smslogin/checkSms", headers=headers, data=data)
            result = resp.json()

            if result.get('errorcode') == -11400:
                ticket, phrase, signature = self._auto_pass_captcha()
                if not ticket:
                    return False

                data['captcha_type'] = '4'
                data['captcha_ticket'] = ticket
                data['captcha_phrase'] = phrase
                data['captcha_signature'] = signature

                v2 = self._get_v()
                if v2:
                    self.session.cookies.set('v', v2['v'])
                    headers['hexin-v'] = v2['v']

                resp = self.session.post("https://upass.10jqka.com.cn/smslogin/checkSms", headers=headers, data=data)
                result = resp.json()

            return result.get('errorcode') == 0
        except Exception:
            return False

    def _get_sms_code(self) -> str:
        if self.sms_code:
            return self.sms_code
        v = os.environ.get(self.sms_code_env_key)
        if v:
            return v.strip()
        return input('\n请输入短信验证码: ').strip()

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

    def _build_result(self, cookies_dict: Dict[str, str], user_info: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            'cookies': cookies_dict,
            'user_info': user_info
        }

    def _save_result(self, result: Dict[str, Any]) -> None:
        if not self.result_output_path:
            return
        try:
            output_path = Path(self.result_output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception:
            pass

    def start(self) -> Dict[str, Any]:
        try:
            if self.session.cookies:
                try:
                    self.session.cookies.clear()
                except Exception:
                    pass

            self._risk_init_device_cookie()

            sent = self._send_sms_with_auto_captcha()
            if not sent:
                raise GGError('短信发送失败：验证码自动识别失败或其他原因，请检查手机号/发送频率限制')

            sms_code = self._get_sms_code()
            checked = self._check_sms_with_auto_captcha(sms_code)
            if not checked:
                raise GGError('短信登录失败：验证码校验失败（可能需要滑块验证/验证码过期/频率限制）')

            cookies_dict = dict_from_cookiejar(self.session.cookies)
            if 'v' in cookies_dict:
                del cookies_dict['v']

            ok, user_info = self._validate_login(cookies_dict)
            if not ok:
                raise GGError('短信登录已校验成功，但校验登录态失败（simple_info 未通过）')

            result = self._build_result(cookies_dict, user_info)
            self._save_result(result)
            return result
        except GGError:
            raise
        except Exception as e:
            raise GGError(f'短信登录失败: {e!r}')
