export type StrategySupportedDataType = 'stock' | 'bond' | 'concept' | 'industry';

// 条件元数据
export interface ConditionMeta {
  key: string;                              // 条件唯一标识
  label: string;                            // 显示名称
  description: string;                      // 描述
  supportedDataTypes: StrategySupportedDataType[];  // 支持的标的类型
  parameters?: Record<string, any>;         // 参数定义
}

export interface StrategyMeta {
  key: string;
  label: string;
  description: string;
  supportedDataTypes: StrategySupportedDataType[];
  conditions?: ConditionMeta[];  // 策略引用的条件列表
}
