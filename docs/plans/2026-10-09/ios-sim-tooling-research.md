# iOSシミュレータをAIから操作する手段 調査 (2026-10-09時点)

## 1. Xcode 26.3 の MCP (xcrun mcpbridge)
- Xcode 26.3 は MCP サーバー相当の `xcrun mcpbridge` を同梱。Claude Code 接続: `claude mcp add --transport stdio xcode -- xcrun mcpbridge`
  - https://danielsaidi.com/blog/2026/04/30/using-xcode-mcp-with-claude-code
  - https://www.heyuan110.com/posts/ai/2026-02-20-xcode-agentic-coding/
- 前提: Xcode設定 > Intelligence で MCP を有効化。接続時に許可ダイアログが出る(クライアント再起動のたびに再承認)。
- ツール(約20個、コミュニティ情報): ファイル操作、BuildProject、GetBuildLog、XcodeListNavigatorIssues、テスト実行、ドキュメント検索、RenderPreview(SwiftUIプレビュー画像)。各ツールは tabIdentifier が必要で、先に XcodeListWindows を呼ぶ。
- シミュレータ操作(タップ/スクショ/ログ)は無い(未確認だが資料に記載なし)。SwiftUIプレビューも本件(WKWebView)には無関係。
- Xcodeを起動しプロジェクトを開いている必要があるか: 公式には 未確認(ブログは起動前提の運用)。大規模プロジェクトはインデックス中にハングあり。Apple公式ドキュメントは今回取得できず、全て二次情報。
- 結論: 本件ではビルド/ビルドエラー取得の補助にはなるが、シミュレータ駆動の主役にはならない。

## 2. XcodeBuildMCP → 「MobileBuildMCP」に改名済み (重要)
- リポ: https://github.com/getsentry/XcodeBuildMCP (約6.5k stars)
- v2.7.1 (2026-09-23) で XcodeBuildMCP → MobileBuildMCP に改名。npm `mobilebuildmcp`、環境変数 `MOBILEBUILDMCP_*`、設定 `.mobilebuildmcp/config.yaml`、xcodebuildmcp.com は廃止。 https://github.com/getsentry/XcodeBuildMCP/releases/tag/v2.7.1
  - 旧名のフォールバック有無は 未確認。ネット上の古い手順(`xcodebuildmcp@latest`)は壊れている可能性。
- 直近: v2.7.0 (2026-07-23, Xcode 27 Device Hub対応, 結果スキーマv3の破壊的変更), v2.6.2 (2026-06-02), v2.6.1 (2026-06-02)。活発に保守されている。 https://api.github.com/repos/getsentry/XcodeBuildMCP/releases
- 要件: macOS 14.5+、Xcode 16+、Node 18+(Homebrew版は不要)。
- 導入: `npx -y mobilebuildmcp@latest mcp` / `brew tap getsentry/xcodebuildmcp && brew install mobilebuildmcp`。READMEにclaude mcp add の記載なし(MCPクライアント用docは404で未取得)。
- 機能: シミュレータ向けビルド/実行、テスト、ログ取得(start_sim_log_cap/stop_sim_log_cap)、スクリーンショット、UI操作(describe_ui/snapshot系、tap、type_text、swipe)。UI操作は別途 AXe(Homebrew) 1.0+ が必要。ツール名は版で変わる(旧READMEとミラー情報: 未確認、v2.7系の正式ツール一覧は取得できず)。
- Sentryによるランタイムエラーテレメトリあり(オプトアウト方法は同リポのPrivacy docs、詳細未確認)。
- 注意: v2.7.1でenv入力が配列形式に変更、`xcode_ide_call_tool` も存在(= mcpbridgeを内部経由で呼べる様子)。

## 3. その他
- ios-simulator-mcp (joshuayoes): https://github.com/joshuayoes/ios-simulator-mcp  2.2k stars、最新 v2.1.0 (2026-08-13)、v2.0.0 (08-11)、v1.6.0 (04-21)。archivedではない、issue 28件。
  - 17ツール: get_booted_sim_id, open_simulator, ui_describe_all, ui_tap, ui_type, ui_swipe, ui_describe_point, ui_find_element, ui_view, screenshot, record_video, stop_recording, install_app, launch_app, terminate_app, open_url, list_apps
  - 要件: Node 20+, Xcode, Facebook IDB (`idb`)。ビルドとログ取得は無し(別途 xcodebuild / `xcrun simctl spawn booted log stream` で補う)。
  - 導入: `claude mcp add ios-simulator npx ios-simulator-mcp`。v1.3.3未満にコマンドインジェクション脆弱性があった(修正済み)。ツール除外: IOS_SIMULATOR_MCP_FILTERED_TOOLS
