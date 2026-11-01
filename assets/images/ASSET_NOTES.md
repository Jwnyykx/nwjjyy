# 兔子图像来源与处理说明

## 当前资产

- 文件：`bunny-model.png`
- 尺寸：1199 × 1312 像素
- 格式：带透明背景的 PNG
- 来源：用户在本次开发对话中提供的奶白色毛绒垂耳兔模型参考图。
- 用途：Nwjjyy 网站的主要兔子形象及二维分层动画。

模型外观以用户提供的图片为准，保留奶白毛绒质感、垂耳、面部、身体比例、双脚与紫色刺绣。原图刺绣是小写 `nwj jyy`；处理时不把它改写为品牌标题 **Nwjjyy**，也不调整绣字的大小写或重新设计字形。

## 图像处理

使用本次会话提供的**内置 ImageGen 图像编辑工具**处理参考图，目标是透明背景资产，没有使用付费外部 API 或在项目中存放 API 密钥。工具不参与网站运行；浏览器只加载已经生成的本地 PNG。

处理分为两次。以下是编辑提示的中文约束概述，方便维护者理解处理范围，并非对工具内部过程的额外保证：

1. **移除背景与地板阴影。**仅移除参考图的白色背景和地板投影，输出真实透明背景；完整保留兔子的奶白色毛绒纹理、原有轮廓、垂耳形状、脸部表情、身体比例、手脚、紫色刺绣及原图绣字大小写。不要重绘兔子，不新增服饰、五官、装饰或文字，不更换姿势、配色和模型外观。
2. **清理外围白色碎屑。**以上一次透明结果为基础，仅清理兔子轮廓外残留的白色碎屑、孤立白点及背景痕迹，保留自然毛绒边缘与兔子本体；继续使用真实透明背景，不新增阴影、底色或光晕，不改动紫色刺绣，不改写、补写或放大绣字，不改变面部、双耳、双脚和身体比例。

网站不再使用最初的临时 SVG 兔子方案。页面中的内联 SVG 只是裁切与定位容器：身体、双耳、双脚和眼睛区域重复引用同一张 `bunny-model.png`，通过裁切分层与 CSS 变换形成眨眼、双耳轻摆及双脚交替小碎步。更换图片后，需要重新校准裁切边界和动画，避免出现接缝或局部错位。

## 权利与公开范围

项目 HTML、CSS 和 JavaScript 代码采用根目录的 MIT 许可证。**用户提供的模型图片及其处理版本，其权利仍归原权利人；代码的 MIT 许可不代表这些图像自动获得 MIT 授权。**本说明没有确认原图作者或授予额外的肖像、著作权及商标权许可。

发布到公开 GitHub 仓库或公开网站之前，项目所有者应确认图像来源以及相应的使用、修改和公开传播授权。公开的 PNG 可以被访问者保存和下载；透明处理、分层动画或页面交互不会限制他人取得原始文件。

若后续获得明确的素材授权文件或署名要求，请更新本说明，并保留对应的权利声明。

## 实际编辑提示

以下两段为本次实际传给内置 ImageGen 的完整提示，逐字保存。两次调用均使用 `transparent_background: true`。

第一次：背景提取。

```text
Use case: background-extraction. Asset type: transparent PNG cutout for a private bunny-interaction website. Input image is the exact edit target, not a style reference. Primary request: remove ONLY the white background and the floor/cast shadow, replacing them with genuine transparent alpha. Preserve the bunny itself exactly: identical cream plush fur, all tiny fur fibers and their colors, long floppy ears, face and large glossy brown eyes, pink nose and cheeks, paws and feet, silhouette and pose, original proportions, and the exact purple embroidered lettering and heart on the viewer-right ear. Do not redraw, restyle, beautify, reshape, or add anything. Keep the full bunny uncropped, centered, with transparent padding around all edges. The transparent area must be actual alpha, not a checkerboard image and not a white backdrop. Do not add a new shadow.
```

第二次：外围碎屑清理。

```text
Use case: background-extraction. This is a cleanup of an existing transparent cutout, not a new illustration. Change ONLY the disconnected stray white/colored speckles and fragments floating in the empty transparent space around the rabbit, including those above its head, on both sides, between its ears and legs, and below its feet: remove these residual background fragments to fully transparent alpha. Preserve every part of the rabbit itself exactly, including its outline, natural fur fibers along the silhouette, face, cream coloring, ears, feet, pose, purple embroidered lettering and heart. Do not change the rabbit's size or framing; do not redraw anything. Keep the same image dimensions, position and scale. The result must have clean genuine transparent empty space surrounding the full rabbit, with no shadow, no floating pixels, no added outline.
```
