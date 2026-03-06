````markdown
# UI Design Style Guide — Hyper Alpha Arena

> 设计哲学：交易终端美学（Trading Terminal Aesthetic）
> 对标参考：Bloomberg Terminal / TradingView / Hyperliquid
> 核心原则：专业、锐利、克制、数据优先

---

## 1. 字体

### 唯一字体：IBM Plex Mono

- 全站**只使用一种字体**，包括正文、标题、按钮、输入框、代码
- 不允许引入任何衬线字体或无衬线字体（如 Inter、Geist、Noto Sans）
- 字体加载：Google Fonts，字重范围 100–700，含斜体

```css
font-family: "IBM Plex Mono", monospace;
```
````

### 字号规范

| 用途      | class                                        |
| --------- | -------------------------------------------- |
| 大标题    | `text-sm font-semibold`                      |
| 正文      | `text-xs`                                    |
| 辅助/标签 | `text-xs text-muted-foreground`              |
| 数据数字  | `text-xs font-medium` 或 `text-sm font-bold` |
| 按钮文字  | `text-xs font-medium`                        |

> ❌ 禁止使用 `text-lg`、`text-xl`、`text-2xl` 及以上（页面主标题除外，且不超过 `text-lg`）

---

## 2. 颜色

### 色盘原则：无饱和度 + 单一强调色

主色调全部使用 **中性灰黑白**（hsl 饱和度为 0%），不使用任何蓝色、紫色、彩色渐变背景。

### 强调色（唯一）

| 用途          | 颜色值                                             |
| ------------- | -------------------------------------------------- |
| 侧边栏激活态  | `#B8860B`（DarkGoldenrod 暗金色）                  |
| Hover 高亮    | `text-[#B8860B]`                                   |
| VIP 图标/光环 | `from-yellow-200 via-amber-500 to-orange-600` 渐变 |

### 涨跌色（仅用于金融数据）

| 含义               | 颜色                                  |
| ------------------ | ------------------------------------- |
| 上涨 / 盈利 / 正值 | `text-green-500` → `rgb(34, 197, 94)` |
| 下跌 / 亏损 / 负值 | `text-red-500` → `rgb(239, 68, 68)`   |

### 边框色

```css
border-color: hsl(340.99deg 10.3% 57.34%); /* 温暖玫瑰灰，统一边框 */
```

> ❌ 禁止使用：紫色、蓝色主题色、彩色渐变背景、彩色 icon 背景块

---

## 3. 圆角

### 规则：全局归零

```css
[class*="rounded"] {
  border-radius: 0 !important;
}
```

- 所有组件（卡片、按钮、输入框、对话框、徽章、标签页）**一律无圆角**
- 不使用 `rounded-full`（圆形头像/按钮除外，如用户头像）
- shadcn 组件默认圆角已被全局覆盖，新增组件不得手动加 `rounded-*`

---

## 4. 间距与布局

### 布局骨架

- **桌面端**：固定左侧导航栏（`w-48`）+ 顶部 Header + 主内容区
- **移动端**：底部固定 4-Tab 导航栏（Dashboard / K-Lines / Chat / Programs）
- 最大内容宽：`max-w-[1400px]`，居中，`padding: 2rem`

### 间距原则

- 内边距优先用 `p-3`、`p-4`（12px / 16px），避免 `p-8` 以上的大留白
- 卡片内部标题与内容间距：`mb-2` 或 `mb-3`
- 列表行高：`py-2` 或 `py-3`

---

## 5. 组件规范

### 5.1 卡片（Card）

```tsx
<Card className="border bg-card">
  <CardHeader className="pb-2">
    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      标题
    </CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

- 标题用全大写 + 宽字距（`uppercase tracking-wider`）表达仪表盘感
- 背景：`bg-card` 或 `bg-background`，不使用彩色背景

### 5.2 按钮（Button）

- 默认变体（黑底白字）用于主操作
- `variant="outline"` 用于次级操作
- `variant="ghost"` 用于工具栏图标按钮
- **不使用彩色按钮**（蓝/绿/紫）
- 尺寸统一用 `size="sm"` 或默认，不用 `size="lg"`

### 5.3 徽章（Badge）

```tsx
// 状态标签：用边框色区分，不用彩色背景
<Badge variant="outline" className="text-xs">运行中</Badge>

