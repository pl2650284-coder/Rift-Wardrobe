# 峡谷衣橱视觉初稿

已选择并实现 A「沉浸衣橱」。正式界面在 ui/src/main.ts、ui/src/shell.ts 与 ui/src/immersive.css；implemented/ 中保存正式构建截图和验证记录。桌面开发版通过 npm.cmd run desktop:dev 启动。

双击 `index.html` 比较三个方向；每版可独立打开，图片和标识均内嵌，离线可预览。`thumbs.html` 是六个初始候选。

| 方案 | 主要变化 | 入口 |
|---|---|---|
| A 沉浸衣橱 | 原画为主体、底部皮肤带、深墨蓝与金 | dir-1.html |
| B 精工收藏馆 | 冷白背景、多列图库、固定详情 | dir-2.html |
| C 竞技工作台 | 顶部导航、列表与原画并排、石墨与冰蓝 | dir-3.html |

以现有桌面窗口980×700为主要验收尺寸。页面内均为演示数据，选择、收藏、使用只改变预览，不调用真实客户端。用户确认方向后，再将相应视觉落到正式应用。

设计依据与来源：spec.md、directions.md、brand-spec.md、product-facts.md。方向选择记录：direction-approved.md。浏览器验证记录：validation.json。

官方原画为1215×717，适合当前尺寸预览；不是高分辨率游戏内素材导出。无外部字体、框架或CDN运行依赖。
