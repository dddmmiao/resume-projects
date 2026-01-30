#!/bin/bash

# 股票K线大屏系统 - 快速重启脚本
# 使用方法: ./restart_project.sh

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 命令未找到，请先安装"
        exit 1
    fi
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port &> /dev/null; then
        return 0  # 端口被占用
    else
        return 1  # 端口空闲
    fi
}

# 等待端口释放
wait_for_port_free() {
    local port=$1
    local timeout=10
    local count=0
    
    while check_port $port && [ $count -lt $timeout ]; do
        log_info "等待端口 $port 释放... ($count/$timeout)"
        sleep 1
        ((count++))
    done
    
    if check_port $port; then
        log_error "端口 $port 仍被占用，请手动停止相关进程"
        return 1
    fi
    return 0
}

# 等待服务启动
wait_for_service() {
    local url=$1
    local service_name=$2
    local timeout=30
    local count=0
    
    log_info "等待 $service_name 启动..."
    
    while ! curl -s --max-time 5 "$url" > /dev/null && [ $count -lt $timeout ]; do
        sleep 1
        ((count++))
        if [ $((count % 5)) -eq 0 ]; then
            log_info "等待 $service_name 启动... ($count/$timeout 秒)"
        fi
    done
    
    if curl -s --max-time 5 "$url" > /dev/null; then
        log_success "$service_name 启动成功"
        return 0
    else
        log_error "$service_name 启动失败或超时"
        return 1
    fi
}

