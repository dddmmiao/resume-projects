// ==UserScript==
// @name         周报助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  周报助手 - 自动收集日报内容，智能汇总生成周报，支持AI润色和流式输出
// @author       lvhaifeng
// @match        https://your-devops-platform.com/devops/daily/
// @match        http://your-devops-platform.com/devops/daily/
// @require      https://gcore.jsdelivr.net/npm/notyf@3/notyf.min.js
// @resource     NOTYF_CSS    https://gcore.jsdelivr.net/npm/notyf@3/notyf.min.css
// @grant        GM_addStyle
// @grant        GM_getResourceText
// ==/UserScript==

/**
 * 周报助手 - 智能周报生成工具
 * 
 * 功能特性：
 * - 自动采集：从日报页面自动获取本周每日的工作内容
 * - 智能汇总：支持AI汇总日报内容，按任务合并去重
 * - 流式输出：支持流式响应，实时显示汇总进度（打字机效果）
 * - Thinking模式：可视化展示AI的思考过程
 * - 灵活配置：可自定义API地址、密钥、模型和提示词
 * - 工作项同步：自动复制工作项到周报
 * 
 * 使用说明：
 * 1. 安装Tampermonkey插件后，创建新脚本并粘贴此代码
 * 2. 访问日报页面，点击"我的周报"标签
 * 3. 点击编辑按钮后，会出现"填充"、"AI汇总"、"AI配置"按钮
 * 4. 点击"填充"开始自动收集日报并生成周报
 * 
 * 技术实现：
 * - 使用智谱AI API（glm-4.5-Flash模型）进行内容汇总
 * - 支持Server-Sent Events (SSE)流式响应
 * - 使用localStorage存储用户配置
 * - 集成Notyf库提供友好的通知提示
 * 
 * 第三方依赖：
 * - Notyf - 轻量级通知库
 */

(function() {
    'use strict';
    
    // 等待日报页面加载完成后初始化
    waitForKeyElements('.daily-calendar', init);
    
    // 加载Notyf通知库样式
    const notyf_css = GM_getResourceText("NOTYF_CSS");
    GM_addStyle(notyf_css);
})();

/**
 * 初始化函数
 * 绑定"我的周报"标签的点击事件，并初始化Notyf通知实例
 */
function init() {
    const tabsParent = document.querySelector('.ant-tabs-nav.ant-tabs-nav-animated');
    if (!tabsParent) return;
    
    const tabs = tabsParent.children[0].childNodes;
    if (tabs) {
        tabs.forEach((tab, index) => {
            if (tab.innerText === '我的周报') {
                tab.addEventListener('click', function() {
                    // 当点击"我的周报"标签时，等待周报行加载完成后添加填充按钮
                    waitForKeyElements('.weekly-line.ant-fullcalendar-selected-week.has-daily', addFillButtonEvent);
                });
            }
        });
    }
    
    // 初始化Notyf通知实例
    window.notyf = new Notyf({
        duration: 2500,      // 通知显示时长（毫秒）
        position: {
            x: 'right',      // 水平位置：右侧
            y: 'top',        // 垂直位置：顶部
        },
        ripple: false        // 禁用波纹动画效果
    });
}

/**
 * 为周报行添加点击事件
 * 当点击周报行时，等待编辑按钮加载完成后添加填充按钮
 */
function addFillButtonEvent() {
    const weeklyLine = document.querySelector('.weekly-line.ant-fullcalendar-selected-week.has-daily');
    if (!weeklyLine) return;
    
    weeklyLine.addEventListener('click', function() {
        waitForKeyElements('[aria-label="图标: bulb"]', addFillButton);
    });
    addFillButton();
}

/**
 * 添加填充按钮和AI相关按钮
 * 在编辑按钮旁边添加"填充"、"AI汇总"开关和"AI配置"按钮
 */
