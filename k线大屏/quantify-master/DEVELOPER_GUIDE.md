# Quantify 开发者指南

[← 返回 README](README.md)

## 目录
1. [开发环境搭建](#1-开发环境搭建)
2. [项目结构](#2-项目结构)
3. [后端开发](#3-后端开发)
4. [前端开发](#4-前端开发)
5. [代码规范](#5-代码规范)
6. [测试指南](#6-测试指南)
7. [部署指南](#7-部署指南)

---

## 1. 开发环境搭建

### 1.1 环境要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Python | 3.9+ | 后端运行时 |
| Node.js | 16+ | 前端构建 |
| Redis | 6+ | 可选，用于缓存 |
| Git | 2.x | 版本控制 |

### 1.2 后端环境

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# 安装依赖
pip install -r requirements.txt

# 复制配置文件
cp .env.example .env

# 编辑配置
vim .env
```

#### 配置文件说明 (.env)

```env
# Tushare API Token (必需)
TUSHARE_TOKEN=your_token_here

# 数据库URL
DATABASE_URL=sqlite:///./quantify.db

# Redis URL (可选)
REDIS_URL=redis://localhost:6379/0

# JWT密钥 (生产环境必须更改)
JWT_SECRET_KEY=your_secret_key

# 日志级别
LOG_LEVEL=INFO

# 同花顺配置 (可选)
THS_COOKIE=your_ths_cookie
```

#### 启动后端

```bash
python main.py
# 或使用uvicorn热重载
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 1.3 前端环境

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start

# 构建生产版本
npm run build
```

### 1.4 获取Tushare Token

1. 访问 [Tushare官网](https://tushare.pro/)
2. 注册账号并登录
3. 在个人中心获取Token
4. 将Token填入 `.env` 文件

---

## 2. 项目结构

### 2.1 整体结构

```
quantify/
├── backend/              # 后端服务
│   ├── main.py           # 应用入口
│   ├── app/              # 应用代码
│   ├── docs/             # 后端文档
│   ├── tests/            # 测试代码
│   └── requirements.txt  # Python依赖
│
├── frontend/             # 前端应用
│   ├── src/              # 源代码
│   ├── public/           # 静态资源
│   └── package.json      # NPM配置
│
├── scripts/              # 运维脚本
├── README.md             # 项目说明
└── ARCHITECTURE.md       # 架构文档
```

### 2.2 后端结构详解

见 [架构文档 - 后端架构](ARCHITECTURE.md#2-后端架构)

### 2.3 前端结构详解

见 [架构文档 - 前端架构](ARCHITECTURE.md#3-前端架构)

---

## 3. 后端开发

### 3.1 添加新的API端点

```python
# app/api/my_feature.py

from fastapi import APIRouter, Depends
from app.services.user.user_service import get_current_user

router = APIRouter(prefix="/api/my-feature", tags=["my-feature"])

@router.get("/")
async def list_items(user: dict = Depends(get_current_user)):
    """获取列表"""
    return {"items": []}

@router.post("/")
async def create_item(data: dict, user: dict = Depends(get_current_user)):
    """创建项目"""
    return {"success": True}
```

注册路由:
```python
# app/api/__init__.py
from .my_feature import router as my_feature_router
router.include_router(my_feature_router)
```

### 3.2 添加新的服务

```python
# app/services/data/my_service.py

from loguru import logger

class MyService:
    def __init__(self):
        pass
    
    def get_data(self, params: dict):
        """获取数据"""
        logger.info(f"获取数据: {params}")
        return []

# 单例实例
my_service = MyService()
```

### 3.3 添加新的DAO

```python
# app/dao/my_dao.py

from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities.my_model import MyModel

class MyDAO:
    def get_all(self, db: Session) -> list:
        return db.query(MyModel).all()
    
    def get_by_id(self, db: Session, id: int):
        return db.query(MyModel).filter(MyModel.id == id).first()

my_dao = MyDAO()
```

### 3.4 添加新的策略条件

```python
# app/strategies/conditions/my_condition.py

from loguru import logger
from . import register_condition

def execute(candidates, kline_data, context, **params):
    """执行筛选条件"""
    enable = params.get('enable_my_condition', False)
    if not enable:
        return None  # 返回None表示跳过
    
    threshold = params.get('my_threshold', 10)
    
    result = []
    for code in candidates:
        data = kline_data.get(code, [])
        if len(data) > 0 and data[-1].get('value', 0) > threshold:
            result.append(code)
    
    logger.info(f"我的条件筛选: {len(candidates)} -> {len(result)}")
    return result

# 注册条件
register_condition(
    key='my_condition',
    label='我的条件',
    type='filter',
    supported_entity_types=['stock', 'bond'],
    parameters={
        'enable_my_condition': {'type': 'boolean', 'default': False},
        'my_threshold': {'type': 'number', 'default': 10},
    },
    execute_fn=execute
)
```

---

## 4. 前端开发

### 4.1 添加新的页面

```tsx
// src/pages/MyPage.tsx

import React from 'react';
import { Typography } from 'antd';

const MyPage: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title>我的页面</Typography.Title>
    </div>
  );
};

export default MyPage;
```

添加路由:
```tsx
// src/App.tsx
import MyPage from './pages/MyPage';

// 在路由配置中添加
<Route path="/my-page" element={<MyPage />} />
```

### 4.2 添加新的组件

```tsx
// src/components/MyComponent.tsx

import React from 'react';
import { Card } from 'antd';

interface MyComponentProps {
  title: string;
  data?: any[];
}

const MyComponent: React.FC<MyComponentProps> = ({ title, data = [] }) => {
  return (
    <Card title={title}>
      {data.map((item, index) => (
        <div key={index}>{item.name}</div>
      ))}
    </Card>
  );
};

export default MyComponent;
```

### 4.3 添加新的Hook

```tsx
// src/hooks/useMyData.ts

import { useState, useEffect } from 'react';
import authFetch from '../utils/authFetch';

export const useMyData = (params: any) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await authFetch('/api/my-endpoint', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        const result = await response.json();
        setData(result.data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params]);

  return { data, loading, error };
};
```

---

## 5. 代码规范

### 5.1 Python代码规范

```python
# 导入顺序：标准库 -> 第三方库 -> 本地模块
import os
from typing import Optional, List

from fastapi import APIRouter
from loguru import logger

from app.services.data.stock_service import stock_service


# 函数/方法命名：snake_case
def get_stock_data(ts_code: str) -> Optional[dict]:
    """获取股票数据
    
    Args:
        ts_code: 股票代码
        
    Returns:
        股票数据字典，不存在时返回None
    """
    pass


# 类命名：PascalCase
class StockService:
    """股票服务类"""
    
    def __init__(self):
        self._cache = {}
```

### 5.2 TypeScript代码规范

```tsx
// 导入顺序：React -> 第三方库 -> 本地模块
import React, { useState, useEffect } from 'react';
import { Card, Button } from 'antd';
import authFetch from '../utils/authFetch';

// 接口命名：PascalCase，以I开头可选
interface StockData {
  tsCode: string;
  name: string;
  price: number;
}

// 组件命名：PascalCase
const StockCard: React.FC<{ data: StockData }> = ({ data }) => {
  // 状态命名：camelCase
  const [isLoading, setIsLoading] = useState(false);
  
  // 事件处理函数：handle前缀
  const handleClick = () => {
    setIsLoading(true);
  };
  
  return (
    <Card title={data.name}>
      <Button onClick={handleClick}>加载</Button>
    </Card>
  );
};

export default StockCard;
```

### 5.3 Git提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type类型**:
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**:
```
feat(strategy): 添加涨停筛选条件

- 添加涨停天数统计
- 支持主板/创业板不同阈值
- 添加UI配置项

Closes #123
```

---

## 6. 测试指南

### 6.1 后端测试

```bash
cd backend

# 运行所有测试
pytest

# 运行特定测试
pytest tests/test_stock_service.py

# 生成覆盖率报告
pytest --cov=app --cov-report=html
```

### 6.2 前端测试

```bash
cd frontend

# 运行测试
npm test

# 运行测试并生成覆盖率
npm test -- --coverage
```

---

## 7. 部署指南

### 7.1 生产环境配置

```bash
# 后端
export ENV=production
export DATABASE_URL=postgresql://user:pass@host:5432/quantify

# 前端构建
cd frontend
npm run build
```

### 7.2 使用脚本

```bash
# 启动
./restart_project.sh

# 停止
./stop_project.sh
```

### 7.3 Nginx配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /path/to/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
}
```

---

[← 返回 README](README.md) | [后端文档 →](backend/docs/BACKEND_OVERVIEW.md)
