"""
策略预设参数DAO
"""
from typing import List, Optional

from sqlmodel import Session, select

from app.models.management.strategy_preset import StrategyPreset
from app.models.base.database import engine


class StrategyPresetDAO:
    """策略预设参数DAO"""

    def create(self, preset: StrategyPreset) -> StrategyPreset:
        """创建策略预设"""
        with Session(engine) as session:
            session.add(preset)
            session.commit()
            session.refresh(preset)
            return preset

    def update(self, preset: StrategyPreset) -> StrategyPreset:
        """更新策略预设"""
        with Session(engine) as session:
            session.add(preset)
            session.commit()
            session.refresh(preset)
            return preset

    def delete_by_key(self, preset_key: str, user_id: str) -> bool:
        """根据preset_key删除策略预设"""
        with Session(engine) as session:
            preset = session.exec(
                select(StrategyPreset).where(
                    StrategyPreset.preset_key == preset_key,
                    StrategyPreset.user_id == user_id
                )
            ).first()
            if preset:
                session.delete(preset)
                session.commit()
                return True
            return False

    def rename_by_key(self, preset_key: str, new_name: str, user_id: str) -> bool:
        """根据preset_key重命名策略预设"""
        with Session(engine) as session:
            preset = session.exec(
                select(StrategyPreset).where(
                    StrategyPreset.preset_key == preset_key,
                    StrategyPreset.user_id == user_id
                )
            ).first()
            if preset:
                preset.name = new_name
                session.add(preset)
                session.commit()
                return True
            return False

    def update_params_by_key(self, preset_key: str, params_json: str, user_id: str) -> bool:
        """根据preset_key更新策略预设参数"""
        from datetime import datetime
        with Session(engine) as session:
            preset = session.exec(
                select(StrategyPreset).where(
                    StrategyPreset.preset_key == preset_key,
                    StrategyPreset.user_id == user_id
                )
            ).first()
            if preset:
                preset.params_json = params_json
                preset.updated_at = datetime.now()
                session.add(preset)
                session.commit()
                return True
            return False

    def get_by_key(self, preset_key: str, user_id: str) -> Optional[StrategyPreset]:
        """根据preset_key获取策略预设"""
        with Session(engine) as session:
            return session.exec(
                select(StrategyPreset).where(
                    StrategyPreset.preset_key == preset_key,
                    StrategyPreset.user_id == user_id
                )
            ).first()

    def exists_by_fields(
        self,
        user_id: str,
        strategy_name: str,
        entity_type: str,
        name: str,
    ) -> bool:
        """检查是否存在相同的预设（基于字段组合）"""
        with Session(engine) as session:
            preset = session.exec(
                select(StrategyPreset).where(
                    StrategyPreset.user_id == user_id,
                    StrategyPreset.strategy_name == strategy_name,
                    StrategyPreset.entity_type == entity_type,
                    StrategyPreset.name == name
                )
            ).first()
            return preset is not None

    def list_by_user(
        self,
        user_id: str,
        strategy_name: Optional[str] = None,
        entity_type: Optional[str] = None,
        period: Optional[str] = None,
    ) -> List[StrategyPreset]:
        """获取用户的策略预设列表"""
        with Session(engine) as session:
            query = select(StrategyPreset).where(StrategyPreset.user_id == user_id)
            
            if strategy_name:
                query = query.where(StrategyPreset.strategy_name == strategy_name)
            if entity_type:
                query = query.where(StrategyPreset.entity_type == entity_type)
            if period:
                query = query.where(StrategyPreset.period == period)
            
            query = query.order_by(StrategyPreset.updated_at.desc())
            return list(session.exec(query).all())

    def get_default(
        self,
        user_id: str,
        strategy_name: str,
        entity_type: str,
        period: str,
    ) -> Optional[StrategyPreset]:
        """获取默认预设"""
        with Session(engine) as session:
            return session.exec(
                select(StrategyPreset).where(
                    StrategyPreset.user_id == user_id,
                    StrategyPreset.strategy_name == strategy_name,
                    StrategyPreset.entity_type == entity_type,
                    StrategyPreset.period == period,
                    StrategyPreset.is_default == True
                )
            ).first()

    def clear_default(
        self,
        user_id: str,
        strategy_name: str,
        entity_type: str,
        period: str,
    ) -> None:
        """清除默认预设标记"""
        with Session(engine) as session:
            presets = session.exec(
                select(StrategyPreset).where(
                    StrategyPreset.user_id == user_id,
                    StrategyPreset.strategy_name == strategy_name,
                    StrategyPreset.entity_type == entity_type,
                    StrategyPreset.period == period,
                    StrategyPreset.is_default == True
                )
            ).all()
            for preset in presets:
                preset.is_default = False
                session.add(preset)
            session.commit()


strategy_preset_dao = StrategyPresetDAO()
