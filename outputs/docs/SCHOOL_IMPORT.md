# 东北大学课表导入调查

2026-11-06。尚未实现爬取、Excel 解析或批量导入，不作为已交付功能。

## 已知事实

- 用户指定 jwxt.neu.edu.cn，已本人登录「我的课表」，说明「打印」可选 Word／Excel；未取得实际文件，不能确定扩展名、合并单元格、周次和列结构。
- [学校官方通知](https://aao.neu.edu.cn/2026/0227/c9434a450413/page.htm)：启用新版系统，统一身份认证，校外按学校说明使用 WebVPN／OpenVPN。不能沿用旧版解析器作为兼容承诺。
- 本机匿名请求能跳转到 pass.neu.edu.cn/tpass/login，未提交凭据，不记录临时 Cookie。
- [学校公开前端 JS](https://jwxt.neu.edu.cn/jwapp/sys/homeapp/home/umi.3c7a30c3.js)包含学生课表 getMyScheduleDetail.do、节次 getSections.do、校区 getMyScheduledCampus.do 和学期 xnxq.do；参数包含 termCode、campusCode、type、week，代码读取 datas.arrangedList、beginSection／endSection、dayOfWeek。仅静态阅读，未执行代码；这些不证明登录后响应格式、完整学期周次和接口稳定性。
- 浏览器自动化能读取 LifeFlow，本校页的页面树、截图和只读 DOM 均反复超时；标签列表确认登录后为本科教务管理系统。不能推断为网站禁爬或用户登录失败。未重置学校会话，未读取密码或 Cookie。

## 目标流程

选择学校 → 本人在官方页面登录 → 选择学期 → 读取本人课表 → 预览周次、星期、节次、地点及冲突 → 用户确认 → 返回实际导入、重复、冲突统计。

首站只适配实际验证后的东北大学版本；其他学校另行适配。按用户触发读取，不采集同学和成绩，不后台持续爬取。源域名设白名单、请求超时和数量上限，不做任意 URL 后端代理。学校密码、Cookie 不进入 AI、LifeFlow 云端、日志或 Git。

Safari／PWA 受[同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)限制，打开学校页面不等于能读取其内容或会话。Capacitor [Browser 插件](https://capacitorjs.com/docs/apis/browser)在 iOS 使用 SFSafariViewController，公开接口不能当作任意 DOM 读取接口。原生受控 WebView／本机采集路径须另行实测；当前缺完整 Xcode，不能承诺原生导入已可用。未来云服务器也不自动具备校园网／VPN 连通性。

学校打印导出的 Excel 可用于核对真实格式及离线导入备用；离线文件通路不等于一键在线抓取。需区分 XLSX、XLS、HTML 伪装 Excel，不能猜测列号；不执行公式、宏或外链。

## 待实现与验收

1. 取得真实样本／可读取的登录后页面，核对星期、周次（含单双周、不连续周）、起止节、地点、未排课记录。
2. 标准化学校数据，结合用户学期和节次表生成具体日期；不明字段标为待处理，不补假数据。
3. 批量接口事务校验、预览后重新检测冲突、来源标识去重；重复导入不重复，取消不写入，调停课不得自动覆盖或删除。
4. 登录失效、无校园网络、返回 HTML 登录页、空课表和字段变化须明确反馈，不能显示导入成功。
5. 人工对照真实课表验证全部实例；真实样本只保留忽略的 work/，公开回归夹具必须脱敏。
6. 手机一键在线读取另行验证，Excel 解析成功不能替代 iPhone 登录、回调与读取验收。

当前仅完成入口调查与设计。原始公开资源在 work/，不提交。真实课表解析与写入尚无通过证据。
