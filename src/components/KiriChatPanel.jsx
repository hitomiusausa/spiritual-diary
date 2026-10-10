'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Trash2 } from 'lucide-react';
import { KIRI_TALK_NAME, chatErrorMessage } from '@/lib/kiriTalk';
import { clearChatHistory, loadChatHistory, saveChatHistory } from '@/lib/chatHistory';
import SupportCard from '@/components/SupportCard';
import { apiUrl } from '@/lib/apiUrl';
import { getStorage, initStorage } from '@/lib/storage';
import { hasConsent } from '@/lib/consent';

const CONSENT_REQUIRED_MESSAGE = '……ここで話した言葉は、Anthropic社のAI（Claude）に送られるの。いまは送信への同意が取り消されているから、届けられないみたい。「読み解く」の確認画面で同意すると、また話せるよ。';

// readOnly: 未購読・解約後（D-28）。会話ログは読めるが、送れない。入力欄の代わりに案内と「Kiriと話す」を出す。
// getAppUserId: RevenueCat の App User ID を返す関数（/api/chat の body に入れる。サーバーが権利を確かめる）。
export default function KiriChatPanel({ userProfile, entry, result, onClose, readOnly = false, onOpenPaywall, getAppUserId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const hydrated = useRef(false);

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label="Kiriとの対話">
      <div className="kiri-card-strong rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-kiri-gold"><MessageCircle className="w-5 h-5" /><h2 className="font-display font-bold">Kiriに聞く</h2></div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && <button type="button" onClick={() => setMessages(clearChatHistory(getStorage()))} aria-label="会話を削除" className="text-kiri-lilac hover:text-white"><Trash2 className="w-4 h-4" /></button>}
            <button type="button" onClick={onClose} aria-label="チャットを閉じる" className="text-kiri-lilac hover:text-white"><X className="w-5 h-5" /></button>
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
              <div className={`rounded-xl p-3 text-sm whitespace-pre-line ${message.role === 'user' ? 'bg-kiri-lilac/20 ml-8 text-white leading-relaxed' : 'kiri-voice bg-white/10 mr-8 text-kiri-fog'}`}>
                {message.content}
              </div>
              {message.support && <div className="mr-8"><SupportCard compact /></div>}
            </div>
          ))}
          {loading && <p className="text-xs text-kiri-lilac">Kiriが言葉を探しています…</p>}
        </div>
        {readOnly ? (
          <div className="p-4 border-t border-white/10">
            <p className="text-xs text-kiri-lilac leading-relaxed mb-2">これまでの会話は、いつでも読めます。続きを話すには「{KIRI_TALK_NAME}」が必要です。</p>
            <button
              type="button"
              onClick={onOpenPaywall}
              className="w-full min-h-11 rounded-full bg-kiri-gold px-4 text-sm font-bold tracking-wider text-kiri-night"
            >
              {KIRI_TALK_NAME}
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="p-3 border-t border-white/10 flex gap-2">
            <textarea value={input} onChange={(event) => setInput(event.target.value.slice(0, 1200))} placeholder="Kiriに聞きたいこと" rows={2} className="flex-1 resize-none rounded-xl bg-white/10 border border-white/15 p-3 text-sm text-white placeholder-kiri-lilac/60 focus:outline-none focus:ring-2 focus:ring-kiri-lilac" />
            <button type="submit" disabled={!input.trim() || loading} aria-label="送信" className="self-end kiri-button rounded-xl p-3 disabled:opacity-40"><Send className="w-5 h-5" /></button>
          </form>
        )}
      </div>
    </div>
  );
}