function addFillButton() {
    const tabPanels = document.querySelectorAll('.ant-tabs-content.ant-tabs-content-no-animated.ant-tabs-top-content.ant-tabs-card-content');
    if (!tabPanels || tabPanels.length < 2) return;
    
    const editLink = tabPanels[1].children[0]?.children[1]?.children[0]?.children[0]?.children[0]?.children[0];
    if (!editLink) return;
    
    // 为编辑按钮添加点击事件监听器
    editLink.addEventListener('click', function() {
        // 检查是否已经存在"填充"按钮，避免重复添加
        const existingFillButton = editLink.nextSibling;
        if (existingFillButton && existingFillButton.textContent === '填充') {
            return;
        }

        // 创建填充按钮 - 用于触发日报收集和周报生成
        const fillButton = document.createElement('a');
        fillButton.textContent = '填充';
        fillButton.style.cssText = editLink.style.cssText;
        editLink.parentNode.insertBefore(fillButton, editLink.nextSibling);
        fillButton.addEventListener('click', function() {
            fetchReports();
        });

            // 创建AI汇总开关按钮
            const aiToggleButton = document.createElement('a');
            aiToggleButton.textContent = AI_SUMMARY_CONFIG.enabled ? 'AI汇总: 开' : 'AI汇总: 关';
            aiToggleButton.style.cssText = editLink.style.cssText;
            aiToggleButton.style.marginLeft = '10px';
            aiToggleButton.style.color = AI_SUMMARY_CONFIG.enabled ? '#52c41a' : '#ff4d4f';
            editLink.parentNode.insertBefore(aiToggleButton, fillButton.nextSibling);

            aiToggleButton.addEventListener('click', function() {
                AI_SUMMARY_CONFIG.enabled = !AI_SUMMARY_CONFIG.enabled;
                aiToggleButton.textContent = AI_SUMMARY_CONFIG.enabled ? 'AI汇总: 开' : 'AI汇总: 关';
                aiToggleButton.style.color = AI_SUMMARY_CONFIG.enabled ? '#52c41a' : '#ff4d4f';
                saveAIConfig();

                const message = AI_SUMMARY_CONFIG.enabled ? '已开启AI汇总' : '已关闭AI汇总';
                window.notyf.success(message);

                // 根据AI汇总状态显示/隐藏AI配置按钮
                if (aiConfigButton) {
                    aiConfigButton.style.display = AI_SUMMARY_CONFIG.enabled ? 'inline' : 'none';
                }
            });

            // 创建AI配置按钮
            const aiConfigButton = document.createElement('a');
            aiConfigButton.textContent = 'AI配置';
            aiConfigButton.style.cssText = editLink.style.cssText;
            aiConfigButton.style.marginLeft = '10px';
            aiConfigButton.style.color = '#1890ff';
            aiConfigButton.style.display = AI_SUMMARY_CONFIG.enabled ? 'inline' : 'none'; // 根据AI汇总状态控制显示
            editLink.parentNode.insertBefore(aiConfigButton, aiToggleButton.nextSibling);

        // 创建AI配置按钮点击事件
        aiConfigButton.addEventListener('click', function() {
            showAIConfigModal();
        });
    });
}

// ==================== API请求函数 ====================

/**
 * 获取当前周报ID
 * @param {number} userId - 用户ID
 * @param {string} token - 认证令牌
 * @returns {Promise<number|null>} 周报ID或null
 */
async function getCurrentWeeklyReportId(userId, token) {
    const today = new Date();
    const year = today.getFullYear();
    const weekNumber = getWeekNumber(today);
    const label = `${year}年第${weekNumber}周`;

    const url = `/api/reports/list/?label=${encodeURIComponent(label)}&user_id=${userId}&type=weekly`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`
    };

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });
        const data = await response.json();
        if (data.code === 200 && data.data.length > 0) {
            return data.data[0].id;
        }
    } catch (error) {
        console.error('获取周报ID失败:', error);
        return null;
    }
}

/**
 * 获取周报关联的任务数据
 * @param {number} reportId - 周报ID
 * @param {string} token - 认证令牌
 * @returns {Promise<Object|null>} 任务数据对象或null
 */
async function getWeeklyReportIssues(reportId, token) {
    const url = `/api/reports/${reportId}/issues/`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`
    };

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });
        const data = await response.json();
        if (data.code === 200) {
            return data.data;
        }
    } catch (error) {
        console.error('获取周报任务数据失败:', error);
        return null;
    }
}

/**
 * 复制任务到周报
 * @param {number} reportId - 周报ID
 * @param {Array<number>} issueIds - 任务ID数组
 * @param {string} token - 认证令牌
 * @returns {Promise<boolean>} 是否成功
 */
async function copyIssuesToReport(reportId, issueIds, token) {
    const url = `/api/reports/${reportId}/copy-issues/`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                issues: issueIds
            })
        });
        const data = await response.json();
        return data.code === 200;
    } catch (error) {
        console.error('复制任务到周报失败:', error);
        return false;
    }
}

/**
 * 更新周报内容
 * @param {number} reportId - 周报ID
 * @param {string} content - HTML格式的周报内容
 * @param {string} token - 认证令牌
 * @returns {Promise<boolean>} 是否成功
 */
