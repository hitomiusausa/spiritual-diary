// OpenNext（Cloudflare）の設定。ISR/データキャッシュは使わないので、インクリメンタルキャッシュは既定（なし）のまま。
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
