# NEBULA CTRL · 手势驱动 3D 粒子系统

单文件 HTML 原型：22,000 个粒子的 Three.js 场景，用摄像头手势（单手 + 双手混合）实时控制形态、缩放、涡旋与冲击波。

在线演示：<https://nebula-ctrl.pages.dev>

## 运行

直接双击 `index.html` 就能看到粒子场景（脚本走 CDN）。想用手势则需要 HTTPS 或 localhost：

```
python -m http.server 8000
# 打开 http://localhost:8000/index.html
```

页面加载后会先让你点「启用手势控制」才请求摄像头权限；不想授权可以点「跳过，用鼠标体验」（拖拽旋转、滚轮缩放）。

## 手势

单手：张掌（扩散）· 握拳（坍缩）· 捏合（缩放）· 指向（粒子流）· 胜利（切换配色）· 掌位（yaw/pitch）· 掌面旋转（roll）

双手：双手距离（整体缩放）· 双掌涡旋（加强涡旋）· 合击（冲击波）· 一握一张（吸引/排斥）· 分层托举（沿 Y 拉伸）

键盘：`1-5` 切形态 · `G` 辉光 · `T` 拖影 · `H` 隐藏 HUD · `C` 重开摄像头 · `空格` 暂停自动演示 · `R` 重置

## 文件

- `index.html` — 全部源码（CSS/JS 内联，无构建步骤）
- `dist/` — 部署产物：`index.html` 加同域的 `hand_landmarker.task`

## 部署

```
Copy-Item index.html dist\index.html -Force
npx wrangler pages deploy dist --project-name nebula-ctrl
```

`wrangler.jsonc` 已把资源目录锁定为 `./dist`。**不要**把仓库根目录当作部署目录，否则会连同 `.git/` 一起发布出去。

## 中国大陆访问

手部识别模型默认来自 `storage.googleapis.com`，该域名在中国大陆不可达。因此 `dist/` 里放了一份同域的 `hand_landmarker.task`，页面会优先加载它，取不到才回退官方地址——这样国内访问者也能正常用手势。MediaPipe 运行时（wasm）在 jsDelivr 不可达时会自动切到淘宝 npm 镜像 `registry.npmmirror.com`。

## 技术栈

Three.js 0.186.1（ESM + importmap）· MediaPipe tasks-vision 1.1.1（HandLandmarker，最多双手）· Tailwind CSS 4.3.3（browser 构建）

## 已知限制

- 手势阈值集中在文件顶部的 `CFG` 与 `classify()`，换环境/换摄像头可能需要现场微调。
- Three.js 与 Tailwind 仍走 jsDelivr；若该 CDN 在某些网络下不可达，页面会白屏（MediaPipe 有镜像回退，这两者暂时没有）。
- 面向桌面独显调试，22k 粒子的实际帧率未在集显/移动端验证。
- 无音频、无手势录制回放、未做移动端触控适配。
