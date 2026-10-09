'use client';

import Link from 'next/link';
import { ShieldCheck, X } from 'lucide-react';

// 第三者AIへの送信に対する同意（App Store 5.1.2(i)）。文言は承認済みの草案どおり。
// onReadPolicy: ポリシーへ移る直前に呼ぶ（書きかけの記録を退避するため）。
export default function ConsentModal({ show, onAccept, onDecline, onReadPolicy }) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]"
      onClick={onDecline}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kiri-consent-title"
    >
      <div className="kiri-card-strong rounded-2xl w-full max-w-md p-6 kiri-rise max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 id="kiri-consent-title" className="font-display text-xl font-bold text-kiri-gold flex items-center gap-2 text-balance">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            読み解きのための送信について
          </h3>
          <button type="button" onClick={onDecline} aria-label="閉じる" className="text-white hover:bg-white/20 rounded-full p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-white text-sm leading-relaxed space-y-3">
          <p>
            「読み解く」を押すと、基本情報（生年月日・出生時刻・性別・ニックネーム）と今日の記録（気分・出来事・直感）が、くうが株式会社のサーバーを経由して <strong className="text-kiri-gold">Anthropic社のAI（Claude）</strong> に送られ、Kiriの言葉を生成します。
          </p>
          <ul className="list-disc pl-5 space-y-1 text-kiri-lilac">
            <li>送信は読み解きのときだけです。サーバーには日記の内容を保存しません。</li>
            <li>Anthropic社での取り扱いは同社の方針に従います。</li>
            <li>同意はいつでも設定から取り消せます（取り消すと読み解きは使えなくなります）。</li>
          </ul>
          <p>
            <Link href="/privacy" onClick={onReadPolicy} className="text-kiri-gold underline underline-offset-2">プライバシーポリシーを読む</Link>
          </p>
        </div>
        <div className="kiri-dt-actions flex gap-2 mt-5">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            今はやめる
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 kiri-button py-2.5 rounded-lg text-sm font-bold hover:scale-[1.01] active:scale-[0.98] transition-transform"
          >
            同意して読み解く
          </button>
        </div>
      </div>
    </div>
  );
}
