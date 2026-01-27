// ==UserScript==
// @name         DevOps Pipeline Helper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  DevOps平台增强插件 - 提供快速部署、分支收藏、项目直达、终端模拟等功能
// @author       lvhaifeng
// @match        https://your-devops-platform.com/devops/project/*
// @match        http://your-devops-platform.com/devops/project/*
// @match        http://your-devops-platform.com/devops/pipline/
// @match        https://your-devops-platform.com/devops/pipline/
// @require      https://code.jquery.com/jquery-2.0.0.min.js
// @require      https://unpkg.com/xterm/lib/xterm.js
// @require      https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js
// @require      https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @resource     xtermCss https://unpkg.com/xterm/css/xterm.css
// @resource     jqueryUiCss https://code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// ==/UserScript==

/**
 * DevOps Pipeline Helper - DevOps平台增强插件
 * 
 * 功能特性：
 * - 快速部署：一键执行流水线，支持批量部署和计划任务
 * - 分支收藏：收藏常用分支，快速切换
 * - 项目直达：卡片悬浮显示Apollo、Cat、Umelog、Dubbo等快捷链接
 * - 终端模拟：基于WebSocket连接到K8s Pod，实现终端操作
 * - 项目管理：支持项目卡片拖拽排序、隐藏不常用项目
 * - 缓存机制：智能缓存分支、流水线、任务数据，加速加载
 * 
 * 工作模式：
 * - workType=1: 流水线列表页面（/devops/pipline/）
 * - workType=2: 项目详情页面（/devops/project/*）
 * 
 * 第三方依赖：
 * - jQuery 2.0.0 - DOM操作和UI交互
 * - jQuery UI 1.12.1 - 拖拽和缩放功能
 * - xterm.js - 终端模拟器
 * - xterm-addon-fit - 终端自适应尺寸
 * 
 * 数据存储：
 * - localStorage: 存储用户配置、收藏分支、缓存数据、部署计划
 * - token: 从DevOps平台获取的认证令牌
 */
// ==================== 全局变量 ====================

let urlFlag = '.com';           // URL后缀标志（.com或.com.cn）
let workType = null;            // 工作模式：1=流水线列表页，2=项目详情页
let configureId = null;         // 当前项目配置ID
let appName = null;             // 当前项目名称
let headers = null;             // API请求头
let token = null;               // 认证令牌
let favoriteApp = null;         // 当前项目的收藏配置
let favoriteBranches = [];      // 收藏的分支列表
// 输入框状态记录（用于失焦时恢复）
let initialBranchInput = '';    // 分支输入框的初始值
let initialProjectInput = '';   // 项目输入框的初始值
let dialogShown = false;        // 弹窗显示状态标志

// ==================== 缓存配置 ====================

let projectsCacheKey = null;                        // 项目列表缓存键
const projectsCacheDuration = 24 * 60 * 60 * 1000;  // 项目缓存有效期：24小时
let branchCacheKey = null;                          // 分支列表缓存键
const branchCacheDuration = 20 * 60 * 1000;         // 分支缓存有效期：20分钟
let pipelineCacheKey = null;                        // 流水线列表缓存键
const pipelineCacheDuration = 2 * 3600 * 1000;      // 流水线缓存有效期：2小时
let taskCacheKey = null;                            // 任务列表缓存键
const taskCacheDuration = 20 * 60 * 1000;           // 任务缓存有效期：20分钟

// ==================== 部署计划配置 ====================

let deploySchedules = [];                           // 部署计划列表
const maxDuration = 45 * 60 * 1000;                 // 单个任务最大执行时间：45分钟

// ==================== 直达菜单配置 ====================

const ROW_ONE_MAX_HEIGHT = '50px';  // 菜单行最大高度

/**
 * 直达菜单项配置
 * 支持的占位符：
 * - {appName}: 项目名称
 * - {startTimestamp}: 开始时间戳（当前时间-1小时）
 * - {endTimestamp}: 结束时间戳（当前时间）
 */
const basicLinks = [
    {text: 'Apollo', url: 'https://your-apollo-config.com/config.html?#/appid={appName}'},
    {text: 'APM', url: 'https://your-apm-platform.com/trace?service={appName}'},
    {text: 'Log', url: 'https://your-log-platform.com/log?serviceName={appName}&startTimestamp={startTimestamp}&endTimestamp={endTimestamp}'},
    {text: 'ServiceMesh', url: 'https://your-service-mesh.com/services/{appName}'},
];

// ==================== 样式定义 ====================

// 创建并注入自定义CSS样式
const styleElement = document.createElement('style');
const cssRules = `
.branch-ant-tag {
            display: inline-flex; /* 使用flex布局，方便对齐内部元素 */
            align-items: center; /* 垂直居中对齐内部元素 */
            justify-content: center; /* 水平居中对齐内部元素 */
            padding: 3px 7px; /* 适当减小内边距，使按钮尺寸变小 */
            border: 1px solid #ccc;
            border-radius: 3.5px;
            cursor: pointer;
            background-color: #f0f0f0;
            color: #333;
            transition: all 0.3s ease;
            margin-left: 14px; /* 增加与“执行流水线”文本的间距 */
            font-size: 14px;
        }

      .branch-ant-tag:hover,
      .branch-ant-tag.active {
            background-color: #409EFF;
            color: white;
            font-weight: bold;
        }

      .branch-anticon-close {
            display: flex;
            margin-left: 3px;
            margin-top: 3px;
            cursor: pointer;
        }

      .branch-anticon-close svg {
            width: 11px; /* 可以适当调整图标大小，这里设置宽度为14px */
            height: 11px;
        }
}`;
// 将CSS规则内容添加到<style>元素中
styleElement.textContent = cssRules;
// 将样式注入到页面
document.head.appendChild(styleElement);

// ==================== 入口函数 ====================

(function () {
    /* globals jQuery, $, waitForKeyElements */
    'use strict';
    console.log('DevOps Pipeline Helper 启动');
    mainFunction();
})();


/**
 * 主函数 - 插件入口
 * 根据当前页面URL判断工作模式并初始化相应功能
 */
function mainFunction() {
    console.log("mainFunction");
    getHeaders();

    // 获取当前页面的URL
    const currentUrl = window.location.href;
    urlFlag = currentUrl.includes('.com.cn') ? '.com.cn' : '.com';
    if (currentUrl.endsWith('/devops/pipline/')) {
        workType = 1;
        waitForKeyElements('.ant-tabs-nav.ant-tabs-nav-animated', function () {
            //加载我的工程
            loadMyProjects();
            appendButton('Just Go!', mainDialogFunc);
            workType1ButtonEvent();
            //每个卡片增加直达列表
            appendExtraFuncEvent();
        });
    } else if (currentUrl.includes('/devops/project/')) {
        workType = 2;
        waitForKeyElements('.project-title', function () {
            appendButton('Just Go!', mainDialogFunc);
            //刷新流水线执行情况
            newPageProjectStatusRefresh();
        });
    } else {
        return null;
    }
}


/**
 * 主弹窗函数
 * 创建并显示流水线执行弹窗
 */
function mainDialogFunc() {
    console.log("mainDialogFunc");
    createDialogWithSelect();
    if (workType === 2) {
        afterLoadProjects("");
    }
}

/**
 * 工作模式1的按钮事件绑定
 * 为"我的工程"菜单项添加点击事件
 */
function workType1ButtonEvent() {
    $(document).ready(function () {
        $('.ant-menu-item').filter(function () {
            return $(this).text().includes("我的工程");
        }).click(function () {
            waitForKeyElements('.ant-tabs-nav.ant-tabs-nav-animated', function () {
                appendButton('Just Go!', mainDialogFunc);
                appendExtraFuncEvent();
            });
        });
    });
}


/**
 * 清空指定下拉列表的选项
 * @param {string} tagPreFix - 下拉列表的前缀标识（branch/commit/pipeline等）
 */
function clearOption(tagPreFix) {
    const input = document.getElementById(`${tagPreFix}-input`);
    if (input) input.value = '';
    const description = document.getElementById('description');
    if (description) description.value = '';
    const selectElement = document.getElementById(`${tagPreFix}-select`);
    if (selectElement) {
        const dropdownList = selectElement.querySelector('.el-select-dropdown__list');
        if (dropdownList) dropdownList.innerHTML = "";
    }
}

/**
 * 获取任务选择列表
 * 当流水线为生产或灰度时，显示Issues选择框
 * @param {string} pipeline - 流水线名称
 */
function getTaskSelect(pipeline) {
    const taskOptionList = document.getElementById('task-option-list');
    const taskFormItem = document.getElementById('task-label-div');
    // 生产/灰度流水线需要关联Issues
    if (pipeline.includes('生产') || pipeline.includes('灰度')) {
        taskFormItem.style.display = 'block';
        taskOptionList.innerHTML = '';

        loadTasks()
            .then(tasks => {
                // 获取弹窗中的下拉列表元素
                const selectElement = document.getElementById('task-select');
                if (selectElement) {
                    const taskInput = document.getElementById('task-input');
                    if (tasks.length > 0) {
                        if (taskInput.innerText === '') {
                            setTaskClickEvent(taskInput, tasks[0].value, tasks[0].text);
                        }
                        // 重新设置下拉列表的功能，传入加载完成的分支信息
                        setupSelect('task-select', tasks, function (event) {
                            console.log('选中的任务是：', event.target.value);
                        });
                    } else {
                        // 没有任务时的处理
                        taskInput.value = '';
                        console.log('没有可用的任务');
                    }
                }
            }).catch(error => {
            console.error(error);
        });
    } else {
        taskFormItem.style.display = 'none';
    }
}

/**
 * 获取指定分支的commit列表
 * @param {string} currentBranch - 分支名称
 */
function getCommits(currentBranch) {
    if (currentBranch && currentBranch !== 'loading...') {
        clearOption('commit');
        loadCommits(currentBranch)
            .then(commits => {
                const commitInput = document.getElementById('commit-input');
                const description = document.getElementById('description');
                // 设置commit输入框展示获取到的commits的最后一个内容（如果有）
                if (commits.length > 0) {
                    commitInput.value = `${commits[0].value} ${commits[0].text}`;
                    description.value = commits[0].text.slice(0, 50);
                }
                setupSelect('commit-select', commits, function (event) {
                    console.log('选中的commit是：', event.target.value);
                });
            })
            .catch(error => {
                console.error(error);
            });
    }
}

// ==================== 弹窗创建 ====================

/**
 * 创建流水线执行弹窗
 * 包含项目选择、分支选择、commit选择、流水线选择、描述输入、Issues选择等
 * @param {string} projectName - 预选的项目名称（可选）
 */
