# 设计存档

此目录保存已移除功能的 UI 设计，供将来参考或复用。

## 登录页 (Login.vue)

- **文件**: `Login.vue`
- **状态**: ✅ 已保存完整 UI
- **i18n keys** (在 `src/i18n/messages.js` 中保留):
  - `login.empty` — 请输入用户名和密码
  - `login.wrong` — 用户名或密码错误
  - `login.success` — 登录成功，欢迎回来！
  - `login.fail` — 登录失败，请检查账号密码
  - `login.fallbackName` — 武理学子
  - `login.welcome` — 欢迎回来
  - `login.subtitle` — 武理小精灵 · 您的智慧校园助手
  - `login.account` — 学号 / 账号
  - `login.accountPlaceholder` — 请输入您的学号
  - `login.password` — 密码
  - `login.passwordPlaceholder` — 请输入密码
  - `login.loggingIn` — 登录中...
  - `login.submit` — 立即登录
  - `login.help` — 遇到问题? 联系管理员获得帮助

## 头像选择器 (AvatarPicker.vue)

- **文件**: `AvatarPicker.vue`
- **预设头像**: DiceBear API（notionists / avataaars / bottts 风格）
- **UI**: 4×3 网格布局，悬停边框高亮，选中态紫色描边

## 系统设置面板 (SettingsPanel.vue)

- **文件**: `SettingsPanel.vue`
- **功能**: 主题模式切换 + ~~修改密码~~ ~~退出登录~~ → 重置身份
- **状态**: 已迁移到 ProfilePanel.vue（主题切换功能合并到个人中心）

## Chroma 向量数据库服务 (chroma.service.js)

- **文件**: `chroma.service.js`
- **说明**: 从未被实际调用过，RAG 走的是讯飞知识库 WebSocket

### 设计特点

- 背景：蓝青渐变模糊圆点缀，`animate-pulse` 微动效
- 卡片：毛玻璃效果 (`backdrop-blur-xl`)，白色半透明背景
- Logo：武理工校徽，旋转悬浮动效
- 表单：圆角输入框，聚焦时蓝色发光边框
- 按钮：蓝渐变，hover 加深，点击微缩
- 底部：版权信息 + 帮助链接