async function updateWeeklyReport(reportId, content, token) {
    const url = `/api/reports/${reportId}/`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`
    };

    try {
        const response = await fetch(url, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({
                content: content,
                issues: []
            })
        });
        const data = await response.json();
        return data.code === 200;
    } catch (error) {
        console.error('更新周报内容失败:', error);
        return false;
    }
}

// ==================== 工具函数 ====================

/**
 * 获取指定日期所在的周数
 * @param {Date} date - 日期对象
 * @returns {string} 两位数的周数字符串（如"05"、"12"）
 */
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    // 关键：补零处理，确保返回两位数（如 5 → "05"，12 → "12"）
    return weekNumber.toString().padStart(2, '0');
}

/**
 * 点击周报行刷新显示
 * 用于在更新周报内容后刷新页面显示
 */
function clickWeeklyLine() {
    try {
        // 查找周报行元素
        const weeklyLine = document.querySelector('.weekly-line.ant-fullcalendar-selected-week');
        if (weeklyLine) {
            // 直接点击
            weeklyLine.click();
        }
    } catch (error) {
        // 忽略点击错误
    }
}

// ==================== AI汇总配置 ====================

/**
 * AI汇总配置对象
 * 包含所有AI汇总相关的配置项
 */
let AI_SUMMARY_CONFIG = {
    enabled: true, // 开关：true使用AI汇总，false使用简单汇总
    useStream: true, // 是否使用流式响应：true使用流式响应（打字机效果），false使用普通响应
    useThinking: true, // 是否启用thinking模式
    apiUrl: "https://your-ai-api-endpoint.com/v1/chat/completions",
    apiKey: "",
    model: "glm-4.5-Flash",
    systemPrompt: "将日报汇总为周报。规则：1.保留所有内容，不省略；2.使用原HTML格式；3.返回纯HTML，不用Markdown；4.按任务合并同标题内容；5.相同任务去重，只保留最新进度；6.直接输出HTML，无说明文字；7.按任务合并，不按日期拼接，不包含日期；8.思考时不要反复调整结果，调整次数不要超过3次，不要陷入修改循环；9.去除不必要的空格和空行；"
};

/**
 * 从本地存储加载AI配置
 * 如果本地存储中有保存的配置，则合并到默认配置中
 */
function loadAIConfig() {
    const saved = localStorage.getItem('ai_summary_config');
    if (saved) {
        AI_SUMMARY_CONFIG = { ...AI_SUMMARY_CONFIG, ...JSON.parse(saved) };
    }
}

/**
 * 保存AI配置到本地存储
 */
function saveAIConfig() {
    localStorage.setItem('ai_summary_config', JSON.stringify(AI_SUMMARY_CONFIG));
}

// 脚本加载时自动加载用户保存的AI配置
loadAIConfig();

// ==================== AI配置弹窗 ====================

/**
 * 创建AI配置弹窗DOM元素
 * 包含流式响应、Thinking模式、API地址、密钥、模型和系统提示词的配置项
 * @returns {HTMLElement} 弹窗元素
 */
function createAIConfigModal() {
    // 创建弹窗HTML
    const modalHTML = `
        <div id="aiConfigModal" style="
            display: none;
            position: fixed;
            z-index: 10000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
            <div style="
                background-color: white;
                margin: 5% auto;
                padding: 20px;
                border-radius: 8px;
                width: 80%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 15px;
                ">
                    <h2 style="margin: 0; color: #333; font-size: 18px;">AI汇总配置</h2>
                    <button id="closeAIConfigModal" style="
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #999;
                        padding: 0;
                        width: 30px;
                        height: 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">×</button>
                </div>

                <form id="aiConfigForm">
                    <!-- 开关配置区域 -->
                    <div style="
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 15px;
                        margin-bottom: 20px;
                        padding: 15px;
                        background: #f8f9fa;
                        border-radius: 6px;
                    ">
                        <label style="display: flex; align-items: center; font-weight: 500; color: #333;">
                            <input type="checkbox" id="useStream" ${AI_SUMMARY_CONFIG.useStream ? 'checked' : ''} style="margin-right: 8px;">
                            流式响应
                        </label>
                        <label style="display: flex; align-items: center; font-weight: 500; color: #333;">
                            <input type="checkbox" id="useThinking" ${AI_SUMMARY_CONFIG.useThinking ? 'checked' : ''} style="margin-right: 8px;">
                            Thinking模式
                        </label>
                    </div>

                    <!-- API配置区域 -->
                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; margin-bottom: 8px; font-weight: 500; color: #333;">
                            API地址
                            <a href="https://your-ai-api-docs.com/api/introduction" target="_blank" style="
                                margin-left: 8px;
                                color: #1890ff;
                                text-decoration: none;
                                font-size: 16px;
                                font-weight: bold;
                            " title="查看API文档">ℹ️</a>
                        </label>
                        <input type="text" id="apiUrl" value="${AI_SUMMARY_CONFIG.apiUrl}" style="
                            width: 100%;
                            padding: 8px 12px;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; margin-bottom: 8px; font-weight: 500; color: #333;">
                            API密钥
                            <a href="https://your-ai-platform.com/apikeys" target="_blank" style="
                                margin-left: 8px;
                                color: #1890ff;
                                text-decoration: none;
                                font-size: 16px;
                                font-weight: bold;
                            " title="查看API密钥管理">ℹ️</a>
                        </label>
                        <input type="password" id="apiKey" value="${AI_SUMMARY_CONFIG.apiKey}" style="
                            width: 100%;
                            padding: 8px 12px;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; margin-bottom: 8px; font-weight: 500; color: #333;">
                            模型
                            <a href="https://your-ai-api-docs.com/models" target="_blank" style="
                                margin-left: 8px;
                                color: #1890ff;
                                text-decoration: none;
                                font-size: 16px;
                                font-weight: bold;
                            " title="查看模型文档">ℹ️</a>
                        </label>
                        <input type="text" id="model" value="${AI_SUMMARY_CONFIG.model}" style="
                            width: 100%;
                            padding: 8px 12px;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">系统提示词</label>
                        <textarea id="systemPrompt" rows="6" style="
                            width: 100%;
                            padding: 8px 12px;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            font-size: 14px;
                            box-sizing: border-box;
                            resize: vertical;
                            font-family: monospace;
                        ">${AI_SUMMARY_CONFIG.systemPrompt}</textarea>
                    </div>

                    <!-- 按钮区域 -->
                    <div style="
                        display: flex;
                        gap: 8px;
                        justify-content: flex-end;
                        margin-top: 20px;
                        padding-top: 15px;
                        border-top: 1px solid #eee;
                    ">
                        <button type="button" id="resetAIConfig" style="
                            padding: 6px 12px;
                            border: 1px solid #ddd;
                            background: white;
                            color: #666;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">重置</button>
                        <button type="button" id="cancelAIConfig" style="
                            padding: 6px 12px;
                            border: 1px solid #ddd;
                            background: white;
                            color: #666;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">取消</button>
                        <button type="submit" style="
                            padding: 6px 12px;
                            border: none;
                            background: #1890ff;
                            color: white;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">保存</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // 添加到页面
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 绑定事件
    const modal = document.getElementById('aiConfigModal');
    const form = document.getElementById('aiConfigForm');
    const closeBtn = document.getElementById('closeAIConfigModal');
    const cancelBtn = document.getElementById('cancelAIConfig');
    const resetBtn = document.getElementById('resetAIConfig');

    // 关闭弹窗
    function closeModal() {
        modal.style.display = 'none';
    }


    // 重置配置
    function resetConfig() {
        // 使用真正的默认配置
        document.getElementById('useStream').checked = true;
        document.getElementById('useThinking').checked = true;
        document.getElementById('apiUrl').value = "https://your-ai-api-endpoint.com/v1/chat/completions";
        document.getElementById('apiKey').value = "";
        document.getElementById('model').value = "glm-4.5-Flash";
        document.getElementById('systemPrompt').value = "将日报汇总为周报。规则：1.保留所有内容，不省略；2.使用原HTML格式；3.返回纯HTML，不用Markdown；4.按任务合并同标题内容；5.相同任务去重，只保留最新进度；6.直接输出HTML，无说明文字；7.按任务合并，不按日期拼接，不包含日期；8.思考时不要反复调整结果，调整次数不要超过3次，不要陷入修改循环；9.去除不必要的空格和空行；";
    }

    // 保存配置
    function saveConfig() {
        AI_SUMMARY_CONFIG.useStream = document.getElementById('useStream').checked;
        AI_SUMMARY_CONFIG.useThinking = document.getElementById('useThinking').checked;
        AI_SUMMARY_CONFIG.apiUrl = document.getElementById('apiUrl').value;
        AI_SUMMARY_CONFIG.apiKey = document.getElementById('apiKey').value;
        AI_SUMMARY_CONFIG.model = document.getElementById('model').value;
        AI_SUMMARY_CONFIG.systemPrompt = document.getElementById('systemPrompt').value;

        saveAIConfig();
        closeModal();

        if (window.notyf) {
            window.notyf.success('配置已保存');
        }
    }

    // 事件绑定
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    resetBtn.addEventListener('click', resetConfig);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveConfig();
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    return modal;
}

