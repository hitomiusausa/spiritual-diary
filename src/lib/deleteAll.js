// 「振り返り」の「すべて削除」（F-B2）。日記の記録・端末に一時保存した読み解き（D-18）・Kiriとの会話をまとめて消す。
// プロフィール・AI 送信の同意・ロックの設定は消さない（記録ではないため）。プライバシーポリシーの削除の記述と対。
import { clearCachedAnalyses } from "./analysisCache";
import { clearChatHistory, loadChatHistory } from "./chatHistory";
import { clearHistory, clearHistoryQuarantine, hasQuarantinedHistory } from "./history";

export function clearAllRecords(storage) {
  clearCachedAnalyses(storage);
  clearChatHistory(storage);
  // 別に保管した読み込めない記録の原本（R2-03）も日記の一部なので、ここで一緒に消す。
  clearHistoryQuarantine(storage);
  return clearHistory(storage);
}

// 日記の記録が0件でも、会話や保管した原本が残っていれば「すべて削除」に辿り着けるようにする。
export function hasAnyRecords(history, storage) {
  return (Array.isArray(history) && history.length > 0) || loadChatHistory(storage).length > 0 || hasQuarantinedHistory(storage);
}

// 入力画面から「すべて削除」したときは、まだ読み解いていない（保存していない）書きかけを消さない（R2-01）。
// 結果画面の入力は読み解き済みで記録に入っているので、記録と一緒に画面からも消す。
export function keepsDraftAfterDeleteAll(step) {
  return step !== "result";
}
