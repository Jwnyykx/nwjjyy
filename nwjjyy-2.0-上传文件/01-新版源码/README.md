# nwjjyy的故事 2.0

**我们的故事，未完待续。**

一本两个人可以一起续写的私人故事书。公开首页展示封面。成员可以一起整理故事章节、留下各自的视角、翻看照片背面的文字、记录相见的地点，以及写下留给未来的信。

现有正式网址是 [jwnyykx.github.io/nwjjyy](https://jwnyykx.github.io/nwjjyy/)。当前交付是独立工作区的新版，本次验收范围为本地试用。

## 直接在本机试用

需要 Node.js 24 或以上。在项目目录执行：

~~~powershell
npm ci
npm run local
~~~

打开 [本机试用](http://127.0.0.1:5174/)。如果服务已启动，直接打开链接即可。

| 本机测试角色 | 邮箱 | 测试密码 |
| --- | --- | --- |
| 管理员 | yangyang@example.test | story-local-only |
| 共同记录者 | wanwan@example.test | story-local-only |

在另一个浏览器或无痕窗口登录第二个账号，可以从收信人的角度试用。两个窗口读取同一个本地数据库。试用记录保存在 output/local-preview.pg，重开服务会保留记录。这个链接只在启动服务的电脑上可用。请用测试内容，实际账号和私人媒体在正式接入后再添加。

登录后从 **更多 → 写给你的信 · 时间胶囊** 试试寄信，或从 **故事 → 章节** 浏览故事。双人视角、照片翻面、足迹、年鉴和放映机的操作见 [日常操作指南](USER-GUIDE.md)。

## 连接自己的 Supabase

1. 按 [接入及上线说明](SETUP.md) 创建专用 Supabase 项目、执行迁移、授权两位账号。
2. 复制 .env.example 为 .env.local，填项目 URL 和公开客户端密钥。
3. npm run dev 打开前端，完成账号与内容验收。无配置时仍可看公开封面和接入状态。
4. npm run typecheck、npm test、npm run build 分别运行类型检查、本地数据库与恢复测试、构建。npm run preview 可以预览构建产物。
5. 确认本机验收结果并明确同意发布后，按 SETUP.md 在原有 GitHub 仓库设置 Pages。网站内容可在登录后更新。

浏览器流程测试使用独立本地库。先运行 `node tests/prepare-browser-fixtures.mjs`，再在另一个 PowerShell 窗口设置 `$env:STORY_TEST_PORT='5192'` 后运行 `npm.cmd run local`。然后执行：

~~~powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=storybook-v2-qa open about:blank --browser=chrome
npx.cmd --yes --package @playwright/cli playwright-cli -s=storybook-v2-qa run-code --filename tests/v2-browser.js
~~~

测试记录写入 5192 的试用库，截图写入 output 目录。默认 5174 的本机试用库独立保存。Windows PowerShell 如限制 npm.ps1，可使用 npm.cmd 运行上述 npm 命令。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| src/pages/ | 封面、登录、时间轴、阅读、相册、写作和管理 |
| src/data/ | Supabase 请求、类型、日期、媒体和导出 |
| src/ui/ | 表单、媒体阅读、Markdown 和兔子互动 |
| supabase/migrations/ | PostgreSQL 表、权限、私有媒体桶和事务函数 |
| tests/ | 数据库规则、恢复测试和仅本机使用的试用服务器 |
| scripts/restore.mjs | 在专用新项目中恢复管理员备份 |
| .github/workflows/pages.yml | 校验源码和发布 Vite 构建产物 |

React、TypeScript、Vite 和 React Router 提供网页和打包。GitHub Pages 提供静态网页，故事与媒体由 Supabase Auth、PostgreSQL 行级权限和私有 Storage 保护。路由经过 #，资源使用相对路径。全站使用设备自带字体。

## 维护资料

- [日常操作指南](USER-GUIDE.md)
- [数据库、权限与恢复](DATABASE.md)
- [接入和部署](SETUP.md)
- [原兔子素材来源](assets/images/ASSET_NOTES.md)
- [封面插画来源](src/assets/COVER-NOTES.md)

旧版线上提交保存在本地 Git 分支 backup/nwjjyy-pages-20261114，旧本地提交保存在 backup/nwjjyy-local-20261114。原始工作目录的未提交修改留在原目录。代码采用 [MIT 许可证](LICENSE)，兔子图像权利见素材来源说明。
