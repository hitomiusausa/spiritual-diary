'use client';

import { useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound, LifeBuoy, Lock, RotateCw, ScanFace, X } from 'lucide-react';
import SupportCard from '@/components/SupportCard';

// アプリのロック画面（iOS のみ。見た目は比較案 A「静かな扉」、2026-10-09 オーナー選択）。
// - スプラッシュ「静かな霧」と地続きの夜色・霧の地平・上からの薄紫の光。ゴールドは 1 色だけ。
// - アプリ本体の上に重ねるだけで、本体はアンマウントしない（書きかけ・読み解き中の処理が残る。設計 Ruling 8）。
// - つらいときの相談先は、ページ移動せずにこの画面の中で開く（D-15。移動すると本体が消えて書きかけが失われるため）。
// view は lockScreenView()（src/lib/lockUi.js）の戻り値。

const METHOD_ICONS = { faceId: ScanFace, touchId: Fingerprint, passcode: KeyRound, pending: Lock };

const BACKGROUND = {
  backgroundColor: '#171522',
  backgroundImage:
    'radial-gradient(circle at 50% -10%, rgba(126, 104, 156, 0.2), transparent 42%), linear-gradient(180deg, #171522 62%, rgba(40, 35, 58, 0.55) 100%)',
};

export default function LockScreen({ view, onUnlock }) {
  const [showSupport, setShowSupport] = useState(false);
  const primaryRef = useRef(null);
  const supportCloseRef = useRef(null);
  const failed = view.mode === 'failed';
  const MethodIcon = METHOD_ICONS[view.method] ?? KeyRound;
  const PrimaryIcon = failed ? RotateCw : MethodIcon;

  // 表示時・状態が変わったときは、ひらくボタンへフォーカスを置く（VoiceOver が最初に読む位置）。
  useEffect(() => {
    if (showSupport) supportCloseRef.current?.focus();
    else primaryRef.current?.focus();
  }, [showSupport, view.mode]);

  return (
    <div
      className="fixed inset-0 z-[90] overflow-hidden text-kiri-text"
      style={BACKGROUND}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kiri-lock-title"
    >
      {/* 霧の地平と、弱めの霧の光（スプラッシュと同じ地） */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute left-[-20%] w-[140%] rounded-full bg-kiri-lilac" style={{ top: '66%', height: 60, opacity: 0.05, filter: 'blur(34px)' }} />
        <div className="absolute left-[-20%] w-[140%] rounded-full bg-kiri-fog" style={{ top: '76%', height: 90, opacity: 0.07, filter: 'blur(34px)' }} />
        <div className="kiri-fog-orb w-60 h-44 left-[-13%] top-[62%] bg-kiri-lilac" style={{ '--drift': '80s', '--breathe': '12s', '--fog-min': 0.08, '--fog-max': 0.16 }} />
        <div className="kiri-fog-orb w-52 h-36 right-[-10%] top-[36%]" style={{ background: '#7e689c', '--drift': '90s', '--breathe': '14s', '--delay': '-12s', '--fog-min': 0.07, '--fog-max': 0.14 }} />
      </div>

      <div className="relative h-full flex flex-col items-center px-8 pt-[env(safe-area-inset-top)] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {showSupport ? (
          <div className="flex-1 w-full max-w-sm flex flex-col min-h-0 pt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 id="kiri-lock-title" className="font-display text-lg text-kiri-gold tracking-[0.08em]">つらいときの相談先</h2>
              <button
                ref={supportCloseRef}
                type="button"
                onClick={() => setShowSupport(false)}
                aria-label="相談先を閉じる"
                className="text-kiri-lilac hover:text-white p-2 rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-kiri-fog/70"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pb-4">
              <p className="kiri-voice text-sm text-kiri-fog mb-3">ロックしたままでも、話を聞いてくれる人の声に、いつ頼ってもいいからね。</p>
              <SupportCard compact />
            </div>
          </div>
        ) : (
          <>
            <div className="flex-[3]" />
            <div
              className={`w-[84px] h-[84px] rounded-full grid place-items-center border border-kiri-gold/25 bg-white/[0.08] ${failed ? 'text-kiri-lilac' : 'text-kiri-gold'}`}
              aria-hidden="true"
            >
              {failed ? <MethodIcon className="w-9 h-9" strokeWidth={1.6} /> : <Lock className="w-9 h-9" strokeWidth={1.6} />}
            </div>
            <div className="h-[22px]" />
            <h1 id="kiri-lock-title" className={failed ? 'sr-only' : 'text-sm text-kiri-lilac leading-loose tracking-[0.04em] text-center font-normal'}>
              ロックされています
            </h1>
            <div role="status" aria-live="polite" className="text-center">
              {failed && (
                <>
                  <p className="text-sm leading-[1.9] text-kiri-danger">{view.message}</p>
                  {view.detail && <p className="text-sm leading-[1.9] text-kiri-fog mt-1">{view.detail}</p>}
                </>
              )}
            </div>
            <div className="flex-[2] min-h-[100px]" />
            <div className="w-full max-w-sm flex flex-col gap-3">
              <button
                ref={primaryRef}
                type="button"
                onClick={() => {
                  if (!view.busy) onUnlock();
                }}
                aria-disabled={view.busy || undefined}
                aria-busy={view.busy || undefined}
                className={`w-full h-[52px] rounded-full flex items-center justify-center gap-2.5 text-base tracking-[0.06em] border border-kiri-gold transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-kiri-fog/70 aria-disabled:opacity-60 ${failed ? 'bg-kiri-gold text-kiri-night font-bold' : 'bg-kiri-gold/[0.08] text-kiri-gold font-medium'}`}
              >
                <PrimaryIcon className="w-5 h-5" strokeWidth={1.6} aria-hidden="true" />
                {view.busy ? '確認しています' : view.primaryLabel}
              </button>
              {view.note && (
                <p className="text-xs leading-relaxed text-kiri-lilac/80 text-center px-2">{view.note}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowSupport(true)}
              className="mt-[22px] mb-3 min-h-[44px] flex items-center gap-2 px-3.5 text-[13px] text-kiri-lilac tracking-[0.04em] border-b border-kiri-gold/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-kiri-fog/70"
            >
              <LifeBuoy className="w-4 h-4 text-kiri-gold" strokeWidth={1.6} aria-hidden="true" />
              つらいときの相談先
            </button>
          </>
        )}
      </div>
    </div>
  );
}
