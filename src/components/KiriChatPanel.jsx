'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Trash2 } from 'lucide-react';
import { KIRI_TALK_READ_ONLY_NOTE, KIRI_TALK_START_LABEL, PURCHASE_REFLECTION_NOTICE, chatErrorMessage } from '@/lib/kiriTalk';
import { clearChatHistory, loadChatHistory, saveChatHistory } from '@/lib/chatHistory';
import SupportCard from '@/components/SupportCard';
import { apiUrl } from '@/lib/apiUrl';
import { getStorage, initStorage, flushStorageWrites, retryStorageWrites } from '@/lib/storage';
import { hasConsent } from '@/lib/consent';
import ModalFrame from '@/components/ModalFrame';
import { detectCrisis } from '@/lib/kiriSafety';
import { CHAT_USER_MAX_CHARS } from '@/lib/inputContract';
import { createChatRequestSession, withChatAbort, chatRequestBody } from '@/lib/chatRequest';

const CONSENT_REQUIRED_MESSAGE = '……ここで話した言葉は、Anthropic社のAI（Claude）に送られるの。いまは送信への同意が取り消されているから、届けられないみたい。「読み解く」の確認画面で同意すると、また話せるよ。';

export default function KiriChatPanel({ userProfile, entry, result, onClose, readOnly = false, onOpenPaywall, getAppUserId, onNotEntitled, purchasePending = false, onChatSuccess }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingContent, setPendingContent] = useState(null);
  const [notice, setNotice] = useState(null);
  const [storageNotice, setStorageNotice] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [ready, setReady] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [requests] = useState(() => createChatRequestSession());
  const sending = useRef(false);
  const unsavedIntent = useRef(null);
  const verifiedPurchase = useRef(false);
  const closeRef = useRef(null);
  const cancelClearRef = useRef(null);
  const trashRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    initStorage().then(() => {
      if (!cancelled) { setMessages(loadChatHistory(getStorage())); setReady(true); }
    }).catch(() => {
      if (!cancelled) setStorageNotice('会話を読み込めませんでした。いったん閉じて、もう一度開いてください。');
    });
    return () => { cancelled = true; requests.cancel(); sending.current = false; };
  }, [requests]);

  const cancelSend = () => {
    requests.cancel();
    sending.current = false;
    setPendingContent(null);
    setLoading(false);
  };
  const closeChat = () => { cancelSend(); onClose?.(); };
  const retrySave = async () => {
    try {
      const intent = unsavedIntent.current;
      if (intent?.kind === 'save') saveChatHistory(getStorage(), intent.messages);
      else if (intent?.kind === 'clear') clearChatHistory(getStorage());
      await retryStorageWrites();
      if (unsavedIntent.current === intent) unsavedIntent.current = null;
      setStorageNotice(null);
    }
    catch { setStorageNotice('まだ端末に保存できていません。空き容量などを確かめ、もう一度お試しください。'); }
  };

  const send = async (event) => {
    event.preventDefault();
    const content = input.trim();
    if (readOnly || !ready || !content || sending.current) return;
    setNotice(null);
    if (input.length > CHAT_USER_MAX_CHARS) {
      setNotice(`一度に送れるのは${CHAT_USER_MAX_CHARS}文字までです。入力を短くして、もう一度お試しください。`);
      return;
    }
    if (!hasConsent(getStorage())) { setNotice(CONSENT_REQUIRED_MESSAGE); return; }
    const request = requests.begin();
    sending.current = true;
    setLoading(true);
    setPendingContent(content);
    const nextMessages = [...messages, { role: 'user', content }];
    try {
      const appUserId = getAppUserId ? await withChatAbort(getAppUserId(), request.signal) : null;
      if (!request.current()) return;
      const response = await withChatAbort(fetch(apiUrl('/api/chat'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify(chatRequestBody({ messages: nextMessages, userProfile, entry, result, appUserId })),
      }), request.signal);
      const data = await withChatAbort(response.json(), request.signal);
      if (!request.current()) return;
      if (!response.ok || !data?.success || typeof data.reply !== 'string' || !data.reply.trim()) {
        const error = new Error('Chat unavailable');
        error.code = data?.code;
        throw error;
      }
      const updated = [...nextMessages, { role: 'assistant', content: data.reply, ...(data.support ? { support: true } : {}) }];
      setMessages(updated);
      setInput('');
      verifiedPurchase.current = true;
      onChatSuccess?.();
      unsavedIntent.current = { kind: 'save', messages: updated };
      try {
        const saved = saveChatHistory(getStorage(), updated);
        setMessages(saved);
        await flushStorageWrites();
        if (request.current()) { unsavedIntent.current = null; setStorageNotice(null); }
      } catch {
        if (request.current()) setStorageNotice('返事は届きましたが、端末に保存できていません。「保存をもう一度試す」から保存できます。');
      }
    } catch (error) {
      if (!request.current()) return;
      setNotice(error?.code === 'not_entitled' && purchasePending && !verifiedPurchase.current
        ? PURCHASE_REFLECTION_NOTICE
        : error?.name === 'AbortError'
          ? '返事を待つ時間が長くなったので、送信を止めました。入力は残っています。もう一度お試しください。'
          : chatErrorMessage(error?.code));
      if (error?.code === 'not_entitled') onNotEntitled?.();
      // 失敗案内は通常会話に混ぜず、入力もそのまま残す。
    } finally {
      request.finish();
      if (request.current()) { sending.current = false; setLoading(false); setPendingContent(null); }
    }
  };

  const closeConfirm = () => setConfirmClear(false);
  const clearConversation = async () => {
    cancelSend();
    setClearing(true);
    setNotice(null);
    unsavedIntent.current = { kind: 'clear' };
    try {
      setMessages(clearChatHistory(getStorage()));
      await flushStorageWrites();
      unsavedIntent.current = null;
      setStorageNotice(null);
    } catch {
      setStorageNotice('会話の削除を端末に反映できていません。「保存をもう一度試す」で削除をやり直せます。');
    } finally { setClearing(false); setConfirmClear(false); }
  };

  const iconButton = 'w-11 h-11 grid place-items-center rounded-full text-kiri-lilac-ink hover:text-white hover:bg-white/10';

  return (
    <ModalFrame onClose={closeChat} initialFocus="[data-kiri-chat-close]" className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label="Kiriとの対話">
      <div className="bg-kiri-plum border border-kiri-gold/30 rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="shrink-0 p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-kiri-gold"><MessageCircle className="w-5 h-5" /><h2 className="font-display font-bold">Kiriに聞く</h2></div>
          {/* 押せる範囲は 44px。見出しの高さは変えない（上下の負の余白） */}
          <div className="flex items-center gap-1 -my-2.5 -mr-2.5">
            {messages.length > 0 && <button ref={trashRef} type="button" onClick={(event) => { event.currentTarget.focus(); setConfirmClear(true); }} aria-label="会話を削除" className={iconButton}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>}
            <button ref={closeRef} data-kiri-chat-close type="button" onClick={closeChat} aria-label="チャットを閉じる" className={iconButton}><X className="w-5 h-5" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ minHeight: 'min(12rem, 25dvh)' }}>
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
          {pendingContent && <p className="rounded-xl p-3 ml-8 bg-kiri-lilac/20 text-sm text-white leading-relaxed whitespace-pre-line">{pendingContent}</p>}
          {loading && <div className="space-y-2"><p className="text-xs text-kiri-lilac-ink">Kiriが言葉を探しています…</p><button type="button" onClick={cancelSend} className="min-h-11 text-sm text-kiri-gold underline">送信を取りやめる</button></div>}
          {notice && <p role="alert" className="text-sm text-kiri-gold leading-relaxed">{notice}</p>}
          {(notice || input.length > CHAT_USER_MAX_CHARS) && detectCrisis(input) && <SupportCard compact />}
          {storageNotice && <div role="status"><p className="text-sm text-kiri-gold leading-relaxed">{storageNotice}</p><button type="button" onClick={retrySave} className="min-h-11 text-sm text-kiri-gold underline">保存をもう一度試す</button></div>}
        </div>
        {!readOnly && <p id="kiri-chat-input-limit" className="px-3 text-xs text-kiri-lilac-ink">{input.length > CHAT_USER_MAX_CHARS ? `入力が${CHAT_USER_MAX_CHARS}文字を超えています。短くすると送れます。` : `一度に${CHAT_USER_MAX_CHARS}文字まで送れます。`}</p>}
        {readOnly ? (
          <div className="shrink-0 p-4 border-t border-white/10">
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
          <form onSubmit={send} className="shrink-0 p-3 border-t border-white/10 flex gap-2">
            <label className="sr-only" htmlFor="kiri-chat-input">Kiriに聞きたいこと</label>
            <textarea id="kiri-chat-input" value={input} disabled={loading || !ready} onChange={(event) => { setInput(event.target.value); setNotice(null); }} aria-describedby="kiri-chat-input-limit" placeholder="Kiriに聞きたいこと" rows={2} className="flex-1 resize-none rounded-xl bg-white/[0.055] border border-white/15 p-3 text-sm text-white placeholder-kiri-lilac-ink focus:outline-none focus:ring-2 focus:ring-kiri-lilac" />
            <button type="submit" disabled={!input.trim() || loading || !ready || input.length > CHAT_USER_MAX_CHARS} aria-label="送信" className="self-end kiri-button rounded-xl p-3 disabled:opacity-40"><Send className="w-5 h-5" /></button>
          </form>
        )}
      </div>
      {/* 会話の削除の確認（最近の記録の削除の確認と同じ形。F-B4） */}
      {confirmClear && (
        <ModalFrame onClose={closeConfirm} initialFocus="[data-kiri-chat-cancel]" className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={closeConfirm} role="alertdialog" aria-modal="true" aria-labelledby="kiri-chat-clear-title">
          <div className="kiri-card-strong rounded-2xl w-full max-w-sm p-6 kiri-rise max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <h3 id="kiri-chat-clear-title" className="font-display text-lg font-bold text-white mb-2">会話を削除しますか？</h3>
            <p className="text-sm text-kiri-lilac-ink leading-relaxed mb-4">この端末に残っているKiriとの会話がすべて消え、元に戻せません。日記の記録は消えません。</p>
            <div className="flex gap-2">
              <button
                ref={cancelClearRef}
                data-kiri-chat-cancel
                disabled={clearing}
                type="button"
                onClick={closeConfirm}
                className="flex-1 min-h-11 bg-white/[0.055] hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={clearConversation}
                disabled={clearing}
                className="flex-1 min-h-11 bg-kiri-danger text-kiri-night rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
              >
                削除する
              </button>
            </div>
          </div>
        </ModalFrame>
      )}
    </ModalFrame>
  );
}
