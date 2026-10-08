// 読み解きが失敗したときに画面へ出す文（Kiriの声のまま、技術的な文字列は出さない）。
// サーバーの error 文字列（英語・開発者向け）やブラウザの例外文（"Load failed" など）は表示しない。
// 原因の判定には HTTP ステータスとサーバーの code（daily_limit / rate_limited）だけを使う。
// 文言は T13 検収での提案（オーナー確認待ち）。

const KEEP_ENTRY = "書いた記録はそのまま残っています。";

export function describeAnalyzeFailure({ network = false, status, code } = {}) {
  if (network) {
    return {
      title: "Kiriの声が届きませんでした",
      message: `通信がつながっていないようです。電波の届くところで、もう一度ためしてみてね。${KEEP_ENTRY}`,
    };
  }
  if (code === "daily_limit") {
    return {
      title: "今日の読み解きは、ここまで",
      message: `今日はたくさんの声が届いて、Kiriがひと休みしています。日本時間の明日になったら、また話しかけてね。${KEEP_ENTRY}`,
    };
  }
  if (code === "rate_limited" || status === 429) {
    return {
      title: "少しだけ間をおいてね",
      message: `続けて届いたので、Kiriが少し休んでいます。1分ほどしてから、もう一度ためしてみてね。${KEEP_ENTRY}`,
    };
  }
  if (status === 400) {
    return {
      title: "記録を読み取れませんでした",
      message: "出来事の欄を確かめて、もう一度ためしてみてね。",
    };
  }
  return {
    title: "Kiriの声が届きませんでした",
    message: `いまはうまく言葉を結べないみたい。少し時間をおいて、もう一度ためしてみてね。${KEEP_ENTRY}`,
  };
}
