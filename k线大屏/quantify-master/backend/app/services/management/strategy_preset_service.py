"""
策略预设参数服务
"""
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger

from app.dao.strategy_preset_dao import strategy_preset_dao
from app.models.management.strategy_preset import StrategyPreset, generate_preset_key


class StrategyPresetService:
    """策略预设参数服务"""

    def save_preset(
        self,
        user_id: str,
        name: str,
        strategy_name: str,
        entity_type: str,
        period: str,
        params: Dict[str, Any],
        is_default: bool = False,
    ) -> StrategyPreset:
        """保存策略预设"""
        # 预设名称校验
        name = name.strip()
        if not name:
            raise ValueError("预设名称不能为空")
        if len(name) < 2:
            raise ValueError("预设名称至少2个字符")
        if len(name) > 50:
            raise ValueError("预设名称不能超过50个字符")
        
        params_json = json.dumps(params, ensure_ascii=False)
        
        # 检查是否已存在相同的预设（相同用户+策略+标的类型+名称）
        if strategy_preset_dao.exists_by_fields(user_id, strategy_name, entity_type, name):
            raise ValueError(f"预设名称 '{name}' 已存在")
        
        # 生成随机preset_key
        preset_key = generate_preset_key()
        
        # 创建新预设
        if is_default:
            strategy_preset_dao.clear_default(user_id, strategy_name, entity_type, period)
        
        preset = StrategyPreset(
            user_id=user_id,
            preset_key=preset_key,
            name=name,
            strategy_name=strategy_name,
            entity_type=entity_type,
            period=period,
            params_json=params_json,
            is_default=is_default,
        )
        return strategy_preset_dao.create(preset)

    def list_presets(
        self,
        user_id: str,
        strategy_name: Optional[str] = None,
        entity_type: Optional[str] = None,
        period: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取用户的策略预设列表"""
        presets = strategy_preset_dao.list_by_user(
            user_id=user_id,
            strategy_name=strategy_name,
            entity_type=entity_type,
            period=period,
        )
        
        result = []
        for preset in presets:
            try:
                params = json.loads(preset.params_json)
            except json.JSONDecodeError:
                params = {}
            
            # 精简返回字段，使用preset_key代替id
            result.append({
                "key": preset.preset_key,
                "name": preset.name,
                "strategy_name": preset.strategy_name,
                "params": params,
                "is_default": preset.is_default,
                "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
            })
        
        return result

    def get_preset(self, preset_key: str, user_id: str) -> Optional[Dict[str, Any]]:
        """获取单个策略预设"""
        preset = strategy_preset_dao.get_by_key(preset_key, user_id)
        if not preset:
            return None
        
        try:
            params = json.loads(preset.params_json)
        except json.JSONDecodeError:
            params = {}
        
        return {
            "key": preset.preset_key,
            "name": preset.name,
            "strategy_name": preset.strategy_name,
            "params": params,
            "is_default": preset.is_default,
            "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
        }

    def delete_preset(self, preset_key: str, user_id: str) -> bool:
        """删除策略预设"""
        return strategy_preset_dao.delete_by_key(preset_key, user_id)

    def rename_preset(self, preset_key: str, new_name: str, user_id: str) -> bool:
        """重命名策略预设"""
        return strategy_preset_dao.rename_by_key(preset_key, new_name, user_id)

    def update_preset(self, preset_key: str, params: Dict[str, Any], user_id: str) -> bool:
        """更新策略预设参数"""
        params_json = json.dumps(params, ensure_ascii=False)
        return strategy_preset_dao.update_params_by_key(preset_key, params_json, user_id)

    def get_default_preset(
        self,
        user_id: str,
        strategy_name: str,
        entity_type: str,
        period: str,
    ) -> Optional[Dict[str, Any]]:
        """获取默认预设"""
        preset = strategy_preset_dao.get_default(
            user_id=user_id,
            strategy_name=strategy_name,
            entity_type=entity_type,
            period=period,
        )
        if not preset:
            return None
        
        try:
            params = json.loads(preset.params_json)
        except json.JSONDecodeError:
            params = {}
        
        return {
            "key": preset.preset_key,
            "name": preset.name,
            "params": params,
            "is_default": preset.is_default,
        }

    def set_default(self, preset_key: str, user_id: str) -> bool:
        """设置默认预设"""
        preset = strategy_preset_dao.get_by_key(preset_key, user_id)
        if not preset:
            return False
        
        # 清除其他默认
        strategy_preset_dao.clear_default(
            user_id=user_id,
            strategy_name=preset.strategy_name,
            entity_type=preset.entity_type,
            period=preset.period,
        )
        
        # 设置当前为默认
        preset.is_default = True
        preset.updated_at = datetime.now()
        strategy_preset_dao.update(preset)
        return True


strategy_preset_service = StrategyPresetService()
