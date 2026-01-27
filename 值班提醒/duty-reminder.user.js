// ==UserScript==
// @name         DevOps值班提醒插件
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  值班提醒插件：提醒用户即将到来的值班，支持多种提醒模式和智能数据刷新。
// @author       lvhaifeng
// @match        https://your-devops-platform.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * 值班提醒插件 - 完整版
 * 
 * 功能特性：
 * - 支持两种提醒模式：
 *   - 每日提醒：在值班日之前的每一天都会提醒。
 *   - 上一个工作日提醒：只在值班日前的最后一个工作日提醒。
 * - 智能缓存机制：在需要时调用 API 更新值班数据，且每日（按自然日0:00-0:00计算）最多调用一次，避免频繁请求。
 * - 简洁的提醒逻辑：脚本加载时检查是否需要提醒，每日（按自然日0:00-0:00计算）只显示一次提醒弹窗。
 * - 特定页面豁免：访问 `/devops/daily/` 页面时，无视日期提醒限制，每次加载页面都会检查并触发提醒。
 * - 易读的日期显示：将值班日期格式化为"今天"、"明天"、"后天"、"周x"、"下周x"等，方便用户快速理解（按周一到周日计算一周）。
 * - 美观的用户界面：设置按钮和提醒弹窗经过优化，提供更好的视觉体验和交互。
 * - 本地存储：将用户设置和值班信息本地化存储，确保数据持久性。
 * 
 * 使用说明：
 * 1. 安装：安装 Tampermonkey 插件后，创建新脚本，复制此文件内容并保存。
 * 2. 交互：点击页面右下角的齿轮图标即可打开/关闭设置面板，配置提醒模式。
 * 3. 实时保存：所有设置更改都会实时自动保存，无需手动点击保存按钮。
 * 4. 手动关闭：提醒弹窗不会自动关闭，需要手动点击"×"按钮关闭。
 * 
 * 核心技术：
 * - localStorage 本地存储：持久化保存用户配置和值班数据
 * - 智能缓存策略：按自然日判断API调用频率，减少不必要的网络请求
 * - CSS动画：使用slideIn/slideUp动画提升用户体验
 * - 工作日计算：自动识别周末，支持"上一个工作日"提醒模式
 */

