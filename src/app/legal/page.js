import DocPage from "@/components/DocPage";

export const metadata = {
  title: "特定商取引法に基づく表記 | Kiri",
  description: "Kiri（Mind & Energy Note）の特定商取引法に基づく表記",
};

// D-45。下書きは docs/releases/release-review-2026-11-14/tokushoho-draft.md。
// 代表者・所在地・電話は「請求があれば遅滞なく開示」の形にしている（ひとみうさの判断で専門家確認なし）。
// 価格の数字は書かない（StoreKit の表示が正。legalPages.test.js が検査）。
const ROWS = [
  ["販売事業者", "くうが株式会社（KUGA K.K.）"],
  ["運営責任者", "ご請求があれば、遅滞なく開示します。"],
  ["所在地", "ご請求があれば、遅滞なく開示します。"],
  ["電話番号", "ご請求があれば、遅滞なく開示します。"],
  ["メールアドレス", <a key="mail" href="mailto:info@kugainc.com" className="underline">info@kugainc.com</a>],
  ["販売価格", "「Kiriと話す」（月額の自動更新サブスクリプション）。価格はアプリ内の購入画面に表示します（App Storeの表示が優先します）。"],
  ["商品代金以外に必要な費用", "インターネット接続にかかる通信料"],
  ["支払方法", "App Store（Apple ID）による決済"],
  ["支払時期", "無料トライアルの対象の方はトライアル終了時、対象でない方は購入の確定時。以後は毎月の自動更新時。"],
  ["提供時期", "購入手続きの完了後、すぐにご利用いただけます。"],
  ["申込みの撤回・解約", "iPhoneの「設定」→ご自身の名前→「サブスクリプション」から、次の更新日の24時間前までに解約できます。デジタルサービスの性質上、購入後の撤回・返品はお受けできません。期間の途中で解約しても、日割りの返金はありません。返金はAppleの規定に従います（reportaproblem.apple.com）。"],
  ["動作環境", "iOS 15.5 以上（ウェブ版では「Kiriと話す」を提供していません）"],
];

export default function LegalPage() {
  return (
    <DocPage title="特定商取引法に基づく表記" updatedAt="2026-11-16">
      <dl className="space-y-4">
        {ROWS.map(([term, detail]) => (
          <div key={term}>
            <dt className="font-bold text-white mb-1">{term}</dt>
            <dd className="ml-0">{detail}</dd>
          </div>
        ))}
      </dl>
    </DocPage>
  );
}
