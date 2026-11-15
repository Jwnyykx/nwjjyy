# 将《nwjjyy的故事》接到正式网站

目前工作区是本机试用版。两个测试账号只在本机试用服务器上使用。正式网站将使用你名下的 Supabase 项目和两位自己的邮箱账号。

## 1. 创建私人数据库

1. 登录 [Supabase](https://supabase.com/dashboard)，在自己的组织里新建专用于这本故事书的项目。选择合适的地区和套餐，保存数据库密码。项目地区和费用以创建页面的选项为准。
2. 在项目的 **Authentication → Settings** 或 **Sign In / Providers** 中启用 Email 登录，关闭 **Allow new users to sign up**。第一版使用管理员创建的邮箱和密码账号。
3. 在 **SQL Editor** 按文件名顺序逐个执行 [数据库迁移目录](supabase/migrations) 的 SQL。新项目从 001 开始，已接入 V1 的项目先备份，再执行尚未运行的 002 至 007。每个文件只执行一次。使用故事书专用项目，以免表名与其他应用冲突。
4. 在 **Storage** 确认 storybook-private 和 storybook-letters 都为 Private。相册和信件的单个文件最多 15 MB。项目若有更低的全局限制，上传也会受项目限制。

资料参见 [Supabase 登录设置](https://supabase.com/docs/guides/auth/general-configuration)、[密码认证](https://supabase.com/docs/guides/auth/passwords)和[存储授权](https://supabase.com/docs/guides/storage/security/access-control)。

## 2. 开通两位成员

1. 在 **Authentication → Users → Add user → Create new user** 为自己建立一个邮箱和独有密码的账号，并按控制台提示确认邮箱。为另一位成员重复操作。首版使用邮箱密码直接登录，无须邮件回调或公开注册。
2. 复制你自己的 **User UID**。在 **SQL Editor** 执行下面的 SQL，将示例中的 UID 替换成你的实际 UID。创建的第一个管理员是阳阳，显示名称可以按你们习惯修改。

~~~sql
insert into public.members (id, display_name, role)
values ('替换成阳阳的 User UID', '阳阳', 'admin');
~~~

3. 在本地配置好前端后，用阳阳的账号登录。打开 **更多 → 纪念日与故事书设置 → 第二位成员**。填入宛宛的 User UID 和显示名称，点 **授权共同记录者**。宛宛接下来就能用自己的账号登录。
4. 成员管理可以暂停或恢复宛宛的访问。暂停后，新的请求立即失去数据库和媒体读取权限。已经被打开或导出的文件由对方设备保留。账号忘记密码时，请由管理员通过 Supabase 管理账号。

## 3. 先在本机连接并验收

从项目的 **Connect / API Keys** 复制 **Project URL** 和以 sb_publishable_ 开头的公开客户端密钥。在工作区复制 .env.example 为 .env.local，并填写以下两项。

~~~dotenv
VITE_SUPABASE_URL=https://你的项目引用.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_你的公开密钥
~~~

用 npm run dev 读取这些配置。在两个浏览器会话分别登录，再用明确标记的测试内容走一遍发布、照片上传、另一账号阅读、两人分别写视角。验证共同记录者只能编辑自己的内容，草稿只对作者和管理员可见。用未来时间寄一封带附件的时间胶囊，确认收信人只能看到信封。退出后打开故事和 NFC 深链接，确认需要再次登录。数据库密码和 Supabase secret key 只用于可信管理端。 [Supabase 密钥说明](https://supabase.com/docs/guides/getting-started/api-keys)

## 4. 切换 GitHub Pages 发布

正式仓库仍用 **Jwnyykx/nwjjyy**，网址是 [https://jwnyykx.github.io/nwjjyy/](https://jwnyykx.github.io/nwjjyy/)。新版使用相对资源路径和带 # 的路由，在仓库子路径下可以直接刷新详情。工作流只将 dist 构建输出上传为 Pages 产物。

1. 本机验收并取得发布确认后，从新版工作区将开发分支推到原仓库，再开 PR 检查类型、测试及构建。旧版使用 main 根目录发布，等验收完成再切换。

   ~~~powershell
   git push https://github.com/Jwnyykx/nwjjyy.git codex/nwjjyy-storybook
   ~~~

2. 在 **Settings → Secrets and variables → Actions → Variables** 新建 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。它们是客户端可以看到的配置。将 PAGES_RELEASE 设为 true。准备就绪后，通过 **Settings → Pages** 将发布来源设为 **GitHub Actions**，随即合入验证过的分支。工作流会自动发布 main。也可在 **Actions → Storybook → Run workflow** 选 main 手动重跑。
3. 在 **Actions** 核对构建与部署都成功，打开 Pages 控制台提供的正式网址。确认无痕模式只能看到公开封面，随后用两位真实账号重复编辑和读取检查。最后用实际 iPhone Safari 和 Android Chrome，在 Wi-Fi 和移动网络关闭 VPN 分别检查首页、登录、上传和图片加载，再通过 NFC 进入一次。
4. 原来写入首页地址的挂件可以继续用。管理员也可以在 **更多 → NFC 专属入口** 拿到邮差、声音、信箱、随机回忆或特别故事的地址。写入前在目标手机上直接打开对应的正式链接，退出登录后再验证一次登录跳转。GitHub Pages 和 Supabase 的网络可达性需要分别检查。

[GitHub Pages 发布来源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [GitHub Pages 自定义工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 5. 回到旧版

旧版线上提交可从本地分支 backup/nwjjyy-pages-20261114 取回，提交为 e02cd9adcb2da77ef9807621e3267a32267d93d7。可使用该提交建立专用旧版发布分支，再把 Pages 来源选为该分支的根目录。另一种方式是按正常 Git 流程撤销把新版合到 main 的提交，再切回 main 根目录发布。两种方式都保留仓库历史和 Supabase 中的数据。