function createDialogWithSelect(projectName) {
    // 先移除已存在的弹窗，避免重复创建
    removeDialog();
    // 创建弹窗的HTML结构
    var dialogHtml = `<div role="dialog" id = "dialog" aria-modal="true" aria-label="请选择一个选项" class="el-dialog"
     style="margin-top: 15vh; position: absolute; top: 10%; left: 50%; transform: translate(-50%, -20%); width: 630px; z-index: 1000; background: white; padding: 20px;">
    <div class="el-dialog__header"><span class="el-dialog__title">执行流水线
        <span class="ant-descriptions-item-content" id="tag-container"></span>
        </span>
        <button type="button" aria-label="Close" class="el-dialog__headerbtn"><i
            class="el-dialog__close el-icon el-icon-close" id="dialogClose"></i></button>
    </div>
    <div class="el-dialog__body">
        <form class="el-form">
        <div class="el-form-item is-required el-form-item--small" id="project-label-div" style="display: none"><label for="project"
                                                                             class="el-form-item__label"
                                                                             style="width: 120px;">Project</label>
                <div class="el-form-item__content" style="margin-left: 120px;">
                    <div class="el-select el-select--small" style="width: 300px;" id="project-select"><!---->
                        <div class="el-input el-input--small el-input--suffix"><!----><input type="text"
                                                                                             placeholder="loading..."
                                                                                             class="el-input__inner"
                                                                                             id="project-input"/><!----><span
                            class="el-input__suffix"><span class="el-input__suffix-inner"><i
                            class="el-select__caret el-input__icon el-icon-arrow-up"></i><!----><!----><!----><!----><!----></span><!----></span><!----><!---->
                        </div>
                        <div class="el-select-dropdown el-popper" style="min-width: 300px; position: absolute; top: 100%; left: 0; transform-origin: center top; z-index: 3004; display: none">
                            <div class="el-scrollbar">
                                <div
                                    class="el-select-dropdown__wrap el-scrollbar__wrap el-scrollbar__wrap--hidden-default">
                                    <ul class="el-scrollbar__view el-select-dropdown__list" id="project-option-list"></ul>
                                </div>
                                <div class="el-scrollbar__bar is-horizontal">
                                    <div class="el-scrollbar__thumb" style="transform: translateX(0%);"></div>
                                </div>
                                <div class="el-scrollbar__bar is-vertical">
                                    <div class="el-scrollbar__thumb" style="transform: translateY(0%);"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="el-form-item is-required el-form-item--small"><label for="branch"
                                                                             class="el-form-item__label"
                                                                             style="width: 120px;">Git分支</label>
                <div class="el-form-item__content" style="margin-left: 120px;">
                    <div class="el-select el-select--small" style="width: 300px;" id="branch-select"><!---->
                        <div class="el-input el-input--small el-input--suffix"><!----><input type="text"
                                                                                             placeholder="loading..."
                                                                                             class="el-input__inner"
                                                                                             id="branch-input"/><!----><span
                            class="el-input__suffix"><span class="el-input__suffix-inner"><i
                            class="el-select__caret el-input__icon el-icon-arrow-up"></i><!----><!----><!----><!----><!----></span><!----></span><!----><!---->
                        </div>
                        <div class="el-select-dropdown el-popper" style="min-width: 300px; position: absolute; top: 100%; left: 0; transform-origin: center top; z-index: 3004; display: none">
                            <div class="el-scrollbar">
                                <div
                                    class="el-select-dropdown__wrap el-scrollbar__wrap el-scrollbar__wrap--hidden-default">
                                    <ul class="el-scrollbar__view el-select-dropdown__list" id="branch-option-list"></ul>
                                </div>
                                <div class="el-scrollbar__bar is-horizontal">
                                    <div class="el-scrollbar__thumb" style="transform: translateX(0%);"></div>
                                </div>
                                <div class="el-scrollbar__bar is-vertical">
                                    <div class="el-scrollbar__thumb" style="transform: translateY(0%);"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="el-button el-button--primary el-button--small" id="collectBranch">收藏</button>
                </div>
            </div>
            <div class="el-form-item is-required el-form-item--small"><label for="Commit"
                                                                             class="el-form-item__label"
                                                                             style="width: 120px;">commit</label>
                <div class="el-form-item__content" style="margin-left: 120px;">
                    <div class="el-select el-select--small" style="width: 300px;" id="commit-select"><!---->
                        <div class="el-input el-input--small el-input--suffix"><!----><input type="text"
                                                                                             placeholder="loading..."
                                                                                             class="el-input__inner" readonly="readonly"
                                                                                             id="commit-input"/><!----><span
                            class="el-input__suffix"><span class="el-input__suffix-inner"><i
                            class="el-select__caret el-input__icon el-icon-arrow-up"></i><!----><!----><!----><!----><!----></span><!----></span><!----><!---->
                        </div>
                        <div class="el-select-dropdown el-popper" style="min-width: 300px; position: absolute; top: 100%; left: 0; transform-origin: center top; z-index: 3004; display: none; float: left; color: rgb(132, 146, 166); font-size: 13px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" >
                            <div class="el-scrollbar">
                                <div
                                    class="el-select-dropdown__wrap el-scrollbar__wrap el-scrollbar__wrap--hidden-default" >
                                    <ul class="el-scrollbar__view el-select-dropdown__list" id="commit-option-list"></ul>
                                </div>
                                <div class="el-scrollbar__bar is-horizontal">
                                    <div class="el-scrollbar__thumb" style="transform: translateX(0%);"></div>
                                </div>
                                <div class="el-scrollbar__bar is-vertical">
                                    <div class="el-scrollbar__thumb" style="transform: translateY(0%);"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="el-form-item is-required el-form-item--small"><label for="pipeline"
                                                                             class="el-form-item__label"
                                                                             style="width: 120px;">流水线</label>
                <div class="el-form-item__content" style="margin-left: 120px;">
                    <div class="el-select el-select--small" style="width: 300px;" id="pipeline-select"><!---->
                        <div class="el-input el-input--small el-input--suffix"><!----><input type="text"
                                                                                             placeholder="loading..."
                                                                                             class="el-input__inner" readonly="readonly"
                                                                                             id="pipeline-input"/><!----><span
                            class="el-input__suffix"><span class="el-input__suffix-inner"><i
                            class="el-select__caret el-input__icon el-icon-arrow-up"></i><!----><!----><!----><!----><!----></span><!----></span><!----><!---->
                        </div>
                        <div class="el-select-dropdown el-popper" style="min-width: 300px; position: absolute; top: 100%; left: 0; transform-origin: center top; z-index: 3004; display: none" >
                            <div class="el-scrollbar">
                                <div
                                    class="el-select-dropdown__wrap el-scrollbar__wrap el-scrollbar__wrap--hidden-default" >
                                    <ul class="el-scrollbar__view el-select-dropdown__list" id="pipeline-option-list"></ul>
                                </div>
                                <div class="el-scrollbar__bar is-horizontal">
                                    <div class="el-scrollbar__thumb" style="transform: translateX(0%);"></div>
                                </div>
                                <div class="el-scrollbar__bar is-vertical">
                                    <div class="el-scrollbar__thumb" style="transform: translateY(0%);"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="el-form-item is-required el-form-item--small"><label for="description"
                                                                             class="el-form-item__label"
                                                                             style="width: 120px;">描述</label>
                <div class="el-form-item__content" style="margin-left: 120px;">
                    <div class="descp-input el-input el-input--small"><!----><input type="text"
                                                                                    autocomplete="off"
                                                                                    maxlength="255"
                                                                                    class="el-input__inner"
                                                                                    id = "description"/><!----><span
                        class="el-input__suffix"><span class="el-input__suffix-inner"><!----><!----><!----><span
                        class="el-input__count"><span class="el-input__count-inner">
            0/255
          </span></span></span><!----></span><!----><!----></div>
                    <!----></div>
            </div>
            <div class="el-form-item is-required el-form-item--small" id="task-label-div" style="display: none"><label for="task"
                                                                             class="el-form-item__label"
                                                                             style="width: 120px;">Issues</label>
                <div class="el-form-item__content" style="margin-left: 120px;">
                    <div class="el-select el-select--small" style="position: relative; width: 400px" id="task-select"><!---->
                        <div style="border: 1px dashed rgb(220, 223, 230); padding: 0px 15px; margin-right: 35px; min-height: 32px;" id="task-input">
                        </div>
                        <div class="el-select-dropdown el-popper" style="min-width: 300px; position: absolute; top: 100%; left: 0; transform-origin: center top; z-index: 3004; display: none" >
                            <div class="el-scrollbar">
                                <div
                                    class="el-select-dropdown__wrap el-scrollbar__wrap el-scrollbar__wrap--hidden-default" >
                                    <ul class="el-scrollbar__view el-select-dropdown__list" id="task-option-list"></ul>
                                </div>
                                <div class="el-scrollbar__bar is-horizontal">
                                    <div class="el-scrollbar__thumb" style="transform: translateX(0%);"></div>
                                </div>
                                <div class="el-scrollbar__bar is-vertical">
                                    <div class="el-scrollbar__thumb" style="transform: translateY(0%);"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="el-form-item el-form-item--small" id="deployTask-label-div" style="display: none"><label for="deployTask"
                                                                             class="el-form-item__label"
                                                                             style="width: 120px;">计划任务</label>
                <div class="el-form-item__content" style="margin-left: 120px;">
                    <div class="el-select el-select--small" style="position: relative; width: 420px" id="deployTask-select"><!---->
                        <div style="border: 1px dashed rgb(220, 223, 230); padding: 0px 15px; margin-right: 35px; min-height: 32px;" id="deployTask-input">
                        </div>
                    </div>
                </div>
            </div>
        </form>
    </div>
    <div class="el-dialog__footer">
        <button type="button" class="el-button el-button--primary el-button--small" style="display: none; float: left; background-color: #20a162; border-color: #20a162 " id="executeDeployTasks">执行计划</button>
        <button type="button" class="el-button el-button--primary el-button--small" id="deploy">执行当前</button>
        <button type="button" class="el-button el-button--primary el-button--small" id="addToDeployTask">添加到计划</button>
    </div>
</div>`;

    // 创建一个新的div元素来作为弹窗的容器
    var dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = dialogHtml;
    let buttonParent = document.querySelector('.ume-main');
    buttonParent.appendChild(dialogContainer);

    const dialogElement = dialogContainer.firstChild;
    setupButtons(dialogElement);
    if (workType === 1) {
        //展示 project list列表
        const projectLabelDiv = dialogElement.querySelector('#project-label-div');
        projectLabelDiv.style.display = 'block';
        //初始化参数
        loadMyProjects().then(projects => {
            const projectSelectElement = dialogElement.querySelector('#project-select');
            if (projectSelectElement) {
                const projectInput = document.getElementById('project-input');
                // 确保选中的值与传入的项目名称一致
                if (projectName) {
                    const targetProject = projects.find(p => p.text === projectName);
                    projectInput.value = targetProject.text;
                    projectInput.dataset.value = targetProject.value;
                } else {
                    projectInput.value = projects[0].text;
                    projectInput.dataset.value = projects[0].value
                }
                initialProjectInput = projectInput.value; // 记录获得焦点时的输入框内容
                afterLoadProjects(`${projectInput.dataset.value} ${projectInput.value}`);
                // 为输入框添加input事件监听器，用于实时进行模糊匹配
                projectInput.addEventListener('input', function () {
                    filterSelect('project-select', projects, this.value); // 传入已加载的分支数据和输入框的值进行筛选
                });

                // 重新设置下拉列表的功能，传入加载完成的分支信息
                setupSelect('project-select', projects, function (event) {
                    console.log('选中的project是：', event.target.value);
                });
            }
        })
    }
}

/**
 * 项目加载完成后的回调处理
 * @param {string} projectInputValue - 项目输入值（格式："configureId projectName"）
 */
function afterLoadProjects(projectInputValue) {
    const dialogElement = document.getElementById('dialog');
    getBaseParam(projectInputValue);
    loadCore();
    cacheInitData(dialogElement);
}

/**
 * 项目页面状态刷新
 * 检查是否有未完成的部署任务，有则继续执行
 */
function newPageProjectStatusRefresh() {
    configureId = getConfigureIdFromUrl();
    let targetSchedule = getAppDeploySchedules(String(configureId));
    if (targetSchedule && targetSchedule.executeFlag && targetSchedule.deployTaskList.length !== 0) {
        //还有没执行完的任务，尝试执行
        executeDeployTasksHandler(false)
    } else if (!targetSchedule || !targetSchedule.deployTaskList || targetSchedule.deployTaskList.length === 0) {
        // 如果任务列表为空或未执行，直接退出
        console.log("已触发执行任务中没有要执行的了，无需启动定时刷新");
    }
}

/**
 * 初始化缓存数据并设置弹窗初始值
 * @param {HTMLElement} dialogElement - 弹窗DOM元素
 */
function cacheInitData(dialogElement) {
    generateAntTags(favoriteBranches, dialogElement);
    setBranchInputInitialValue(dialogElement);
    setDeployTaskInputInitialValue(dialogElement);
}

/**
 * 加载核心数据
 * 加载分支列表、流水线列表和任务列表
 */
function loadCore() {
    clearOption('branch');
    loadAllBranches()
        .then(branches => {
            // 获取弹窗中的下拉列表元素
            const selectElement = document.getElementById('branch-select');
            if (selectElement) {
                const dropdownList = selectElement.querySelector('.el-select-dropdown__list');
                dropdownList.innerHTML = "";
                const branchInput = document.getElementById('branch-input');
                // 为输入框添加input事件监听器，用于实时进行模糊匹配
                branchInput.addEventListener('input', function () {
                    filterSelect('branch-select', branches, this.value); // 传入已加载的分支数据和输入框的值进行筛选
                });

                // 重新设置下拉列表的功能，传入加载完成的分支信息
                setupSelect('branch-select', branches, function (event) {
                    console.log('选中的分支是：', event.target.value);
                });
            }
        })
        .catch(error => {
            console.error(error);
        });
    clearOption('pipeline');
    loadAllPipelines()
        .then(pipelines => {
            // 获取弹窗中的下拉列表元素
            const selectElement = document.getElementById('pipeline-select');
            if (selectElement) {
                const dropdownList = selectElement.querySelector('.el-select-dropdown__list');
                dropdownList.innerHTML = "";
                const pipelineInput = document.getElementById('pipeline-input');
                const selectedPipeline = pipelines.filter(pipeline => pipeline.text.includes("测试"))[0];
                pipelineInput.value = selectedPipeline ? selectedPipeline.text : (pipelines.length > 0 ? pipelines[0].text : "");
                pipelineInput.dataset.value = selectedPipeline.value;
                if (pipelineInput.value !== "") {
                    getTaskSelect(pipelineInput.value);
                }
                // 重新设置下拉列表的功能，传入加载完成的分支信息
                setupSelect('pipeline-select', pipelines, function (event) {
                    console.log('选中的流水线是：', event.target.value);
                });
            }
        })
        .catch(error => {
            console.error(error);
        });

    //提前加载存缓存
    loadTasks();
}

/**
 * 筛选下拉列表选项
 * 根据输入内容进行模糊匹配
 * @param {string} selectId - 下拉列表元素ID
 * @param {Array} selectData - 完整的选项数据
 * @param {string} query - 筛选关键词
 */
function filterSelect(selectId, selectData, query) {
    const selectElement = document.getElementById(selectId);
    const dropdown = selectElement.querySelector('.el-select-dropdown');
    const dropdownList = selectElement.querySelector('.el-select-dropdown__list');
    dropdownList.innerHTML = "";

    const filteredData = selectData.filter(data => typeof data.value === 'number' ? data.text.includes(query.toLowerCase()) : data.value.includes(query.toLowerCase()));
    // 先清空下拉列表中的已有选项
    if (filteredData.length > 0) {
        // 重新设置下拉列表的功能，传入加载完成的分支信息
        setupSelect(selectId, filteredData, function (event) {
            console.log('选中的是：', event.target.value);
        });
        // 主动设置下拉列表显示，确保筛选出内容后能自动显示下拉列表
        dropdown.style.display = 'block';
    } else {
        // 如果没有匹配的分支，隐藏分支列表（设置为不显示）
        dropdown.style.display = 'none';
    }
    // 如果没有匹配的分支，不做额外操作，保持下拉列表清空状态（即隐藏分支列表）
}

/**
 * 设置任务点击事件
 * 将选中的任务添加到任务输入框中
 * @param {HTMLElement} taskInputDiv - 任务输入容器
 * @param {number} taskId - 任务ID
 * @param {string} taskText - 任务标题
 */
function setTaskClickEvent(taskInputDiv, taskId, taskText) {
    let taskIds = [];
    if (taskInputDiv.dataset.value) {
        try {
            taskIds = JSON.parse(taskInputDiv.dataset.value);
        } catch (error) {
            console.error('Error parsing taskInputDiv.dataset.value:', error);
        }
    }

    // 仅当 taskId 存在且不在 taskIds 数组中时，将其添加到任务 id 数组中
    if (taskId && !taskIds.includes(taskId)) {
        taskIds.push(taskId);
        taskInputDiv.dataset.value = JSON.stringify(taskIds);
        const span = document.createElement('span');
        span.className = "select-issue el-tag el-tag--info el-tag--small";
        span.innerHTML = `${taskText}<i class="el-tag__close el-icon-close"></i>`;
        taskInputDiv.appendChild(span);
        // 为关闭图标添加点击事件处理，以删除任务
        span.querySelector('i').addEventListener('click', function () {
            const taskIds = JSON.parse(taskInputDiv.dataset.value);
            const index = taskIds.indexOf(taskId);
            if (index > -1) {
                taskIds.splice(index, 1);
                taskInputDiv.dataset.value = JSON.stringify(taskIds);
                if (taskIds.length === 0) {
                    taskInputDiv.dataset.value = "";
                }
                taskInputDiv.removeChild(span);
            }
        });
    }

}

/**
 * 设置下拉列表功能
 * 初始化下拉列表选项并绑定事件
 * @param {string} selectId - 下拉列表元素ID
 * @param {Array} options - 选项数据数组 [{value, text}]
 * @param {Function} onSelectFunc - 选中回调函数
 */
