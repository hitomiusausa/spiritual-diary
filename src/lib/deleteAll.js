// 「最近の記録」の「すべて削除」（F-B2）。日記の記録・端末に一時保存した読み解き（D-18）・Kiriとの会話をまとめて消す。
// プロフィール・AI 送信の同意・ロックの設定は消さない（記録ではないため）。プライバシーポリシーの削除の記述と対。
import { clearCachedAnalyses } from "./analysisCache";
import { clearChatHistory, loadChatHistory } from "./chatHistory";
import { clearHistory } from "./history";

export function clearAllRecords(storage) {
  clearCachedAnalyses(storage);
  clearChatHistory(storage);
  return clearHistory(storage);
}

// 日記の記録が0件でも、会話が残っていれば「すべて削除」に辿り着けるようにする。
export function hasAnyRecords(history, storage) {
  return (Array.isArray(history) && history.length > 0) || loadChatHistory(storage).length > 0;
}
