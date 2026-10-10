'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, MessageCircle, RotateCw, X } from 'lucide-react';
import { KIRI_TALK_AI_NOTICE, KIRI_TALK_NAME, KIRI_TALK_PROMISES, paywallView } from '@/lib/kiriTalk';

// 購入画面「Kiriと話す」（D-30 案A: 結果画面の上に下から出るシート）。
// 上から: アバター → 商品名と「月額の自動更新サブスクリプション」→ 約束2つ → 価格の箱（月額をいちばん大きく）→ ボタン →
// 注意書き → AI 送信の告知（Ruling 7）→ 購入を復元・利用規約・プライバシーポリシー（購読中はサブスクリプションを管理も）。
// 価格は StoreKit の文字列（offering.priceString）。ここに数字を書かない。
// offering: undefined（読み込み中）／null（取れなかった）／{ priceString, productId, trial }
// onPurchase / onRestore: Promise<string | null>（画面に出す案内。null なら何も出さない）を返す。
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const PROMISE_ICONS = [MessageCircle, BookOpen];

export default function PaywallSheet({ open, offering, entitled = false, onPurchase, onRestore, onRetry, onManage, onClose }) {
  const sheetRef = useRef(null);
  const closeRef = useRef(null);
  const [busy, setBusy] = useState(null); // null | 'purchase' | 'restore'
  const [notice, setNotice] = useState(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // 開いている間: 背景のスクロールを止め、閉じるボタンへフォーカス。閉じたら開く前の場所へ戻す。
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const root = document.documentElement;
    const previousOverflow = [root.style.overflow, document.body.style.overflow];
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      [root.style.overflow, document.body.style.overflow] = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setNotice(null);
      setBusy(null);
    }
  }, [open]);

  if (!open) return null;

  const view = paywallView(offering);

  const close = () => {
    if (busyRef.current === 'purchase') return; // App Store の購入シートが出ている間は閉じない
    onClose?.();
  };

  // Esc で閉じる・Tab はシートの中を回る（aria-modal の約束）。
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...(sheetRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const run = async (kind, action) => {
    if (busyRef.current || !action) return;
    busyRef.current = kind;
    setBusy(kind);
    setNotice(null);
    try {
      setNotice((await action()) || null);
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="presentation" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/60" onClick={close} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kiri-paywall-title"
        aria-describedby="kiri-paywall-kind"
        className="kiri-paywall-sheet kiri-rise relative w-full max-w-md max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-kiri-gold/25 px-6 pt-2.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-kiri-fog/30" aria-hidden="true" />
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="閉じる"
          className="absolute top-2 right-2 w-11 h-11 grid place-items-center rounded-full text-kiri-lilac hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex flex-col items-center text-center mt-1.5">
          <Image src="/kiri-avatar-144.png" alt="" width={72} height={72} className="w-[4.5rem] h-[4.5rem] rounded-full border border-kiri-gold/25 object-cover" />
          <h2 id="kiri-paywall-title" className="font-display text-[1.375rem] tracking-wider text-kiri-text mt-3">{KIRI_TALK_NAME}</h2>
          <p id="kiri-paywall-kind" className="text-[0.8125rem] text-kiri-lilac mt-1">月額の自動更新サブスクリプション</p>
        </div>

        <ul className="mt-5 space-y-3">
          {KIRI_TALK_PROMISES.map((promise, index) => {
            const Icon = PROMISE_ICONS[index] ?? MessageCircle;
            return (
              <li key={promise.title} className="flex items-start gap-3">
                <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full border border-kiri-gold/25 text-kiri-gold" aria-hidden="true">
                  <Icon className="w-4 h-4" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.9375rem] font-medium leading-normal text-kiri-text">{promise.title}</p>
                  <p className="text-xs leading-relaxed text-kiri-lilac mt-0.5">{promise.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {view.status === 'error' ? (
          <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-center" role="status">
            <p className="text-sm leading-relaxed text-kiri-fog">いまは購入の情報を読み込めませんでした。通信の状態を確かめて、もう一度お試しください。</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-kiri-gold/60 px-5 text-sm font-medium text-kiri-gold hover:bg-kiri-gold/10"
            >
              <RotateCw className="w-4 h-4" aria-hidden="true" />再読み込み
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-kiri-gold/50 bg-kiri-gold/[0.06] px-4 py-3.5 text-center" aria-busy={view.status === 'loading'}>
              {view.status === 'loading' ? (
                <p className="text-sm text-kiri-fog py-2">価格を読み込んでいます…</p>
              ) : (
                <>
                  <p className="text-[1.625rem] font-bold leading-tight tracking-wide text-kiri-text">{view.priceLabel}</p>
                  <p className="text-[0.8125rem] text-kiri-fog mt-1">{view.priceSub}</p>
                </>
              )}
            </div>
            {!entitled && (
              <button
                type="button"
                onClick={() => run('purchase', onPurchase)}
                disabled={view.status !== 'ready' || busy !== null}
                aria-busy={busy === 'purchase'}
                className="mt-4 w-full min-h-[3.25rem] rounded-full bg-kiri-gold px-4 text-base font-bold tracking-wider text-kiri-night disabled:opacity-60"
              >
                {busy === 'purchase' ? '手続きしています…' : (view.ctaLabel ?? '準備しています…')}
              </button>
            )}
          </>
        )}

        {notice && <p className="mt-3 text-center text-sm leading-relaxed text-kiri-gold" role="status">{notice}</p>}

        {view.fine && <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-kiri-lilac">{view.fine}</p>}
        <p className="mt-1 text-center text-[0.6875rem] leading-relaxed text-kiri-lilac">{KIRI_TALK_AI_NOTICE}</p>

        <div className="mt-2 flex flex-wrap justify-center gap-x-1">
          <button
            type="button"
            onClick={() => run('restore', onRestore)}
            disabled={busy !== null}
            aria-busy={busy === 'restore'}
            className="min-h-11 px-2 text-xs text-kiri-fog underline underline-offset-4 disabled:opacity-60"
          >
            {busy === 'restore' ? '確認しています…' : '購入を復元'}
          </button>
          {entitled && onManage && (
            <button type="button" onClick={onManage} className="min-h-11 px-2 text-xs text-kiri-fog underline underline-offset-4">
              サブスクリプションを管理
            </button>
          )}
          <Link href="/terms" className="inline-flex min-h-11 items-center px-2 text-xs text-kiri-fog underline underline-offset-4">利用規約</Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 text-xs text-kiri-fog underline underline-offset-4">プライバシーポリシー</Link>
        </div>
      </div>
    </div>
  );
}
