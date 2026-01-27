// ==UserScript==
// @name         Apollo JSON Formatter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Apollo配置中心JSON格式化工具 - 提供JSON配置的格式化和压缩功能，提升配置编辑效率
// @author       lvhaifeng
// @match        https://your-apollo-config.com/config.html*
// @match        http://your-apollo-config.com/config.html*
// @icon         https://your-apollo-config.com/img/config.png
// @require      https://cdn.jsdelivr.net/gh/CoeJoder/waitForKeyElements.js@v1.2/waitForKeyElements.js
// @resource     NOTYF_CSS    https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.css
// @require      https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js
// @run-at       document-end
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

/**
 * Apollo JSON Formatter - Apollo配置中心JSON格式化增强插件
 * 
 * 功能特性：
 * - 一键格式化：将压缩的JSON配置转换为易读的缩进格式
 * - 一键压缩：将格式化的JSON配置压缩为单行格式，节省存储空间
 * - 实时反馈：使用Notyf库提供友好的操作结果提示
 * - 无缝集成：自动在Apollo配置编辑弹窗中添加操作按钮
 * 
 * 使用场景：
 * - 编辑复杂的JSON配置时，格式化后更易阅读和修改
 * - 提交配置前，压缩JSON以减少存储空间
 * 
 * 技术实现：
 * - 使用waitForKeyElements监听DOM元素加载
 * - 通过原生DOM操作添加功能按钮
 * - 使用JSON.parse/stringify实现格式转换
 * - 手动触发input事件确保Vue/Angular等框架能检测到变化
 */

(function() {
    'use strict';
    
    // 等待配置编辑弹窗加载完成后执行主函数
    waitForKeyElements("#itemModal", mainFunc);
    
    // 加载Notyf通知库的CSS样式
    let notyf_css = GM_getResourceText("NOTYF_CSS");
    GM_addStyle(notyf_css);
})();

/**
 * 主函数 - 初始化插件功能
 * 在配置编辑弹窗加载完成后调用，添加格式化和压缩按钮
 */
function mainFunc() {
    // 获取配置编辑弹窗元素
    let itemModal = document.getElementById('itemModal');
    console.log(itemModal);
    
    // 定位到弹窗底部的按钮区域
    let footer = itemModal.children[0].children[0].children[2];

    // 添加功能按钮
    appendButton(footer, '最小化', miniJson);   // 压缩JSON按钮
    appendButton(footer, '格式化', formatJson); // 格式化JSON按钮

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
 * 格式化JSON - 将压缩的JSON转换为易读的缩进格式
 * 使用4个空格作为缩进，便于阅读和编辑
 */
function formatJson() {
    let textArea = document.getElementById('valueEditor');
    try {
        // 解析JSON字符串为对象
        let jsonObject = JSON.parse(textArea.value);
        
        // 验证解析结果是否为有效对象
        if (typeof(jsonObject) == 'object') {
            // 使用4空格缩进格式化JSON
            textArea.value = JSON.stringify(jsonObject, null, 4);
            window.notyf.success('格式化完成');
            // 触发input事件，确保框架能检测到值的变化
            dispatchInputEvent(textArea);
        } else {
            window.notyf.error('解析JSON失败');
        }
    } catch (err) {
        // JSON解析失败时显示错误提示
        window.notyf.error('解析JSON失败');
    }
}

/**
 * 压缩JSON - 将格式化的JSON转换为单行压缩格式
 * 移除所有不必要的空白字符，减少存储空间
 */
function miniJson() {
    let textArea = document.getElementById('valueEditor');
    try {
        // 解析JSON字符串为对象
        let jsonObject = JSON.parse(textArea.value);
        
        // 验证解析结果是否为有效对象
        if (typeof(jsonObject) == 'object') {
            // 不使用缩进参数，生成压缩格式的JSON
            textArea.value = JSON.stringify(jsonObject);
            // 触发input事件，确保框架能检测到值的变化
            dispatchInputEvent(textArea);
            window.notyf.success('最小化完成');
        } else {
            window.notyf.error('解析JSON失败');
        }
    } catch (err) {
        // JSON解析失败时显示错误提示
        window.notyf.error('解析JSON失败');
    }
}

/**
 * 触发input事件
 * 手动派发input事件，确保Vue、Angular等现代框架能够检测到输入框值的变化
 * @param {HTMLElement} ele - 需要触发事件的DOM元素
 */
function dispatchInputEvent(ele) {
    ele.dispatchEvent(new Event('input', {'bubbles': true, 'cancelable': false}));
}

/**
 * 通用按钮创建函数
 * 创建统一样式的功能按钮并添加到指定父元素
 * @param {HTMLElement} parentEle - 按钮的父容器元素
 * @param {string} buttonDesc - 按钮显示的文本
 * @param {Function} onClickFunc - 按钮点击时执行的回调函数
 */
function appendButton(parentEle, buttonDesc, onClickFunc) {
    let newButton = document.createElement("button");
    newButton.setAttribute("type", "button");
    newButton.setAttribute("class", "btn btn-default");
    newButton.setAttribute("style", "float:left");
    newButton.onclick = onClickFunc;
    newButton.innerHTML = buttonDesc;
    parentEle.appendChild(newButton);
}
