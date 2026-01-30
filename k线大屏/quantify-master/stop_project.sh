#!/bin/bash

# 股票K线大屏系统 - 停止服务脚本
# 使用方法: ./stop_project.sh

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

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port &> /dev/null; then
        return 0  # 端口被占用
    else
        return 1  # 端口空闲
    fi
}

# 停止指定PID的进程
stop_process_by_pid() {
    local pid_file=$1
    local service_name=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "停止 $service_name (PID: $pid)"
            kill -TERM "$pid" 2>/dev/null || true
            
            # 等待进程优雅退出
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                sleep 1
                ((count++))
            done
            
            # 如果进程仍在运行，强制杀死
            if kill -0 "$pid" 2>/dev/null; then
                log_warning "强制停止 $service_name (PID: $pid)"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            log_success "$service_name 已停止"
        else
            log_warning "$service_name PID文件存在但进程不在运行"
        fi
        rm -f "$pid_file"
    else
        log_info "$service_name PID文件不存在"
    fi
}

# 通过端口停止进程
stop_process_by_port() {
    local port=$1
    local service_name=$2
    
    if check_port $port; then
        log_info "停止占用端口 $port 的 $service_name"
        local pids=$(lsof -t -i:$port 2>/dev/null || true)
        
        if [ -n "$pids" ]; then
            for pid in $pids; do
                log_info "停止进程 PID: $pid"
                kill -TERM "$pid" 2>/dev/null || true
            done
            
            # 等待进程退出
            sleep 2
            
            # 检查是否还有进程占用端口
            if check_port $port; then
                log_warning "强制停止占用端口 $port 的进程"
                kill -9 $(lsof -t -i:$port 2>/dev/null) 2>/dev/null || true
            fi
            
            log_success "$service_name 已停止"
        fi
    else
        log_info "$service_name 未在端口 $port 运行"
    fi
}

# 清理日志文件（可选）
cleanup_logs() {
    local project_root=$1
    
    read -p "是否清理日志文件? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "清理日志文件..."
        
        local deleted_count=0
        
        # 清理 backend 目录下的日志文件
        if [ -f "$project_root/backend/backend.log" ]; then
            if rm -f "$project_root/backend/backend.log" 2>/dev/null; then
                log_info "已删除 $project_root/backend/backend.log"
                ((deleted_count++)) || true
            fi
        fi
        
        # 清理 frontend 目录下的日志文件
        if [ -f "$project_root/frontend/frontend.log" ]; then
            if rm -f "$project_root/frontend/frontend.log" 2>/dev/null; then
                log_info "已删除 $project_root/frontend/frontend.log"
                ((deleted_count++)) || true
            fi
        fi
        
        # 清理 backend/logs 目录下7天前的日志文件（.log 和 .log.zip）
        local backend_logs_cleaned=0
        if [ -d "$project_root/backend/logs" ]; then
            # 统计7天前的日志文件数量
            local old_backend_logs=$(find "$project_root/backend/logs" \( -name "*.log" -o -name "*.log.zip" \) -type f -mtime +7 2>/dev/null | wc -l | tr -d ' ')
            if [ "$old_backend_logs" -gt 0 ]; then
                find "$project_root/backend/logs" \( -name "*.log" -o -name "*.log.zip" \) -type f -mtime +7 -delete 2>/dev/null || true
                backend_logs_cleaned=$old_backend_logs
                log_info "已清理 backend/logs 目录下7天前的日志文件（$old_backend_logs 个）"
            fi
        fi
        
        # 清理 frontend/logs 目录下7天前的日志文件
        local frontend_logs_cleaned=0
        if [ -d "$project_root/frontend/logs" ]; then
            # 统计7天前的日志文件数量
            local old_frontend_logs=$(find "$project_root/frontend/logs" \( -name "*.log" -o -name "*.log.zip" \) -type f -mtime +7 2>/dev/null | wc -l | tr -d ' ')
            if [ "$old_frontend_logs" -gt 0 ]; then
                find "$project_root/frontend/logs" \( -name "*.log" -o -name "*.log.zip" \) -type f -mtime +7 -delete 2>/dev/null || true
                frontend_logs_cleaned=$old_frontend_logs
                log_info "已清理 frontend/logs 目录下7天前的日志文件（$old_frontend_logs 个）"
            fi
        fi
        
        local total_cleaned=$((deleted_count + backend_logs_cleaned + frontend_logs_cleaned))
        if [ $total_cleaned -gt 0 ]; then
            log_success "日志文件清理完成（共删除/清理 $total_cleaned 个文件）"
        else
            log_info "没有找到需要清理的日志文件"
        fi
    else
        log_info "跳过日志文件清理"
    fi
}

