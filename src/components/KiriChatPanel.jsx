'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Trash2 } from 'lucide-react';
import { KIRI_TALK_READ_ONLY_NOTE, KIRI_TALK_START_LABEL, chatErrorMessage } from '@/lib/kiriTalk';
import { clearChatHistory, loadChatHistory, saveChatHistory } from '@/lib/chatHistory';
import SupportCard from '@/components/SupportCard';
import { apiUrl } from '@/lib/apiUrl';
import { getStorage, initStorage } from '@/lib/storage';
import { hasConsent } from '@/lib/consent';

const CONSENT_REQUIRED_MESSAGE = '……ここで話した言葉は、Anthropic社のAI（Claude）に送られるの。いまは送信への同意が取り消されているから、届けられないみたい。「読み解く」の確認画面で同意すると、また話せるよ。';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// readOnly: 未購読・解約後・開いている間に期限切れ（D-28・F-B9）。会話ログは読めるが、送れない。入力欄の代わりに案内と「Kiriと話す」を出す。
// getAppUserId: RevenueCat の App User ID を返す関数（/api/chat の body に入れる。サーバーが権利を確かめる）。
// onNotEntitled: サーバーが 403 not_entitled を返したとき（親が購読状態を読み直す）。
// 欄は不透明（後ろの画面の文字が透けて重ならないように。F-B5）。Esc で閉じ、開いたらフォーカスを中へ、閉じたら戻す（PaywallSheet と同じ作法）。
export default function KiriChatPanel({ userProfile, entry, result, onClose, readOnly = false, onOpenPaywall, getAppUserId, onNotEntitled }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const hydrated = useRef(false);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const cancelClearRef = useRef(null);
  const trashRef = useRef(null);

  // 開いたら閉じるボタンへフォーカス（iOS でいきなりキーボードを出さない）。閉じたら開く前の場所へ戻す。
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (confirmClear) cancelClearRef.current?.focus();
  }, [confirmClear]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initStorage();
      if (cancelled) return;
      setMessages(loadChatHistory(getStorage()));
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated.current) saveChatHistory(getStorage(), messages);
  }, [messages]);

  const send = async (event) => {
    event.preventDefault();
    const content = input.trim();
    if (readOnly || !content || loading) return;
    // 第三者AIへの送信は同意があるときだけ（5.1.2(i)）。同意は「読み解く」の確認画面で取る。
    // 送らずに案内だけを出し、書いた言葉は入力欄に残す。
    if (!hasConsent(getStorage())) {
      setMessages([...messages, { role: 'assistant', content: CONSENT_REQUIRED_MESSAGE, isSystem: true }]);
      return;
    }
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const appUserId = getAppUserId ? await getAppUserId() : null;
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          userProfile: { nickname: userProfile?.nickname || '' },
          context: { entry, result },
          ...(typeof appUserId === 'string' && appUserId ? { appUserId } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const error = new Error(data.error || 'Chat failed');
        error.code = data.code;
        throw error;
      }
      setMessages([...nextMessages, { role: 'assistant', content: data.reply, ...(data.support ? { support: true } : {}) }]);
    } catch (error) {
      setMessages([...nextMessages, { role: 'assistant', content: chatErrorMessage(error.code), isSystem: true }]);
      console.error('[kiri-chat-ui]', error.code || 'error');
      if (error.code === 'not_entitled') onNotEntitled?.();
    } finally {
      setLoading(false);
    }
  };

  const closeConfirm = () => {
    setConfirmClear(false);
    trashRef.current?.focus();
  };

  const clearConversation = () => {
    setMessages(clearChatHistory(getStorage()));
    setConfirmClear(false);
    closeRef.current?.focus();
  };

  // Esc で閉じる（確認が出ていれば確認だけ閉じる）・Tab は欄の中を回る（aria-modal の約束）。
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (confirmClear) closeConfirm();
      else onClose?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const scope = confirmClear ? panelRef.current?.querySelector('[role="alertdialog"]') : panelRef.current;
    const items = [...(scope?.querySelectorAll(FOCUSABLE) ?? [])].filter((el) => confirmClear || !el.closest('[role="alertdialog"]'));
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

  const iconButton = 'w-11 h-11 grid place-items-center rounded-full text-kiri-lilac-ink hover:text-white hover:bg-white/10';

  return (
    <div ref={panelRef} onKeyDown={onKeyDown} className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label="Kiriとの対話">
      <div className="bg-kiri-plum border border-kiri-gold/30 rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-kiri-gold"><MessageCircle className="w-5 h-5" /><h2 className="font-display font-bold">Kiriに聞く</h2></div>
          {/* 押せる範囲は 44px。見出しの高さは変えない（上下の負の余白） */}
          <div className="flex items-center gap-1 -my-2.5 -mr-2.5">
            {messages.length > 0 && <button ref={trashRef} type="button" onClick={() => setConfirmClear(true)} aria-label="会話を削除" className={iconButton}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>}
            <button ref={closeRef} type="button" onClick={onClose} aria-label="チャットを閉じる" className={iconButton}><X className="w-5 h-5" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-48">
          {messages.length === 0 && (
            <p className="text-sm text-kiri-fog leading-relaxed">
              {readOnly ? 'まだ会話はありません。' : '今日のメッセージで、もう少し聞きたいところがあれば話して。ここでは答えを急がなくていいよ。'}
            </p>
          )}
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className="space-y-2">
              <div className={`rounded-xl p-3 text-sm whitespace-pre-line ${message.role === 'user' ? 'bg-kiri-lilac/20 ml-8 text-white leading-relaxed' : 'kiri-voice bg-white/[0.055] mr-8 text-kiri-fog'}`}>
                {message.content}
              </div>
              {message.support && <div className="mr-8"><SupportCard compact /></div>}
            </div>
          ))}
          {loading && <p className="text-xs text-kiri-lilac-ink">Kiriが言葉を探しています…</p>}
        </div>
        {readOnly ? (
          <div className="p-4 border-t border-white/10">
            <p className="text-xs text-kiri-lilac-ink leading-relaxed mb-2">{KIRI_TALK_READ_ONLY_NOTE}</p>
            <button
              type="button"
              onClick={onOpenPaywall}
              className="w-full min-h-11 rounded-full bg-kiri-gold px-4 text-sm font-bold tracking-wider text-kiri-night"
            >
              {KIRI_TALK_START_LABEL}
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="p-3 border-t border-white/10 flex gap-2">
            <textarea value={input} onChange={(event) => setInput(event.target.value.slice(0, 1200))} placeholder="Kiriに聞きたいこと" rows={2} className="flex-1 resize-none rounded-xl bg-white/[0.055] border border-white/15 p-3 text-sm text-white placeholder-kiri-lilac-ink focus:outline-none focus:ring-2 focus:ring-kiri-lilac" />
            <button type="submit" disabled={!input.trim() || loading} aria-label="送信" className="self-end kiri-button rounded-xl p-3 disabled:opacity-40"><Send className="w-5 h-5" /></button>
          </form>
        )}
      </div>
      {/* 会話の削除の確認（最近の記録の削除の確認と同じ形。F-B4） */}
      {confirmClear && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={closeConfirm} role="alertdialog" aria-modal="true" aria-labelledby="kiri-chat-clear-title">
          <div className="kiri-card-strong rounded-2xl w-full max-w-sm p-6 kiri-rise" onClick={(event) => event.stopPropagation()}>
            <h3 id="kiri-chat-clear-title" className="font-display text-lg font-bold text-white mb-2">会話を削除しますか？</h3>
            <p className="text-sm text-kiri-lilac-ink leading-relaxed mb-4">この端末に残っているKiriとの会話がすべて消え、元に戻せません。日記の記録は消えません。</p>
            <div className="flex gap-2">
              <button
                ref={cancelClearRef}
                type="button"
                onClick={closeConfirm}
                className="flex-1 min-h-11 bg-white/[0.055] hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={clearConversation}
                className="flex-1 min-h-11 bg-kiri-danger text-kiri-night rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
