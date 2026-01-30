@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ===================================
echo 股票K线大屏系统启动脚本
echo ===================================

if "%1"=="install" goto install
if "%1"=="init-db" goto init_db
if "%1"=="backend" goto backend
if "%1"=="frontend" goto frontend
if "%1"=="stop" goto stop
if "%1"=="help" goto help
if "%1"=="-h" goto help
if "%1"=="--help" goto help
if "%1"=="" goto run
goto run

:install
echo 安装依赖...
call :check_python
call :check_node
call :install_backend
call :install_frontend
echo 安装完成！
echo 请配置Tushare Token后运行: start.bat run
goto end

:init_db
echo 初始化数据库...
call :init_database
echo 数据库初始化完成！
goto end

:backend
echo 仅启动后端服务...
call :start_backend
goto end

:frontend
echo 仅启动前端服务...
call :start_frontend
goto end

:run
echo 启动完整服务...
call :init_database
start /b cmd /c "call :start_backend"
timeout /t 3 /nobreak >nul
start /b cmd /c "call :start_frontend"

echo.
echo ===================================
echo 服务启动完成！
echo 后端API: http://localhost:8000
echo 前端应用: http://localhost:3000
echo API文档: http://localhost:8000/docs
echo ===================================
echo 按任意键停止服务
pause >nul

:stop
echo 停止所有服务...
taskkill /f /im python.exe 2>nul
taskkill /f /im node.exe 2>nul
echo 服务已停止
goto end

:help
echo 用法: %0 [命令]
echo.
echo 命令:
echo   install   安装所有依赖
echo   init-db   初始化数据库
echo   run       启动完整服务（默认）
echo   backend   仅启动后端服务
echo   frontend  仅启动前端服务
echo   stop      停止所有服务
echo   help      显示此帮助信息
goto end

:check_python
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python 3.8+
    exit /b 1
)
for /f "tokens=2" %%i in ('python --version') do echo Python版本: %%i
goto :eof

:check_node
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Node.js，请先安装Node.js 16+
    exit /b 1
)
for /f %%i in ('node --version') do echo Node.js版本: %%i
goto :eof

:install_backend
echo 正在安装后端依赖...
cd backend

if not exist "venv" (
    echo 创建Python虚拟环境...
    python -m venv venv
)

call venv\Scripts\activate.bat
pip install -r requirements.txt

if not exist "config\config.py" (
    echo 复制配置文件...
    copy config\config.example.py config\config.py
    echo 请编辑 backend\config\config.py 文件，填入你的Tushare Token
)


cd ..
goto :eof

:install_frontend
echo 正在安装前端依赖...
cd frontend

if not exist "package.json" (
    echo 错误: 未找到package.json文件
    exit /b 1
)

where yarn >nul 2>&1
if not errorlevel 1 (
    yarn install
) else (
    npm install
)


cd ..
goto :eof

:init_database
echo 正在初始化数据库...
cd backend
call venv\Scripts\activate.bat

python -c "from config.config import settings; import sys; sys.exit(0 if 'mysql' in settings.DATABASE_URL else 1)" 2>nul
if not errorlevel 1 (
    echo 检测到MySQL配置，正在初始化MySQL数据库...
    python scripts\init_mysql.py
) else (
    echo 使用SQLite数据库，将在启动时自动创建
)

cd ..
goto :eof

:start_backend
cd backend
call venv\Scripts\activate.bat
python main.py
cd ..
goto :eof

:start_frontend
cd frontend
where yarn >nul 2>&1
if not errorlevel 1 (
    yarn start
) else (
    npm start
)
cd ..
goto :eof

:end
endlocal