function setupSelect(selectId, options, onSelectFunc) {
    const selectElement = document.getElementById(selectId);
    const dropdown = selectElement.querySelector('.el-select-dropdown');
    const dropdownList = selectElement.querySelector('.el-select-dropdown__list');

    // 判断是branch还是commit下拉列表，通过检查元素是否有特定类名或者属性等来区分，这里简单以id包含特定字符串为例
    const isProjectList = selectId.includes('project');
    const isBranchList = selectId.includes('branch');
    const isCommitList = selectId.includes('commit');
    const isPipelineList = selectId.includes('pipeline');
    const isTaskList = selectId.includes('task');
    dropdownList.innerHTML = "";
    // 如果传入的options为空（初始情况），只保留已有的默认项
    if (options.length === 0) {
        return;
    }
// 先清空下拉列表中的所有选项
    options.forEach(function (option) {
        const item = document.createElement('li');
        item.classList.add('el-select-dropdown__item');
        if (isCommitList) {
            item.innerHTML = `<span style="float: left;">${option.value} </span><span style="margin-left: 10px; text-align: left;"> ${option.text}</span>`;
        } else if (isTaskList) {
            item.innerHTML = `<span style="display: flex; align-items: center; float: left; color: rgb(132, 146, 166); font-size: 13px;">
                                <a target="_blank" href="/devops/issue/?id=${option.value}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="12" height="12" class="" style="fill: #409eff; margin-right: 5px;"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"></path></svg></a> 
                              <span>${option.text}</span></span>`;
        } else {
            item.textContent = option.text;
        }
        item.dataset.value = option.value;
        dropdownList.appendChild(item);
        item.addEventListener('click', function () {
            event.stopPropagation();
            onSelectFunc({target: {value: this.dataset.value}});
            dropdown.style.display = 'none';
            if (isCommitList) {
                const commitInput = document.getElementById('commit-input');
                commitInput.value = this.textContent;
                const commitMsg = this.querySelector('span:nth-child(2)').textContent;
                const description = document.getElementById('description');
                description.value = commitMsg.slice(0, 50);
            } else if (isBranchList) {
                const branchInput = document.getElementById('branch-input');
                branchInput.value = this.textContent;
                initialBranchInput = branchInput.value; // 记录获得焦点时的输入框内容
                // 为每个下拉列表选项添加点击事件监听器，当点击时将isBranchSelected设置为true，并填充输入框
                getCommits(branchInput.value)
            } else if (isPipelineList) {
                const pipelineInput = document.getElementById('pipeline-input');
                pipelineInput.value = this.textContent;
                pipelineInput.dataset.value = this.dataset.value
                const branchInput = document.getElementById('branch-input');
                if (pipelineInput.value.includes('生产')) {
                    branchInput.value = 'master';
                    getCommits('master');
                }
                getTaskSelect(pipelineInput.value);
            } else if (isTaskList) {
                if ($(event.target).closest('a').length > 0) {
                    event.stopPropagation();
                }else{
                    const taskInput = document.getElementById('task-input');
                    setTaskClickEvent(taskInput, option.value,option.text);
                }
            } else if (isProjectList) {
                const projectInput = document.getElementById('project-input');
                projectInput.value = this.textContent;
                initialProjectInput = projectInput.value; // 记录获得焦点时的输入框内容
                projectInput.dataset.value = this.dataset.value
                //重新加载收藏分支
                afterLoadProjects(`${projectInput.dataset.value} ${this.textContent}`)
            }
        });
    });

    // 移除已有的点击事件监听器
    selectElement.removeEventListener('click', clickHandler);

    // 点击输入框或箭头时显示下拉列表
    function clickHandler(event) {
        event.stopPropagation();
        // 查找当前打开的下拉列表元素
        const openDropdowns = document.querySelectorAll('.el-select-dropdown[style*="display: block"]');
        openDropdowns.forEach(openDropdown => {
            if (openDropdown !== dropdown) {
                openDropdown.style.display = 'none';
            }
        });
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }

    // 确保只添加一次点击事件监听器
    if (!selectElement.hasAttribute('data-setup-select')) {
        selectElement.setAttribute('data-setup-select', 'true');
        selectElement.addEventListener('click', clickHandler);
    }

    // 点击外部时隐藏下拉列表
    document.addEventListener('click', function (event) {
        if (!selectElement.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });

    if (isBranchList) {
        const branchInput = document.getElementById('branch-input');
        branchInput.addEventListener('focus', function () {
            initialBranchInput = branchInput.value; // 记录获得焦点时的输入框内容
        });
        branchInput.addEventListener('blur', function () {
            backBranch(branchInput);
        });
    } else if (isProjectList) {
        const projectInput = document.getElementById('project-input');
        projectInput.addEventListener('focus', function () {
            initialProjectInput = projectInput.value; // 记录获得焦点时的输入框内容
        });
        projectInput.addEventListener('blur', function () {
            backProject(projectInput);
        });
    }
}

/**
 * 恢复项目输入框到初始值
 * @param {HTMLInputElement} projectInput - 项目输入框元素
 */
function backProject(projectInput) {
    if (initialProjectInput !== '' && initialProjectInput !== projectInput.value) {
        projectInput.value = initialProjectInput;
    }
}

/**
 * 恢复分支输入框到初始值
 * @param {HTMLInputElement} branchInput - 分支输入框元素
 */
function backBranch(branchInput) {
    if (initialBranchInput !== '' && initialBranchInput !== branchInput.value) {
        branchInput.value = initialBranchInput;
    }
}

/**
 * 检查部署参数是否完整
 * @returns {boolean} 参数是否完整
 */
function checkDeployParam() {
    const description = document.getElementById('description').value;
    const branchInput = document.getElementById('branch-input').value;
    const commitInput = document.getElementById('commit-input').value;
    const pipelineInput = document.getElementById('pipeline-input').value;
    const taskInput = document.getElementById('task-input').dataset.value;
    const projectInput = document.getElementById('project-input').dataset.value;

    if (description === '' || branchInput === '' || commitInput === '' || pipelineInput === '' || ((pipelineInput.includes('生产') || pipelineInput.includes('灰度')) && taskInput === '') || (workType === 1 && projectInput === '')) {
        alert('请将信息填写完整');
        return false;
    }
    return true;
}

// ==================== 按钮事件处理 ====================

/**
 * 设置弹窗按钮事件
 * 绑定收藏、部署、关闭、添加计划、执行计划等按钮事件
 * @param {HTMLElement} dialogElement - 弹窗DOM元素
 */
function setupButtons(dialogElement) {
    const collectBranchButton = document.getElementById('collectBranch');
    if (collectBranchButton) {
        collectBranchButton.addEventListener('click', function () {
            collectBranch(dialogElement);
        });
    }

    const deployButton = document.getElementById('deploy');
    if (deployButton) {
        deployButton.addEventListener('click', async function () {
            if (!checkDeployParam()) {
                return;
            }
            try {
                const requestData = await getTaskParameters();
                deploy(requestData.configure_id, requestData.commit_id, requestData.commit_message, requestData.description, requestData.branch, requestData.pipline_id, requestData.issues, requestData.providerMark);
                removeDialog();
                await afterDeploy(true, [requestData.configure_id]);
            } catch (error) {
                console.error(error);
            }
        });
    }
    const closeButton = document.getElementById('dialogClose');
    closeButton.addEventListener('click', function () {
        dialogShown = false;
        dialogElement.remove();
    });


// 为 "下一个执行" 按钮添加点击事件处理函数
    const addNextDeployButton = document.getElementById('addToDeployTask');
    if (addNextDeployButton) {
        addNextDeployButton.onclick = addToDeployTask;
    }

    // 为 "执行计划" 按钮添加点击事件处理函数
    const executeDeployTasksButton = document.getElementById('executeDeployTasks');
    if (executeDeployTasksButton) {
        executeDeployTasksButton.onclick = () => {
            executeDeployTasksHandler(true);
        };
    }
}

/**
 * 添加固定按钮到页面
 * @param {string} buttonDesc - 按钮文本
 * @param {Function} onClickFunc - 点击回调函数
 */
function appendButton(buttonDesc, onClickFunc) {
    let newButton = document.createElement("button");
    newButton.setAttribute("type", "button");
    newButton.setAttribute("id", "justGoButton");
    newButton.style.position = 'fixed';
    newButton.style.top = '20px';
    newButton.style.right = '20px';
    newButton.style.zIndex = '999';
    newButton.style.padding = '10px 13px';
    newButton.style.color = 'white';
    newButton.style.backgroundColor = '#409eff';
    newButton.style.border = 'none';
    newButton.style.fontSize = '14px';
    newButton.style.borderRadius = '4px';
    newButton.style.cursor = 'pointer';

    newButton.onclick = function () {
        if (!dialogShown) {
            dialogShown = true;
            onClickFunc();
        }
    };

    newButton.onmouseover = function () {
        newButton.style.backgroundColor = '#67c2ff';
        newButton.style.cursor = 'pointer';
        newButton.style.boxShadow = '0 0 10px rgba(64, 158, 255, 0.6)';
    };

    newButton.onmouseout = function () {
        newButton.style.backgroundColor = '#409eff';
        newButton.style.boxShadow = 'none';
    };
    newButton.innerHTML = buttonDesc;
    document.body.appendChild(newButton);
}

// ==================== 部署任务处理 ====================

/**
 * 获取部署任务参数
 * 从弹窗表单中收集所有部署所需参数
 * @returns {Promise<Object>} 部署参数对象
 */
async function getTaskParameters() {
    const commitInput = document.getElementById('commit-input').value;
    const description = document.getElementById('description').value;
    const branchInput = document.getElementById('branch-input').value;
    const taskInput = document.getElementById('task-input');
    const pipelineInput = document.getElementById('pipeline-input');

    const selectedPipelineId = pipelineInput.dataset.value;
    const selectedPipelineMsg = pipelineInput.value;
    let issues = []; // 初始化为空数组
    if (taskInput.dataset.value) {
        issues = JSON.parse(taskInput.dataset.value); // 将任务的 id 添加到 issues 数组中
    }

    const parts = commitInput.split(' ');
    const commit_id = parts[0];
    const commit_message = parts.slice(1).join(' ');
    // 貌似这个参数不是必要的
    // const providerMark = await getProviderMark();
    // console.log('providerMark:', providerMark);
    // if (providerMark == null) {
    //     alert('参数错误');
    //     return null;
    // }
    return {
        task_id: Date.now(),
        configure_id: parseInt(configureId),
        configure_name: appName,
        pipline_id: selectedPipelineId,
        pipline_name: selectedPipelineMsg,
        description: description,
        branch: branchInput,
        commit_id: commit_id,
        commit_message: commit_message,
        providerMark: 'DEV',
        issues: issues
    };
}

/**
 * 将任务添加到部署计划列表
 */
async function pushToDeploySchedules() {
    const requestData = await getTaskParameters();
    if (requestData != null) {
        console.log('Task parameters:', requestData);
        let targetSchedule = getAppDeploySchedules(String(configureId));
        //已经存在的任务不再添加
        if (targetSchedule) {
            const isTaskExists = targetSchedule.deployTaskList.some(task =>
                task.configure_id === requestData.configure_id
                && task.commit_id === requestData.commit_id
                && task.branch === requestData.branch
                && task.pipline_id === requestData.pipline_id);
            if (!isTaskExists) {
                targetSchedule.deployTaskList.push(requestData);
            } else {
                console.log('Task already exists in the schedule.');
                alert('请勿重复添加任务!');
                return;
            }
        } else {
            targetSchedule = {
                executeFlag: false,
                configureId: configureId,
                appName: appName,
                deployTaskList: [requestData]
            };
        }
        updateAppDeploySchedules(String(configureId), targetSchedule);
    }
}

/**
 * 添加任务到部署计划
 * 验证参数后将任务加入计划列表
 */
async function addToDeployTask() {
    if (!checkDeployParam()) {
        return;
    }
    await pushToDeploySchedules();
    const dialogElement = document.getElementById('dialog');
    setDeployTaskInputInitialValue(dialogElement);
}

/**
 * 执行部署计划处理器
 * @param {boolean} click - 是否由点击事件触发
 */
async function executeDeployTasksHandler(click) {
    if (click) {
        removeDialog();
    }
    let deploySchedulesList;
    if (workType === 2) {
        // 当 workType === 2 时，从 getAppDeploySchedules 获取数据
        let singleSchedule = getAppDeploySchedules(String(configureId));
        if (!singleSchedule) {
            console.info('No target schedule found for configureId:', configureId);
            return;
        }
        deploySchedulesList = [singleSchedule];
    } else if (workType === 1) {
        // 当 workType === 1 时，从 getDeploySchedules 获取数据
        deploySchedulesList = getDeploySchedules();
    } else {
        console.error('Invalid workType:', workType);
        return;
    }
    const promises = deploySchedulesList.map(async (targetSchedule) => {
        //点击事件进入执行时，赋值 targetSchedule.executeFlag
        //监听事件进入时，筛选
        if (click || targetSchedule.executeFlag) {
            targetSchedule.executeFlag = true;
            updateAppDeploySchedules(targetSchedule.configureId, targetSchedule);
            batchDeployHandler(targetSchedule).then(r => {
                console.log(targetSchedule.configureId + ' schedule taskList execute done')
                afterDeploy(true, targetSchedule.configureId);
            });
        }
    });
    // 等待所有部署任务完成
    await Promise.all(promises);
    console.log('allDeployTaskList execute done');
    if(workType === 1){
        // 有多个工程刷新我的发布中
        console.log('own deploying status refresh');
        await projectsStatusRefresh();
    }
}

/**
 * 批量部署处理器
 * 同一项目的部署任务依次执行，等待前一个完成后再执行下一个
 * @param {Object} targetSchedule - 目标部署计划对象
 */
async function batchDeployHandler(targetSchedule) {
    if (!targetSchedule || !targetSchedule.executeFlag) {
        return;
    }
    let taskIndex = 0;
    let scheduleLength = targetSchedule.deployTaskList.length;
    while (taskIndex < scheduleLength) {
        targetSchedule = getAppDeploySchedules(targetSchedule.configureId);
        const task = targetSchedule.deployTaskList[taskIndex];
        const {
            configure_id,
            commit_id,
            commit_message,
            description,
            branch,
            pipline_id,
            pipline_name,
            issues,
            providerMark
        } = task;
        try {
            let checking = true;
            while (checking) {
                //重新获取下任务，以免任务已经被删除还执行
                targetSchedule = getAppDeploySchedules(targetSchedule.configureId);
                if (!targetSchedule || !targetSchedule.executeFlag) {
                    return;
                }
                console.log('Checking status...');
                const response = await fetch(`https://your-devops-platform${urlFlag}/api/jobs/list/?offset=0&configure_id=${configure_id}&limit=1`, {
                    method: 'GET',
                    headers: headers
                });
                const result = await response.json();

                if (result.code === 200 && result.data.results.length > 0) {
                    const jobConfigureId = result.data.results[0].configure_id;
                    const jobConfigureName = result.data.results[0].configure_name;
                    const jobCommitId = result.data.results[0].commit_id;
                    const jobBranch = result.data.results[0].branch;
                    const jobPipelineId = result.data.results[0].pipline_id;
                    const jobPipelineName = result.data.results[0].pipline_name;
                    const status = result.data.results[0].status;
                    const executeResult = result.data.results[0].result;
                    const startTime = new Date(result.data.results[0].create_time.replace(/-/g, '/'));

                    console.log('job info', jobConfigureName, jobCommitId, jobBranch, jobPipelineName, status);

                    if (configure_id === jobConfigureId) {
                        if (status === 'running' || status === 'rollbacking') {
                            console.log('Task is running, waiting...');
                            const elapsedTime = Date.now() - startTime.getTime();

                            if (elapsedTime > maxDuration) {
                                const continueWait = confirm(`项目: ${targetSchedule.appName} 任务执行时间超过 ${maxDuration / 60 / 1000} 分钟，是否继续等待，点击【确定】继续等待，点击【取消】中断任务`);
                                if (!continueWait) {
                                    //不等了中断项目的任务执行
                                    //执行时间超过 maxDuration 中断这个工程的任务，交给用户处理
                                    console.log('Task execution time exceeded ${maxDuration / 60 / 1000} minutes, interrupting...');
                                    //更新任务触发状态为false，避免其他线程执行
                                    updateExecuteFlag(targetSchedule.configureId);
                                    return;
                                }
                            }
                        }
                        if (status !== 'running' && status !== 'rollbacking') {
                            //重新获取下任务，以免任务已经被删除还执行
                            targetSchedule = getAppDeploySchedules(targetSchedule.configureId);
                            if (!targetSchedule || !targetSchedule.executeFlag) {
                                return;
                            }
                            //该任务没执行过，准备执行
                            console.log('Task is not running, starting...');
                            console.log('removing from list...');
                            deleteDeployTask(targetSchedule, task);
                            // 移除已完成的任务
                            taskIndex--;
                            scheduleLength--;
                            checking = false;

                            let ignoreConfirm = false;
                            if (executeResult === 'fail' || executeResult === 'interrupt') {
                                let confirmMsg = '';
                                if (commit_id === jobCommitId && branch === jobBranch && pipline_id === String(jobPipelineId)) {
                                    //同工程 同分支 同流水线 同 commitid 出错了或手动中断了，交给用户处理，跳过或者继续执行
                                    confirmMsg = `项目: ${targetSchedule.appName} 任务[${branch} ${commit_id} ${pipline_name}]已执行过，且上次执行失败/被中断，点击【确定】继续执行此任务，点击【取消】忽略此任务`;
                                } else {
                                    //同工程 不同分支/不同流水线/不同 commitid 出错了或手动中断了，交给用户处理，跳过或者继续执行
                                    confirmMsg = `项目: ${targetSchedule.appName} 任务[${branch} ${commit_id} ${pipline_name}]，上次任务[${jobBranch} ${jobCommitId} ${jobPipelineName}] 执行失败/被中断，点击【确定】继续执行，点击【取消】忽略此任务`;
                                }

                                ignoreConfirm = !confirm(confirmMsg);
                                if (ignoreConfirm) {
                                    console.log('last Task is fail, ignore current task...');
                                    break;
                                }
                            }
                            try {
                                // 开始执行任务
                                await deploy(configure_id, commit_id, commit_message, description, branch, pipline_id, issues, providerMark);
                                await afterDeploy(false, targetSchedule.configureId);
                                //执行完可以直接返回了，不用再checking
                                return;
                            } catch (deployError) {
                                console.error('Error during deploy:', deployError);
                            }
                        }
                    }
                } else {
                    console.log('Checking close!!!!');
                    checking = false;
                }
                // 继续checking 或者 执行该工程下一个任务， 都等待 5 秒
                await new Promise(resolve => setTimeout(resolve, 5 * 1000));
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
        taskIndex++;
    }
}

/**
 * 更新执行标志
 * @param {string} configureId - 项目ID
 * @param {Object} targetSchedule - 目标计划对象
 */
function updateExecuteFlag(configureId, targetSchedule) {
    targetSchedule.executeFlag = false;
    updateAppDeploySchedules(configureId, targetSchedule);
}

// ==================== API请求函数 ====================

/**
 * 获取providerMark
 * @returns {Promise<string>} providerMark值
 */
function getProviderMark() {
    return new Promise((resolve, reject) => {
        const apiURL = `https://your-devops-platform${urlFlag}/api/jobs/provider/?configure_name=${appName}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: apiURL,
            headers: headers,
            onload: function (response) {
                const responseJSON = JSON.parse(response.responseText);
                if (responseJSON.status === 1) {
                    // 假设responseJSON.data是一个数组，包含分支信息
                    // 直接返回第一个 providerMark 值
                    const providerMark = responseJSON.data[0];
                    resolve(providerMark);
                } else {
                    reject(new Error('Failed to fetch providerMark info: ' + responseJSON.message));
                }
            },
            onerror: function (error) {
                reject(new Error('Request failed: ' + error));
            }
        });
    });
}

/**
 * 移除弹窗
 */
function removeDialog() {
    const existingPopup = document.getElementById('dialog');
    if (existingPopup) {
        existingPopup.remove();
    }
    dialogShown = false;
}

// ==================== 页面刷新函数 ====================

/**
 * 所有项目页面状态刷新
 * 定时刷新"我的发布中"列表，直到所有任务完成
 */
async function projectsStatusRefresh() {
    $('li span:contains("我的发布中")').click()
    await new Promise(resolve => setTimeout(resolve, 2000));
    const reloadButton = document.querySelector('i.anticon-reload[aria-label="图标: reload"]');
    reloadButton.click(); //先刷新一次
    let hasContentBefore = true; // 初始假设为有内容，因为还未开始检测
    let consecutiveEmptyCount = 0; // 记录连续无内容的次数
    const timer = setInterval(() => {
        reloadButton.click();
        const tbody = document.querySelector('tbody');
        const hasContent = tbody && tbody.innerHTML.trim() !== '<!---->';
        if (!hasContent && hasContentBefore) {
            let deploySchedulesList = getDeploySchedulesList();
            if (deploySchedulesList == null || deploySchedulesList.filter(item => item.executeFlag === true).length === 0) {
                // 从有内容变为无内容，并且要执行的任务都执行完毕 停止定时器
                reloadButton.click();
                clearInterval(timer);
            }
        } else if (!hasContent) {
            // 无内容状态，连续无内容次数加1
            consecutiveEmptyCount++;
            if (consecutiveEmptyCount >= 5) {
                // 连续无内容达到5次，停止定时器
                reloadButton.click();
                clearInterval(timer);
            }
        } else {
            // 有内容状态，重置连续无内容次数
            consecutiveEmptyCount = 0;
        }
        hasContentBefore = hasContent;
    }, 10000);
}

/**
 * 项目详情页面状态刷新
 * 刷新流水线和历史记录标签
 */
async function projectStatusRefresh() {
    //执行完成等待几秒再做操作
    await new Promise(resolve => setTimeout(resolve, 2000));
    document.getElementById('tab-pipline').click();
    document.getElementById('tab-history').click();
    document.getElementById('tab-pipline').click();
}

/**
 * 打开新的项目标签页
 * @param {string} configureId - 项目ID
 */
async function openNewProjectTab(configureId) {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`open new tab for ${configureId}`);
    const newTabURL = `https://devops.example${urlFlag}/devops/project/?id=${configureId}`;
    window.open(newTabURL, '_blank');
}

/**
 * 部署完成后的处理
 * @param {boolean} openNewTab - 是否打开新标签页
 * @param {string} configureId - 项目ID
 */
async function afterDeploy(openNewTab, configureId) {
    if (workType === 2) {
        // 在项目页面直接刷新
        await projectStatusRefresh();
    } else if (workType === 1) {
        if (openNewTab) {
            await openNewProjectTab(configureId);
        }
    }
}

/**
 * 执行部署
 * @param {number} configureId - 项目ID
 * @param {string} commitId - commit ID
 * @param {string} commitMsg - commit消息
 * @param {string} description - 部署描述
 * @param {string} branch - 分支名称
 * @param {string} pipelineId - 流水线ID
 * @param {Array} issues - 关联的Issues列表
 * @param {string} providerMark - 提供者标识
 */
function deploy(configureId, commitId, commitMsg, description, branch, pipelineId, issues, providerMark) {
    const apiURL = `https://your-devops-platform${urlFlag}/api/jobs/deploy/`;
    const requestData = {
        configure_id: configureId,
        pipline_id: pipelineId,
        description: description,
        branch: branch,
        commit_id: commitId,
        commit_message: commitMsg,
        providerMark: providerMark,
        issues: issues
    };
    console.log(requestData);
    GM_xmlhttpRequest({
        method: "POST",
        url: apiURL,
        headers: headers,
        data: JSON.stringify(requestData),
        onload: function (response) {
            const responseJSON = JSON.parse(response.responseText);
            if (responseJSON.status === 1) {
                console.log(`configureId: ${configureId} deploy success`);
            } else {
                let messageDecoded;
                if (typeof responseJSON.message === 'string') {
                    messageDecoded = decodeURIComponent(responseJSON.message.replace(/\\/g, '%'));
                } else {
                    messageDecoded = decodeURIComponent(JSON.stringify(responseJSON.message).replace(/\\/g, '%'));
                }
                alert('执行失败：' + messageDecoded);
            }
        },
        onerror: function (error) {
            console.error('Request failed', error);
            alert('请求失败，请检查控制台日志。');
        }
    });
}

// ==================== 数据加载函数 ====================

/**
 * 加载所有流水线
 * 优先从缓存加载，缓存过期则请求API
 * @returns {Promise<Array>} 流水线列表 [{value, text}]
 */
function loadAllPipelines() {
    const cachedDataStr = searchCacheByConfigureId(pipelineCacheKey, String(configureId));
    if (cachedDataStr) {
        if (Date.now() - cachedDataStr.timestamp < pipelineCacheDuration) {
            // 如果缓存数据存在且未过期，将 cachedData 转换为指定结构
            const transformedData = cachedDataStr.data.map(pipeline => ({
                value: pipeline.value,
                text: pipeline.text
            }));
            return Promise.resolve(transformedData);
        }
    }

    return new Promise((resolve, reject) => {
        const apiURL = `https://your-devops-platform${urlFlag}/api/projects/${configureId}/pipelines/`;
        GM_xmlhttpRequest({
            method: "GET",
            url: apiURL,
            headers: headers,
            onload: function (response) {
                const responseJSON = JSON.parse(response.responseText);
                if (responseJSON.status === 1) {
                    // 假设responseJSON.data是一个数组，包含分支信息
                    const pipelines = responseJSON.data.map(pipeline => ({
                        value: pipeline.id,
                        text: pipeline.name
                    }));
                    saveCacheToLocalStorage(pipelineCacheKey, String(configureId), pipelines);
                    resolve(pipelines);
                } else {
                    reject(new Error('Failed to fetch pipelines info: ' + responseJSON.message));
                }
            },
            onerror: function (error) {
                reject(new Error('Request failed: ' + error));
            }
        });
    });
}

// ==================== 缓存管理函数 ====================

/**
 * 保存数据到localStorage缓存
 * @param {string} cacheKey - 缓存键名
 * @param {string} configureId - 项目ID
 * @param {any} data - 要缓存的数据
 */
function saveCacheToLocalStorage(cacheKey, configureId, data) {
    // 从 localStorage 获取现有的数据
    let existingData = localStorage.getItem(cacheKey);
    if (existingData) {
        // 如果存在数据，将其解析为 JavaScript 对象
        existingData = JSON.parse(existingData);
    } else {
        // 如果不存在数据，初始化为空数组
        existingData = [];
    }

    // 检查是否已经存在该 configureId 的数据
    const index = existingData.findIndex(item => item.configureId === configureId);
    if (index !== -1) {
        // 如果存在，更新对应的 branches 和 timestamp
        existingData[index].data = data;
        existingData[index].timestamp = Date.now();
    } else {
        // 如果不存在，添加新的配置项
        existingData.push({
            configureId,
            data,
            timestamp: Date.now()
        });
    }

    // 将更新后的数据存储回 localStorage
    localStorage.setItem(cacheKey, JSON.stringify(existingData));
}

/**
 * 根据configureId搜索缓存数据
 * @param {string} cacheKey - 缓存键名
 * @param {string} configureId - 项目ID
 * @returns {Object|null} 缓存数据对象或null
 */
function searchCacheByConfigureId(cacheKey, configureId) {
    // 从 localStorage 获取数据
    const dataStr = localStorage.getItem(cacheKey);
    if (dataStr) {
        // 如果存在数据，将其解析为 JavaScript 对象
        const data = JSON.parse(dataStr);
        // 查找匹配 configureId 的数据项
        return data.find(item => item.configureId === configureId);
    }
    return null;
}

/**
 * 加载所有Git分支
 * 优先从缓存加载，缓存过期则请求API
 * @returns {Promise<Array>} 分支列表 [{value, text}]
 */
function loadAllBranches() {
    const cachedDataStr = searchCacheByConfigureId(branchCacheKey, String(configureId));
    if (cachedDataStr) {
        if (Date.now() - cachedDataStr.timestamp < branchCacheDuration) {
            // 如果缓存数据存在且未过期，将 cachedData 转换为指定结构
            const transformedData = cachedDataStr.data.map(branch => ({
                value: branch,
                text: branch
            }));
            return Promise.resolve(transformedData);
        }
    }

    return new Promise((resolve, reject) => {
        const apiURL = `https://your-devops-platform${urlFlag}/api/git/branches/?app_name=${appName}&configure_id=${configureId}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: apiURL,
            headers: headers,
            onload: function (response) {
                const responseJSON = JSON.parse(response.responseText);
                if (responseJSON.status === 1) {
                    // 假设responseJSON.data是一个数组，包含分支信息
                    const branches = responseJSON.data.map(branch => ({
                        value: branch, // 假设branch就是分支名称
                        text: branch
                    }));
                    saveCacheToLocalStorage(branchCacheKey, String(configureId), responseJSON.data);
                    resolve(branches);
                } else {
                    reject(new Error('Failed to fetch Git branch info: ' + responseJSON.message));
                }
            },
            onerror: function (error) {
                reject(new Error('Request failed: ' + error));
            }
        });
    });
}

/**
 * 加载指定分支的commit列表
 * @param {string} branch - 分支名称
 * @returns {Promise<Array>} commit列表 [{value, text}]
 */
function loadCommits(branch) {

    return new Promise((resolve, reject) => {
        const apiURL = `https://your-devops-platform${urlFlag}/api/git/commits/?app_name=${appName}&git_branch=${branch}&configure_id=${configureId}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: apiURL,
            headers: headers,
            onload: function (response) {
                const responseJSON = JSON.parse(response.responseText);
                if (responseJSON.status === 1) {
                    // 假设responseJSON.data是一个数组，包含分支信息
                    const commits = responseJSON.data.map(commit => ({
                        value: commit.commit_id, // 假设branch就是分支名称
                        text: commit.commit_message
                    }));
                    resolve(commits);
                } else {
                    reject(new Error('Failed to fetch Git commits info: ' + responseJSON.message));
                }
            },
            onerror: function (error) {
                reject(new Error('Request failed: ' + error));
            }
        });
    });
}

/**
 * 加载任务列表
 * 通过多级API请求获取当前用户的可关联任务
 * @returns {Promise<Array>} 任务列表 [{value, text}]
 */
async function loadTasks() {
    const cachedDataStr = localStorage.getItem(taskCacheKey);
    if (cachedDataStr) {
        const cachedData = JSON.parse(cachedDataStr);
        if (Date.now() - cachedData.timestamp < taskCacheDuration) {
            // 如果缓存数据存在且未过期，直接使用缓存数据
            return Promise.resolve(cachedData.data);
        }
    }

    return new Promise((resolve, reject) => {
        // 发送第一个请求
        const firstApiURL = `https://your-devops-platform${urlFlag}/api/cmdb/configures/${configureId}/relations/?relation_model_code=domain&relation_name=`;
        GM_xmlhttpRequest({
            method: 'GET',
            url: firstApiURL,
            headers: headers,
            onload: function (response) {
                const responseJSON = JSON.parse(response.responseText);
                const userInfo = JSON.parse(localStorage.getItem('user_info'));
                const assignee = userInfo.id;
                console.log(responseJSON.data)
                const secondApiPromises = responseJSON.data.map(item => {
                    const targetId = item.target;
                    const secondApiURL = `https://your-devops-platform${urlFlag}/api/cmdb/configures/${targetId}/relations/?relation_model_code=productline&relation_name=`;
                    return new Promise((innerResolve, innerReject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: secondApiURL,
                            headers: headers,
                            onload: function (secondResponse) {
                                const secondResponseJSON = JSON.parse(secondResponse.responseText);
                                if (secondResponseJSON.status === 1) {
                                    innerResolve(secondResponseJSON.data);
                                } else {
                                    innerReject(new Error('Failed to fetch second api info: ' + secondResponseJSON.message));
                                }
                            },
                            onerror: function (error) {
                                innerReject(new Error('Second request failed:' + error));
                            }
                        });
                    });
                });
                Promise.all(secondApiPromises)
                    .then(secondApiResults => {
                        const allProductLines = [].concat(...secondApiResults.map(result => result.map(item => item.source)));
                        const thirdApiPromises = allProductLines.map(product_line => {
                            const thirdApiURL = `https://your-devops-platform${urlFlag}/api/pm/issues/options/?product_line=${product_line}&assignee=${assignee}&status=active`;
                            return new Promise((innerResolve, innerReject) => {
                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: thirdApiURL,
                                    headers: headers,
                                    onload: function (thirdResponse) {
                                        const thirdResponseJSON = JSON.parse(thirdResponse.responseText);
                                        if (thirdResponseJSON.status === 1) {
                                            innerResolve(thirdResponseJSON.data.map(task => ({
                                                value: task.id,
                                                text: task.title
                                            })));
                                        } else {
                                            innerReject(new Error('Failed to fetch third api info: ' + thirdResponseJSON.message));
                                        }
                                    },
                                    onerror: function (error) {
                                        innerReject(new Error('Third request failed:' + error));
                                    }
                                });
                            });
                        });
                        Promise.all(thirdApiPromises)
                            .then(allTasksLists => {
                                const flattenedTasks = [].concat(...allTasksLists);
                                const cacheDataToSave = {
                                    data: flattenedTasks,
                                    timestamp: Date.now()
                                };
                                localStorage.setItem(taskCacheKey, JSON.stringify(cacheDataToSave)); // 存储数据及时间戳到localStorage
                                resolve(flattenedTasks);
                            })
                            .catch(error => {
                                reject(error);
                            });
                    })
                    .catch(error => {
                        reject(error);
                    });
            },
            onerror: function (error) {
                console.error('第一个请求失败:', error);
            }
        });
    });
}

