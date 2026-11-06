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

## 课程布局与持久化补充

GET／PUT /api/calendar-preferences 保存每个本地所有者的学期日期和时间块；严格参数校验，UUID 唯一、时间合法、排序且不重叠，以 version 防止旧页面覆盖。SQLite schema v3，事务升级旧版日程／时段设置，保留原数据。时段修改不平移已有日程。

src/calendar-layout.ts 为纯计算模块：学期周数按日期与周一边界计算，课程轴采用节次与压缩间隙的分段映射；实际事件触发课前／课后扩展，休息内安排也可显示。它不创建业务日程。src/time-block-generator.ts 只生成框架草稿；用户填写午休／晚休分钟数后按前段结束顺延，不固定下午／晚上钟点。界面读原生表单当前值，避免依赖单一日期／时间 change 事件；真实 Safari 键盘／选择器仍须真机验证。

当前持久化时间框架和学期，不存生成器的节数、休息等独立参数。未来导入应先映射星期／周次／节次到日程，校验并预览后应用；本轮没有实现课表文件导入或重复课程引擎。

## XLSX 导入迭代

后续文件迭代已实现打印课表导入：server/imports/neu-xlsx.ts 用 ExcelJS 保留合并结构，按真实文件格式解析；server/imports/routes.ts 保留短期预览、生成具体日期、检查来源去重及冲突，再事务提交。原文件仅内存处理，不在服务端创建上传目录。客户端仅发送原文件和条目选择，不直接生成任意写库工具操作。

SQLite schema v4 在原 events 增加 location、notes、source_key 及所有者下来源键唯一索引。旧数据无损升级；普通编辑字段省略时保留原元信息。来源字段不允许普通 API 指定。文件内冲突双方均标记，已有数据不覆盖；学期和设置版本、计划摘要在提交事务内重查。重复提交回执短期保留，持久重复实例由来源键和现有日程识别。

课程按 UTC+08 转为 UTC，界面仍按设备时区显示；地点与教师备注保存在事件内。当前是展开为具体实例的单次导入，不是完整重复规则／自动调课同步引擎。多门课共格必须人工确认节次。网络爬取与原生浏览器桥接没有随文件通路实现。