/**
 * 显示AI配置弹窗
 * 如果弹窗不存在则创建，然后显示
 */
function showAIConfigModal() {
    let modal = document.getElementById('aiConfigModal');
    if (!modal) {
        modal = createAIConfigModal();
    }
    modal.style.display = 'block';
}

// ==================== AI汇总核心函数 ====================

/**
 * AI汇总日报内容
 * 支持流式响应（打字机效果）和非流式响应两种模式
 * 
 * @param {Array<string>} dailySummaries - 每日日报内容数组
 * @param {Array<Date>} weekDates - 对应的日期数组
 * @param {boolean} useStream - 是否使用流式响应，默认true
 * @returns {Promise<string>} 汇总后的HTML内容
 * @throws {Error} 当日报内容为空或API请求失败时抛出错误
 */
async function aiSummarizeReports(dailySummaries, weekDates, useStream = true) {
    // 检查日报内容是否为空
    if (!dailySummaries || dailySummaries.length === 0) {
        throw new Error('没有找到日报内容，请确认本周是否有日报数据');
    }

    const requestBody = {
        model: AI_SUMMARY_CONFIG.model,
        messages: [
            {
                role: "system",
                content: AI_SUMMARY_CONFIG.systemPrompt
            },
            {
                role: "user",
                content: dailySummaries.map((content, index) => {
                    const date = weekDates[index];
                    const label = `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
                    return `<p><strong>【${label}】</strong></p>${content}`;
                }).join('<br><br>')
            }
        ],
        temperature: 0.2,
        stream: useStream
    };

    // 根据配置决定是否启用thinking模式
    if (AI_SUMMARY_CONFIG.useThinking) {
        requestBody.thinking = {
            type: "enabled"
        };
    } else {
        requestBody.thinking = {
            type: "disabled"
        };
    }

    try {
        const response = await fetch(AI_SUMMARY_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_SUMMARY_CONFIG.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (useStream) {
            // 流式响应处理
            return new Promise((resolve, reject) => {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullContent = '';

                // 查找目标编辑器（需要根据实际页面结构调整）
                const targetDiv = document.querySelectorAll('.ql-editor');
                if (!targetDiv || targetDiv.length === 0) {
                    reject(new Error('未找到编辑器'));
                    return;
                }

                let reasoningContent = '';

                function readStream() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            // 去除空行并返回最终内容
                            const cleanContent = fullContent.replace(/\n\s*\n/g, '\n').trim();
                            resolve(cleanContent);
                            return;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    if (data.choices && data.choices[0] && data.choices[0].delta) {
                                        const delta = data.choices[0].delta;

                                        // 处理思考内容
                                        if (delta.reasoning_content) {
                                            reasoningContent += delta.reasoning_content;

                                            // 显示思考过程
                                            try {
                                                if (targetDiv.length > 0 && targetDiv[targetDiv.length - 1]) {
                                                    // 处理多个连续换行符，只保留一个
                                                    const cleanReasoningContent = reasoningContent.replace(/\n{2,}/g, '\n');
                                                    targetDiv[targetDiv.length - 1].innerHTML = cleanReasoningContent;

                                                    // 自动滚动到底部
                                                    targetDiv[targetDiv.length - 1].scrollTop = targetDiv[targetDiv.length - 1].scrollHeight;
                                                }
                                            } catch (error) {
                                                // 忽略编辑器更新错误
                                            }
                                        }

                                        // 处理最终内容
                                        if (delta.content) {
                                            // 如果开始输出content，说明思考阶段结束

                                            fullContent += delta.content;

                                            // 实时更新编辑器内容（打字机效果）
                                            try {
                                                if (targetDiv.length > 0 && targetDiv[targetDiv.length - 1]) {
                                                    // 处理多个连续换行符，只保留一个，然后删除标签之间的空白字符
                                                    const cleanContent = fullContent
                                                        .replace(/\n{2,}/g, '\n')  // 多个连续换行符只保留一个
                                                        .replace(/>\s+</g, '><')  // 删除标签之间的空白字符
                                                        .replace(/\n/g, '')       // 删除所有换行符
                                                        .trim();
                                                    targetDiv[targetDiv.length - 1].innerHTML = cleanContent;

                                                    // 自动滚动到底部
                                                    targetDiv[targetDiv.length - 1].scrollTop = targetDiv[targetDiv.length - 1].scrollHeight;
                                                }
                                            } catch (error) {
                                                // 忽略编辑器更新错误
                                            }
                                        }
                                    }
                                } catch (parseError) {
                                    // 忽略解析错误，继续处理
                                }
                            }
                        }

                        readStream();
                    }).catch(error => {
                        reject(error);
                    });
                }

                readStream();
            });
        } else {
            // 非流式响应处理
            const data = await response.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
                // 去除空行并返回最终内容
                const cleanContent = data.choices[0].message.content.replace(/\n\s*\n/g, '\n').trim();
                return cleanContent;
            }
            throw new Error('AI汇总返回格式异常');
        }
    } catch (error) {
        console.error('AI汇总失败:', error);
        throw error;
    }
}

// ==================== 主流程函数 ====================

/**
 * 发起接口请求并整合内容
 * 这是周报生成的主流程函数，负责：
 * 1. 获取周报关联的工作项并复制
 * 2. 获取本周每天的日报内容
 * 3. 根据配置选择AI汇总或简单汇总
 * 4. 更新周报内容
 */
async function fetchReports() {
    window.notyf.success(`正在获取本周日报...`);
    const userInfoStr = localStorage.getItem('user_info');
    let userId;
    if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        userId = userInfo.id;
    } else {
        return;
    }
    const today = new Date();
    const risks = [];
    const token = localStorage.getItem('token') || '';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`
    };

    // 获取周报任务数据
    try {
        const reportId = await getCurrentWeeklyReportId(userId, token);
        if (reportId) {
            const issueData = await getWeeklyReportIssues(reportId, token);
            if (issueData) {
                // 收集所有任务ID
                const allIssueIds = [];
                if (issueData.finished_issues) {
                    allIssueIds.push(...issueData.finished_issues.map(issue => issue.id));
                }
                if (issueData.unfinished_issues) {
                    allIssueIds.push(...issueData.unfinished_issues.map(issue => issue.id));
                }

                // 复制任务到周报
                if (allIssueIds.length > 0) {
                    const copySuccess = await copyIssuesToReport(reportId, allIssueIds, token);
                    if (copySuccess) {
                        window.notyf.success(`已更新 ${allIssueIds.length} 个工作项`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('处理工作项数据时出错:', error);
    }

    // 按正序获取数据（本周一到周四）
    const dailySummaries = []; // 存储每日总结（AI汇总用）
    let lastDayPlanContent = null;

    // 获取本周一到周四的日期
    const getWeekDates = (date) => {
        const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ..., 6=周六
        // 转换为0=周一, 6=周日的格式
        const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const daysToMonday = -adjustedDayOfWeek; // 距离周一的天数
        const monday = new Date(date);
        monday.setDate(date.getDate() + daysToMonday);

        const weekDates = [];
        for (let i = -6; i < -2; i++) { // 周一到周四
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            weekDates.push(day);
        }
        return weekDates;
    };

    const weekDates = getWeekDates(today);

    for (let i = 0; i < weekDates.length; i++) {
        const date = weekDates[i];
        const label = `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
        const url = `/api/reports/list/?label=${encodeURIComponent(label)}&user_id=${userId}&type=daily`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });
            const data = await response.json();
            if (data.code === 200 && data.data.length > 0) {
                const content = data.data[0].content;

                // 提取今日总结内容（简单汇总用）
                const summaryContent = extractSectionContent(content, '【今日总结】');
                if (summaryContent) {
                    // 直接添加日报内容，不添加日期标识
                    dailySummaries.push(summaryContent);
                }

                // 只处理最后一天（周四）的明日计划作为本周总结的一部分
                if (i === 3) { // 周四（索引3）
                    lastDayPlanContent = extractSectionContent(content, '【明日计划】');
                }

                // 提取风险与问题内容
                const riskContent = extractSectionContent(content, '【风险与问题】');
                if (riskContent) {
                    risks.push(riskContent);
                }
            }
        } catch (error) {
            console.error(`请求 ${label} 的数据时出错:`, error);
        }
    }

    // 根据配置选择汇总方式
    let mergedSummaries;
    if (AI_SUMMARY_CONFIG.enabled) {
        try {
            window.notyf.success(`正在使用AI汇总日报...`);

            // 在AI请求之前显示提示文案
            try {
    const targetDiv = document.querySelectorAll('.ql-editor');
                if (targetDiv && targetDiv.length > 0) {
                    // 根据thinking模式显示不同提示
                    if (AI_SUMMARY_CONFIG.useThinking) {
                        targetDiv[targetDiv.length - 1].innerHTML = '<p style="color: #999; font-style: italic;">正在思考中...</p>';
                    } else {
                        targetDiv[targetDiv.length - 1].innerHTML = '<p style="color: #999; font-style: italic;">正在汇总中...</p>';
                    }
                }
            } catch (error) {
                // 忽略编辑器更新错误
            }

            // 为AI汇总准备数据：将周四的明日计划也作为本周总结的一部分
            const aiDailySummaries = [...dailySummaries];
            const aiWeekDates = [...weekDates];

            // 如果有最后一天的明日计划内容，添加到AI输入中
            if (lastDayPlanContent) {
                // 获取最后一天（周四）的下一天日期
                const lastDate = weekDates[weekDates.length - 1];
                const nextDay = new Date(lastDate);
                nextDay.setDate(nextDay.getDate() + 1);

                aiDailySummaries.push(lastDayPlanContent);
                aiWeekDates.push(nextDay);
            }

            mergedSummaries = await aiSummarizeReports(aiDailySummaries, aiWeekDates, AI_SUMMARY_CONFIG.useStream);
            // 去除AI汇总结果中的换行符（HTML内容不需要换行符）
            // 只删除标签之间的换行符和空格，保留标签内部的正常空格
            mergedSummaries = mergedSummaries
                .replace(/>\s+</g, '><')  // 删除标签之间的空白字符
                .replace(/\n/g, '')       // 删除所有换行符
                .trim();

            window.notyf.success(`AI汇总完成`);

            // AI汇总完成后，直接通过API更新周报内容
            try {
                const reportId = await getCurrentWeeklyReportId(userId, token);
                if (reportId) {
                    const summaryHtml = `<p>【本周总结】</p>${mergedSummaries}`;
                    const planHtml = `<p>【下周计划】</p><ol><li></li></ol>`;
                    const riskHtml = `<p>【风险与问题】</p>${formatContentAsList(risks)}`;
                    const content = summaryHtml + planHtml + riskHtml;

                    const updateSuccess = await updateWeeklyReport(reportId, content, token);
                    if (updateSuccess) {
                        window.notyf.success(`周报内容已更新`);
                        // 点击周报行刷新显示
                        clickWeeklyLine();
                    } else {
                        window.notyf.error(`周报内容更新失败`);
                    }
                }
            } catch (error) {
                console.error('AI汇总更新周报内容失败:', error);
                window.notyf.error(`更新周报内容失败: ${error.message}`);
            }
            return; // AI汇总完成后直接返回
        } catch (error) {
            console.error('AI汇总失败:', error);
            window.notyf.error(`AI汇总失败: ${error.message}`);
            return; // AI汇总失败时直接返回，不进行降级处理
        }
    } else {
        // 简单汇总：检查是否有日报内容
        if (!dailySummaries || dailySummaries.length === 0) {
            window.notyf.error('没有找到日报内容，请确认本周是否有日报数据');
            return;
        }

        // 简单汇总：合并每天的内容，每天之间用两个空行分隔
        mergedSummaries = dailySummaries.join('');

        // 将最后一天的明日计划添加到本周总结中
        if (lastDayPlanContent) {
            mergedSummaries += lastDayPlanContent;
        }
    }
    // 通过API更新周报内容
    try {
        const reportId = await getCurrentWeeklyReportId(userId, token);
        if (reportId) {
            const summaryHtml = `<p>【本周总结】</p>${mergedSummaries}`;
            const planHtml = `<p>【下周计划】</p><ol><li></li></ol>`;
            const riskHtml = `<p>【风险与问题】</p>${formatContentAsList(risks)}`;
            const content = summaryHtml + planHtml + riskHtml;

            const updateSuccess = await updateWeeklyReport(reportId, content, token);
            if (updateSuccess) {
                window.notyf.success(`周报内容已更新`);
                // 点击周报行刷新显示
                clickWeeklyLine();
            } else {
                window.notyf.error(`周报内容更新失败`);
            }
        }
    } catch (error) {
        console.error('简单汇总更新周报内容失败:', error);
        window.notyf.error(`更新周报内容失败: ${error.message}`);
    }
}

// ==================== 内容处理函数 ====================

/**
 * 提取指定章节的内容
 * 从日报HTML中提取指定标题（如【今日总结】）之后的内容
 * 
 * @param {string} content - 日报的HTML内容
 * @param {string} sectionTitle - 章节标题（如"【今日总结】"）
 * @returns {string|null} 章节内容或null
 */
function extractSectionContent(content, sectionTitle) {
    // 查找章节标题的位置（处理可能的空格）
    const titlePattern = new RegExp(`<p>\\s*${sectionTitle}\\s*</p>`, 'g');
    const titleMatch = titlePattern.exec(content);

    if (!titleMatch) {
        return null;
    }

    const startIndex = titleMatch.index + titleMatch[0].length;

    // 查找下一个章节的开始位置
    const nextSections = ['【明日计划】', '【风险与问题】', '【今日总结】'];
    let endIndex = content.length;

    for (const nextSection of nextSections) {
        if (nextSection !== sectionTitle) {
            const nextPattern = new RegExp(`<p>\\s*${nextSection}\\s*</p>`, 'g');
            const nextMatch = nextPattern.exec(content);
            if (nextMatch && nextMatch.index > startIndex) {
                endIndex = Math.min(endIndex, nextMatch.index);
            }
        }
    }

    const sectionContent = content.slice(startIndex, endIndex).trim();

    if (!sectionContent) {
        return null;
    }

    // 检查内容是否只包含空标签（如<p><br></p>）
    const isEmptyContent = /^<p><br><\/p>(\s*<p><br><\/p>)*\s*$/.test(sectionContent);
    if (isEmptyContent) {
        return null;
    }
    
    // 直接返回原始内容，保留完整格式
    return sectionContent;
}

/**
 * 智能格式化内容为列表
 * 如果内容已经是列表格式则直接返回，否则转换为列表
 * 
 * @param {Array<string>} contentArray - 内容数组
 * @returns {string} HTML列表字符串
 */
function formatContentAsList(contentArray) {
    if (!contentArray || contentArray.length === 0) {
        return `<ol><li></li></ol>`;
    }
    
    const joinedContent = contentArray.join('');
    
    // 检查内容是否已经是列表格式（包含<li>标签）
    if (joinedContent.includes('<li')) {
        // 内容已经是列表格式，直接返回，不需要再加<ol>包装
        return joinedContent;
    } else {
        // 内容不是列表格式，可能需要其他处理
        // 如果内容为空或只有空白，返回空的列表项
        if (!joinedContent.trim()) {
            return `<ol><li></li></ol>`;
        }
        
        // 将内容按行分割并转换为列表项
        const lines = joinedContent.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
            const listItems = lines.map(line => `<li>${line.trim()}</li>`).join('');
            return `<ol>${listItems}</ol>`;
        }
        
        // 如果无法处理，返回原始内容
        return joinedContent;
    }
}

/**
 * 获取指定日期前几天的日期字符串
 * @param {Date} date - 基准日期
 * @param {number} days - 天数
 * @returns {string} 格式化的日期字符串（如"2024年01月15日"）
 */
function getPreviousDate(date, days) {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - days);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    return `${year}年${month}月${day}日`;
}
// ==================== DOM等待工具函数 ====================

/**
 * 等待指定DOM元素出现后执行回调函数
 * 使用轮询方式检测元素是否出现，出现后执行回调
 * 
 * 改写自 https://gist.github.com/BrockA/2625891
 * 
 * @param {string} selectorTxt - CSS选择器字符串
 * @param {Function} actionFunction - 元素出现后执行的回调函数，接收匹配的元素作为参数
 */
function waitForKeyElements(selectorTxt, actionFunction) {
    var targetNodes, btargetsFound;
    targetNodes = document.querySelectorAll(selectorTxt);

    if (targetNodes && targetNodes.length > 0) {
        btargetsFound = true;
        // Found target node(s).  Go through each and act if they are new.
        targetNodes.forEach(function (node) {
            var alreadyFound = node.dataset.alreadyFound === 'true' || false;

            if (!alreadyFound) {
                //--- Call the payload function.
                var cancelFound = actionFunction (node);
                if (cancelFound) {
                    btargetsFound = false;
                } else {
                    node.dataset.alreadyFound = 'true';
                }
            }
        });
    }
    else {
        btargetsFound = false;
    }

    //--- Get the timer-control variable for this selector.
    var controlObj = waitForKeyElements.controlObj || {};
    var controlKey = selectorTxt.replace (/[^\w]/g, "_");
    var timeControl = controlObj [controlKey];

    //--- Now set or clear the timer as appropriate.
    if (btargetsFound && timeControl) {
        //--- The only condition where we need to clear the timer.
        clearInterval (timeControl);
        delete controlObj [controlKey]
    } else {
        //--- Set a timer, if needed.
        if (!timeControl) {
            timeControl = setInterval ( function () {
                    waitForKeyElements (selectorTxt, actionFunction);
                }, 300
            );
            controlObj [controlKey] = timeControl;
        }
    }
    waitForKeyElements.controlObj = controlObj;
}