/**
 * 加载我的项目列表
 * 优先从缓存加载，缓存过期则请求API
 * @returns {Promise<Array>} 项目列表 [{value, text, hidden, originalTabIndex}]
 */
function loadMyProjects() {
    const cachedDataStr = localStorage.getItem(projectsCacheKey);
    if (cachedDataStr) {
        const cachedData = JSON.parse(cachedDataStr);
        if (Date.now() - cachedData.timestamp < projectsCacheDuration) {
            // 如果缓存数据存在且未过期，直接使用缓存数据
            // 如果缓存数据存在且未过期，只返回 hidden 为 false 的项目
            return Promise.resolve(cachedData.data.filter(project => !project.hidden));
        }
    }

    return new Promise((resolve, reject) => {
        const apiURL = `https://your-devops-platform${urlFlag}/api/projects/`;

        GM_xmlhttpRequest({
            method: "GET",
            url: apiURL,
            headers: headers,
            onload: function (response) {
                const responseJSON = JSON.parse(response.responseText);
                if (responseJSON.status === 1) {
                    // 假设responseJSON.data是一个数组，包含分支信息
                    // 获取新的项目数据
                    const newProjects = responseJSON.data.map(project => ({
                        value: project.id,
                        text: project.name,
                        hidden: false, // 默认隐藏状态为 false
                        originalTabIndex: 0 // 示例索引
                    }));
                    // 如果有缓存，更新缓存中的项目状态
                    let updatedProjects = [];
                    if (cachedDataStr) {
                        const cachedData = JSON.parse(cachedDataStr);
                        updatedProjects = newProjects.map(newProject => {
                            const cachedProject = cachedData.data.find(p => p.text === newProject.text);
                            return cachedProject ? {...newProject, hidden: cachedProject.hidden} : newProject;
                        });
                    } else {
                        updatedProjects = newProjects;
                    }
                    const cacheDataToSave = {
                        data: updatedProjects,
                        timestamp: Date.now()
                    };
                    localStorage.setItem(projectsCacheKey, JSON.stringify(cacheDataToSave)); // 存储数据及时间戳到localStorage
                    // 只返回 hidden 为 false 的项目
                    resolve(updatedProjects.filter(project => !project.hidden));
                } else {
                    reject(new Error('Failed to fetch projects info: ' + responseJSON.message));
                }
            },
            onerror: function (error) {
                reject(new Error('Request failed: ' + error));
            }
        });
    });
}

