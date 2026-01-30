/**
 * Chart color utilities for consistent color schemes across the application
 */

/**
 * 涨跌幅分布颜色渐变 - 从深绿到浅绿到灰到浅红到深红
 * 对应区间: <=-10, -10~-7, -7~-5, -5~-3, -3~0, =0, 0~3, 3~5, 5~7, 7~10, >=10
 */
export const getPctChangeColors = (isDarkTheme: boolean = false) => {
  return {
    // 负收益区间：从深到浅的绿
    negative: [
      '#1a5f1a', // 0: <=-10 大跌 最深绿
      '#2d7d2d', // 1: -10~-7 中等深绿
      '#4a9d4a', // 2: -7~-5 中等绿
      '#67be67', // 3: -5~-3 浅绿
      '#85df85', // 4: -3~0 最浅绿
    ],
    // 平盘区间：灰色
    neutral: isDarkTheme ? '#8c8c8c' : '#bfbfbf', // 5: =0 平盘
    // 正收益区间：从浅到深的红
    positive: [
      '#ffe6e6', // 6: 0~3 最浅红
      '#ffcccc', // 7: 3~5 浅红
      '#ffb3b3', // 8: 5~7 中等红
      '#ff9999', // 9: 7~10 深红
      '#ff6666', // 10: >=10 最深红
    ],
  };
};

/**
 * 获取涨跌幅分布的完整颜色数组
 */
export const getPctChangeColorArray = (isDarkTheme: boolean = false) => {
  const colors = getPctChangeColors(isDarkTheme);
  return [
    ...colors.negative,
    colors.neutral,
    ...colors.positive,
  ];
};

/**
 * 简化的涨跌颜色映射（用于进度条等简单场景）
 */
export const getSimpleGainLossColors = () => {
  return {
    gain: '#ff4d4f',    // 红涨
    loss: '#52c41a',    // 绿跌
    neutral: '#8c8c8c', // 灰平
  };
};
