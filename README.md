# LifeFlow

带 AI 功能的私人生活助理。移动端优先，主要使用 iPhone 验收；后端初期在 Windows／Mac 本地运行，未来迁移到用户购买的云服务器，通过 Capacitor 推进 iOS App。产品不构建自主 Agent。

## 当前版本 0.1

已实现：手机单列布局与底部导航，一体化周日历，日期下方的彩色日程块，日程新增／查看／编辑／确认删除，服务端冲突检测，SQLite 持久化，浅深主题及本地访问令牌。

已生成并同步 Capacitor 8.6 iOS 工程（SPM）。没有将工程生成当作原生运行成功：当前 Mac 缺少完整 Xcode，编译和真机尚未验证。

尚未实现：AI 调用、任务、饮食、月视图、PWA Service Worker、云端登录／同步、正式图标。无模拟 AI 回复或预置业务日程。左侧按自定义课程节次显示时间，默认从第一节开始；有课前／课后安排时自动扩展。支持学期周数与一键生成节次；颜色用于区分记录，不代表尚未实现的分类。

[当前需求](outputs/PRD.md) · [连接与演进](outputs/docs/ARCHITECTURE.md) · [测试记录](outputs/docs/TEST_REPORT.md) · [开发记录](outputs/docs/DEVELOPMENT.md)

## 设置课程时段

进入「设置 → 学期与课程时段」：填写学期开始日期（所在周为第 1 周，周一至周日）；填写每日第一节、每节分钟数、上午／下午／晚上节数，以及你自己的午休、晚休分钟数。课间默认 10 分钟，可改。生成预览 → 使用这些时段 → 保存学期与时段。午休从上午最后一节结束起算，晚休从下午最后一节结束起算，不再叠加普通课间；跳过某段时，下一非空段从上一非空段结束起算，全天首个非空段使用每日第一节时间。

逐节修改开始时间，会按当前每节时长补全结束（默认 45 分钟）；添加下一节自动留出当前课间。可单独改结束时间。只生成时间框架，不会创建实际课程或改动已有日程。当前最多 24 节，跨午夜／重叠会拒绝；课表文件导入尚未实现。顶部「本周」返回当前周，设置学期后显示「第 n 周（本周）」。

## 本地启动

准备 Node.js 24+（建议 LTS）与 Git，在根目录执行：

```text
npm ci
npm run build
npm start
```

访问 http://127.0.0.1:3001 。默认仅监听本机，自动创建 `data/lifeflow.sqlite`，不插入演示数据。热更新开发使用 `npm run dev`，访问 http://127.0.0.1:5173 。开发代理默认指向 HTTP 3001，修改服务端口／TLS 时同步调整 vite.config.ts，或使用构建后同源服务。

需要修改配置时将 `.env.example` 复制为 `.env`。数据库路径相对项目根目录。环境、数据、证书与缓存不提交。`better-sqlite3` 包含本机模块，切换 Windows／Mac 后重新 `npm ci`，不能跨平台复制 node_modules；若目标 Node 版本无预编译包可能需要编译工具。Windows 实机尚未测试。

## iPhone 与 Capacitor

完整流程见 [连接文档](outputs/docs/ARCHITECTURE.md)。手机 localhost 指手机自己。

Safari 推荐使用电脑的局域网 HTTPS，页面和 API 同源。设置 LAN 监听时必须配置至少 24 字符的 LOCAL_ACCESS_TOKEN；在设置页填写，当前仅保存于浏览器会话。电脑要保持运行、允许防火墙端口且网络支持设备互访。

TLS_CERT_PATH／TLS_KEY_PATH 两项同时设置后开启 HTTPS。证书覆盖实际 IP／主机名并在 iPhone 信任；不要关闭证书校验。项目没有自动生成证书、修改系统信任或关闭 ATS。

原生页面来自 capacitor://localhost，需要明确的后端地址：参考 `.env.native.example`，在 `.env.local` 设置公开的 VITE*API_BASE_URL=https://实际地址:端口。不能把密钥放入任何 VITE* 配置。后端 ALLOWED_ORIGINS 应包含 capacitor://localhost。

```text
npm run ios:sync
npm run ios:check
npm run ios:open
```

ios/ 已生成，不要重复运行 ios:add。使用完整 Xcode 选择团队、签名并运行到实际 iPhone。开发标识 dev.lifeflow.app 与模板图标不作为最终发布素材。Windows 可开发 Web／API，iOS 编译需要 Mac 与完整 Xcode；官方 Capacitor 8 要求 Xcode 26+，当前使用 SPM，不需 CocoaPods。[官方环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)

当前没有 PWA 缓存；安装 Capacitor 不会把电脑 Node.js／数据库带进手机。

## 验证与版本管理

```text
npm test
npm run build
npm run ios:sync
npm run ios:check
```

测试使用内存和临时数据库。缺少 Xcode 时 ios:check 返回非零，不能据此声称原生已通过。

仓库：[GitHub](https://github.com/jiangkaicheng874-gif/lifeflow) · [Gitee](https://gitee.com/liehen_nb/lifeflow)

本机配置远端：

```text
npm run remotes:set -- https://github.com/jiangkaicheng874-gif/lifeflow.git https://gitee.com/liehen_nb/lifeflow.git
```

提交后执行 `npm run push:both`，分别推送 main，失败端会明确报告，不强推。认证使用本机 Git 凭据或 SSH；不要把令牌写入 URL。克隆到其他电脑需重新配置远端。

公开仓库暂未选择开源许可证，待用户决定；未授权部署服务。
