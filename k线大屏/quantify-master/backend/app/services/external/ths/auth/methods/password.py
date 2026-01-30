import json
import re
import time
from pathlib import Path
from typing import Dict, Any
from urllib.parse import parse_qs

import execjs
import requests
from ddddocr import DdddOcr
from requests.utils import dict_from_cookiejar

from ..login_utils import GGError, sha256, str_md5, hamc_256, get_crnd, get_timestamp, get_random


class TongHuaShunLogin:
    headers = {
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Pragma": "no-cache",
        "Referer": "https://upass.10jqka.com.cn/",
        "Sec-Fetch-Dest": "script",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-site",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\""
    }

    def __init__(self, user: str, password: str):
        self.user = user
        self.password = password
        self.session = requests.Session()
        
        base_dir = Path(__file__).resolve().parent.parent
        js_dir = base_dir / 'js'
        with open(js_dir / '加密.js', 'r', encoding='utf-8') as f:
            self.js_content = f.read()
        with open(js_dir / 'v_new.js', 'r', encoding='utf-8') as f:
            self.hexin_v = f.read()
        with open(js_dir / 'encrypt.js', 'r', encoding='utf-8') as f:
            self.encrypt = f.read()
        with open(js_dir / 'passwd_check.js', 'r', encoding='utf-8') as f:
            self.passwd_check = f.read()
        self.dct = DdddOcr(det=False, ocr=False, show_ad=False)

    def get_pubkey(self) -> str:
        url = "https://upass.10jqka.com.cn/common/getFingerprintRsaInfo?"
        response = self.session.get(url, headers=self.headers)
        return response.json()['pubkey']

    def generate(self) -> Dict[str, Any]:
        collections = execjs.compile(self.js_content).call('get_collections', self.get_pubkey())
        url = "https://hawkeye.10jqka.com.cn/v1/hawkeye/generate"
        data = {
            "pass_code": "",
            "user_id": "null",
            "source_type": "web",
            "collections": collections,
            "protocol": "fingerprint_1"
        }
        response = self.session.post(url, headers=self.headers, cookies=self.get_v(), data=data)
        return response.json()

    def set_device_cookie(self) -> Dict[str, str]:
        msg = self.generate()
        pass_code = msg['data']['pass_code']
        expires_time = msg['data']['expires_time']
        device_code = msg['data']['device_code']
        
        url = "https://upass.10jqka.com.cn/common/setDeviceCookie"
        data = {
            "u_dpass": pass_code,
            "u_did": device_code,
            "u_uver": "1.0.0",
            "expires_time": expires_time
        }
        v = self.get_v()
        self.session.cookies.set('v', v['v'])
        self.headers.update({'hexin-v': v['v']})
        response = self.session.post(url, headers=self.headers, data=data)
        return dict_from_cookiejar(response.cookies)

    def get_pre_handle(self):
        url = "https://captcha.10jqka.com.cn/getPreHandle"
        params = {
            "captcha_type": "4",
            "appid": "registernew",
            "random": get_random(),
            "callback": "PreHandle"
        }
        response = self.session.get(url, headers=self.headers, cookies=self.get_v(), params=params)
        
        payload = None
        try:
            m = re.search(r'\((\{.*\})\)\s*;?\s*$', response.text, flags=re.S)
            if m:
                payload = json.loads(m.group(1))
        except Exception:
            pass
        
        if not payload:
            url_params = ''.join(re.findall(r'urlParams":"(.*?)"', response.text))
            imgs = ''.join(re.findall(r'"imgs":(.*?),"initx', response.text))
            params_dict = parse_qs(url_params)
            return params_dict, imgs
        
        data_obj = payload.get('data', {})
        url_params = data_obj.get('urlParams', '')
        imgs = data_obj.get('imgs', [])
        params_dict = parse_qs(url_params)
        return params_dict, imgs

    def ddd_img(self, params, imgs):
        headers = {
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Pragma": "no-cache",
            "Referer": "https://upass.10jqka.com.cn/",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\""
        }
        
        img_list = imgs if isinstance(imgs, list) else eval(imgs)
        for index, img in enumerate(img_list):
            url = "https://captcha.10jqka.com.cn/getImg"
            img_params = {
                "rand": ''.join(params['rand']),
                "time": ''.join(params['time']),
                "appid": "registernew",
                "captcha_type": "4",
                "signature": ''.join(params['signature']),
                "iuk": img
            }
            response = self.session.get(url, headers=headers, params=img_params)
            img_list[index] = response.content
        
        res = self.dct.slide_match(img_list[1], img_list[0], simple_target=True)
        return res['target']

    def get_ticket(self, p, x, y):
        url = "https://captcha.10jqka.com.cn/getTicket"
        y = y / 195 * 177.22058823529412
        phrase = f"{int(x * 0.908)};{y};309;177.22058823529412"
        params = {
            "rand": ''.join(p['rand']),
            "time": ''.join(p['time']),
            "appid": "registernew",
            "captcha_type": "4",
            "signature": ''.join(p['signature']),
            "phrase": phrase,
            "callback": "verify"
        }
        v = self.get_v()
        self.session.cookies.set('v', v['v'])
        self.headers.update({'hexin-v': v['v']})

        response = self.session.get(url, headers=self.headers, params=params)
        ticket = ''.join(re.findall(r'"ticket":"(.*?)"', response.text))
        if ticket:
            return ticket, phrase
        return None, None

    def get_gs(self, crnd=None):
        url = "https://upass.10jqka.com.cn/user/getGS"
        uname = execjs.compile(self.encrypt).call('rsa', self.user)
        crnd = get_crnd() if not crnd else crnd
        data = {
            "uname": uname,
            "rsa_version": "default_4",
            "crnd": crnd
        }
        v = self.get_v()
        self.session.cookies.set('v', v['v'])
        self.headers.update({'hexin-v': v['v']})
        response = self.session.post(url, headers=self.headers, data=data)
        return response.json(), crnd

    def get_passwd_salt(self, gs, crnd):
        dsv, ssv, dsk = gs['dsv'], gs['ssv'], gs['dsk']
        crnd_dsk_sha256 = sha256(crnd + dsk)
        n = execjs.compile(self.encrypt).call('get_passwdSalt', ssv, crnd_dsk_sha256)
        hamc_result = hamc_256(n, str_md5(self.password))
        dsv_sha256 = sha256(dsv)
        result = execjs.compile(self.encrypt).call('get_passwdSalt2', hamc_result, dsv_sha256)
        return result

    def get_v(self):
        return {'v': execjs.compile(self.hexin_v).call('get_v')}

    def start(self) -> Dict[str, str]:
        if self.session.cookies:
            self.session.cookies.clear()
        
        self.set_device_cookie()
        upwd_score = execjs.compile(self.passwd_check).call('calculatePasswordScore', self.password)
        gs, crnd = self.get_gs()
        v1 = self.get_v()
        self.session.cookies.set('v', v1['v'])
        self.headers.update({'hexin-v': v1['v']})
        
        data = {
            "uname": execjs.compile(self.encrypt).call('rsa', self.user),
            "passwd": execjs.compile(self.encrypt).call('rsa', str_md5(self.password)),
            "saltLoginTimes": "1",
            "longLogin": "on",
            "rsa_version": "default_4",
            "source": "pc_web",
            "request_type": "login",
            "captcha_type": "4",
            "upwd_score": upwd_score,
            "ignore_upwd_score": "",
            "passwdSalt": self.get_passwd_salt(gs=gs, crnd=crnd),
            "dsk": gs['dsk'],
            "crnd": crnd,
            "ttype": "WEB",
            "sdtis": "C22",
            "timestamp": get_timestamp()
        }
        
        response = self.session.post("https://upass.10jqka.com.cn/login/dologinreturnjson2", 
                                     headers=self.headers, data=data)
        
        if response.json()['errorcode'] != -11400:
            raise GGError(f'第一次未带验证码校验出现未知情况>>{response.json()}')
        
        gs, crnd = self.get_gs(crnd=crnd)
        while True:
            params, imgs = self.get_pre_handle()
            target = self.ddd_img(params, imgs)
            time.sleep(2)
            ticket, phrase = self.get_ticket(params, target[0], target[1])
            if ticket:
                break
        
        v2 = self.get_v()
        self.session.cookies.set('v', v2['v'])
        self.headers.update({'hexin-v': v2['v']})
        
        data = {
            "uname": execjs.compile(self.encrypt).call('rsa', self.user),
            "passwd": execjs.compile(self.encrypt).call('rsa', str_md5(self.password)),
            "saltLoginTimes": "1",
            "longLogin": "on",
            "rsa_version": "default_4",
            "source": "pc_web",
            "request_type": "login",
            "captcha_type": "4",
            "captcha_phrase": phrase,
            "captcha_ticket": ticket,
            "captcha_signature": ''.join(params['signature']),
            "upwd_score": upwd_score,
            "ignore_upwd_score": "",
            "passwdSalt": self.get_passwd_salt(gs=gs, crnd=crnd),
            "dsk": gs['dsk'],
            "crnd": crnd,
            "ttype": "WEB",
            "sdtis": "C22",
            "timestamp": get_timestamp()
        }
        
        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://upass.10jqka.com.cn",
            "Pragma": "no-cache",
            "Referer": "https://upass.10jqka.com.cn/login?redir=HTTP_REFERER",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
            "hexin-v": v2['v'],
            "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\""
        }
        
        response = self.session.post("https://upass.10jqka.com.cn/login/dologinreturnjson2", 
                                     headers=headers, data=data)
        
        result = response.json()
        if result['errorcode'] == -10510:
            raise GGError('需要手机验证码')
        elif result['errorcode'] == -11032 and result.get('dsk'):
            raise GGError('登录状态异常，请稍后重试')
        elif result['errorcode'] == -11043:
            raise GGError('暂不支持手机号/邮箱+密码登录，请使用其他登录方式')
        elif result['errorcode'] == 0 and result['errormsg'] == '成功':
            cookies = self.session.cookies
            if cookies.get('v'):
                del cookies['v']
            return dict_from_cookiejar(cookies)
        else:
            # 返回 API 的 errormsg，如果没有则返回 errorcode
            errormsg = result.get('errormsg', f'登录失败(错误码: {result.get("errorcode")})')
            raise GGError(errormsg)