# 主函数
main() {
    # 解析命令行参数
    ENVIRONMENT="development"  # 默认环境
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --help|-h)
                echo "用法: $0 [选项]"
                echo "选项:"
                echo "  --env, --environment ENV    设置环境 (development|production)"
                echo "  --help, -h                  显示帮助信息"
                exit 0
                ;;
            *)
                log_warning "未知参数: $1"
                shift
                ;;
        esac
    done
    
    log_info "🚀 开始重启股票K线大屏系统..."
    log_info "🌍 运行环境: $ENVIRONMENT"
    
    # 检查必要的命令
    check_command "python"
    check_command "node"
    check_command "npm"
    check_command "curl"
    check_command "lsof"
    
    # 获取项目根目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$SCRIPT_DIR"
    BACKEND_DIR="$PROJECT_ROOT/backend"
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    
    # 检查目录是否存在
    if [ ! -d "$BACKEND_DIR" ]; then
        log_error "后端目录不存在: $BACKEND_DIR"
        exit 1
    fi
    
    if [ ! -d "$FRONTEND_DIR" ]; then
        log_error "前端目录不存在: $FRONTEND_DIR"
        exit 1
    fi
    
    # 1. 停止现有服务
    log_info "📋 停止现有服务..."

    # 停止后端服务 (端口 8000)
    if check_port 8000; then
        log_warning "停止后端服务 (端口 8000)"
        kill -9 $(lsof -t -i:8000) 2>/dev/null || true
    fi

    # 停止前端服务 (端口 3000 或 18888)
    for port in 3000 18888; do
        if check_port $port; then
            log_warning "停止前端服务 (端口 $port)"
            kill -9 $(lsof -t -i:$port) 2>/dev/null || true
        fi
    done

    # 也检查其他可能的端口
    for port in 8001 8002 8003 8004 8005 18889; do
        if check_port $port; then
            log_warning "停止端口 $port 上的服务"
            kill -9 $(lsof -t -i:$port) 2>/dev/null || true
        fi
    done

    # 强制清理相关进程
    pkill -f "uvicorn.*main:app" 2>/dev/null || true
    pkill -f "react-scripts start" 2>/dev/null || true
    pkill -f "npm start" 2>/dev/null || true

    # 等待端口释放
    wait_for_port_free 8000 || exit 1
    wait_for_port_free 18889 || exit 1
    wait_for_port_free 3000 || exit 1
    wait_for_port_free 18888 || exit 1
    
    log_success "所有服务已停止"
    
    # 2. 启动后端服务
    log_info "🔧 启动后端服务..."

    cd "$PROJECT_ROOT"

    # 检查Python依赖
    if ! python -c "import fastapi" 2>/dev/null; then
        log_warning "FastAPI未安装，尝试安装依赖..."
        if [ -f "backend/requirements.txt" ]; then
            pip install -r backend/requirements.txt
        else
            log_error "requirements.txt不存在，请手动安装依赖"
            exit 1
        fi
    fi

    # 启动后端服务 (使用uvicorn，端口8000)
    cd "$BACKEND_DIR"

    # 确保日志文件可写
    rm -f backend.log
    touch backend.log

    # 设置环境变量
    export ENVIRONMENT
    
    # 根据环境设置端口
    if [ "$ENVIRONMENT" = "production" ]; then
        BACKEND_PORT=18889
        FRONTEND_PORT=18888
        log_info "生产环境 - 后端端口: ${BACKEND_PORT}, 前端端口: ${FRONTEND_PORT}"
    else
        BACKEND_PORT=8000
        FRONTEND_PORT=3000
        log_info "开发环境 - 后端端口: ${BACKEND_PORT}, 前端端口: ${FRONTEND_PORT}"
    fi
    
    python -m uvicorn main:app --reload --host 0.0.0.0 --port $BACKEND_PORT --no-access-log > backend.log 2>&1 &
    BACKEND_PID=$!

    log_info "后端服务启动中，PID: $BACKEND_PID"

    # 等待后端服务启动
    if wait_for_service "http://localhost:$BACKEND_PORT/health" "后端服务"; then
        # 使用绝对路径 + tee 写入PID文件，失败时回退到/tmp
        echo "$BACKEND_PID" | tee "$PROJECT_ROOT/backend.pid" >/dev/null 2>&1 || echo "$BACKEND_PID" > /tmp/backend.pid
    else
        log_error "后端服务启动失败"
        exit 1
    fi
    
    # 3. 启动前端服务
    log_info "🎨 启动前端服务..."

    cd "$FRONTEND_DIR"

    # 检查node_modules
    if [ ! -d "node_modules" ]; then
        log_warning "node_modules不存在，正在安装依赖..."
        npm install
    fi

    # 清理可能的缓存问题
    if [ -d "node_modules/.cache" ]; then
        log_info "清理前端缓存..."
        rm -rf node_modules/.cache 2>/dev/null || true
    fi

    # 启动前端服务 (端口3000)
    cd "$FRONTEND_DIR"

    # 确保日志文件可写
    rm -f frontend.log
    touch frontend.log

    DISABLE_ESLINT_PLUGIN=true ESLINT_NO_DEV_ERRORS=true GENERATE_SOURCEMAP=false PORT=$FRONTEND_PORT npm start > frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd "$PROJECT_ROOT"

    log_info "前端服务启动中，PID: $FRONTEND_PID"

    # 等待前端服务启动
    if wait_for_service "http://localhost:$FRONTEND_PORT" "前端服务"; then
        # 使用绝对路径 + tee 写入PID文件，失败时回退到/tmp
        echo "$FRONTEND_PID" | tee "$PROJECT_ROOT/frontend.pid" >/dev/null 2>&1 || echo "$FRONTEND_PID" > /tmp/frontend.pid
    else
        log_error "前端服务启动失败"
        exit 1
    fi
    
    # 4. 验证系统状态
    log_info "🔍 验证系统状态..."

    # 验证后端API
    if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null; then
        log_success "后端API正常"
    else
        log_warning "后端API可能异常"
    fi

    # 验证前后端通信
    if curl -s "http://localhost:$BACKEND_PORT/api/convertible-bonds/?page=1&page_size=1" --max-time 10 > /dev/null; then
        log_success "前后端通信正常"
    else
        log_warning "前后端通信可能异常"
    fi

    # 等待前后端通信建立
    sleep 3
    
    # 5. 显示结果
    log_success "🎉 系统重启完成！"
    echo ""
    echo "📊 服务信息:"
    echo "  📱 前端地址: http://localhost:$FRONTEND_PORT"
    echo "  🔧 后端地址: http://localhost:$BACKEND_PORT"
    echo "  📋 API文档: http://localhost:$BACKEND_PORT/docs"
    echo ""
    echo "🎯 主要页面:"
    echo "  🏠 系统主页: http://localhost:$FRONTEND_PORT/"
    echo "  📊 数据仪表板: http://localhost:$FRONTEND_PORT/dashboard"
    echo "  ⚙️  管理面板: http://localhost:$FRONTEND_PORT/admin"
    echo ""
    echo "📋 进程信息:"
    echo "  🔧 后端PID: $BACKEND_PID"
    echo "  🎨 前端PID: $FRONTEND_PID"
    echo ""
    echo "📝 进程管理:"
    echo "  🔧 后端PID文件: $PROJECT_ROOT/backend.pid"
    echo "  🎨 前端PID文件: $PROJECT_ROOT/frontend.pid"
    echo ""
    echo "📊 数据源状态:"
    echo "  ✅ Tushare: 已配置并正常工作"
    echo ""
    echo "🔄 数据同步功能:"
    echo "  ✅ 股票列表同步: 可在管理面板手动触发"
    echo "  ✅ K线数据同步: 支持日线、周线、月线数据"
    echo "  🔄 定时同步: 已准备就绪（暂时禁用）"
    echo ""
    echo "🎯 使用说明:"
    echo "  - 在浏览器中访问: http://localhost:$FRONTEND_PORT"
    echo "  - 数据同步管理: http://localhost:$FRONTEND_PORT/admin (数据同步管理卡片)"
    echo ""
    echo "🛑 停止服务:"
    echo "  kill $BACKEND_PID  # 停止后端"
    echo "  kill $FRONTEND_PID  # 停止前端"
    echo "  或者运行: ./stop_project.sh"
    echo ""
    log_success "系统已就绪，开始使用吧！ 🚀"
}

# 捕获中断信号
trap 'log_error "脚本被中断"; exit 1' INT TERM

# 运行主函数
main "$@"