// ==================== 配置初始化函数 ====================

/**
 * 获取请求头和初始化缓存键
 */
function getHeaders() {
    token = localStorage.getItem('token') || '';
    headers = {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`
    };

    taskCacheKey = `taskCache`; // 根据实际请求参数生成缓存键
    projectsCacheKey = `projectsCache`; // 根据实际请求参数生成缓存键
}

/**
 * 获取基础参数
 * 根据工作模式获取configureId和appName
 * @param {string} projectInputValue - 项目输入值
 */
function getBaseParam(projectInputValue) {
    if (workType === 1) {
        const projectInfo = projectInputValue.split(' ');
        configureId = projectInfo[0];
        appName = projectInfo[1];
    } else {
        configureId = getConfigureIdFromUrl();
        const targetItem = $('.el-breadcrumb__item').eq(1);
        appName = targetItem.find('span.el-breadcrumb__inner').text().trim();
    }
    if (!configureId || !appName) {
        console.error('Configure ID or appName not found in URL');
        alert('配置ID未找到');
        return; // 退出函数
    }

    //加载喜欢分支的commit
    // 存储用户收藏的分支，以configureId为键，分支列表为值
    // 尝试从localStorage获取favoriteBranchesMap，如果不存在则初始化为空的Map
    favoriteApp = FavoriteApps.init(configureId, appName);
    favoriteBranches = FavoriteApps.findByConfigId(configureId)?.favoriteBranch || [];
    branchCacheKey = `branch`; // 根据实际请求参数生成缓存键
    pipelineCacheKey = `pipeline`; // 根据实际请求参数生成缓存键

}

/**
 * 设置分支输入框的初始值
 * 如果有收藏分支，则默认选中第一个收藏分支
 * @param {HTMLElement} dialogElement - 弹窗DOM元素
 */
function setBranchInputInitialValue(dialogElement) {
    if (dialogElement) {
        const branchInput = dialogElement.querySelector('#branch-input');
        if (branchInput) {
            if (favoriteApp.favoriteBranch.length > 0) {
                // 如果有收藏分支，将第一个分支名设置到下拉列表中
                branchInput.value = favoriteApp.favoriteBranch[0];
                initialBranchInput = branchInput.value; // 记录获得焦点时的输入框内容
                getCommits(branchInput.value);
            }
        }
    }
}

// ==================== 部署计划存储函数 ====================

/**
 * 获取所有部署计划
 * @returns {Array} 部署计划列表
 */
function getDeploySchedules() {
    return JSON.parse(localStorage.getItem('deploySchedules')) || [];
}

/**
 * 获取指定项目的部署计划
 * @param {string} configureId - 项目ID
 * @returns {Object|null} 部署计划对象或null
 */
function getAppDeploySchedules(configureId) {
    const deploySchedulesCache = getDeploySchedules();
    const targetScheduleIndex = deploySchedulesCache.findIndex(s => s.configureId === configureId);
    if (targetScheduleIndex > -1) {
        return deploySchedulesCache[targetScheduleIndex];
    }
    return null;
}

/**
 * 更新指定项目的部署计划
 * @param {string} configureId - 项目ID
 * @param {Object} updateToSchedule - 要更新的计划对象
 */
function updateAppDeploySchedules(configureId, updateToSchedule) {
    const deploySchedulesCache = getDeploySchedules();
    const targetScheduleIndex = deploySchedulesCache.findIndex(s => String(s.configureId) === configureId);
    if (targetScheduleIndex > -1) {
        deploySchedulesCache[targetScheduleIndex].deployTaskList = updateToSchedule.deployTaskList;
        deploySchedulesCache[targetScheduleIndex].executeFlag = updateToSchedule.executeFlag;
    } else {
        deploySchedulesCache.push({
            executeFlag: updateToSchedule.executeFlag,
            configureId: updateToSchedule.configureId,
            appName: updateToSchedule.appName,
            deployTaskList: updateToSchedule.deployTaskList
        });
    }
    // 将计划执行列表存储到本地存储中
    localStorage.setItem('deploySchedules', JSON.stringify(deploySchedulesCache));
}

/**
 * 获取部署计划列表
 * 根据工作模式返回单个或所有部署计划
 * @returns {Array|null} 部署计划列表
 */
function getDeploySchedulesList() {
    let deploySchedulesList;
    if (workType === 2) {
        // 当 workType === 2 时，从 getAppDeploySchedules 获取数据
        let targetSchedule = getAppDeploySchedules(String(configureId));
        if (!targetSchedule) {
            console.info('No target schedule found for configureId:', configureId);
            return null;
        }
        deploySchedulesList = [targetSchedule];
    } else if (workType === 1) {
        // 当 workType === 1 时，从 getDeploySchedules 获取数据
        deploySchedulesList = getDeploySchedules();
    } else {
        console.error('Invalid workType:', workType);
        return null;
    }
    return deploySchedulesList;
}

/**
 * 设置部署任务输入框的初始值
 * 显示已添加的部署任务列表
 * @param {HTMLElement} dialogElement - 弹窗DOM元素
 */
function setDeployTaskInputInitialValue(dialogElement) {
    if (dialogElement) {
        let deploySchedulesList = getDeploySchedulesList();
        if (deploySchedulesList == null) {
            return;
        }

        const deployTaskInputDiv = dialogElement.querySelector('#deployTask-input');
        // 清空原有的内容
        deployTaskInputDiv.innerHTML = '';

        deploySchedulesList.forEach(targetSchedule => {
            const deploySchedules = targetSchedule.deployTaskList;
            const configureId = targetSchedule.configureId;
            if (deploySchedules && deploySchedules.length > 0) {
                // 显示 执行计划按钮
                const executeDeployTasks = document.getElementById('executeDeployTasks');
                executeDeployTasks.style.display = 'inline-block';

                // 显示 deployTask 框
                const deployTaskLabelDiv = dialogElement.querySelector('#deployTask-label-div');
                deployTaskLabelDiv.style.display = 'block';

                deploySchedules.forEach(task => {
                    const span = document.createElement('span');
                    span.className = "select-issue el-tag el-tag--info el-tag--small";
                    span.innerHTML = `${task.configure_name} ${task.branch} ${task.commit_id} ${task.pipline_name}  <i class="el-tag__close el-icon-close"></i>`;
                    deployTaskInputDiv.appendChild(span);

                    // 为关闭图标添加点击事件处理，以删除任务
                    span.querySelector('i').addEventListener('click', function () {
                        const taskSpans = deployTaskInputDiv.querySelectorAll('span');
                        const index = Array.from(taskSpans).indexOf(span);
                        if (index > -1) {
                            deleteDeployTask(targetSchedule, task);
                            span.remove();
                        }
                        if ((workType === 1 && (getDeploySchedules() == null || getDeploySchedules().length === 0)) || (workType === 2 && (getAppDeploySchedules(configureId) == null || getAppDeploySchedules(configureId).length === 0))) {
                            deployTaskLabelDiv.style.display = 'none';
                            executeDeployTasks.style.display = executeDeployTasks.style.display === 'none' ? 'inline-block' : 'none';
                        }
                    });
                });
            }
        })

    }
}

// ==================== 收藏分支功能 ====================

/**
 * 收藏当前选中的分支
 * @param {HTMLElement} dialogElement - 弹窗DOM元素
 */
function collectBranch(dialogElement) {
    const branchInput = dialogElement.querySelector('#branch-input');
    if (branchInput && branchInput.value.trim() !== '') {
        const selectedBranch = branchInput.value;
        favoriteApp.addBranch(selectedBranch);
        favoriteBranches = FavoriteApps.findByConfigId(configureId)?.favoriteBranch || [];
        const tagContainer = document.getElementById('tag-container');
        updateTags(tagContainer, dialogElement);
    } else {
        alert('请等待分支列表加载完成');
        console.warn('branch下拉列表中无内容或尚未加载完毕，请检查后再点击收藏分支按钮');
    }
}

/**
 * 创建分支标签元素
 * @param {string} branchName - 分支名称
 * @returns {HTMLElement} 标签元素
 */
function createAntTag(branchName) {
    const tagElement = document.createElement('span');
    tagElement.classList.add('branch-ant-tag');
    tagElement.textContent = branchName;

    const closeIcon = document.createElement('i');
    closeIcon.classList.add('branch-anticon-close');
    closeIcon.setAttribute('aria-label', '图标: close');
    closeIcon.setAttribute('tabindex', '-1');

    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('viewBox', '64 64 896 896');
    svgElement.setAttribute('data-icon', 'close');
    svgElement.setAttribute('width', '1em');
    svgElement.setAttribute('height', '1em');
    svgElement.setAttribute('fill', 'currentColor');
    svgElement.setAttribute('aria-hidden', 'true');
    svgElement.setAttribute('focusable', 'false');
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', 'M563.8 512l262.5-312.9c4.4-5.2.7-13.1-6.1-13.1h-79.8c-4.7 0-9.2 2.1-12.3 5.7L511.6 449.8 295.1 191.7c-3-3.6-7.5-5.7-12.3-5.7H203c-6.8 0-10.5 7.9-6.1 13.1L459.4 512 196.9 824.9A7.95 7.95 0 0 0 203 838h79.8c4.7 0 9.2-2.1 12.3-5.7l216.5-258.1 216.5 258.1c3 3.6 7.5 5.7 12.3 5.7h79.8c6.8 0 10.5-7.9 6.1-13.1L563.8 512z');
    svgElement.appendChild(pathElement);
    closeIcon.appendChild(svgElement);

    tagElement.appendChild(closeIcon);

    return tagElement;
}


/**
 * 生成收藏分支标签
 * @param {Array<string>} favoriteBranches - 收藏的分支列表
 * @param {HTMLElement} dialogElement - 弹窗DOM元素
 */
function generateAntTags(favoriteBranches, dialogElement) {
    const tagContainer = document.getElementById('tag-container');
    //先清空
    tagContainer.innerHTML = '';
    const tags = []; // 用于存储所有生成的branch-ant-tag元素
    const input = document.getElementById('branch-input');
    // 先根据收藏分支情况设置初始值（如果有收藏分支，优先展示第一个收藏分支名，否则展示loading，且已有值时不更新）
    if (favoriteBranches.length <= 0) {
        input.value = 'master';
        getCommits('master');
        return;
    }
    favoriteBranches.forEach((item) => {
        // 复用createAntTag函数来创建branch-ant-tag元素
        const tagElement = createAntTag(item);
        tagContainer.appendChild(tagElement);
        tags.push(tagElement); // 将生成的branch-ant-tag元素添加到tags数组中

        // 为每个动态生成的branch-ant-tag元素添加点击事件监听器，实现单选和样式切换功能
        tagElement.addEventListener('click', function () {
            event.preventDefault(); // 阻止默认点击行为，防止出现意外的页面跳转等情况
            const isCloseIconClicked = event.target.closest('.branch-anticon-close');
            // 获取branch下拉列表输入框元素
            const branchInput = dialogElement.querySelector('#branch-input');
            if (isCloseIconClicked) {
                const branch = this.textContent; // 获取当前tag对应的分支名称
                // 假设这里有favoriteApp对象，调用其removeBranch方法删除localStorage中的分支
                favoriteApp.removeBranch(branch);
                // 更新tag container中的tag
                updateTags(tagContainer, dialogElement);
            } else if (branchInput) {
                // 将当前点击的branch-ant-tag元素的文本内容填充到输入框中
                branchInput.value = this.textContent;
                initialBranchInput = branchInput.value; // 记录获得焦点时的输入框内容
                getCommits(branchInput.value);
            }
        });
    });
}

/**
 * 更新收藏分支标签容器
 * @param {HTMLElement} tagContainer - 标签容器
 * @param {HTMLElement} dialogElement - 弹窗DOM元素
 */
function updateTags(tagContainer, dialogElement) {
    // 清空tag container中的现有tag元素
    while (tagContainer.firstChild) {
        tagContainer.removeChild(tagContainer.firstChild);
    }

    // 重新获取最新的favoriteBranches数据，这里假设你有相应的方法来获取最新数据，实际需根据具体情况调整
    favoriteApp = FavoriteApps.init(configureId, appName);
    favoriteBranches = FavoriteApps.findByConfigId(configureId)?.favoriteBranch || [];
    generateAntTags(favoriteBranches, dialogElement);
}

/**
 * 从页面URL中获取configure_id
 * @returns {string|null} configure_id或null
 */
function getConfigureIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const configureId = urlParams.get('id');
    if (!configureId) {
        console.error('Configure ID not found in URL');
        return null;
    }
    return configureId;
}

/**
 * 删除部署任务
 * @param {Object} schedule - 部署计划对象
 * @param {Object} task - 要删除的任务
 * @returns {boolean} 是否成功删除
 */
function deleteDeployTask(schedule, task) {
    let deploySchedulesCache = getDeploySchedules();
    let taskRemoved = false;
    // 找到要修改的 schedule
    const targetScheduleIndex = deploySchedulesCache.findIndex(s => s.configureId === schedule.configureId);
    if (targetScheduleIndex !== -1) {
        // 检查任务是否在 deployTaskList 中
        const deployTaskList = deploySchedulesCache[targetScheduleIndex].deployTaskList;
        const taskIndex = deployTaskList.findIndex(t => t.task_id === task.task_id);

        if (taskIndex !== -1) {
            // 如果任务存在，移除该任务
            deployTaskList.splice(taskIndex, 1);
            deploySchedulesCache[targetScheduleIndex].deployTaskList = deployTaskList;
            taskRemoved = true;
            // 如果移除后 deployTaskList 为空，从 deploySchedules 中移除该 schedule
            if (deployTaskList.length === 0) {
                deploySchedulesCache = deploySchedulesCache.filter(s => s.configureId !== schedule.configureId);
            }
        }
        // 将更新后的 deploySchedulesCache 存储到 localStorage 中
        localStorage.setItem('deploySchedules', JSON.stringify(deploySchedulesCache));
    }
    // 返回任务是否被移除的结果
    return taskRemoved;
}

// ==================== 收藏应用类 ====================

/**
 * 收藏应用类 - 管理项目的收藏分支
 */
class FavoriteApps {
    /**
     * 构造函数
     * @param {string} appName - 项目名称
     * @param {string} configureId - 项目ID
     * @param {Array<string>} favoriteBranch - 收藏的分支列表
     */
    constructor(appName, configureId, favoriteBranch = []) {
        this.appName = appName;
        this.configureId = configureId;
        this.favoriteBranch = favoriteBranch;
    }

    /**
     * 添加分支到收藏列表
     * @param {string} branch - 分支名称
     */
    addBranch(branch) {
        if (!this.favoriteBranch.includes(branch)) {
            this.favoriteBranch.push(branch);
            this.saveToLocalStorage();
        }
    }

    /**
     * 从收藏列表中移除分支
     * @param {string} branch - 分支名称
     */
    removeBranch(branch) {
        const index = this.favoriteBranch.indexOf(branch);
        if (index !== -1) {
            this.favoriteBranch.splice(index, 1);
            this.saveToLocalStorage();
        }
    }

    /**
     * 保存当前对象到localStorage
     */
    saveToLocalStorage() {
        let favorites = FavoriteApps.getFavoritesFromLocalStorage();
        const index = favorites.findIndex(fav => fav.configureId === this.configureId);
        if (index !== -1) {
            favorites[index] = this;
        } else {
            favorites.push(this);
        }
        localStorage.setItem('favoriteApps', JSON.stringify(favorites));
    }

    /**
     * 根据configureId查找收藏配置
     * @param {string} configureId - 项目ID
     * @returns {FavoriteApps|undefined} 收藏配置对象
     */
    static findByConfigId(configureId) {
        const favorites = FavoriteApps.getFavoritesFromLocalStorage();
        return favorites.find(fav => fav.configureId === configureId);
    }

    /**
     * 从localStorage中获取所有收藏配置
     * @returns {Array} 收藏配置列表
     */
    static getFavoritesFromLocalStorage() {
        const favoritesStr = localStorage.getItem('favoriteApps');
        return favoritesStr ? JSON.parse(favoritesStr) : [];
    }

    /**
     * 初始化或获取收藏配置
     * @param {string} configureId - 项目ID
     * @param {string} appName - 项目名称
     * @returns {FavoriteApps} 收藏配置对象
     */
    static init(configureId, appName) {
        return new FavoriteApps(appName, configureId, FavoriteApps.findByConfigId(configureId)?.favoriteBranch || []);
    }
}

// ==================== DOM等待工具函数 ====================

/**
 * 等待指定DOM元素出现后执行回调
 * 使用轮询方式检测元素是否出现
 * 
 * 改写自 https://gist.github.com/BrockA/2625891
 * 
 * @param {string} selectorTxt - CSS选择器字符串
 * @param {Function} actionFunction - 元素出现后执行的回调函数
 */
function waitForKeyElements(selectorTxt, actionFunction) {
    var targetNodes, btargetsFound;
    targetNodes = document.querySelectorAll(selectorTxt);

    if (targetNodes && targetNodes.length > 0) {
        btargetsFound = true;
        // Found target node(s).  Go through each and act if they are new.
        targetNodes.forEach(function (node) {
            var propKey = (GM_info?.script?.name?.replaceAll(' ', '_') ?? '') + '_alreadyFound';
            var alreadyFound = node.dataset[propKey] === 'true' || false;

            if (!alreadyFound) {
                //--- Call the payload function.
                var cancelFound = actionFunction(node);
                if (cancelFound) {
                    btargetsFound = false;
                } else {
                    node.dataset[propKey] = 'true';
                }
            }
        });
    } else {
        btargetsFound = false;
    }

    //--- Get the timer-control variable for this selector.
    var controlObj = waitForKeyElements.controlObj || {};
    var controlKey = selectorTxt.replace(/[^\w]/g, "_");
    var timeControl = controlObj [controlKey];

    //--- Now set or clear the timer as appropriate.
    if (btargetsFound && timeControl) {
        //--- The only condition where we need to clear the timer.
        clearInterval(timeControl);
        delete controlObj [controlKey]
    } else {
        //--- Set a timer, if needed.
        if (!timeControl) {
            timeControl = setInterval(function () {
                    waitForKeyElements(selectorTxt, actionFunction);
                }, 300
            );
            controlObj [controlKey] = timeControl;
        }
    }
    waitForKeyElements.controlObj = controlObj;
}

// ==================== 项目卡片功能 ====================

/**
 * 添加额外功能事件
 * 为每个tab添加直达菜单和隐藏菜单
 */
function appendExtraFuncEvent() {
    const tabNav = $('.ant-tabs-nav.ant-tabs-nav-animated');
    const tabContainer = tabNav.find('div');
    const tabs = tabContainer.find('.ant-tabs-tab');
    appendHiddenMenu();
    appendDirectList(tabs[0], 0);

    // 为所有的 tab 添加点击事件监听器
    tabs.on('click', function () {
        const index = $('.ant-tabs-tab').index(this);
        appendDirectList(this, index);
    });
}

/**
 * 添加隐藏项目菜单
 * 支持项目卡片的拖拽隐藏和恢复
 */
function appendHiddenMenu() {
    // 获取全部标签内容
    const allTabHeaders = document.querySelectorAll('.ant-tabs-tab');

    // 创建隐藏项目的悬浮窗
    const hiddenProjectsModal = createHiddenProjectsModal();
    document.body.appendChild(hiddenProjectsModal);

    // 创建隐藏项目按钮 绑定事件
    const hiddenProjectsButton = createHiddenProjectsButton();
    document.body.appendChild(hiddenProjectsButton);
    hiddenProjectsButton.addEventListener('click', () => {
        hiddenProjectsModal.style.display = hiddenProjectsModal.style.display === 'none' ? 'flex' : 'none';
    });

    const modalContent = hiddenProjectsModal.querySelector('.modal-content');
    // 初始化项目缓存和卡片内容，同时将隐藏项目添加到悬浮窗
    projectBoxAndCacheInit(modalContent, 0, allTabHeaders);

    // 为悬浮窗中卡片 绑定事件
    bindDragOverAndDropEvents(modalContent, allTabHeaders);

    // 为窗口添加点击事件监听器，当点击悬浮窗外部时隐藏悬浮窗
    window.addEventListener('click', (e) => {
        if (!hiddenProjectsModal.contains(e.target) && e.target !== hiddenProjectsButton) {
            hiddenProjectsModal.style.display = 'none';
        }
    });

    // 为默认显示的 tab 下的项目卡片绑定事件
    bindProjectBoxEvents(0, hiddenProjectsButton);

    // 为每个标签头部添加点击事件监听器，处理标签切换逻辑
    allTabHeaders.forEach((tabHeader, index) => {
        tabHeader.addEventListener('click', () => {
            // 初始化该tab下projectBox和缓存
            projectBoxAndCacheInit(modalContent, index, allTabHeaders);
            // 为新切换的 tab 下的项目卡片绑定事件
            bindProjectBoxEvents(index, hiddenProjectsButton);
        });
    });

    //创建虚拟区域，用于检测拖放操作
    function createVirtualZone(rect, topOffset, leftOffset, widthOffset, heightOffset) {
        const virtualZone = document.createElement('div');
        virtualZone.style.position = 'absolute';
        virtualZone.style.top = rect.top + topOffset + 'px';
        virtualZone.style.left = rect.left + leftOffset + 'px';
        virtualZone.style.width = rect.width + widthOffset + 'px';
        virtualZone.style.height = rect.height + heightOffset + 'px';
        virtualZone.style.opacity = '0';
        return virtualZone;
    }

    /**
     * 创建隐藏项目按钮
     * @returns {HTMLButtonElement} 创建好的按钮元素
     */
    function createHiddenProjectsButton() {
        const button = document.createElement('button');
        button.textContent = '隐藏的项目';
        button.style.position = 'fixed';
        button.style.top = '20px';
        button.style.right = '120px';
        button.style.zIndex = '999';
        button.style.padding = '10px 13px';
        button.style.color = 'white';
        button.style.backgroundColor = '#4CAF50';
        button.style.border = 'none';
        button.style.fontSize = '14px';
        button.style.borderRadius = '4px';

        button.onmouseover = function () {
            button.style.backgroundColor = '#4CAF50';
            button.style.boxShadow = '0 0 10px rgba(64, 158, 255, 0.6)';
            button.style.cursor = 'pointer';
        };

        button.onmouseout = function () {
            button.style.backgroundColor = '#4CAF50';
            button.style.boxShadow = 'none';
        };
        return button;
    }

    /**
     * 创建隐藏项目的模态框
     * @returns {HTMLDivElement} 创建好的模态框元素
     */
    function createHiddenProjectsModal() {
        const modal = document.createElement('div');
        modal.classList.add('modal');
        modal.style.position = 'fixed';
        modal.style.borderRadius = '20px';
        modal.style.top = '0';
        modal.style.right = '0';
        modal.style.width = 'auto';
        // 设置模态框的最大高度，可根据实际情况调整
        modal.style.maxHeight = '100vh';
        modal.style.backgroundColor = 'white';
        modal.style.display = 'none';
        modal.style.flexDirection = 'column';
        modal.style.alignItems = 'flex-start';
        modal.style.padding = '20px';
        modal.style.boxShadow = '-1px 0 5px rgba(0, 0, 0, 0.2)';
        modal.style.zIndex = '9999';

        const modalContent = document.createElement('div');
        modalContent.classList.add('modal-content');
        modalContent.style.width = '100%';
        // 设置模态框内容的最大高度，让其根据模态框自适应
        modalContent.style.maxHeight = 'calc(100% - 40px)';
        modalContent.style.overflowY = 'auto';

        modal.appendChild(modalContent);
        return modal;
    }

    /**
     * 初始化项目卡片和缓存数据，同时将隐藏项目添加到悬浮窗
     * @param {HTMLElement} tabContent 标签页内容区域的 DOM 元素
     * @param {NodeList} targetPanel 所有标签面板的 DOM 元素集合
     * @param {NodeList} allTabHeaders 所有标签头部的 DOM 元素集合
     */
    function projectBoxAndCacheInit(modalContent, tabIndex, allTabHeaders) {
        let projectsCache = getProjectsCache();
        const projectBoxes = findProjectBoxs(tabIndex);
        modalContent.innerHTML = ''
        projectBoxes.forEach(projectBox => {
            const project = getOrCreateProject(projectsCache, projectBox);
            if (project.hidden) {
                const parentLink = projectBox.closest('a');
                if (parentLink) {
                    const oldParent = parentLink.parentNode;
                    if (oldParent) {
                        parentLink.style.display = 'none'; // 隐藏项目卡片
                    }
                    const clonedLink = parentLink.cloneNode(true);
                    clonedLink.style.cssText = parentLink.style.cssText;
                    clonedLink.style.display = ''
                    clonedLink.style.marginBottom = '15px';
                    removeUnUseDivOfADiv(clonedLink);

                    // 添加好看的边框
                    clonedLink.children[0].style.border = '1px solid #ddd'; // 浅灰色边框
                    clonedLink.children[0].style.borderRadius = '5px'; // 圆角边框
                    modalContent.appendChild(clonedLink);
                    bindDraggableEvents(clonedLink, allTabHeaders[project.originalTabIndex]);
                }
            } else {
                // 设置项目的原始标签索引
                setOriginalTabIndex(project, projectBox);
            }
        });

        // 将更新后的项目缓存数据存储到本地存储中
        localStorage.setItem('projectsCache', JSON.stringify(projectsCache));
    }

    /**
     * 从本地存储中获取项目缓存数据
     * @returns {Object} 项目缓存数据对象
     */
    function getProjectsCache() {
        let projectsCache = JSON.parse(localStorage.getItem('projectsCache'));
        if (projectsCache) {
            projectsCache.data.forEach(project => {
                if (!project.hasOwnProperty('hidden')) {
                    project.hidden = false;
                }
                if (!project.hasOwnProperty('originalTabIndex')) {
                    project.originalTabIndex = undefined;
                }
            });
        } else {
            projectsCache = {data: []};
        }
        return projectsCache;
    }

    /**
     * 获取或创建项目缓存数据对象
     * @param {Object} projectsCache 项目缓存数据对象
     * @param {HTMLElement} projectBox 项目卡片的 DOM 元素
     * @returns {Object} 项目缓存数据对象
     */
    function getOrCreateProject(projectsCache, projectBox) {
        const projectName = projectBox.querySelector('.project-title').textContent;
        let project = projectsCache.data.find(p => p.text === projectName);
        if (!project) {
            project = {text: projectName, hidden: false, originalTabIndex: undefined};
            projectsCache.data.push(project);
        }
        return project;
    }

    /**
     * 设置项目的原始标签索引
     * @param {Object} project 项目缓存数据对象
     * @param {NodeList} allTabPanels 所有标签面板的 DOM 元素集合
     * @param {HTMLElement} projectBox 项目卡片的 DOM 元素
     */
    function setOriginalTabIndex(project, projectBox) {
        const tabContent = document.querySelector('.ant-tabs-content.ant-tabs-content-animated.ant-tabs-top-content');
        const allTabPanels = tabContent.querySelectorAll('.ant-tabs-tabpane');
        for (let i = 0; i < allTabPanels.length; i++) {
            if (allTabPanels[i].contains(projectBox)) {
                project.originalTabIndex = i;
                break;
            }
        }
    }

    //为目标标签面板下的项目卡片绑定拖拽事件
    function bindProjectBoxEvents(tabIndex, hiddenProjectsButton) {
        const tabPaneProjectBoxes = findProjectBoxs(tabIndex);

        tabPaneProjectBoxes.forEach(projectBox => {
            const parentLink = projectBox.closest('a');
            parentLink.draggable = true;

            parentLink.addEventListener('dragstart', (e) => {
                const projectName = projectBox.querySelector('.project-title').textContent;
                const projectsCache = getProjectsCache();
                const project = projectsCache.data.find(p => p.text === projectName);

                if (!project.hidden) {
                    highlightHiddenButton(hiddenProjectsButton)
                }

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', parentLink.outerHTML);
                parentLink.classList.add('dragging');

                // 创建隐藏项目按钮的虚拟zone 绑定事件
                const rect = hiddenProjectsButton.getBoundingClientRect();
                const hiddenProjectVirtualZone = createVirtualZone(rect, -20, -700, 900, 80);
                hiddenProjectVirtualZone.dataset.hiddenProjectVirtualZone = '0';
                document.body.appendChild(hiddenProjectVirtualZone);
                bindDragOverAndDropEvents(hiddenProjectVirtualZone, allTabHeaders);
            });

            parentLink.addEventListener('dragend', () => {
                unhighlightHiddenButton(hiddenProjectsButton)
                parentLink.classList.remove('dragging');

                const virtualDropZones = document.querySelectorAll('[data-hidden-project-virtual-zone]');
                virtualDropZones.forEach(zone => document.body.removeChild(zone));
            });
        });
    }

    //处理悬浮窗内的拖放事件
    function handleModalDrop(e, allTabHeaders) {
        e.preventDefault();
        const draggedParentLink = document.querySelector('a.dragging');
        if (draggedParentLink) {
            const projectBox = draggedParentLink.querySelector('.project-box');
            const projectName = projectBox.querySelector('.project-title').textContent;
            const projectsCache = getProjectsCache();
            const project = projectsCache.data.find(p => p.text === projectName);

            if (!project.hidden) {
                const oldParent = draggedParentLink.parentNode;
                if (oldParent) {
                    draggedParentLink.style.display = 'none'; // 隐藏项目卡片
                }
                project.hidden = true;
                localStorage.setItem('projectsCache', JSON.stringify(projectsCache));

                const clonedLink = draggedParentLink.cloneNode(true);
                clonedLink.style.cssText = draggedParentLink.style.cssText;
                clonedLink.style.display = ''
                clonedLink.style.marginBottom = '15px';

                removeUnUseDivOfADiv(clonedLink);

                // 添加好看的边框
                clonedLink.children[0].style.border = '1px solid #ddd'; // 浅灰色边框
                clonedLink.children[0].style.borderRadius = '5px'; // 圆角边框
                const modalContent = hiddenProjectsModal.querySelector('.modal-content');
                clonedLink.classList.remove('dragging');
                modalContent.appendChild(clonedLink);

                bindDraggableEvents(clonedLink, allTabHeaders[project.originalTabIndex]);
            }
        }
    }

    function removeUnUseDivOfADiv(aDiv) {
        const projectBox = aDiv.querySelector('.project-box');
        const firstDiv = projectBox.firstElementChild;
        projectBox.innerHTML = '';
        projectBox.appendChild(firstDiv);
    }

    //为元素绑定可拖动事件 恢复到原位置
    function bindDraggableEvents(parentLink, originalTabHeader) {
        const projectBox = parentLink.querySelector('.project-box');
        parentLink.draggable = true;

        parentLink.addEventListener('dragstart', (e) => {
            const projectName = projectBox.querySelector('.project-title').textContent;
            const projectsCache = getProjectsCache();
            const project = projectsCache.data.find(p => p.text === projectName);

            highlightOriginalTab(originalTabHeader);

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', parentLink.outerHTML);
            parentLink.classList.add('dragging');

            // 只有当从悬浮窗拖动时才创建虚拟区域 originalTab
            if (hiddenProjectsModal.contains(parentLink)) {
                createOriginalVirtualDropZones(originalTabHeader, projectsCache, parentLink, project.originalTabIndex);
            }
        });

        parentLink.addEventListener('dragend', () => {
            unhighlightOriginalTab(originalTabHeader);
            parentLink.classList.remove('dragging');

            const virtualDropZones = document.querySelectorAll('[data-tab-index]');
            virtualDropZones.forEach(zone => document.body.removeChild(zone));
        });
    }

    /**
     * 创建虚拟放置区域  原位置
     */
    function createOriginalVirtualDropZones(originalTabHeader, projectsCache, parentLink, originalTabIndex) {
        const virtualDropZones = [];
        if (originalTabHeader) {
            const rect = originalTabHeader.getBoundingClientRect();
            const virtualZone = createVirtualZone(rect, -50, -50, 500, 500);
            virtualZone.dataset.tabIndex = originalTabIndex;
            document.body.appendChild(virtualZone);

            virtualZone.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            virtualZone.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedParentLink = document.querySelector('a.dragging');
                if (draggedParentLink) {
                    const projectBox = draggedParentLink.querySelector('.project-box');
                    const projectName = projectBox.querySelector('.project-title').textContent;
                    const project = projectsCache.data.find(p => p.text === projectName);

                    if (project.hidden) {
                        const oldParent = draggedParentLink.parentNode;
                        if (oldParent) {
                            oldParent.removeChild(draggedParentLink);
                        }
                        const targetProjectBox = findProjectBox(projectName, originalTabIndex);
                        const parentContainer = targetProjectBox.closest('a'); // 假设项目卡片嵌套在 <a> 标签中
                        if (parentContainer) {
                            parentContainer.style.display = ''; // 显示目标面板中的项目卡片
                        }
                        project.hidden = false;
                        localStorage.setItem('projectsCache', JSON.stringify(projectsCache));
                    }
                }
                virtualDropZones.forEach(zone => document.body.removeChild(zone));
            });

            virtualDropZones.push(virtualZone);
        }
        return virtualDropZones;
    }

    /**
     * 高亮显示原始标签头部
     * @param {HTMLElement} tabHeader 标签头部的 DOM 元素
     */
    function highlightOriginalTab(tabHeader) {
        tabHeader.style.transition = 'all 0.1s ease';
        tabHeader.style.backgroundColor = '#4CAF50'; // 使用蓝色调，比如淡蓝色
        tabHeader.style.color = 'white';
        tabHeader.style.borderRadius = '8px'; // 添加圆角
        tabHeader.style.padding = '10px 10px'; // 添加内边距
        tabHeader.style.cursor = 'pointer'; // 鼠标指针样式变为手型
    }

    /**
     * 取消高亮显示原始标签头部
     * @param {HTMLElement} tabHeader 标签头部的 DOM 元素
     */
    function unhighlightOriginalTab(tabHeader) {
        tabHeader.style.backgroundColor = '';
        tabHeader.style.color = '';
        tabHeader.style.boxShadow = '';
    }

    function unhighlightHiddenButton(hiddenButton) {
        hiddenButton.textContent = '隐藏的项目';
        hiddenButton.style.padding = '10px 13px';
        hiddenButton.style.backgroundColor = '#4CAF50';
        hiddenButton.style.borderRadius = '4px';
    }

    function highlightHiddenButton(hiddenButton) {
        hiddenButton.style.transition = 'all 0.1s ease';
        hiddenButton.textContent = '🗑️ 拖动到这里隐藏';
        hiddenButton.style.backgroundColor = '#FF6347'; // 使用更醒目的颜色，如番茄红
        hiddenButton.style.color = 'white';
        hiddenButton.style.borderRadius = '8px'; // 添加圆角
        hiddenButton.style.padding = '10px 10px'; // 添加内边距
    }

    /**
     * 根据项目名称查找项目卡片
     * @param {string} projectName 项目名称
     * @param {NodeList} allTabPanels 所有标签面板的 DOM 元素集合
     * @returns {HTMLElement|null} 找到的项目卡片元素或 null
     */
    function findProjectBox(projectName, originalTabIndex) {
        const projectBoxes = findProjectBoxs(originalTabIndex);
        for (let j = 0; j < projectBoxes.length; j++) {
            const box = projectBoxes[j];
            if (box.querySelector('.project-title').textContent === projectName) {
                return box;
            }
        }
        return null;
    }

    /**
     * 根据项目名称查找项目卡片
     * @param {string} projectName 项目名称
     * @param {NodeList} allTabPanels 所有标签面板的 DOM 元素集合
     * @returns {HTMLElement|null} 找到的项目卡片元素或 null
     */
    function findProjectBoxs(tabIndex) {
        const tabContent = document.querySelector('.ant-tabs-content.ant-tabs-content-animated.ant-tabs-top-content');
        const allTabPanels = tabContent.querySelectorAll('.ant-tabs-tabpane');
        return allTabPanels[tabIndex].querySelectorAll('.project-box');
    }

    //为元素绑定拖放事件
    function bindDragOverAndDropEvents(element, allTabHeaders) {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        element.addEventListener('drop', (e) => {
            handleModalDrop(e, allTabHeaders);
        });
    }
}

/**
 * 添加直达菜单列表
 * 为每个项目卡片添加快捷链接菜单
 * @param {HTMLElement} tab - 标签页元素
 * @param {number} tabIndex - 标签页索引
 */
function appendDirectList(tab, tabIndex) {
    const allTabPanels = document.querySelectorAll('.ant-tabs-tabpane');
    // 根据传入的索引获取当前激活的 tab 面板
    const activeTabPanel = allTabPanels[tabIndex];
    // 从当前激活的 tab 面板中获取 projectBoxes
    const projectBoxes = activeTabPanel.querySelectorAll('.project-box');
    console.log('Found project boxes:', projectBoxes.length);

    // 定义菜单项样式
    const menuItemStyle = {
        margin: '3px',
        padding: '5px 10px',
        cursor: 'pointer',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '3px',
        transition: 'background-color 0.3s',
    };

    // 定义菜单容器样式
    const menuContainerStyle = {
        display: 'none',
        position: 'absolute',
        right: '0',
        bottom: '0',
        backgroundColor: 'transparent',
        whiteSpace: 'nowrap',
        overflowX: 'auto',
        overflowY: 'hidden'
    };

    // 创建菜单项的函数，将创建菜单项的逻辑封装起来
    function createMenuItem(link, projectName) {
        const menuItem = document.createElement('button');
        menuItem.textContent = link.text;
        Object.assign(menuItem.style, menuItemStyle);

        menuItem.draggable = true; // 使菜单项可拖动
        menuItem.addEventListener('dragstart', dragStart);
        menuItem.addEventListener('dragover', dragOver);
        menuItem.addEventListener('drop', drop);

        menuItem.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            link = handleSingleLink(link, projectName);
            window.open(link.url, '_blank');
        });
        return menuItem;
    }

    // 创建菜单容器的函数
    function createMenuContainer(projectBox) {
        const menuContainer = document.createElement('div');
        menuContainer.className = 'custom-menu';
        Object.assign(menuContainer.style, menuContainerStyle);

        // 自定义滚动条样式（WebKit 浏览器），隐藏滚动条
        menuContainer.style.cssText += `
            &::-webkit-scrollbar {
                display: none;
            }
        `;
        // Firefox 浏览器设置滚动条样式，隐藏滚动条
        menuContainer.style.scrollbarWidth = 'none';

        // 获取 projectBox 的宽度并应用到菜单容器
        const projectBoxWidth = projectBox.offsetWidth;
        menuContainer.style.width = projectBoxWidth + 'px';

        return menuContainer;
    }

    // 一行排列的函数
    function arrangeSingleRow(menuItems, innerContainer, menuContainer) {
        menuContainer.style.maxHeight = ROW_ONE_MAX_HEIGHT;
        menuItems.forEach((item) => {
            item.style.display = 'inline-block';
            innerContainer.appendChild(item);
        });
    }

    // 处理单个链接的函数
    function handleSingleLink(link, projectName) {
        let newUrl = link.url;
        const endTimestamp = Date.now();
        const startTimestamp = endTimestamp - 60 * 60 * 1000;

        // 替换.com.cn或.com
        newUrl = newUrl.replace(/\.com\.cn|\.com/g, urlFlag);
        // 替换{appName}
        newUrl = newUrl.replace('{appName}', projectName);
        // 替换{endTimestamp} 和 {startTimestamp}
        newUrl = newUrl.replace('{endTimestamp}', endTimestamp);
        newUrl = newUrl.replace('{startTimestamp}', startTimestamp);

        return {
            ...link,
            url: newUrl
        };
    }

    function createExtraButton(text, onClickFunction, style) {
        const button = document.createElement('button');
        button.textContent = text;
        Object.assign(button.style, style);
        button.draggable = true; // 使额外按钮可拖动
        button.addEventListener('dragstart', dragStart);
        button.addEventListener('dragover', dragOver);
        button.addEventListener('drop', drop);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClickFunction();
        });
        return button;
    }

    // 定义部署按钮的点击事件处理函数
    function deployButtonFunction(projectName) {
        createDialogWithSelect(projectName);
    }

    let draggedItem = null;

    function dragStart(event) {
        event.stopPropagation();
        draggedItem = event.target;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/html', event.target.outerHTML);
    }

    function dragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }

    function drop(event) {
        event.stopPropagation();
        const target = event.target;
        if (target.tagName === 'BUTTON') {
            const parent = target.parentNode;
            const targetIndex = Array.from(parent.children).indexOf(target);
            const draggedIndex = Array.from(parent.children).indexOf(draggedItem);

            if (draggedIndex < targetIndex) {
                parent.insertBefore(draggedItem, target.nextSibling);
            } else {
                parent.insertBefore(draggedItem, target);
            }
            saveMenuOrder(parent);
        }
        return false;
    }

    function saveMenuOrder(menuContainer) {
        const menuItems = Array.from(menuContainer.children);
        const order = menuItems.map(item => item.textContent);
        localStorage.setItem('menuOrder', JSON.stringify(order));
    }

    function getMenuOrder() {
        const storedOrder = localStorage.getItem('menuOrder');
        return storedOrder ? JSON.parse(storedOrder) : null;
    }

    projectBoxes.forEach((projectBox) => {
        // 检查是否已经添加过菜单，避免重复添加
        if (projectBox.querySelector('.custom-menu') || projectBox.parentNode.style.display === 'none') return;
        // 获取当前项目名称
        const projectName = projectBox.querySelector('.project-title').textContent;

        // 创建菜单容器
        const menuContainer = createMenuContainer(projectBox);
        const innerContainer = document.createElement('div');

        let menuItems = basicLinks.map(link => createMenuItem(link, projectName));
        menuItems.unshift(
            createExtraButton('deploy', () => deployButtonFunction(projectName), menuItemStyle),
            createExtraButton('pods', () => createPodsPopup(projectName), menuItemStyle)
        );

        const menuOrder = getMenuOrder();
        if (menuOrder) {
            menuItems.sort((a, b) => {
                const indexA = menuOrder.indexOf(a.textContent);
                const indexB = menuOrder.indexOf(b.textContent);
                return indexA - indexB;
            });
        }

        // 一行排列
        arrangeSingleRow(menuItems, innerContainer, menuContainer);

        menuContainer.appendChild(innerContainer);

        // 将菜单插入到 .project-box 中
        projectBox.appendChild(menuContainer);

        // 鼠标悬停在卡片上时展开菜单
        projectBox.addEventListener('mouseover', () => {
            menuContainer.style.display = 'block';
        });

        // 鼠标移出卡片时关闭菜单
        projectBox.addEventListener('mouseout', () => {
            menuContainer.style.display = 'none';
        });
    });
}

// ==================== Pods弹窗功能 ====================

/**
 * 创建Pods弹窗
 * 显示项目在各集群的Pod列表
 * @param {string} projectName - 项目名称
 */
async function createPodsPopup(projectName) {
    removeDialog();
    const clusters = [
        {name: '测试', clusterId: '46', namespace: 'default'},
        {name: '灰度', clusterId: '49', namespace: 'gray'},
        {name: '生产', clusterId: '37', namespace: 'prod'},
    ];

    // 使用 Promise.all 实现异步并行执行
    const promises = clusters.map(async (cluster) => {
        return await getPods(projectName, cluster);
    });
    // 等待所有异步操作完成
    const allPods = await Promise.all(promises);

    if (allPods.flat().length === 0) {
        alert("该项目无pods")
        return
    }
    // 调用 createPodsPopupContent 函数处理合并后的 pod 数组
    const popup = createPodsPopupContent(allPods.flat());
    let buttonParent = document.querySelector('.ume-main');
    buttonParent.appendChild(popup);
}

/**
 * 创建Pods弹窗内容
 * @param {Array} pods - Pod列表
 * @returns {HTMLElement} 弹窗元素
 */
function createPodsPopupContent(pods) {
    const popupContent = document.createElement('div');
    popupContent.id = 'dialog'
    popupContent.className = 'el-dialog el-table el-table--fit el-table--border el-table--scrollable-x el-table--enable-row-hover el-table--enable-row-transition el-table--small';
    popupContent.style.cssText = 'width: 60%; max-height: 40%; min-height:20%; position: fixed; top: 20%; left: 50%; transform: translate(-50%, 0); z-index: 1000; background-color: white; padding: 20px; overflow: auto;';

    const headers = ['集群', '名称', '状态', '创建时间', '重启次数', '启动时间'];

    // 创建表格
    const table = document.createElement('table');
    table.className = 'el-table__content';
    table.style.width = '100%';

    // 创建表头
    const thead = document.createElement('thead');
    thead.className = 'el-table__header';
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.className = 'el-table__cell';
        th.style.cursor = 'pointer';
        th.innerHTML = `<div class="cell">${headerText}<span class="caret-wrapper"></span></div>`;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');
    tbody.className = 'el-table__body';
    const rows = pods.map(({clusterName, name, status, create_time, restart_count, start_time, wssUrl}) => {
        const row = document.createElement('tr');
        row.className = 'el-table__row';
        const cells = headers.map(header => {
            const td = document.createElement('td');
            td.className = 'el-table__cell';
            let cellContent;
            switch (header) {
                case '集群':
                    cellContent = clusterName;
                    break;
                case '名称':
                    const button = document.createElement('button');
                    button.className = 'el-button el-button--text el-button--small';
                    button.textContent = name;
                    button.addEventListener('click', () => {
                        initTerminal(clusterName, name, wssUrl)
                    });
                    td.appendChild(button);
                    return td;
                case '状态':
                    cellContent = status;
                    break;
                case '创建时间':
                    cellContent = create_time;
                    break;
                case '重启次数':
                    cellContent = restart_count;
                    break;
                case '启动时间':
                    cellContent = start_time;
                    break;
            }
            td.innerHTML = `<div class="cell">${cellContent}</div>`;
            return td;
        });
        cells.forEach(cell => row.appendChild(cell));
        return row;
    });
    rows.forEach(row => tbody.appendChild(row));
    table.appendChild(tbody);

    // 将表格添加到弹窗内容
    popupContent.appendChild(table);
    document.addEventListener('click', function (event) {
        if (!popupContent.contains(event.target)) {
            popupContent.remove();
        }
    });
    return popupContent;
}

/**
 * 获取指定项目在指定集群的Pods
 * @param {string} projectName - 项目名称
 * @param {Object} cluster - 集群配置 {name, clusterId, namespace}
 * @returns {Promise<Array>} Pod列表
 */
async function getPods(projectName, cluster) {
    try {
        const podIdApiUrl = `https://your-devops-platform${urlFlag}/api/k8s/pods/?search=${projectName}&cluster=${cluster.clusterId}`;
        const response = await fetch(podIdApiUrl, {
            method: 'GET',
            headers: headers
        });
        if (!response.ok) {
            console.log(`请求失败，状态码: ${response.status}`);
            return [];
        }
        const data = await response.json();

        // 检查响应数据结构
        if (!data || !data.data || !data.data.results || data.data.results.length === 0) {
            console.log(`未找到有效的 pod 信息`);
            return [];
        }

        return data.data.results.map(pod => {
            const container = pod.containers[0];
            return {
                clusterName: cluster.name,
                name: pod.name,
                status: pod.status,
                create_time: pod.create_time,
                start_time: pod.start_time,
                restart_count: container ? container.restart_count : 0,
                wssUrl: `wss://your-devops-platform${urlFlag}/api/terminal/${cluster.clusterId}/${cluster.namespace}/${pod.name}/`
            };
        });
    } catch (error) {
        console.error('获取 wssUrl 时出错:', error);
        return [];
    }
}

