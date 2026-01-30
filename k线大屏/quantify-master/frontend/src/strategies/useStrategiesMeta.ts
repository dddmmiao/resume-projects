import { useState, useEffect } from 'react';
import authFetch from '../utils/authFetch.ts';
import { type StrategyMeta, type StrategySupportedDataType, type ConditionMeta } from './meta.ts';

interface RemoteStrategyResponse {
  success?: boolean;
  data?: any;
  message?: string;
}

const mapEntityTypeToDataType = (entityType: string): StrategySupportedDataType | null => {
  if (!entityType) return null;
  switch (entityType) {
    case 'stock':
      return 'stock';
    case 'bond':
      return 'bond';
    case 'concept':
      return 'concept';
    case 'industry':
      return 'industry';
    default:
      return null;
  }
};

// 模块级缓存与共享请求，确保整个应用生命周期内最多只发一次 /api/strategies
let cachedStrategies: StrategyMeta[] | null = null;
let fetchPromise: Promise<StrategyMeta[]> | null = null;

const fetchStrategiesOnce = async (): Promise<StrategyMeta[]> => {
  // 已经有缓存，直接返回
  if (cachedStrategies) {
    return cachedStrategies;
  }

  // 已有进行中的请求，复用它
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      // 使用原生 fetch 避免触发全局 axios 拦截器的 message.error，
      // 在移动端首页加载时静默处理策略列表加载失败的情况
      const resp = await authFetch('/api/strategies');
      if (!resp.ok) {
        throw new Error(`获取策略列表失败: ${resp.status} ${resp.statusText}`);
      }
      const json: RemoteStrategyResponse = await resp.json();
      const rawList: any[] = Array.isArray(json?.data) ? (json.data as any[]) : [];

      const mapped = rawList
        .map((item: any): StrategyMeta | null => {
          const name: string = (item?.name || '').toString();
          if (!name) return null;

          const label: string = (item?.label || name).toString();
          const description: string = (item?.description || '').toString();
          const entityTypes: string[] = Array.isArray(item?.supported_entity_types)
            ? item.supported_entity_types
            : ['stock'];

          const supportedDataTypes = Array.from(
            new Set(
              entityTypes
                .map(mapEntityTypeToDataType)
                .filter((v): v is StrategySupportedDataType => Boolean(v))
            )
          );

          // 解析条件列表
          const rawConditions = item?.conditions || [];
          const conditions: ConditionMeta[] = rawConditions
            .map((cond: any): ConditionMeta | null => {
              if (!cond?.key) return null;
              const condSupportedTypes = (cond.supported_entity_types || [])
                .map(mapEntityTypeToDataType)
                .filter((v: StrategySupportedDataType | null): v is StrategySupportedDataType => Boolean(v));
              return {
                key: cond.key,
                label: cond.label || cond.key,
                description: cond.description || '',
                supportedDataTypes: condSupportedTypes,
                parameters: cond.parameters || {},
              };
            })
            .filter((c: ConditionMeta | null): c is ConditionMeta => c !== null);

          return {
            key: name,
            label,
            description,
            supportedDataTypes,
            conditions: conditions.length > 0 ? conditions : undefined,
          };
        })
        .filter((v): v is StrategyMeta => v !== null);

      cachedStrategies = mapped;
      return mapped;
    } catch (e) {
      // 接口不可用时，将缓存置为空数组，调用方看到的就是“无策略可用”
      cachedStrategies = [];
      return [];
    } finally {
      // 请求完成后清空 promise 引用，但保留缓存结果
      fetchPromise = null;
    }
  })();

  return fetchPromise;
};

export const useStrategiesMeta = () => {
  const [strategies, setStrategies] = useState<StrategyMeta[]>(cachedStrategies || []);
  const [loading, setLoading] = useState<boolean>(!cachedStrategies);

  useEffect(() => {
    let mounted = true;

    // 如果已有缓存，直接使用，不再发请求
    if (cachedStrategies) {
      setStrategies(cachedStrategies);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);

    fetchStrategiesOnce().then((result) => {
      if (!mounted) return;
      setStrategies(result);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return { strategies, loading } as const;
};