// 涨跌标签：仅此场景用颜色
<Badge className="bg-green-500/10 text-green-500 border-green-500/20">+2.3%</Badge>
```

### 5.4 表格（Table）

- 表头：`text-xs text-muted-foreground uppercase tracking-wider`
- 行悬停：`hover:bg-muted/50`
- 无斑马纹

### 5.5 输入框（Input）

- 统一 `h-8 text-xs`（紧凑型）
- placeholder 用 `text-muted-foreground`
- 无圆角（已全局覆盖）

### 5.6 标签页（Tabs）

```tsx
<Tabs>
  <TabsList className="h-8">
    <TabsTrigger className="text-xs">选项</TabsTrigger>
  </TabsList>
</Tabs>
```

---

## 6. 动效规范

### 允许的动效

| 动效                             | 使用场景                 |
| -------------------------------- | ------------------------ |
| 数字翻牌 `flip-digit`            | 实时行情数字变动         |
| 数值上涨闪绿 `number-up`         | 价格/余额上涨瞬间        |
| 数值下跌闪红 `number-down`       | 价格/余额下跌瞬间        |
| 毛玻璃 Header `backdrop-blur`    | 顶部导航栏               |
| `transition-colors duration-200` | 按钮/链接 hover          |
| `animate-pulse`                  | 加载占位、实时连接指示灯 |

### 禁止的动效

> ❌ 浮动粒子、流光渐变、打字机逐字显示（AI感）、弹跳动画、视差滚动

---

## 7. 图标

- 使用 **Lucide Icons**（线条风格，`size={14}` 或 `size={16}`）
- 图标颜色跟随文字色（`currentColor`），不单独着色
- 不使用 emoji 作为功能图标
- 自定义 SVG：交易所 Logo、K线图标等场景允许内联 SVG

---

## 8. 图表

- 图表库：**Recharts**
- 去除所有 focus outline：`outline: none`
- 涨跌区域：绿色填充（`fill-opacity: 0.1`）/ 红色填充
- 网格线：`stroke="#333"` 细灰线，不使用白色网格
- Tooltip：深色背景 `bg-background border`，等宽字体
- 不使用饼图（除非必要）；优先折线图、柱状图

---

## 9. 代码编辑器

- 使用 **Monaco Editor**（VSCode 同款）
- 主题：`vs-dark`（深色模式）
- 字体：`IBM Plex Mono`，`fontSize: 13`
- 不允许用 `<textarea>` 代替代码编辑器

---

## 10. 国际化

- 所有用户可见文本必须通过 `i18n` 提供中/英双语
- 不允许硬编码中文或英文字符串直接写在 JSX 中
- 使用 `useTranslation()` hook

---

## 11. 禁止清单（Anti-patterns）

以下风格与本产品调性冲突，**严格禁止**：

| 禁止项                        | 原因                    |
| ----------------------------- | ----------------------- |
| 渐变背景（蓝紫、彩虹）        | AI 产品感，破坏终端美学 |
| 圆角卡片堆叠布局              | 消费级 App 感           |
| 大号无衬线字体标题            | 违背等宽字体规范        |
| 彩色 icon 背景方块            | Dashboard 仪表盘廉价感  |
| 打字机动效/流式渐显           | 强烈 AI 聊天感          |
| 顶部居中导航布局              | 营销页风格，非工具软件  |
| 使用 `text-blue-*` 作为强调色 | 违背单一暗金强调色原则  |
| `rounded-xl`、`rounded-2xl`   | 违背零圆角规范          |

---

> 遵循本规范的界面应让用户感受到：
> **"这是一个专业的量化交易工具，AI 是它的引擎，不是它的脸。"**

```

这份文档涵盖了从字体、颜色、圆角到动效、禁止项的完整设计约束，可以直接作为 Code Review 标准或交给 AI 生成组件时的上下文参考。这份文档涵盖了从字体、颜色、圆角到动效、禁止项的完整设计约束，可以直接作为 Code Review 标准或交给 AI 生成组件时的上下文参考。
```
