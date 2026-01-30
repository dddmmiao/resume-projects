/**
 * 工具函数模块索引
 */

// 导入工具函数
import * as textUtils from './text';
import * as injectStyleUtils from './injectStyle';

// 导出现有工具函数
export * from './text';
export * from './injectStyle';
export * from './indicators';
export * from './chartConfig';
export * from './chartEvents';

/**
 * 工具函数集合
 */
export const utils = {
  text: textUtils,
  injectStyle: injectStyleUtils
};
