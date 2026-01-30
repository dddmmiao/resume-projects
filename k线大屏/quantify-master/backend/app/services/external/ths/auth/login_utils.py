import hashlib
import hmac
import os
import random
import time
from pathlib import Path
from typing import Optional


def load_env_file(file_path: str, override: bool = False) -> None:
    try:
        content = Path(file_path).read_text(encoding='utf-8')
    except Exception:
        return
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith('#'):
            continue
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if (not override) and (key in os.environ) and (str(os.environ.get(key, '')).strip() != ''):
            continue
        if (len(value) >= 2) and ((value[0] == value[-1]) and value[0] in ('"', "'")):
            value = value[1:-1]
        os.environ[key] = value


def load_default_env() -> None:
    base_dir = Path(__file__).resolve().parent.parent
    config_dir = base_dir / 'config'
    
    env_file = os.environ.get('ENV_FILE')
    if env_file:
        p = Path(env_file)
        if (not p.is_absolute()) and (base_dir / p).exists():
            p = base_dir / p
        load_env_file(str(p), override=False)
        return

    for candidate in (Path('.env'), base_dir / '.env', config_dir / '.env'):
        if candidate.exists():
            load_env_file(str(candidate), override=False)

    env_name = os.environ.get('APP_ENV', 'development')
    env_specific_name = f'.env.{env_name}'
    for candidate in (Path(env_specific_name), base_dir / env_specific_name, config_dir / env_specific_name):
        if candidate.exists():
            load_env_file(str(candidate), override=False)


def env_bool(key: str, default: Optional[bool] = None) -> Optional[bool]:
    v = os.environ.get(key)
    if v is None:
        return default
    s = v.strip().lower()
    if s in ('1', 'true', 'yes', 'y', 'on'):
        return True
    if s in ('0', 'false', 'no', 'n', 'off'):
        return False
    return default


class GGError(Exception):
    pass


def sha256(string: str) -> str:
    sha256_hash = hashlib.sha256()
    sha256_hash.update(string.encode('utf-8'))
    return sha256_hash.hexdigest()


def str_md5(target: str) -> str:
    obj = hashlib.md5()
    obj.update(target.encode("utf-8"))
    return obj.hexdigest()


def hamc_256(key: str, message: str) -> str:
    key_bytes = key.encode('utf-8')
    message_bytes = message.encode('utf-8')
    hmac_sha256 = hmac.new(key_bytes, message_bytes, hashlib.sha256)
    return hmac_sha256.hexdigest()


def get_crnd() -> str:
    return ''.join(random.choices('0123456789abcdefghijklmnopqrstuvwxyz', k=8)) + ''.join(
        random.choices('0123456789abcdefghijklmnopqrstuvwxyz', k=8))


def get_timestamp() -> int:
    return int(time.time())


def get_random() -> float:
    current_time = time.time() * 1000
    random_value = random.random()
    return random_value * current_time


load_default_env()