// ==================== 终端模拟器 ====================

/**
 * 初始化终端
 * 创建基于xterm.js的终端模拟器，通过WebSocket连接到Pod
 * @param {string} clusterName - 集群名称
 * @param {string} podName - Pod名称
 * @param {string} wssUrl - WebSocket连接地址
 */
function initTerminal(clusterName, podName, wssUrl) {
    removeDialog();
    let isDragging = false;
    let offsetX, offsetY;
    let canDrag = true;
    let isInputMode = false;

    // 添加样式函数
    function addStyles() {
        // 添加 xterm.css 样式
        const style = document.createElement('style');
        style.textContent = GM_getResourceText('xtermCss');
        document.head.appendChild(style);

        // 添加 jQuery UI 样式
        const jqueryUiStyle = document.createElement('style');
        jqueryUiStyle.textContent = GM_getResourceText('jqueryUiCss');
        document.head.appendChild(jqueryUiStyle);

        // 添加样式来确保终端文本左对齐
        const customStyle = document.createElement('style');
        customStyle.textContent = `
        #terminal .xterm-rows {
            text-align: left !important;
        }
    `;
        document.head.appendChild(customStyle);
    }

// 创建终端容器函数
    function createTerminalContainer(clusterName, podName) {
        const terminalContainer = document.createElement('div');
        terminalContainer.id = 'terminal';
        terminalContainer.style.cssText = 'width: 800px; height: 400px; border: none; padding: 0 0 30px 0; box-shadow: 0 0 5px rgba(0, 0, 0, 0.2); position: absolute; top: 50px; left: 50px; z-index: 9999'

        // 创建上边框显示 pod 名称
        const topBar = document.createElement('div');
        topBar.style.cssText = 'height: 30px; background-color: #4CAF50; color: white; padding: 0 10px; display: flex; align-items: center'
        topBar.textContent = `${clusterName}  ${podName}`;
        terminalContainer.appendChild(topBar);

        let buttonParent = document.querySelector('.ume-main');
        buttonParent.appendChild(terminalContainer);
        return {terminalContainer, topBar};
    }

// 初始化 WebSocket 函数
    function initWebSocket(wssUrl, term) {
        const socket = new WebSocket(wssUrl);
        socket.onopen = () => {
            console.log('Websocket open');
        };

        socket.onmessage = (event) => {
            try {
                term.write(event.data);
            } catch (parseError) {
                console.error('解析 WebSocket 消息时出错:', parseError);
            }
        };

        socket.onclose = () => {
            console.log('Websocket close');
        };

        socket.onerror = (error) => {
            console.log('Websocket error:', error);
        };

        // 终端输入触发事件
        term.onData((data) => {
            socket.send(data);
        });

        return socket;
    }

// 初始化终端函数
    function initTerminalInstance(terminalContainer) {
        const term = new Terminal({
            rendererType: 'canvas',
            rows: 30,
            cols: 80,
            convertEol: true,
            disableStdin: false,
            windowsMode: false,
            theme: {
                foreground: '#FFFFFF',
                background: '#222222',
                lineHeight: 1.5,
                fontSize: 14,
                fontWeight: 'normal',
                fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace'
            },
        });

        term.open(terminalContainer);
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        setTimeout(() => {
            fitAddon.fit();
        }, 5);
        term.focus();

        return {term, fitAddon};
    }

// 实现拖拽功能函数
    function enableDragging(terminalContainer, topBar) {
        topBar.addEventListener('mousedown', (e) => {
            if (canDrag && !isInputMode) {
                isDragging = true;
                offsetX = e.clientX - terminalContainer.offsetLeft;
                offsetY = e.clientY - terminalContainer.offsetTop;
                e.preventDefault();
            }
        });

        // 双击边框关闭终端框
        topBar.addEventListener('dblclick', () => {
            terminalContainer.remove();
        });
        terminalContainer.addEventListener('mousedown', (e) => {
            if (canDrag && !isInputMode) {
                isDragging = true;
                offsetX = e.clientX - terminalContainer.offsetLeft;
                offsetY = e.clientY - terminalContainer.offsetTop;
                e.preventDefault();
            }
        });

        terminalContainer.addEventListener('mousemove', (e) => {
            if (isDragging && canDrag && !isInputMode) {
                terminalContainer.style.left = (e.clientX - offsetX) + 'px';
                terminalContainer.style.top = (e.clientY - offsetY) + 'px';
                e.preventDefault();
            }
        });

        terminalContainer.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // 双击终端输入框切换输入模式
        terminalContainer.addEventListener('dblclick', () => {
            isInputMode = !isInputMode;
        });
    }

// 实现缩放功能函数
    function enableResizing(terminalContainer, fitAddon) {
        let canDrag = true;
        $(terminalContainer).resizable({
            // 确保各方向都能缩放
            handles: 'n, e, s, w, ne, nw, se, sw',
            resize: function (event, ui) {
                // 在缩放时阻止拖动逻辑的影响
                isDragging = false;
                fitAddon.fit();
            },
            start: function () {
                // 开始缩放时，禁止拖动
                canDrag = false;
            },
            stop: function () {
                // 缩放结束后，恢复拖动
                canDrag = true;
            }
        });
    }

    try {
        console.log('开始初始化终端');
        // 添加样式
        addStyles();

        // 创建终端容器
        const {terminalContainer, topBar} = createTerminalContainer(clusterName, podName);

        // 初始化终端实例
        const {term, fitAddon} = initTerminalInstance(terminalContainer);

        // 初始化 WebSocket
        const socket = initWebSocket(wssUrl, term);

        // 实现拖拽等功能
        enableDragging(terminalContainer, topBar);

        // 实现缩放功能
        enableResizing(terminalContainer, fitAddon);

        // 适应浏览器尺寸变化
        const onResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', onResize);

        // 重新计算布局，确保输入框不超出容器
        function recalculateLayout() {
            fitAddon.fit();
        }

        // 在容器创建后和缩放结束后重新计算布局
        recalculateLayout();
        $(terminalContainer).on('resizestop', recalculateLayout);

        // 销毁 WebSocket 和终端
        window.addEventListener('beforeunload', () => {
            socket.close();
            term.dispose();
            window.removeEventListener('resize', onResize);
        });
    } catch (error) {
        console.error('初始化过程中出现错误:', error);
    }
}
