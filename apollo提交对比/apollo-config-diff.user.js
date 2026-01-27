// ==UserScript==
// @name         Apollo Config Diff
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Apollo配置中心配置变更对比工具 - 可视化高亮显示配置修改前后的差异
// @author       lvhaifeng
// @match        https://your-apollo-config.com/config.html*
// @match        http://your-apollo-config.com/config.html*
// @require      https://gist.githubusercontent.com/raw/2625891/waitForKeyElements.js
// @require      https://github.com/google/diff-match-patch/raw/master/javascript/diff_match_patch_uncompressed.js
// @icon         https://your-apollo-config.com/img/config.png
// @grant        none
// ==/UserScript==

/**
 * Apollo Config Diff - Apollo配置中心变更对比增强插件
 * 
 * 功能特性：
 * - 可视化差异对比：使用Google的diff-match-patch算法进行文本差异分析
 * - 高亮显示变更：删除的内容用红色背景标记，新增的内容用绿色背景标记
 * - JSON格式化支持：可选择性地在对比前将JSON格式化，便于查看结构化差异
 * - 一键对比：在发布确认弹窗中添加对比按钮，方便快速查看变更
 * 
 * 使用场景：
 * - 发布配置前，查看本次修改的所有变更内容
 * - 审核配置变更时，快速定位修改的具体位置
 * - 对比压缩JSON时，先格式化再对比，更易发现细微差异
 * 
 * 技术实现：
 * - 使用waitForKeyElements监听DOM元素加载
 * - 集成diff-match-patch库进行差异计算
 * - 通过DOM操作渲染差异高亮效果
 * - 使用localStorage保存用户的JSON格式化偏好设置
 */

(function() {
    'use strict';
    console.log('Apollo Config Diff 插件启动');
    
    // 等待发布确认弹窗加载完成后执行主函数
    waitForKeyElements("#releaseModal", mainFunction);
})();

/**
 * 主函数 - 初始化插件功能
 * 在发布确认弹窗加载完成后调用，添加对比按钮和JSON格式化开关
 */
function mainFunction() {
    console.log("Apollo Config Diff 初始化");

    // 获取发布确认弹窗元素
    let releaseModal = document.getElementById('releaseModal');
    
    // 定位到弹窗底部的按钮区域
    let buttonParent = releaseModal.firstElementChild.firstElementChild.children[2];
    
    // 添加对比按钮
    appendButton(buttonParent, "对比", doCompare);

    // 创建JSON格式化开关复选框
    let checkbox = document.createElement('input');
    checkbox.setAttribute('id', 'jsonCheckbox');
    checkbox.setAttribute('type', 'checkbox');
    
    // 从localStorage读取用户的偏好设置
    checkbox.setAttribute('defaultChecked', 'true' == localStorage.getItem('jsonSwitch'));
    checkbox.setAttribute('checked', 'true' == localStorage.getItem('jsonSwitch'));
    checkbox.onchange = jsonCheckbox;
    
    // 设置复选框样式
    checkbox.style.width = checkbox.style.height = '25px';
    checkbox.style.marginLeft = '10px';
    checkbox.style.float = 'left';
    buttonParent.appendChild(checkbox);
}

/**
 * JSON格式化开关变更处理函数
 * 当用户切换复选框时，保存偏好设置到localStorage
 */
function jsonCheckbox() {
    let checkbox = document.getElementById('jsonCheckbox');
    localStorage.setItem('jsonSwitch', checkbox.checked);
}

/**
 * 执行配置对比
 * 遍历所有配置变更项，计算差异并渲染高亮效果
 */
function doCompare() {
    // 获取配置变更表格的所有行
    let tableRows = document.getElementsByClassName('col-sm-10 ng-scope form-group ng-valid')[0].firstElementChild.children[1];
    
    // 创建diff-match-patch实例
    let dmp = new diff_match_patch();
    
    // 读取JSON格式化开关状态
    let jsonSwitch = ('true' == localStorage.getItem('jsonSwitch'));
    
    // 遍历每一行配置变更
    for (let tableRow of tableRows.children) {
        // 获取旧值和新值，根据开关决定是否格式化JSON
        let oldText = jsonSwitch ? formatJson(tableRow.children[1].innerText) : tableRow.children[1].innerText;
        let newText = jsonSwitch ? formatJson(tableRow.children[2].innerText) : tableRow.children[2].innerText;
        
        // 计算文本差异
        let diffs = dmp.diff_main(oldText, newText);

        // 渲染差异高亮效果
        tableRow.children[1].style.textAlign = 'left';
        tableRow.children[1].firstElementChild.innerHTML = renderOldText(diffs);
        tableRow.children[2].style.textAlign = 'left';
        tableRow.children[2].firstElementChild.innerHTML = renderNewText(diffs);
    }
}

/**
 * 渲染旧文本的差异视图
 * 显示删除的内容（红色高亮）和未变化的内容
 * @param {Array} diffs - diff-match-patch生成的差异数组
 * @returns {string} 带有HTML高亮标记的文本
 */
function renderOldText(diffs) {
    let renderText = "";
    for (let diff of diffs) {
        if (diff[0] == -1) {
            // 删除的内容：用红色背景高亮
            renderText += '<span style="background:#ee7447;">' + diff[1] + '</span>';
        } else if (diff[0] == 0) {
            // 未变化的内容：正常显示
            renderText += '<span>' + diff[1] + '</span>';
        }
        // 新增的内容（diff[0] == 1）在旧文本视图中不显示
    }
    return '<pre>' + renderText + '</pre>';
}

/**
 * 渲染新文本的差异视图
 * 显示新增的内容（绿色高亮）和未变化的内容
 * @param {Array} diffs - diff-match-patch生成的差异数组
 * @returns {string} 带有HTML高亮标记的文本
 */
function renderNewText(diffs) {
    let renderText = "";
    for (let diff of diffs) {
        if (diff[0] == 1) {
            // 新增的内容：用绿色背景高亮
            renderText += '<span style="background:#65db79;">' + diff[1] + '</span>';
        } else if (diff[0] == 0) {
            // 未变化的内容：正常显示
            renderText += '<span>' + diff[1] + '</span>';
        }
        // 删除的内容（diff[0] == -1）在新文本视图中不显示
    }
    return '<pre>' + renderText + '</pre>';
}

/**
 * JSON格式化函数
 * 尝试将输入文本解析为JSON并格式化，失败则返回原文本
 * @param {string} rawText - 原始文本
 * @returns {string} 格式化后的JSON文本或原文本
 */
function formatJson(rawText) {
    try {
        let o = JSON.parse(rawText);
        return JSON.stringify(o, null, 4);
    } catch (err) {
        // 解析失败，返回原文本
        return rawText;
    }
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
