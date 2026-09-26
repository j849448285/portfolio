# 🎨 作品集更新与部署操作手册 (Deployment & Update Guide)

本手册旨在指导你如何向你的复古简约作品集 (`minimalist_composer_portfolio`) 中添加新的音乐作品、视频、文章以及将整个网站发布到互联网上。

---

## 📁 文件夹结构概览
在开始之前，请确保你的文件夹结构如下：
```text
minimalist_composer_portfolio/
├── index.html              # 首页（所有作品的入口）
├── style.css               # 全局样式表
├── DEPLOYMENT_GUIDE.md     # 本手册
├── audio/                  # (需手动创建) 存放本地音频文件 (.mp3, .wav)
└── notes/                  # 存放创作笔记 (详情页)
    ├── math-rock.html
    └── urban-noise.html
```

---

## ✍️ 1. 如何添加新文章 (创作构思记录)

每篇新文章都需要一个独立的 HTML 文件，以保证极佳的阅读体验。

**操作步骤：**
1. **创建文件**：在 `notes/` 文件夹中新建一个 `.html` 文件（例如 `my-new-note.html`）。
2. **复制模板**：直接复制 `notes/math-rock.html` 的全部内容到新文件中。
3. **修改内容**：
   - 修改 `<title>` 标签内的标题。
   - 修改 `<h1>` 标签内的文章标题。
   - 在 `<article class="article-body">` 内部撰写你的正文。
4. **在首页建立链接**：
   - 打开 `index.html`。
   - 找到 `#notes` 区域，复制一个 `<article class="note-item">` 块。
   - 将 `<a href="notes/..." class="read-more">` 中的路径改为你新文件的路径。

---

## 🎵 2. 如何上传音频作品

### 方案 A：本地上传 (适合短片段/演示)
1. **存放文件**：将音频文件放入 `audio/` 文件夹中。
2. **修改代码**：在 `index.html` 的音乐作品区域，找到 `<audio>` 标签：
   ```html
   <audio controls src="audio/你的文件名.mp3"></audio>
   ```

### 方案 B：外部嵌入 (强烈推荐，适合完整作品)
如果你使用 SoundCloud 或 Bandcamp，无需上传文件，直接嵌入播放器：
1. 在 SoundCloud 上点击作品的 **Share $\rightarrow$ Embed**，复制 `<iframe>` 代码。
2. 在 `index.html` 中删除 `<audio>` 标签，直接粘贴 `<iframe>` 代码。
   - *优点*：加载极快，且能同步增加播放量。

---

## 🎬 3. 如何上传视频/交互作品

由于视频文件极大，**禁止**将视频直接放在文件夹中，必须使用外部托管平台。

**操作步骤：**
1. **上传视频**：将视频上传至 **Vimeo** (首选，画质高且无广告) 或 **YouTube**。
2. **获取嵌入代码**：点击视频下方的 **Share $\rightarrow$ Embed**，复制 `<iframe>` 代码。
3. **修改代码**：在 `index.html` 的交互作品区域，找到 `.video-placeholder` 所在的 `div`：
   - 将 `<div class="video-placeholder">...</div>` 整个替换为复制的 `<iframe>` 代码。

---

## 🚀 4. 如何发布到互联网 (让别人看到)

你目前的文件夹在本地电脑，需要通过以下步骤将其变为一个可以通过链接访问的网站。

### 推荐方法：使用 Vercel (最快)
1. 访问 [Vercel.com](https://vercel.com) 并登录。
2. 进入 Dashboard，直接将整个 `minimalist_composer_portfolio` 文件夹**拖拽**到上传区域。
3. 等待 10 秒钟 $\rightarrow$ Vercel 会给你一个链接 (例如 `composer-portfolio-abc.vercel.app`)。
4. **将这个链接分享给你的观众即可！**

### 专业方法：使用 GitHub Pages (适合长期维护)
1. 在 GitHub 创建名为 `portfolio` 的私有/公开仓库。
2. 将文件夹内所有文件上传至该仓库。
3. 在仓库 **Settings $\rightarrow$ Pages** $\rightarrow$ 选择 `main` 分支 $\rightarrow$ **Save**。
4. 你将获得一个 `https://yourname.github.io/portfolio/` 的永久链接。

---

## 💡 维护小贴士
- **备份**：在进行大规模修改前，记得备份整个文件夹。
- **检查**：每次修改完代码后，双击 `index.html` 在浏览器中预览，确保链接跳转正确。
- **图片**：如果需要添加图片，请创建 `images/` 文件夹，并使用 `<img src="images/photo.jpg">` 引用。