# 主函数
main() {
    log_info "🛑 开始停止股票K线大屏系统..."
    
    # 获取项目根目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$SCRIPT_DIR"
    
    # 1. 通过PID文件停止服务
    log_info "📋 通过PID文件停止服务..."
    
    stop_process_by_pid "$PROJECT_ROOT/backend.pid" "后端服务"
    stop_process_by_pid "$PROJECT_ROOT/frontend.pid" "前端服务"
    
    # 2. 通过端口停止服务（备用方法）
    log_info "🔍 检查端口占用情况..."
    
    stop_process_by_port 8000 "后端服务"
    stop_process_by_port 3000 "前端服务"

    # 清理其他可能的端口
    for port in 8001 8002 8003 8004 3001 3002; do
        if check_port $port; then
            log_warning "发现端口 $port 上有服务运行，正在停止..."
            stop_process_by_port $port "端口$port服务"
        fi
    done
    
    # 3. 停止可能的相关进程
    log_info "🧹 清理相关进程..."
    
    # 停止可能的Python进程
    local python_pids=$(pgrep -f "python.*main.py" 2>/dev/null || true)
    if [ -n "$python_pids" ]; then
        log_info "发现相关Python进程: $python_pids"
        for pid in $python_pids; do
            if kill -0 "$pid" 2>/dev/null; then
                log_info "停止Python进程 PID: $pid"
                kill -TERM "$pid" 2>/dev/null || true
            fi
        done
        sleep 2
        
        # 强制停止仍在运行的进程
        python_pids=$(pgrep -f "python.*main.py" 2>/dev/null || true)
        if [ -n "$python_pids" ]; then
            log_warning "强制停止Python进程: $python_pids"
            kill -9 $python_pids 2>/dev/null || true
        fi
    fi
    
    # 停止可能的npm进程
    local npm_pids=$(pgrep -f "npm.*start" 2>/dev/null || true)
    if [ -n "$npm_pids" ]; then
        log_info "发现相关npm进程: $npm_pids"
        for pid in $npm_pids; do
            if kill -0 "$pid" 2>/dev/null; then
                log_info "停止npm进程 PID: $pid"
                kill -TERM "$pid" 2>/dev/null || true
            fi
        done
        sleep 2
        
        # 强制停止仍在运行的进程
        npm_pids=$(pgrep -f "npm.*start" 2>/dev/null || true)
        if [ -n "$npm_pids" ]; then
            log_warning "强制停止npm进程: $npm_pids"
            kill -9 $npm_pids 2>/dev/null || true
        fi
    fi
    
    # 停止可能的node进程（前端开发服务器）
    local node_pids=$(pgrep -f "node.*react-scripts" 2>/dev/null || true)
    if [ -n "$node_pids" ]; then
        log_info "发现相关node进程: $node_pids"
        for pid in $node_pids; do
            if kill -0 "$pid" 2>/dev/null; then
                log_info "停止node进程 PID: $pid"
                kill -TERM "$pid" 2>/dev/null || true
            fi
        done
        sleep 2
        
        # 强制停止仍在运行的进程
        node_pids=$(pgrep -f "node.*react-scripts" 2>/dev/null || true)
        if [ -n "$node_pids" ]; then
            log_warning "强制停止node进程: $node_pids"
            kill -9 $node_pids 2>/dev/null || true
        fi
    fi
    
    # 4. 验证停止状态
    log_info "🔍 验证停止状态..."
    
    if check_port 8000; then
        log_error "端口 8000 仍被占用"
        lsof -i :8000
    else
        log_success "端口 8000 已释放"
    fi

    if check_port 3000; then
        log_error "端口 3000 仍被占用"
        lsof -i :3000
    else
        log_success "端口 3000 已释放"
    fi
    
    # 5. 可选的日志清理
    cleanup_logs "$PROJECT_ROOT"
    
    # 6. 显示结果
    log_success "🎉 系统停止完成！"
    echo ""
    echo "📊 停止状态:"
    echo "  🔧 后端服务: 已停止"
    echo "  🎨 前端服务: 已停止"
    echo "  📋 端口 8000: 已释放"
    echo "  📋 端口 3000: 已释放"
    echo ""
    echo "🚀 重新启动:"
    echo "  ./restart_project.sh"
    echo ""
    echo "📝 如需查看停止前的日志:"
    echo "  tail -n 50 backend.log"
    echo "  tail -n 50 frontend.log"
    echo ""
    log_success "系统已完全停止！ 🛑"
}

# 捕获中断信号
trap 'log_error "脚本被中断"; exit 1' INT TERM

# 运行主函数
main "$@"