(function() {
    'use strict';

    // ==================== 配置区域 ====================
    const CONFIG = {
        // 提醒设置
        REMINDER_TYPES: {
            DAILY: 'daily',      // 每日提醒
            WORKDAY: 'workday'   // 上一个工作日提醒
        },
        
        // localStorage keys - 本地存储键名
        STORAGE_KEYS: {
            DUTY_INFO: 'duty_reminder_info',                      // 值班信息
            LAST_CALL_TIME: 'duty_reminder_last_call',            // 上次调用时间
            REMINDER_SETTING: 'duty_reminder_setting',            // 提醒设置
            LAST_REMINDER_SHOWN: 'duty_reminder_last_shown',      // 上次显示提醒时间
            LAST_API_CALL_TIMESTAMP: 'duty_reminder_last_api_call_timestamp', // API调用时间戳
            TOKEN: 'token',                                        // 认证令牌
            USER_INFO: 'umeapiUser'                                // 用户信息
        },

        // 时间常量
        TWENTY_FOUR_HOURS_IN_MILLIS: 24 * 60 * 60 * 1000, // 24小时的毫秒数
        
        // 接口配置（GET请求方式）
        API: {
            // 动态设置BASE_URL的后缀，根据当前域名自动适配
            BASE_URL: window.location.origin,
            ENDPOINT: '/api/duty/list/',  // 值班表信息获取接口
            METHOD: 'GET',
            HEADERS: {
                'Content-Type': 'application/json'
            }
        }
    };

    // ==================== 工具函数 ====================
    const Utils = {
        /**
         * 获取当前时间字符串（HH:mm格式）
         * @returns {string} 格式化的时间字符串
         */
        getCurrentTimeString() {
            const now = new Date();
            return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        },

        /**
         * 获取当前日期字符串（ISO格式）
         * @returns {string} YYYY-MM-DD格式的日期字符串
         */
        getCurrentDateString() {
            const now = new Date();
            return now.toISOString().split('T')[0];
        },

        /**
         * 获取本地日期字符串（避免时区问题）
         * @param {Date} date - 日期对象
         * @returns {string} YYYY-MM-DD格式的本地日期字符串
         */
        getLocalDateString(date) {
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        },

        /**
         * 检查两个时间戳是否在不同的自然日
         * @param {number} timestamp1 - 时间戳1
         * @param {number} timestamp2 - 时间戳2
         * @returns {boolean} 是否为不同的自然日
         */
        isDifferentDay(timestamp1, timestamp2) {
            if (!timestamp1 || !timestamp2) return true;
            
            const date1 = new Date(timestamp1);
            const date2 = new Date(timestamp2);
            
            const dateStr1 = this.getLocalDateString(date1);
            const dateStr2 = this.getLocalDateString(date2);
            
            return dateStr1 !== dateStr2;
        },

        /**
         * 判断是否为工作日（周一至周五）
         * @param {Date} date - 日期对象
         * @returns {boolean} 是否为工作日
         */
        isWorkday(date) {
            const day = date.getDay();
            return day >= 1 && day <= 5;
        },

        /**
         * 获取指定日期的上一个工作日
         * @param {Date} date - 日期对象
         * @returns {Date} 上一个工作日的日期对象
         */
        getPreviousWorkday(date) {
            const prevDay = new Date(date);
            prevDay.setDate(prevDay.getDate() - 1);
            
            // 循环向前查找，直到找到工作日
            while (!this.isWorkday(prevDay)) {
                prevDay.setDate(prevDay.getDate() - 1);
            }
            return prevDay;
        },

        /**
         * 格式化日期为易读格式
         * 将日期转换为"今天"、"明天"、"后天"、"周x"、"下周x"等格式
         * @param {Date} date - 日期对象
         * @returns {string} 易读的日期描述
         */
        formatReadableDate(date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            
            // 计算天数差值
            const dayDiff = Math.round((targetDate - today) / (1000 * 60 * 60 * 24));
            
            if (dayDiff === 0) {
                return '今天';
            } else if (dayDiff === 1) {
                return '明天';
            } else if (dayDiff === 2) {
                return '后天';
            } else {
                // 判断是否在同一周（按周一到周日计算）
                const todayWeekStart = new Date(today);
                const todayDayOfWeek = today.getDay();
                const daysFromMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
                todayWeekStart.setDate(today.getDate() - daysFromMonday);
                
                const dateWeekStart = new Date(targetDate);
                const targetDayOfWeek = targetDate.getDay();
                const targetDaysFromMonday = targetDayOfWeek === 0 ? 6 : targetDayOfWeek - 1;
                dateWeekStart.setDate(targetDate.getDate() - targetDaysFromMonday);
                
                const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                
                if (todayWeekStart.getTime() === dateWeekStart.getTime()) {
                    return weekdays[targetDate.getDay()];
                } else {
                    return `下${weekdays[targetDate.getDay()]}`;
                }
            }
        },

        /**
         * 获取认证令牌
         * @returns {string|null} 认证令牌或null
         */
        getToken() {
            const token = localStorage.getItem('token');
            if (token) {
                return token;
            }
            Utils.log('未找到token', 'warn');
            return null;
        },

        /**
         * 保存数据到localStorage
         * @param {string} key - 存储键名
         * @param {any} value - 要存储的值
         */
        saveToStorage(key, value) {
            localStorage.setItem(key, JSON.stringify(value));
        },

        /**
         * 从localStorage读取数据
         * @param {string} key - 存储键名
         * @returns {any} 存储的值或null
         */
        getFromStorage(key) {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        },

        /**
         * 日志输出函数
         * @param {string} message - 日志消息
         * @param {string} type - 日志类型：info/warn/error
         */
        log(message, type = 'info') {
            const timestamp = new Date().toISOString();
            const prefix = '[值班提醒插件]';
            
            switch (type) {
                case 'error':
                    console.error(`${prefix} ${timestamp} - ${message}`);
                    break;
                case 'warn':
                    console.warn(`${prefix} ${timestamp} - ${message}`);
                    break;
                default:
                    console.log(`${prefix} ${timestamp} - ${message}`);
            }
        }
    };

    // ==================== 值班信息管理 ====================
    const DutyManager = {
        /**
         * 调用接口获取值班信息
         * @returns {Object|null} 值班信息对象或null
         */
        async fetchDutyInfo() {
            const token = Utils.getToken();
            if (!token) {
                Utils.log('未找到token，无法调用接口', 'warn');
                return null;
            }

            try {
                Utils.log('开始调用接口获取值班信息');

                const currentUserId = this.getCurrentUserId();
                if (!currentUserId) {
                    Utils.log('未找到当前用户ID', 'warn');
                    return null;
                }

                // 构建日期范围（获取未来10天的值班信息）
                const today = new Date();
                const endDate = new Date(today);
                endDate.setDate(today.getDate() + 10);
                
                const startDateStr = today.toISOString().split('T')[0];
                const endDateStr = endDate.toISOString().split('T')[0];
                const dateRange = `${startDateStr},${endDateStr}`;

                const requestConfig = {
                    method: 'GET',
                    headers: {
                        ...CONFIG.API.HEADERS,
                        'Authorization': `token ${token}`
                    }
                };

                const url = `${CONFIG.API.ENDPOINT}?date=${dateRange}`;
                const response = await fetch(url, requestConfig);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                Utils.log('接口调用成功');

                if (result.code !== 200 || !result.data) {
                    throw new Error('接口返回数据格式错误');
                }

                // 查找当前用户的下次值班
                let nextDutyDate = null;
                const currentDate = new Date();
                
                for (const duty of result.data) {
                    const dutyDate = new Date(duty.date);
                    const hasCurrentUser = duty.members.some(member => 
                        member.user_id === currentUserId
                    );
                    
                    if (dutyDate > currentDate && hasCurrentUser) {
                        nextDutyDate = duty.date;
                        break;
                    }
                }

                const dutyInfo = {
                    nextDutyDate: nextDutyDate,
                    lastUpdate: new Date().toISOString()
                };

                Utils.saveToStorage(CONFIG.STORAGE_KEYS.DUTY_INFO, dutyInfo);
                Utils.saveToStorage(CONFIG.STORAGE_KEYS.LAST_API_CALL_TIMESTAMP, new Date().getTime());
                
                return dutyInfo;

            } catch (error) {
                Utils.log(`获取值班信息失败: ${error.message}`, 'error');
                return null;
            }
        },

        /**
         * 获取值班信息（优先从缓存获取）
         * @returns {Object|null} 值班信息对象
         */
        async getDutyInfo() {
            const result = await this.fetchDutyInfo();
            return result || Utils.getFromStorage(CONFIG.STORAGE_KEYS.DUTY_INFO);
        },

        /**
         * 获取当前用户ID
         * @returns {number|null} 用户ID或null
         */
        getCurrentUserId() {
            try {
                const userInfoStr = localStorage.getItem('umeapiUser');
                if (userInfoStr) {
                    const userInfo = JSON.parse(userInfoStr);
                    return userInfo.id;
                }
            } catch (error) {
                Utils.log('解析用户信息失败', 'error');
            }
            return null;
        },
    };

    // ==================== 提醒管理 ====================
    const ReminderManager = {
        /**
         * 检查是否需要提醒
         * @returns {boolean} 是否需要显示提醒
         */
        shouldRemind() {
            const dutyInfo = Utils.getFromStorage(CONFIG.STORAGE_KEYS.DUTY_INFO);
            if (!dutyInfo || !dutyInfo.nextDutyDate) return false;

            const reminderSetting = Utils.getFromStorage(CONFIG.STORAGE_KEYS.REMINDER_SETTING) || CONFIG.REMINDER_TYPES.DAILY;
            const nextDutyDate = new Date(dutyInfo.nextDutyDate);
            const today = new Date();

            const _nextDutyDateOnly = new Date(nextDutyDate);
            _nextDutyDateOnly.setHours(0, 0, 0, 0);
            const _nowDateOnly = new Date(today);
            _nowDateOnly.setHours(0, 0, 0, 0);

            // 如果值班日期已过，不需要提醒
            if (_nextDutyDateOnly <= _nowDateOnly) return false;

            if (reminderSetting === CONFIG.REMINDER_TYPES.DAILY) {
                return true;
            } else if (reminderSetting === CONFIG.REMINDER_TYPES.WORKDAY) {
                const prevWorkday = Utils.getPreviousWorkday(nextDutyDate);
                const todayStr = Utils.getLocalDateString(_nowDateOnly);
                const prevWorkdayStr = Utils.getLocalDateString(prevWorkday);
                
                return todayStr === prevWorkdayStr;
            }

            return false;
        },

        /**
         * 显示值班提醒弹窗
         */
        showReminder() {
            const dutyInfo = Utils.getFromStorage(CONFIG.STORAGE_KEYS.DUTY_INFO);
            if (!dutyInfo) return;

            const nextDutyDate = new Date(dutyInfo.nextDutyDate);
            const readableDate = Utils.formatReadableDate(nextDutyDate);
            const exactDate = `${nextDutyDate.getFullYear()}-${(nextDutyDate.getMonth() + 1).toString().padStart(2, '0')}-${nextDutyDate.getDate().toString().padStart(2, '0')}`;

            Utils.log(`显示值班提醒: ${readableDate} (${exactDate})`);
            this.createReminderPopup(readableDate, exactDate);
        },

        /**
         * 创建提醒弹窗DOM元素
         * @param {string} readableDate - 易读的日期描述
         * @param {string} exactDate - 精确日期
         */
        createReminderPopup(readableDate, exactDate) {
            const existingPopup = document.getElementById('duty-reminder-popup');
            if (existingPopup) {
                existingPopup.remove();
            }

            const popup = document.createElement('div');
            popup.id = 'duty-reminder-popup';
            popup.innerHTML = `
                <div class="duty-reminder-content">
                    <div class="duty-reminder-header">
                        <span class="duty-reminder-title">值班提醒</span>
                        <button class="duty-reminder-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                    </div>
                    <div class="duty-reminder-body">
                        <div class="duty-reminder-icon">📅</div>
                        <div class="duty-reminder-text">
                            <div class="duty-reminder-main">您将在 <strong>${readableDate}</strong> 值班</div>
                            <div class="duty-reminder-sub">日期：${exactDate}</div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);
        }
    };

    // ==================== 设置面板 ====================
    const SettingsPanel = {
        /**
         * 切换设置面板显示/隐藏
         */
        toggleSettingsPanel() {
            const existingPanel = document.getElementById('duty-reminder-settings');
            if (existingPanel) {
                existingPanel.remove();
            } else {
                this.createSettingsPanel();
            }
        },

        /**
         * 保存当前设置
         * @param {HTMLElement} panel - 设置面板元素
         */
        saveCurrentSettings(panel) {
            const selectedType = panel.querySelector('input[name="reminderType"]:checked').value;
            Utils.saveToStorage(CONFIG.STORAGE_KEYS.REMINDER_SETTING, selectedType);
            Utils.log(`设置已自动保存: ${selectedType}`);
        },

        /**
         * 创建设置面板DOM元素
         */
        createSettingsPanel() {
            const existingPanel = document.getElementById('duty-reminder-settings');
            if (existingPanel) {
                existingPanel.remove();
            }

            const dutyInfo = Utils.getFromStorage(CONFIG.STORAGE_KEYS.DUTY_INFO);
            let dutyDateDisplay = '';
            
            if (dutyInfo && dutyInfo.nextDutyDate) {
                const nextDutyDate = new Date(dutyInfo.nextDutyDate);
                const readableDate = Utils.formatReadableDate(nextDutyDate);
                const exactDate = `${nextDutyDate.getFullYear()}-${(nextDutyDate.getMonth() + 1).toString().padStart(2, '0')}-${nextDutyDate.getDate().toString().padStart(2, '0')}`;
                dutyDateDisplay = `
                    <div class="duty-reminder-next-duty">
                        <div class="duty-reminder-next-duty-title">下次值班时间</div>
                        <div class="duty-reminder-next-duty-date">
                            <span class="duty-reminder-readable">${readableDate}</span>
                            <span class="duty-reminder-exact">(${exactDate})</span>
                        </div>
                    </div>
                `;
            } else {
                dutyDateDisplay = `
                    <div class="duty-reminder-next-duty">
                        <div class="duty-reminder-next-duty-title">下次值班时间</div>
                        <div class="duty-reminder-no-duty">暂无值班信息</div>
                    </div>
                `;
            }

            const panel = document.createElement('div');
            panel.id = 'duty-reminder-settings';
            panel.innerHTML = `
                <div class="duty-reminder-settings-content">
                    <h3>值班提醒设置</h3>
                    ${dutyDateDisplay}
                    <div class="duty-reminder-setting-item">
                        <label>
                            <input type="radio" name="reminderType" value="${CONFIG.REMINDER_TYPES.DAILY}" checked>
                            每日提醒
                        </label>
                        <label>
                            <input type="radio" name="reminderType" value="${CONFIG.REMINDER_TYPES.WORKDAY}">
                            上一个工作日提醒
                        </label>
                    </div>
                </div>
            `;

            const currentSetting = Utils.getFromStorage(CONFIG.STORAGE_KEYS.REMINDER_SETTING) || CONFIG.REMINDER_TYPES.DAILY;
            const radioButtons = panel.querySelectorAll('input[name="reminderType"]');
            radioButtons.forEach(radio => {
                if (radio.value === currentSetting) {
                    radio.checked = true;
                }
                radio.addEventListener('change', () => {
                    this.saveCurrentSettings(panel);
                });
            });
            
            document.body.appendChild(panel);

            const handleOutsideClick = (event) => {
                if (!panel.contains(event.target) && event.target.id !== 'duty-reminder-trigger') {
                    panel.remove();
                    document.removeEventListener('click', handleOutsideClick);
                }
            };

            setTimeout(() => {
                document.addEventListener('click', handleOutsideClick);
            }, 100);
        }
    };

    // ==================== 样式定义 ====================
    GM_addStyle(`
        #duty-reminder-popup {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            min-width: 300px;
            animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        .duty-reminder-content { padding: 16px; }
        .duty-reminder-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .duty-reminder-title { font-weight: bold; color: #333; }
        .duty-reminder-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #999; }
        .duty-reminder-close:hover { color: #333; }
        .duty-reminder-body { display: flex; align-items: center; }
        .duty-reminder-icon { font-size: 24px; margin-right: 12px; }
        .duty-reminder-text { flex: 1; }
        .duty-reminder-main { font-size: 14px; color: #333; margin-bottom: 4px; }
        .duty-reminder-sub { font-size: 12px; color: #666; }

        #duty-reminder-settings {
            position: fixed;
            bottom: 80px;
            right: 20px;
            z-index: 10001;
            background: white;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            padding: 20px;
            min-width: 320px;
            animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .duty-reminder-settings-content h3 { margin: 0 0 16px 0; color: #333; }
        .duty-reminder-setting-item { margin-bottom: 16px; }
        .duty-reminder-setting-item label { display: block; margin-bottom: 8px; cursor: pointer; }
        .duty-reminder-next-duty { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
        .duty-reminder-next-duty-title { font-size: 12px; color: #6c757d; margin-bottom: 6px; font-weight: 500; }
        .duty-reminder-next-duty-date { display: flex; align-items: center; gap: 8px; }
        .duty-reminder-readable { font-size: 16px; font-weight: bold; color: #409eff; }
        .duty-reminder-exact { font-size: 12px; color: #6c757d; }
        .duty-reminder-no-duty { font-size: 14px; color: #6c757d; font-style: italic; }

        #duty-reminder-trigger {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            background: #409eff;
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0, 123, 255, 0.3);
            transition: all 0.2s ease-in-out;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #duty-reminder-trigger:hover {
            background: #0056b3;
            box-shadow: 0 6px 15px rgba(0, 123, 255, 0.4);
            transform: translateY(-2px) rotate(30deg);
        }

        #duty-reminder-trigger:active {
            background: #004085;
            transform: translateY(0px) scale(0.95) rotate(60deg);
        }
    `);

    // ==================== 主函数 ====================
    /**
     * 创建触发按钮（齿轮图标）
     */
    const createTriggerButton = () => {
        const button = document.createElement('button');
        button.id = 'duty-reminder-trigger';
        button.innerHTML = '⚙️';
        button.title = '值班提醒设置';
        button.addEventListener('click', () => {
            SettingsPanel.toggleSettingsPanel();
        });

        document.body.appendChild(button);
    };

    /**
     * 检查并获取值班信息
     */
    const checkAndFetchDutyInfo = async () => {
        const lastApiCallTimestamp = Utils.getFromStorage(CONFIG.STORAGE_KEYS.LAST_API_CALL_TIMESTAMP) || 0;
        const currentTimestamp = new Date().getTime();
        const currentPath = window.location.pathname;
        const isDailyPage = currentPath === '/devops/daily/';
        
        if (isDailyPage || !lastApiCallTimestamp || Utils.isDifferentDay(lastApiCallTimestamp, currentTimestamp)) {
            await DutyManager.getDutyInfo();
        }
    };

    /**
     * 处理提醒显示逻辑
     */
    const handleReminderDisplay = () => {
        const currentTimestamp = new Date().getTime();
        const lastReminderShown = Utils.getFromStorage(CONFIG.STORAGE_KEYS.LAST_REMINDER_SHOWN) || 0;
        const isDailyPage = window.location.href.includes('/devops/daily/');

        if (ReminderManager.shouldRemind()) {
            if (isDailyPage || Utils.isDifferentDay(lastReminderShown, currentTimestamp)) {
                ReminderManager.showReminder();
                Utils.saveToStorage(CONFIG.STORAGE_KEYS.LAST_REMINDER_SHOWN, currentTimestamp);
            }
        }
    };

    /**
     * 初始化函数
     */
    const init = async () => {
        createTriggerButton();
        await checkAndFetchDutyInfo();
        handleReminderDisplay();
    };

    // ==================== 启动插件 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 导出到全局作用域（用于调试）
    window.DutyReminderPlugin = {
        Utils,
        DutyManager,
        ReminderManager,
        SettingsPanel,
        CONFIG
    };

    Utils.log('值班提醒插件已加载完成');

})();
