# 品牌与素材

自身品牌：峡谷衣橱 / Rift Wardrobe；标识直接复用 ui/public/app-mark.svg，保留盾牌及 W 图形，不重画标志。金色 #c8a96a、灰黑 #151817、松绿 #4fa99b 来自现有 SVG。

字体：Windows 原生 Segoe UI / Microsoft YaHei；不依赖外部字体服务。

游戏图片全部下载自 Riot 官方 Data Dragon；对应官方英雄页见 product-facts.md。assets 内五张 JPG 共用于六个候选，浏览器解码核实为1215×717，缩略图实际查看无破图。此为官方网页原画尺寸，足以支持980×700预览，未声称有2000px资源。最终HTML内嵌原图。

参考板：refs/mobalytics.webp 已肉眼查看，借用其固定分区和操作层级。Python版 ref_board.py 因本机缺少 Python Playwright 无法执行，改为直接查看官方图片；Node Playwright 可用并用于所有原型验证。OP.GG 页面在浏览器返回请求被拒绝错误，未把该页作为设计证据。

这是独立助手的界面探索，不把英雄联盟官方标志作为 App 自身 Logo。参照产品仅在设计说明里署名，不在产品原型中伪装成它们。
