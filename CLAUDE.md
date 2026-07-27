# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 构建 / 运行

```bash
npx expo lint            # ESLint 检查
npx tsc --noEmit         # TypeScript 类型检查
```

### 日常开发流程（Debug APK + 热更新）

这是**最常用的工作流**。Debug APK 只构建一次，之后改 JS/TS 代码秒级热更新（Fast Refresh），无需重编译。

#### 首次设置（只需做一次）

```bash
# 0. 生成原生 Android 项目（仅全新 clone 后需要，已生成则跳过）
npx expo prebuild --platform android

# 1. 编译 Debug APK（首次约 10-20 分钟，需下载原生依赖）
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ANDROID_HOME="D:/AndroidSDK" ./gradlew assembleDebug

# 2. 手机 USB 连接电脑，安装 APK
"D:/AndroidSDK/platform-tools/adb" install -r android/app/build/outputs/apk/debug/app-debug.apk
```

#### 每次开发时（APK 已装好）

```bash
# 1. 确认手机已 USB 连接
"D:/AndroidSDK/platform-tools/adb" devices
# 应该看到：10AE5L2C4Z001R1  device

# 2. 端口转发（Debug APK 不含 JS bundle，需要从 Metro 加载）
"D:/AndroidSDK/platform-tools/adb" reverse tcp:8081 tcp:8081

# 3. 启动 Metro 开发服务器
npx expo start

# 4. 打开手机上的 nana-rn app（或命令行启动）
"D:/AndroidSDK/platform-tools/adb" shell am start -n com.anonymous.nanarn/.MainActivity
```

之后在电脑上改代码保存 → 手机自动刷新（Fast Refresh），无需任何额外操作。

#### 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| 手机白屏 / 无法连接 | Metro 未运行或端口转发失效 | 重跑 `adb reverse` + `npx expo start` |
| Port 8081 被占用 | 上次 Metro 未正常退出 | `cmd.exe /c "taskkill /f /im node.exe"` 然后重新 `npx expo start` |
| 手机不显示在 `adb devices` | USB 线松动或未授权 | 重新插拔 USB，手机上点"允许 USB 调试" |
| 改动代码后手机没反应 | Fast Refresh 可能断开 | 摇晃手机 → Reload，或 `adb shell am force-stop com.anonymous.nanarn` 后重新打开 |
| Metro 打包报 `tslib` 错误 | framer-motion 6.x (moti 依赖) 不兼容 tslib 2.x | `npm install tslib@1.14.1` 固定版本，且 `npx expo start --clear` 清缓存 |
| Metro 报 `Unable to deserialize cloned data` | 缓存文件损坏（异常退出导致） | `npx expo start --clear` 清缓存重启 |
| 新增原生包后构建失败 | 新包未链接到原生项目 | `npx expo prebuild --platform android` 重新生成，再构建 |
| 手机始终白屏/loading | 装的是 Release APK（JS 已打进包里，不走 Metro） | 卸载后安装 Debug APK：`adb install -r android/app/build/outputs/apk/debug/app-debug.apk` |

### Release APK（最终交付用）

Release APK 把 JS bundle 预打包进 APK 内，Hermes AOT 优化全开，**不需要 Metro**，性能比 Debug 快 3-10x。但每次改代码都要重新编译（约 10-18 分钟）。

```bash
# 构建 Release APK
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ANDROID_HOME="D:/AndroidSDK" ./gradlew assembleRelease

# 安装到手机
"D:/AndroidSDK/platform-tools/adb" install -r android/app/build/outputs/apk/release/app-release.apk

# 启动
"D:/AndroidSDK/platform-tools/adb" shell am start -n com.anonymous.nanarn/.MainActivity
```

**原则：日常开发用 Debug APK + Metro 热更新。只有需要测真实性能或交付时才构建 Release APK。**

### Gradle 故障排查

如果构建卡死或产出的 APK 闪退：
```bash
# 1. 杀残留进程
cmd.exe /c "taskkill /f /im java.exe & taskkill /f /im javaw.exe"
# 2. 清除 Gradle 锁文件和缓存
find android/.gradle -name "*.lock" -delete
rm -rf android/.gradle/9.0.0
rm -rf android/app/build android/build
# 3. 重新构建
```

