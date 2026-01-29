# CyberBugOff Watch App

一个专门为Apple Watch设计的驱蚊应用，支持图片和音效的自定义配置。

## 📁 项目架构

本项目采用模块化架构设计，将功能拆分为多个专门的管理器，提高代码的可维护性和可复用性。

### 🏗️ 核心架构

```
CyberBugOff Watch App/
├── Config/                  # 全局配置
│   └── AppConfig.swift     # 应用配置常量
├── Models/                  # 数据模型层
│   ├── DataModels.swift    # 数据结构定义
│   ├── BugOffModel.swift   # 主模型（兼容层）
│   ├── ImageManager.swift  # 图片管理器
│   ├── SoundManager.swift  # 声音管理器
│   └── TriggerManager.swift # 触发管理器
├── Services/               # 服务层
│   ├── AudioService.swift  # 音频播放服务
│   └── DataService.swift   # 数据持久化服务
├── Theme/                  # UI主题
│   └── AppTheme.swift     # 应用主题配置
└── Views/                  # 视图层
    ├── Image/             # 图片相关视图
    ├── Settings/          # 设置相关视图
    ├── Shared/            # 共享UI组件
    └── Sound/             # 声音相关视图
```

### 🎯 设计原则

1. **单一职责原则**: 每个管理器只负责特定的功能领域
2. **依赖注入**: 通过服务层解耦业务逻辑
3. **配置集中化**: 所有配置项统一管理
4. **向后兼容**: 保持与现有代码的完全兼容性

### 📋 核心组件

#### 1. 配置层 (Config)
- **AppConfig.swift**: 统一管理所有应用级配置常量
  - 声音配置（音量、播放速率等）
  - 图片配置（默认图片列表、裁剪后缀等）
  - UI配置（字体大小、颜色、动画时长等）
  - 持久化键值常量

#### 2. 数据模型层 (Models)
- **DataModels.swift**: 定义所有数据结构
  - `ImageTriggerMode`: 图片触发模式枚举
  - `SoundPlayMode`: 声音播放模式枚举
  - `TriggerAnimationStyle`: 触发动画样式枚举
  - `CustomTriggerDisplay`: 自定义触发显示配置
  - `SoundConfig`: 声音配置结构
  - `ImageSettings`: 图片设置结构

- **ImageManager.swift**: 图片管理器
  - 图片文件管理（添加、删除、裁剪）
  - 图片设置管理（缩放、偏移、触发模式等）
  - 用户自定义图片支持

- **SoundManager.swift**: 声音管理器
  - 声音配置管理
  - 播放模式控制
  - 图片与声音关联管理
  - 播放顺序管理

- **TriggerManager.swift**: 触发管理器
  - 自定义触发显示配置
  - 点击计数管理
  - 颜色切换逻辑
  - 触发动画管理

- **BugOffModel.swift**: 主模型（兼容层）
  - 向后兼容现有视图代码
  - 管理器间的协调
  - 对外提供统一接口

#### 3. 服务层 (Services)
- **AudioService.swift**: 音频播放服务
  - 单个声音播放
  - 多声音播放（顺序/同时/随机）
  - 音频配置应用（音量、速率、裁剪等）
  - 播放状态管理

- **DataService.swift**: 数据持久化服务
  - UserDefaults封装
  - 数据序列化/反序列化
  - 批量数据操作
  - 数据清理功能

#### 4. UI组件层 (Views/Shared)
- **CommonUIComponents.swift**: 通用UI组件库
  - `ExpandableSection`: 可展开的设置区域
  - `ConfigurationRow`: 配置行组件
  - `SliderConfigView`: 滑块配置视图
  - `ColorPickerGrid`: 颜色选择网格
  - `LimitedTextField`: 有字符限制的文本输入框

### 🔧 使用方式

#### 1. 在视图中使用管理器
```swift
struct MyView: View {
    @ObservedObject var model: BugOffModel
    
    var body: some View {
        // 直接使用原有API（兼容性）
        Button("播放声音") {
            model.playSound(soundName: "sound1")
        }
        
        // 或使用新的管理器API（推荐）
        Button("播放声音") {
            model.soundManager.playSound(soundName: "sound1")
        }
    }
}
```

#### 2. 添加新功能
当需要添加新功能时，优先考虑添加到相应的管理器中：
- 图片相关功能 → `ImageManager`
- 声音相关功能 → `SoundManager`
- 触发相关功能 → `TriggerManager`
- 新的服务功能 → 创建新的Service类

#### 3. 使用通用UI组件
```swift
// 使用高性能可展开设置区域
PerformantExpandableSection(
    isExpanded: $showVolumeSettings,
    header: {
        StandardRowContent(
            leftIcon: "speaker.wave.2.fill",
            leftTitle: "音量设置",
            rightText: "\(Int(volume * 100))%",
            isExpanded: showVolumeSettings
        )
        .standardRowStyle()
    },
    content: {
        SliderConfigView(
            title: "音量",
            value: $volume,
            range: AppConfig.volumeRange,
            formatter: { "\(Int($0 * 100))%" }
        )
    },
    skeleton: {
        SettingsSliderSkeleton(title: "音量", leftLabel: "0%", rightLabel: "100%")
    }
)
```

### 🚀 优势

1. **可维护性**: 代码结构清晰，职责分明
2. **可测试性**: 每个组件都可以独立测试
3. **可扩展性**: 易于添加新功能而不影响现有代码
4. **复用性**: 通用组件可在多处使用
5. **配置统一**: 所有配置集中管理，易于修改

### 📝 开发指南

1. **修改配置**: 在`AppConfig.swift`中统一管理
2. **添加数据模型**: 在`DataModels.swift`中定义
3. **创建UI组件**: 优先使用`CommonUIComponents.swift`中的通用组件
4. **数据持久化**: 通过`DataService.shared`进行
5. **音频播放**: 通过`AudioService`进行

### 🔄 迁移说明

现有代码无需修改即可运行，新重构的架构完全向后兼容。建议在后续开发中逐步采用新的管理器模式。

## 资源导入说明

### 音频资源
项目需要以下默认音频文件，请将它们添加到项目中：
- sound1.mp3
- sound2.mp3
- sound3.mp3
- sound4.mp3

将这些文件添加到项目中后，确保在"Build Phases"中的"Copy Bundle Resources"部分包含了这些文件。

### 图片资源
项目已经包含了以下默认图片的资源配置：
- bug1.imageset
- bug2.imageset
- bug3.imageset
- bug4.imageset

请为每个imageset添加相应的图片文件，建议使用驱虫相关的图像。

## 功能说明

应用提供三种驱虫模式：

1. 📷 **图片模式**
   - 显示预设或自定义图片
   - 点击图片播放音效

2. 🎨 **颜色模式**
   - 使用高对比度颜色或渐变色
   - 支持自定义颜色和全屏显示

3. 🔊 **声音模式**
   - 播放高频驱虫声波
   - 支持音量调节和后台播放

## 开发须知

- 后台音频播放需要在app的Info.plist中添加"Required background modes"并选择"Audio, AirPlay, and Picture in Picture"
- 访问照片库需要在Info.plist中添加"Privacy - Photo Library Usage Description"
- 录音功能需要在Info.plist中添加"Privacy - Microphone Usage Description" 