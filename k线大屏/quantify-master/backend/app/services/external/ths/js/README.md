# 同花顺 JavaScript 文件

本目录包含用于同花顺登录和加密的JavaScript文件。

## 目录结构

```
js/
├── core/                  # 核心加密逻辑
│   ├── encrypt.js         # 加密功能
│   └── encryption.js      # 主要加密算法 (原加密.js，重命名为英文)
└── utils/                 # 工具函数
    ├── passwd_check.js    # 密码检查工具
    └── v_new.js          # 版本相关工具
```

## 文件说明

### core/
- **encrypt.js** (23KB): 基础加密功能实现
- **encryption.js** (420KB): 主要加密算法库，包含完整的同花顺加密逻辑

### utils/  
- **passwd_check.js** (5KB): 密码强度检查和验证工具
- **v_new.js** (50KB): 版本处理和兼容性工具

## 使用注意事项

1. **文件来源**: 这些JavaScript文件来自同花顺官方网站，用于模拟登录过程
2. **更新维护**: 当同花顺更新其加密算法时，可能需要更新这些文件
3. **安全性**: 这些文件仅用于合法的API调用，请遵守相关使用协议

## 引用方式

在Python代码中通过以下方式调用：

```python
from pathlib import Path

# 获取加密JS文件路径
js_dir = Path(__file__).parent / "js"
encrypt_js = js_dir / "core" / "encrypt.js"
encryption_js = js_dir / "core" / "encryption.js"
```
