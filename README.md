# 清研 · 考研复习工作台

清研是一款面向个人备考的复习工具，提供 Windows 本地版和 iPhone／iPad 原生 App。两端可通过用户选择的 iCloud 云盘文件夹交换同步包。

- **资料库**管理笔记、习题集、真题和模拟卷。习题集可按文件夹归档。
- **错题本**按科目、知识点和错因整理错题，可从习题集图片或 PDF 框选题图。
- **错题组卷**支持调整题序、分值和答题留白，并导出 Word。
- **成绩分析**分别呈现真题和模拟卷的成绩走势。
- **iPhone／iPad**支持多页扫描、透视校正、去阴影、文字锐化和可搜索 PDF。配置自己的 DeepSeek API Key 后，可使用拍照搜题、解析续写和错题变式练习。

1.5.0 增加独立的「AI 变式练习」页面。拍照搜题可在相机预览中框选，拍下后继续调整并确认，支持移动选区和八向缩放。

## Windows

安装 Node.js 24 和 npm，在仓库根目录执行：

~~~powershell
npm ci
node desktop/build.mjs
node outputs/desktop-app/launcher.mjs
~~~

启动器运行本机服务并打开浏览器。需要桌面快捷方式时，在构建后运行 PowerShell 脚本 **desktop/install.ps1**。数据目录与程序分开，详见 [本地版使用说明](docs/本地版使用说明.md)。

## iPhone 和 iPad

原生 App 支持 iOS／iPadOS 16 及以上。使用 macOS、Xcode 27、XcodeGen 和 Node.js 24，从仓库根目录执行：

~~~sh
npm ci
node ios/build-web.mjs
cd ios
xcodegen generate --spec project.yml
open Qingyan.xcodeproj
~~~

在 Xcode 中选择自己的签名团队和设备后运行 **Qingyan**。安装、编译与原生扩展说明见 [iOS 开发指南](ios/README.md)。

## 数据与开发

Windows 使用本地 SQLite 和文件目录。iPhone／iPad 将资料缓存放在 App 容器中。可选择 [iCloud 文件同步](docs/iCloud文件同步.md) 或使用内置备份功能。启用 AI 后，所选题干与题图会在点击生成时发送给 DeepSeek，密钥保存在设备钥匙串中。

共享界面在 **app/workspace.tsx** 和 **components/**，校验与数据类型在 **lib/**。Windows 本地服务在 **desktop/**，iOS 宿主在 **ios/QingyanApp/**。仓库也保留可选的 Cloudflare 本地开发入口，详见 [使用与开发说明](docs/使用与开发说明.md)。

~~~sh
npx tsc --noEmit
node desktop/build.mjs
node tests/desktop-local.mjs
node tests/icloud-sync.mjs
node ios/build-web.mjs
node ios/package.mjs
node tests/native-ios.mjs
~~~

## 许可证

清研源码采用 [MIT 许可证](LICENSE)。仓库中带有独立许可证的第三方文件保留各自的声明。
