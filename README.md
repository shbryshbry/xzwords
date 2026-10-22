# xz背单词 (xzwords) 📚

开源、离线、单机的 Windows 桌面背单词应用。全部代码从零编写，不依赖任何原软件代码与资源。

核心：**FSRS 科学记忆调度 + 桌面碎片化插件**，数据 100% 保存在本机，无账号、无联网依赖。

![License](https://img.shields.io/badge/license-MIT-green) ![Electron](https://img.shields.io/badge/electron-44-blue) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

## ✨ 功能

### 学习调度
- **FSRS-4.5** 科学间隔重复（默认参数，可调期望记忆率 70%~97%）
- **艾宾浩斯** 经典箱线（10分钟/1天/2天/4天/7天/15天/30天/60天）
- 每日新词上限、复习上限、学习步骤（分钟级）可配置
- 出题顺序：正序 / 乱序；学习范围：全部 / 按单元 / 自定义序号区间
- 记忆反馈四键：不认识 / 模糊 / 认识 / 简单（安排下次复习时间）
- 延后（穿插到下一词之后）、收藏、掌握（F3）、重学流程、全局熟词

### 学习工具
| 工具 | 说明 |
|---|---|
| 🃏 卡片背单词 | 正反面翻卡，底部记忆反馈（快捷键 1-4 / 空格 / P / S / F3） |
| 📃 列表快速背 | 单词+译文平铺，数字键直接反馈 |
| ✅ 选题背单词 | 四选一（词义题 + 词库自带真题选择题） |
| ⌨️ 拼写练习 | 默写/抄写模式，逐字母校验、提示、每词重复 1-3 遍 |
| 🔢 顺序模式 | 按词库顺序浏览，进度自动保存、断点续记 |

### 桌面插件（碎片化被动学习）
- 🎠 **桌面轮播**：定时切换的置顶单词卡，多主题配色，点击发音
- ✅ **选题浮窗**：常驻桌面小窗四选一答题，**绝不抢焦点**（`focusable:false`）——边工作边背词
  - `Alt+Q` 全局显示/隐藏浮窗
  - 浮窗内点 **⌨** 开启「键盘答题」后，`1-4` 全局直接作答（再点关闭，避免干扰平时打字）
  - 右下角拖拽调整大小，答题可选是否计入复习计划
- 📌 **桌面贴纸**：单词便签常驻桌面，右键换样式/移空间/换词/删除

### 词库管理
- 内置示例导入：**官网同款 JSONL**（每行一个词的 JSON，如 CET4/6/考研/雅思词库文件）、JSON 数组、TXT/CSV（`单词 = 译文` 或 `单词,译文`，自动识别 UTF-8/GBK）
- 单元管理（每单元词数可配）、批量操作（掌握/收藏/熟词/删除/重置）、搜索、状态筛选、词汇评分
- 词条详情：释义/例句/真题例句/短语/同近义词/同根词/记忆法/真题练习；释义与音标可编辑
- 全局熟词：跨词库标记，自动跳过

### 其他
- 复习预览（未来 30 天到期日历，点日期提前学）
- 学习统计（今日/累计/连续天数/14 天柱状图）
- 系统语音发音（美音/英音、音色/语速可调、自动发音）
- 托盘常驻、关闭窗口不退出
- 数据本机存储，支持一键导出/导入备份

## 🚀 快速开始（普通用户）

1. 下载 Release 中的便携版 exe（或自行打包，见下文）
2. 双击桌面图标即可（首次启动需解压 10-30 秒）
3. 「我的词库 → 新建词库」导入你的词库文件
4. 关闭窗口 = 缩到托盘；托盘右键可彻底退出

> ⚠️ 部分Windows 系统下 Chromium 沙箱引导会失败（启动即崩），启动参数已带 `--no-sandbox`（快捷方式内置）。本应用不加载任何远程内容，关闭沙箱无实际安全影响。

## 🛠 从源码运行 / 开发

```bash
git clone <本仓库地址>
cd xzwords
npm install        # 国内网络建议保留 .npmrc（npmmirror 镜像）
npm start          # 启动开发版
npm test           # 运行单元测试（29 项，无需 Electron）
npm run dist       # 打包 Windows 便携版 exe（输出到 release/）
npm run pack       # 仅打包成目录（release/win-unpacked）
npm run icon       # 重新生成应用图标（纯 Node 实现，无依赖）
```

要求：Node.js ≥ 18。无任何运行时依赖、无原生模块，克隆后 `npm install` 只装 electron 与 electron-builder 两个开发依赖。

> 💡 打包时若报 `WebAssembly.Memory(): could not allocate memory`，是系统内存不足（浏览器/剪辑软件占用），关闭大内存程序后重试；或把 `electron-builder.yml` 的 `compression` 设为 `store`（不压缩，低内存可打包，exe 体积变大）。

## 📖 词库导入格式

**1. JSONL（推荐，每行一个词的 JSON）**——兼容市面常见的百词斩式导出：

```json
{"wordRank":1,"headWord":"abandon","content":{"word":{"wordHead":"abandon","content":{"ukphone":"ə'bænd(ə)n","trans":[{"tranCn":"放弃","pos":"vt"}],"sentence":{"sentences":[{"sContent":"...","sCn":"..."}]}}}}}
```

自动映射：音标（ukphone/usphone）、词性（pos）、释义（trans）、例句、真题例句、短语、同近义词、同根词、记忆法、真题选择题。

**2. JSON 数组（简化结构）**：

```json
[{"word":"apple","trans":["苹果"]},{"word":"bus","translation":"公交车"}]
```

**3. TXT / CSV**（每行一条，`=`、`,`、Tab 分隔均可）：

```
caption = 标题
distance = 距离
hello my friend = 你好我的朋友
```

> 注：词典数据（如四六级词库）版权归原作者/提供方所有，本仓库不分发任何词库数据，请自行导入。`scripts/seed-all.js` 提供了多词书合并导入的示例（同词取信息最丰富的词条、字母序重排）。

## 🧠 记忆算法

- **FSRS-4.5**：17 个默认参数（w[0..16]），可提取强度 `r(t,S)=(1+19/81·t/S)^(-1/2)`，复习间隔由期望记忆率换算；新词学习步骤默认 `10分钟 → 1天 → 毕业`，遗忘进入重学（10 分钟）
- **艾宾浩斯**：8 级固定间隔箱线，答对升级、答错回炉
- 两种算法共用同一套反馈（1-4），随时可在设置中切换

## 📁 项目结构

```
xzwords/
├── main.js            # Electron 主进程：窗口/托盘/IPC/插件窗口/全局快捷键
├── preload.js         # contextBridge 安全 API
├── lib/
│   ├── srs.js         # FSRS-4.5 + 艾宾浩斯 调度算法（纯函数，双端可用）
│   ├── store.js       # 数据层：原子写 JSON 存储/统计/备份
│   └── importer.js    # 词库解析器（JSONL/JSON数组/文本，UTF-8/GBK 自动识别）
├── renderer/          # 主界面（原生 HTML/CSS/JS，无框架）
│   ├── index.html
│   ├── css/app.css
│   └── js/            # app 核心 + 各页面 + 五种学习工具
├── widgets/           # 桌面插件窗口（轮播/选题浮窗/贴纸）
├── assets/            # 图标
├── scripts/           # 图标生成 / 词库预置合并 / 冒烟启动脚本
└── test/              # 单元测试（算法/导入器/数据层）
```

数据保存在 `%APPDATA%/xz背单词/data`（JSON，原子写入；损坏自动隔离 `.corrupt-*` 备份）。

## 🧪 测试

```bash
npm test
```

覆盖：FSRS 间隔单调性/毕业/遗忘/重学闭环、艾宾浩斯箱线、间隔文案、JSONL/JSON/文本导入、坏行容错、去重、学习闭环、每日上限、收藏/未掌握来源、全局熟词、复习预览、贴纸、备份、插件取词。

可选：设置环境变量 `MOMO_CET4=<真实词库路径>` 可额外跑真实词库解析用例。

## 🤝 贡献

欢迎 Issue / PR！开发约定：

- 渲染层为原生 JS，无构建步骤，改完即生效
- 主进程与渲染层通过 `preload.js` 暴露的 `window.momo.*` 通信，新增通道需三处同步（main handle / preload / 调用方）
- 所有落盘数据走 `store.js` 的原子写
- 提交前请跑 `npm test`

## 💗 支持作者

如果 xz背单词 对你有帮助，欢迎请作者喝杯饮料～

<p align="center"><img src="assets/donate.webp" width="260" alt="微信赞赏码"></p>

- 📕 小红书：**xz0516762**（昵称：先z）
- 🎵 抖音：**xz0516762**（昵称：先z）

关注可以第一时间看到更新动态～

## 📄 License

[MIT](LICENSE) © 2026 xzwords contributors

## 🙏 致谢

- [FSRS](https://github.com/open-spaced-repetition) —— 开源间隔重复算法
- 词库数据（四六级/考研词书）来自百词斩，版权归原方，本项目不分发数据