### 第三方原生包修复

某些 RN 原生包的 `build.gradle` 和 `AndroidManifest.xml` 过时，安装后需手动修复：

**@react-native-voice/voice** — `node_modules/@react-native-voice/voice/android/build.gradle`：
- 替换 `jcenter()` → `mavenCentral()`
- 添加 `namespace "com.reactnative.voice"`
- 更新 `compileSdk` / `targetSdk` 到 34
- 同一包的 `AndroidManifest.xml`：删除 `package="com.wenkesj.voice"` 属性

## 架构概览

**nana-rn** — AI 角色扮演移动应用，React Native 版本。从 Capacitor（WebView）整套迁移而来，业务逻辑层 100% 复用，UI 层全部重写。

**技术栈**：React 19 + React Native 0.83 + Expo SDK 55 + TypeScript 5.9 + NativeWind v4 + Moti 0.30 + react-native-reanimated 4.2 + react-native-gesture-handler 2.30 + expo-linear-gradient + expo-haptics + expo-speech + expo-font + expo-battery + lucide-react-native + Zustand 5 + AsyncStorage + @react-native-voice/voice (STT) + @expo-google-fonts/inter, playfair-display, jetbrains-mono。

### 与 Capacitor 原版的关键差异

| 层面 | Capacitor 原版 | React Native 版 |
|------|---------------|-----------------|
| **渲染** | WebView (DOM/CSS) | 原生 View/Text |
| **样式** | Tailwind CSS v4 | NativeWind v4（className 兼容） |
| **动画** | Framer Motion | Moti + react-native-reanimated |
| **路由** | Zustand 状态路由 | expo-router（文件路由） |
| **持久化** | localStorage（自定义分 key 适配器） | AsyncStorage（createJSONStorage，单 key `nana-root`） |
| **触觉** | `navigator.vibrate()` | expo-haptics |
| **键盘** | Capacitor Keyboard 插件 | RN `Keyboard.addListener` |
| **语音** | Web Speech API (TTS+STT) | expo-speech (TTS) + @react-native-voice/voice (STT) |
| **字体** | Google Fonts CDN (CSS @import) | expo-font + @expo-google-fonts/* |
| **电池** | Web Battery API | expo-battery |
| **对话框** | `window.confirm/alert/prompt` | `Alert.alert` + PromptModal（替代 prompt） |
| **存储服务** | DOM Blob + `<a>` 标签下载 | AsyncStorage 多 key 操作 + RN Share |

### 数据流（与原版一致）

```
nanaStore.ts (Zustand + AsyncStorage — 唯一状态源)
  ├─ persist middleware → AsyncStorage (nana-root key)
  ├─ src/app/_layout.tsx (RootLayout: AppContext + GestureHandler + BackHandler)
  │   └─ src/app/index.tsx (HomeScreen: app grid 切换 + BlobBackground + AppOverlay)
  │       ├─ WeChatRootView → ChatListView / ChatView / ProfileView / MomentsView ...
  │       ├─ CharacterView / ThemeView / PresetsView
  │       ├─ UserView / SettingsView / WorldBookView (三级导航 + MemoryEditor)
  │       └─ PromptModal (全局弹窗，在 AppOverlay 层渲染)
  └─ 各组件通过 useNanaStore(s => s.xxx) 直接读写状态
```

### Store 修改注意事项

`nanaStore.ts` 是 Zustand + persist 中间件。新增字段时必须同时修改三处：
1. **TypeScript 接口** `NanaStore`（约第 18-122 行）— 声明类型
2. **初始值** `persist(() => ({...}))`（约第 124-180 行）— 给默认值
3. 如果是持久化字段，确保放在 `// ── Persisted` 区域（会在 AsyncStorage 中保存）；瞬态字段放在 `// ── Transient` 区域（不持久化）

目前持久化字段包括：`unreadCounts`, `chatHistory`, `worldBookEntries`, `characters`, `friends`, `themeConfig` 等。其余为瞬态。

### 文件迁移状态

| 类别 | 文件 | 状态 |
|------|------|------|
| **类型/常量/i18n** | `types/` `constants/` `i18n/` | 直接从 nana-main 复制，零改动 |
| **AI 服务** | `services/ai.ts` | 零改动（fetch 原生可用） |
| **工具函数** | `utils/macros.ts` `hooks/useTime.ts` | 零改动 |
| **Store** | `stores/nanaStore.ts` | localStorage → AsyncStorage，新增 voice 消息 note 参数支持 |
| **AppContext** | `context/AppContext.ts` | 新增 `themeFont`、`customTextColor` 字段 |
| **Haptics** | `utils/haptics.ts` | `navigator.vibrate` → expo-haptics |
| **Keyboard** | `hooks/useKeyboardHeight.ts` | Capacitor → RN Keyboard |
| **Battery** | `hooks/useBattery.ts` | Web API → expo-battery |
| **Speech** | `utils/speech.ts` | TTS: expo-speech / STT: @react-native-voice/voice（事件驱动 + Promise 封装） |
| **Storage** | `services/storage.ts` | importData 完整实现（PromptModal 输入 JSON → 解析 → AsyncStorage → rehydrate） |
| **所有 UI 组件** | `components/*.tsx` | 完全重写（div→View, motion→Moti, onClick→onPress） |

### 关键组件速查

| 组件 | 职责 |
|------|------|
| `app/_layout.tsx` | RootLayout：SafeAreaProvider + StatusBar + AppContext.Provider + BackHandler + Stack 导航 |
| `app/index.tsx` | HomeScreen：BlobBackground（Reanimated 驱动） + app icon grid + Dynamic Island + AppOverlay |
| `primitives.tsx` | 可复用 UI 原语：AnimatedPressable / GradientButton / GlassView / NativeGradient / Input |
| `AppIcon.tsx` | App 图标组件，接受 `label: string` + `icon: ReactNode`（用 lucide-react-native 矢量图标）+ `gradient: [string, string]`（图标背景渐变色） |
| `WeChatRootView.tsx` | 微信内导航容器（ChatList / ChatView / Profile / Moments / Wallet + Overlays） |
| `ChatView.tsx` | 聊天界面：消息列表 + 选择模式 + SelectModeBar + ChatInputBar + forward 确认 |
| `ChatInputBar.tsx` | 输入栏：药丸形容器 + 表情/加号面板 + 按住说话（voice STT）+ 回车发送 + 屏蔽遮罩 |
| `ChatMessageBubble.tsx` | 消息气泡：text/voice/transfer/redpacket 四种类型 + 长按选择 + 勾选框 + 打字指示器 |
| `MemoryEditor.tsx` | 记忆编辑器：Records（180px）+ Summary（120px）固定布局 + Modal 展开 + AI 摘要 |
| `WorldBookView.tsx` | WorldBook 三级导航（Global/Local → chardetail → edit） + M/A 徽章 + 角色绑定 |
| `ProfileView.tsx` | 角色详情：Send Message / Voice Call / Video Call / Clear / Export Memory（支持范围选择） |
| `PlusMenuPanel.tsx` | + 号菜单：转账/红包/通话/拉黑/批量转发/清除消息/删除联系人 |
| `EmptyState.tsx` | 可复用空状态：居中图标 + 标题 + 副标题 + 可选操作按钮 |
| `ThemedText.tsx` | 支持 customTextColor 的 Text 封装，从 AppContext 读取 |
| `ThemeView.tsx` | 主题/字体/语言/自定义文字颜色设置 |
| `SettingsView.tsx` | API 配置 + 模型选择 + 数据导出/导入/清除 |
| `AddFriendOverlay.tsx` / `ComposeMomentOverlay.tsx` | 覆盖层弹窗 |
| `CallOverlay.tsx` / `PaymentModal.tsx` / `PromptModal.tsx` | 通话/支付/输入弹窗 |
| `SelectModeBar.tsx` | 消息选择模式工具栏（全选/批量转发/计数） |
| `GlassCard.tsx` | 带标题 + 装饰渐变线的玻璃卡片 |

### RN 新增（无 Capacitor 对应）

| 文件 | 用途 |
|------|------|
| `primitives.tsx` | RN 原生 UI 原语库（替代 Tailwind 渐变 / CSS 动画） |
| `EmptyState.tsx` | 统一空状态组件 |
| `ThemedText.tsx` | 自定义文字颜色支持 |
| `hooks/useThemeFont.ts` | 字体映射：font-sans/serif/mono → Google Fonts 实际家族名 |
| `constants/colors.ts` | 集中色板（text, gradient, status 色组） |

### 记忆系统（与原版完全一致）

双层结构：`WorldBookEntry` 含 `records: MemoryRecord[]` + `content: string`
- 聊天长按 → selectMode → 勾选消息 → Forward（Alert.alert 确认）→ 去重合并到 memory entry
- `lastForwardedMsgId` 追踪每个角色上次转发位置，再次长按自动勾选新消息
- MemoryEditor：展开 Records → 选中未摘要记录 → Generate Summary → AI 生成追加到 Summary
- Context Preview：👁 按钮显示 AI 完整 prompt + Token 预算警告（>2500 tokens）
- 破坏性操作均有 `Alert.alert` 确认

## 设计系统

### 颜色

- **主文字**：`#5E5472`（body）/ `#8A7FA1`（muted）
- **品牌渐变**：`#FFE89F` → `#D9C2FF`（primary 按钮 / 用户气泡 / 发送按钮）
- **头像渐变**：`#FFF0AA` → `#D8C0FF`（角色头像）/ `rgba(255,255,255,0.6)` → `rgba(255,255,255,0.3)`（用户头像）
- **语义色**：绿 `#34C759` / 红 `#FF3B30` / 粉 `#FF2D55`（红包）/ 橙 `#fa9d3b`（转账）
- **背景**：`#e0e5ec`
- 集中管理在 `src/constants/colors.ts`

### 弹簧参数

统一在 `primitives.tsx` 的 AnimatedPressable 和 GradientButton 中：
- 按压：`damping: 18, stiffness: 350, mass: 0.6` + 透明度 1→0.85（iOS UIButton 手感）
- App 进入：`damping: 22, stiffness: 300, mass: 0.8`
- App 手势关闭速度阈值：`velocityY > 500`（iOS 标准）

### 触觉反馈

已经在以下位置接入 `triggerHaptic('light')`：
- App 图标点击（`index.tsx`）
- 发送消息（`ChatInputBar.tsx`）
- Tab 切换（`ChatListView.tsx`）

添加新触觉时导入 `triggerHaptic` from `'../utils/haptics'`。

### 字体系统

`hooks/useThemeFont.ts` 加载三个 Google Fonts（Inter / Playfair Display / JetBrains Mono），映射 `themeConfig.fontFamily` 到实际字体名。通过 AppContext 的 `themeFont` 字段全局可用。`ThemedText` 组件可同时应用字体和自定义颜色。

## NativeWind 使用说明

- 所有 `className` 使用 Tailwind 语法，编译为 RN StyleSheet
- **不支持**的 Tailwind 特性：`backdrop-blur-*`（原生无 backdrop-filter）、CSS Grid、`@apply`
- **`bg-gradient-to-*` 在原生端静默失效**——必须用 `<NativeGradient>` 或 `<GradientButton>`（来自 expo-linear-gradient）
- 自定义颜色/尺寸用 Tailwind 方括号语法：`bg-[#e0e5ec]`、`w-[60px]`
- 布局优先用 flex（`flex-row`、`flex-1`、`justify-center`、`items-center`）

## 动画系统

动画通过 `src/components/primitives.tsx` 中的可复用原语统一管理：

| 原语 | 用途 | 实现 |
|------|------|------|
| `AnimatedPressable` | 替代 TouchableOpacity，spring 按压反馈 + 透明度 | MotiView + Pressable + useState |
| `GradientButton` | 渐变按钮（4 变体：primary/ghost/danger/green） | LinearGradient + AnimatedPressable |
| `GlassView` | 玻璃拟态卡片（3 强度：light/medium/heavy） | 半透明背景 + shadow |
| `NativeGradient` | 任意渐变背景（8 方向） | LinearGradient 封装 |
| `Input` | 统一输入框（带 label） | View + Text + TextInput |
| `GlassCard` | 带标题 + 装饰线的玻璃卡片 | GlassView + NativeGradient 装饰线 |

**重要**：不要使用 `MotiPressable`——它的 `animate` 回调在 Reanimated worklet 线程执行，与 React Compiler 冲突。也不要使用 `framer-motion`（moti 的 web 端依赖，Metro 打包会出错）。

`AnimatedPressable` 支持 `onPressIn` / `onPressOut` 用于按住说话等场景。内层 `Pressable` 已设 `flex: 1` + `hitSlop={4}`，确保触摸区域等于视觉容器大小。

- 声明式动画用 `MotiView`（`from`/`animate`/`exit` props）
- 页面过渡用 `AnimatePresence`（从 moti 导入）
- 复杂连续手势用 `react-native-reanimated`（`useSharedValue` + `useAnimatedStyle`）
- Blob 背景动画用 `useSharedValue` + `withRepeat(withTiming(...))` 驱动

## Safe Area 处理

- 根布局已用 `<SafeAreaProvider>` 包裹（`react-native-safe-area-context`）
- 系统状态栏通过 `<StatusBar hidden />` 隐藏（`expo-status-bar`）
- 自定义状态栏行、Dynamic Island、主内容区均使用 `useSafeAreaInsets()` 动态计算偏移
- 全局背景色：`#e0e5ec`（`_layout.tsx` 根 View）
- 底部安全区：Tab 栏用 `paddingBottom: insets.bottom + 6`，输入栏用 `paddingBottom: insets.bottom + 4`

## 禁止事项

- **禁止使用 `TouchableOpacity`** — 必须用 `AnimatedPressable`
- **禁止使用 `bg-gradient-to-*` className** — 必须用 `NativeGradient` 或 `GradientButton`
- **禁止使用 `backdrop-blur-*` className** — 原生端无效
- **禁止使用 `MotiPressable`** — 与 React Compiler 冲突
- **禁止使用 `framer-motion`** — Web 专用，moti 的 web 端依赖，Metro 打包报 tslib 错误
- **不要使用 `tslib@2.x`** — framer-motion 6.x (moti 依赖) 只兼容 tslib 1.x。如遇 Metro 打包错误 `Cannot destructure property '__extends' of 'tslib.default'`，运行 `npm install tslib@1.14.1`

## 原版项目

原 Capacitor 版本已冻结并保存在此仓库之外。迁移完成后，新功能只在 `nana-rn` 开发。

## 关键配置文件

| 文件 | 作用 |
|------|------|
| `tsconfig.json` | `@/*` → `./src/*` 路径别名 |
| `babel.config.js` | babel-preset-expo + nativewind/babel |
| `metro.config.js` | withNativeWind 包装，input: `./src/global.css` |
| `tailwind.config.js` | nativewind/preset，空 extend |
| `nativewind-env.d.ts` | NativeWind 类型声明 |
| `android/gradle.properties` | `hermesEnabled=true`, `newArchEnabled=true` |
| `src/constants/colors.ts` | 集中式色板 |
| `src/components/primitives.tsx` | 可复用 UI 原语库 |
| `src/hooks/useThemeFont.ts` | Google Fonts 加载与映射 |

## React Compiler

`app.json` 中 `experiments.reactCompiler: true`。React Compiler 会对组件做自动 memoization，**不能与 MotiPressable 的 worklet 回调共存**。编译 / 热更新时如遇 worklet 错误，先确认没用到 MotiPressable。

## 数据导入/导出

- **导出**：收集所有 `nana_*` 前缀的 AsyncStorage key → JSON → `Share.share()`
- **导入**：通过全局 PromptModal 输入 JSON → 解析 → `AsyncStorage.multiSet()` → `useNanaStore.persist.rehydrate()`
- **清除**：删除所有 `nana_*` key → rehydrate → 应用回到初始状态
- PromptModal 在 `AppOverlay` 中渲染（不在 WeChatRootView），确保所有 App 内可用
