# API 参考文档

[← 返回后端总览](BACKEND_OVERVIEW.md)

## API 端点列表

### 1. 用户认证 (`/api/user`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/user/login` | 用户登录 | ❌ |
| POST | `/api/user/register` | 用户注册 | ❌ |
| GET | `/api/user/me` | 获取当前用户信息 | ✅ |
| POST | `/api/user/logout` | 用户登出 | ✅ |
| PUT | `/api/user/password` | 修改密码 | ✅ |

### 2. 股票数据 (`/api/stocks`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/stocks` | 获取股票列表 | ✅ |
| GET | `/api/stocks/{ts_code}` | 获取股票详情 | ✅ |
| POST | `/api/stocks/klines` | 获取K线数据 | ✅ |
| POST | `/api/stocks/mini-klines` | 获取迷你K线 | ✅ |
| GET | `/api/stocks/search` | 搜索股票 | ✅ |

### 3. 可转债 (`/api/bonds`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/bonds` | 获取可转债列表 | ✅ |
| GET | `/api/bonds/{ts_code}` | 获取可转债详情 | ✅ |
| POST | `/api/bonds/klines` | 获取K线数据 | ✅ |

### 4. 概念板块 (`/api/concepts`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/concepts` | 获取概念列表 | ✅ |
| GET | `/api/concepts/{code}` | 获取概念详情 | ✅ |
| POST | `/api/concepts/klines` | 获取K线数据 | ✅ |
| GET | `/api/concepts/stocks/{code}` | 获取概念成分股 | ✅ |

### 5. 行业板块 (`/api/industries`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/industries` | 获取行业列表 | ✅ |
| GET | `/api/industries/{code}` | 获取行业详情 | ✅ |
| POST | `/api/industries/klines` | 获取K线数据 | ✅ |
| GET | `/api/industries/stocks/{code}` | 获取行业成分股 | ✅ |

### 6. 策略执行 (`/api/strategies`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/strategies/execute-async` | 异步执行策略 | ✅ |
| GET | `/api/strategies/meta` | 获取策略元数据 | ✅ |
| GET | `/api/strategies/presets` | 获取预设列表 | ✅ |
| POST | `/api/strategies/presets` | 创建预设 | ✅ |
| PUT | `/api/strategies/presets/{key}` | 更新预设 | ✅ |
| DELETE | `/api/strategies/presets/{key}` | 删除预设 | ✅ |

### 7. 执行历史 (`/api/strategy-history`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/strategy-history` | 获取执行历史 | ✅ |
| DELETE | `/api/strategy-history/{id}` | 删除历史记录 | ✅ |

### 8. 收藏功能 (`/api/favorites`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/favorites/groups` | 获取收藏分组 | ✅ |
| POST | `/api/favorites/groups` | 创建分组 | ✅ |
| PUT | `/api/favorites/groups/{id}` | 更新分组 | ✅ |
| DELETE | `/api/favorites/groups/{id}` | 删除分组 | ✅ |
| POST | `/api/favorites/add` | 添加收藏 | ✅ |
| POST | `/api/favorites/remove` | 移除收藏 | ✅ |

### 9. 任务管理 (`/api/tasks`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/tasks/{task_id}` | 获取任务状态 | ✅ |
| POST | `/api/tasks/{task_id}/cancel` | 取消任务 | ✅ |

### 10. 交易日历 (`/api/calendar`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/calendar` | 获取交易日历 | ✅ |
| GET | `/api/calendar/latest-trade-date` | 获取最新交易日 | ✅ |

### 11. 管理员接口 (`/api/admin`)

> ⚠️ 需要管理员权限

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/admin/sync/stocks` | 同步股票数据 |
| POST | `/api/admin/sync/bonds` | 同步可转债数据 |
| POST | `/api/admin/sync/concepts` | 同步概念数据 |
| POST | `/api/admin/sync/industries` | 同步行业数据 |
| POST | `/api/admin/sync/klines` | 同步K线数据 |
| POST | `/api/admin/sync/hot` | 同步热度数据 |
| GET | `/api/admin/tasks` | 获取任务列表 |
| POST | `/api/admin/scheduler/start` | 启动调度器 |
| POST | `/api/admin/scheduler/stop` | 停止调度器 |

### 12. 同花顺集成 (`/api/ths`)

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/ths/login` | 获取登录二维码 | ✅ |
| GET | `/api/ths/login/status` | 检查登录状态 | ✅ |
| POST | `/api/ths/push` | 推送自选股 | ✅ |

---

## 通用响应格式

### 成功响应
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

### 错误响应
```json
{
  "success": false,
  "detail": "错误描述",
  "code": "ERROR_CODE"
}
```

---

## 认证方式

使用 JWT Token 进行认证：

```
Authorization: Bearer <token>
```

Token 获取流程：
1. POST `/api/user/login` 获取 token
2. 将 token 存储在客户端
3. 后续请求携带 Authorization header

---

[← 返回后端总览](BACKEND_OVERVIEW.md)
