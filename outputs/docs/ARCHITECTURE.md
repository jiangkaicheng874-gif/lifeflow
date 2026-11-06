# 架构、连接与演进

2026-11-06。本文区分当前实现与待验证方案。

## 模块

src/ 为 React 手机界面；server/app.ts 为校验、事务与路由；server/database.ts 集中持久化；shared/ 为公开契约；ios/ 为 Capacitor 工程；scripts/ 为跨平台启动、环境检查和双远端脚本。采用单体服务，不预建微服务与复杂同步。

## 连接

| 场景          | 页面                       | API                   | 条件                                           |
| ------------- | -------------------------- | --------------------- | ---------------------------------------------- |
| 本机开发      | Vite 127.0.0.1:5173        | 代理 HTTP 3001        | 默认仅电脑可达                                 |
| iPhone Safari | 电脑局域网 HTTPS           | 同源 /api             | 电脑运行、网络互访、防火墙、可信证书和访问令牌 |
| Capacitor     | 包内 capacitor://localhost | 配置的绝对 HTTPS 地址 | CORS、ATS、证书信任、原生签名与真机            |

手机 localhost 指手机；0.0.0.0 是服务监听地址，手机使用电脑实际 IP。校园／访客网可能禁止互访，即使同 Wi-Fi 也不保证可达。验收前验证备用路由网络。电脑睡眠时服务可能不可用。

非回环监听必须配置至少 24 字符的本地访问令牌。CORS 仅允许显式配置来源，原生为 capacitor://localhost，不能用通配符代替认证。当前不是云端多用户安全方案。

## HTTPS／iOS

TLS_CERT_PATH 与 TLS_KEY_PATH 同时提供时开启 HTTPS。建议本地 CA 给实际 IP／主机名签证；iPhone 安装 CA 公共证书并启用完全信任。证书私钥不分享、不提交，不绕过警告或关闭 ATS。IP 变化会影响入口与证书，应固定局域网地址。

当前未生成证书、修改系统信任或安装 Xcode。Info.plist 仅增加网络用途说明，不能当作权限已获准。Safari 与 WKWebView 的连接效果分别真机测试。

Capacitor 8.6 SPM 工程生成与同步已通过；xcodebuild 报错当前只有 CommandLineTools。需完整 Xcode 26+ 后再编译签名与安装 iPhone。Node.js 和电脑 SQLite 不会被复制进 App。PWA Service Worker 尚未实现。

## 自购服务器

未来路径：公网域名／可信 HTTPS → Express → 持久化数据库。密钥仍在服务器。上线前补账号、隔离、会话撤销、限流、AI 用量、隐私同意、备份恢复、监控与错误处理。

SQLite 可评估用于持久磁盘上的单实例；多实例／并发增长时再评估 PostgreSQL，迁移需单独转换和验证。正式 App 不要求开发 CA 或个人电脑在线；上架、支付、账号和隐私要求在发布前重新核查。

## 真机门禁

1. Safari 无证书警告，访问健康接口与受保护数据。
2. 手机新增、编辑、取消删除／确认删除，重启后数据保持。
3. 完整 Xcode 编译，签名安装实际 iPhone。
4. 包内页面通过绝对 HTTPS 调用 API，不放宽 ATS。
5. 断网、拒绝访问、后台返回能恢复，不重复写入。
6. 记录设备、iOS、Xcode、网络和证书地址。

以上尚未在 iPhone 验证。

官方依据：[Capacitor 环境](https://capacitorjs.com/docs/getting-started/environment-setup)、[同步](https://capacitorjs.com/docs/getting-started)、[Apple 证书](https://support.apple.com/en-gb/102390)、[SQLite](https://www.sqlite.org/whentouse.html)、[Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)。