- mobile-mcp (mobile-next): https://github.com/mobile-next/mobile-mcp  8.8k stars、1.0.8 (2026-10-02)、1.0.7 (10-01)、1.0.6 (09-30)。ほぼ毎日リリースで変動が激しい。
  - ネイティブのアクセシビリティツリー優先、必要時のみスクショ+座標。iOS/Android/実機対応。ログ/クラッシュレポート取得ツールあり。要Node 20+。ビルドは無し。
  - 導入: `claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@latest`
  - テレメトリ(PostHog/Scarf)あり。`MOBILEMCP_DISABLE_TELEMETRY=1` で無効化。
  - WebView対応の記載: READMEに記載なし (未確認)
- Maestro MCP / Appium MCP / idbベースの他実装: 今回は調査せず 未確認。

## 4. WKWebView(Capacitor)の特殊事項
- アクセシビリティツリー: idbの説明では画面全体の階層を取得可能 (https://fbidb.io/docs/idb/accessibility)。ただしWKWebView内のDOMがどこまでツリーに出るかを確認した資料は見つからず 未確認。一般にはWebView内の要素は、見出し/ボタン/ラベル/aria属性があるものだけが出る傾向(一般知識、要実機確認)。canvasや無ラベルdivは座標タップ頼みになる。
- WebレイヤーのInspectは Safari Web Inspector が最適。
  - Mac: Safari > 設定 > 詳細 > 「Webデベロッパ用の機能を表示」、シミュ内: 設定 > Safari > 詳細 > Webインスペクタ ON。Safariの「開発」メニュー > シミュレータ名 > アプリのWebView。
  - iOS 16.4+ は `isInspectable = true` が必要。Capacitorは `ios.webContentsDebuggingEnabled`(未設定ならdev buildで true、リリースでは既定 false)。 https://capacitorjs.com/docs/config
  - 参考: https://developer.apple.com/forums/thread/727049 , https://www.bendodson.com/weblog/2022/04/13/web-inspector-on-ios-devices-simulators/
  - 「Inspectableなアプリなし」問題の報告あり(Safari Technology Preview で回避の古い報告)。
- AIから自動でWebレイヤーを読む方法(ios-webkit-debug-proxy / safaridriver / Appium webview context): 実機向けが主で、シミュレータでの現行の動作は今回 未確認。
- 現実解: DOM/コンソールの検証は Next.js 静的exportを通常ブラウザ(Playwright MCP, 375px幅)で行い、ネイティブ層固有の挙動(ステータスバー、セーフエリア、キーボード、権限)のみシミュレータで見る二段構え。

## 5. 推奨
- 第一候補コンボ: MobileBuildMCP(旧XcodeBuildMCP) + AXe。1つでビルド→インストール→起動→スクショ→タップ/入力→UI階層→ログまで完結。保守が最も活発で、ログ取得を持つ点が決定的。
  ```
  brew install cameroncooke/axe/axe        # AXe(取得元は旧README記載、要現行確認)
  claude mcp add mobilebuildmcp -- npx -y mobilebuildmcp@2.7.1 mcp
  ```
  v2.7.1 (09-23) は公開から約16日で「2週間以上」を満たす。バージョン固定で自動更新を避ける。
- 第二候補(軽量・操作特化): ios-simulator-mcp v2.1.0 (08-13、約2ヶ月経過で安定)。
  ```
  # 要 idb
  claude mcp add ios-simulator -- npx -y ios-simulator-mcp@2.1.0
  ```
  ビルド・ログは別途 `npx cap run ios` / `xcrun simctl spawn booted log stream --predicate 'process == "App"'` をBashで。
- mobile-mcp は最新1.0.8が公開7日で2週間未満、かつ連日更新のため、使うなら1.0.5以前など2週間以上前の版に固定(該当版の存在は未確認)。
- Xcode mcpbridge は補助として任意(Xcodeを開いている時のビルド診断用)。
- WebレイヤーはSafari Web Inspector(人間が目視)かPlaywright(PC/375px)で補完。
- セキュリティ: `npx pkg@latest` は実行のたびに最新を取得するため、サプライチェーン攻撃を受けやすい。バージョン固定を推奨。これらのMCPはシミュレータ操作とシェル実行権限を持つので、`claude mcp add` は --scope project/local で必要なプロジェクトに限定し、ツールの許可リストを絞る。テレメトリ(Sentry/PostHog)は各設定で無効化を確認。ios-simulator-mcp は過去にコマンドインジェクション脆弱性あり(v1.3.3で修正)。出力先既定は ~/Downloads。
