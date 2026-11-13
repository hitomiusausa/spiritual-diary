'use client';

import Link from 'next/link';
import { ShieldCheck, X } from 'lucide-react';
import ModalFrame from '@/components/ModalFrame';

const CHAT_ENABLED = process.env.NEXT_PUBLIC_KIRI_IAP === '1' || process.env.NEXT_PUBLIC_KIRI_CHAT_PREVIEW === '1';

// 同意v2: 読み解きと、有効なビルドでは会話の送信範囲も説明する。
// 送る内容・送り先・保存の範囲を変えずにボタン名を実物に合わせただけの直しは、CONSENT_VERSION を上げない（consent.js の方針どおり）。
// onReadPolicy: ポリシーへ移る直前に呼ぶ（書きかけの記録を退避するため）。
export default function ConsentModal({ show, onAccept, onDecline, onReadPolicy, busy = false, notice }) {
  if (!show) return null;
  return (
    <ModalFrame
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]"
      onClose={onDecline}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kiri-consent-title"
    >
      <div className="kiri-card-strong kiri-dialog-card rounded-2xl w-full max-w-md p-6 kiri-rise max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 id="kiri-consent-title" className="font-display text-xl font-bold text-kiri-gold flex items-center gap-2 text-balance">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            AIへの送信について
          </h3>
          <button type="button" onClick={onDecline} aria-label="閉じる" className="kiri-hit text-white hover:bg-white/20 rounded-full p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-white text-sm leading-relaxed space-y-3">
          <p>
            「Kiriに読み解いてもらう」を押すと、基本情報（生年月日・出生時刻・性別・ニックネーム）と今日の記録（気分・出来事・直感）が、くうが株式会社のサーバーを経由して <strong className="text-kiri-gold">Anthropic社のAI（Claude）</strong> に送られ、<span className="inline-block">Kiriの言葉を生成します。</span>
          </p>
          {CHAT_ENABLED && (
            <p>会話で「送信」を押すと、ニックネーム・今日の記録・読み解き結果・直近の会話も、同じ経路でAnthropic社へ送られます。保存済みの会話すべてを送ることはありません。</p>
          )}
          <ul className="list-disc pl-5 space-y-1 text-kiri-lilac-ink">
            <li>{CHAT_ENABLED ? '送信は「Kiriに読み解いてもらう」または会話の「送信」を押したときです。' : '送信は「Kiriに読み解いてもらう」を押したときです。'}運営者のサーバーには、日記・読み解き結果・会話を保存しません。</li>
            <li>Anthropic社では、通常は受信・生成から30日以内に削除されますが、安全対策・法令などの例外があります。詳しくはプライバシーポリシーをご確認ください。</li>
            <li>{CHAT_ENABLED ? '同意は設定から取り消せます。取り消したあとは、再び同意するまで読み解き・会話を送信しません。保存済みの記録は読めます。' : '同意は設定から取り消せます。取り消したあとは、再び同意するまで読み解きを送信しません。保存済みの記録は読めます。'}</li>
          </ul>
          <p>
            <Link href="/privacy" onClick={onReadPolicy} className="text-kiri-gold underline underline-offset-2">プライバシーポリシーを読む</Link>
          </p>
        </div>
        {notice && <p role="alert" className="mt-3 text-sm text-kiri-danger">{notice}</p>}
        <div className="kiri-dt-actions flex gap-2 mt-5">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 min-h-11 bg-white/[0.055] hover:bg-white/20 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            今はやめる
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            aria-busy={busy || undefined}
            className="flex-1 min-h-11 kiri-button py-2.5 rounded-lg text-sm font-bold hover:scale-[1.01] active:scale-[0.98] transition-transform"
          >
            {busy ? '保存しています' : '同意して読み解く'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
