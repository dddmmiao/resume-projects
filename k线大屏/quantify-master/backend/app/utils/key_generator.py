"""
唯一标识生成工具
统一生成各类随机唯一标识
"""

import secrets


def generate_unique_key(length: int = 12) -> str:
    """
    生成随机唯一标识
    
    Args:
        length: 标识长度（十六进制字符数，必须为偶数）
        
    Returns:
        随机十六进制字符串
    """
    byte_length = length // 2
    return secrets.token_hex(byte_length)


def generate_preset_key() -> str:
    """生成策略预设唯一标识（12位）"""
    return generate_unique_key(12)


def generate_context_hash() -> str:
    """生成策略执行上下文哈希（12位）"""
    return generate_unique_key(12)
