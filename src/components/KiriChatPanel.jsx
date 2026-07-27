'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Trash2 } from 'lucide-react';
import { clearChatHistory, loadChatHistory, saveChatHistory } from '@/lib/chatHistory';

export default function KiriChatPanel({ userProfile, entry, result, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    setMessages(loadChatHistory(window.localStorage));
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) saveChatHistory(window.localStorage, messages);
  }, [messages]);

  const send = async (event) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          userProfile: { nickname: userProfile?.nickname || '' },
          context: { entry, result },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const error = new Error(data.error || 'Chat failed');
        error.code = data.code;
        throw error;
      }
      setMessages([...nextMessages, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      const fallback = {
        chat_disabled: '……この対話は、いまは準備中みたい。開発プレビューが有効になるまで待っていて。',
        rate_limited: '……少し言葉が続きすぎたみたい。ひと呼吸おいてから、また聞かせて。',
        daily_limit: '……今日はここまでにしておこう。また明日、続きを聞かせて。',
      }[error.code] || '……少し声が届かなかったみたい。もう一度聞かせて。';
      setMessages([...nextMessages, { role: 'assistant', content: fallback, isSystem: true }]);
      console.error('[kiri-chat-ui]', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Kiriとの対話">
      <div className="kiri-card-strong rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-kiri-gold"><MessageCircle className="w-5 h-5" /><h2 className="font-display font-bold">Kiriに聞く</h2></div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && <button type="button" onClick={() => setMessages(clearChatHistory(window.localStorage))} aria-label="会話を削除" className="text-kiri-lilac hover:text-white"><Trash2 className="w-4 h-4" /></button>}
            <button type="button" onClick={onClose} aria-label="チャットを閉じる" className="text-kiri-lilac hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-48">
          {messages.length === 0 && <p className="text-sm text-kiri-fog/80 leading-relaxed">今日のメッセージで、もう少し聞きたいところがあれば話して。ここでは答えを急がなくていいよ。</p>}
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`rounded-xl p-3 text-sm whitespace-pre-line ${message.role === 'user' ? 'bg-kiri-lilac/20 ml-8 text-white leading-relaxed' : 'kiri-voice bg-white/10 mr-8 text-kiri-fog'}`}>
              {message.content}
            </div>
          ))}
          {loading && <p className="text-xs text-kiri-lilac">Kiriが言葉を探しています…</p>}
        </div>
        <form onSubmit={send} className="p-3 border-t border-white/10 flex gap-2">
          <textarea value={input} onChange={(event) => setInput(event.target.value.slice(0, 1200))} placeholder="Kiriに聞きたいこと" rows={2} className="flex-1 resize-none rounded-xl bg-white/10 border border-white/15 p-3 text-sm text-white placeholder-kiri-lilac/60 focus:outline-none focus:ring-2 focus:ring-kiri-lilac" />
          <button type="submit" disabled={!input.trim() || loading} aria-label="送信" className="self-end kiri-button rounded-xl p-3 disabled:opacity-40"><Send className="w-5 h-5" /></button>
        </form>
        <p className="px-4 pb-3 text-[11px] text-kiri-lilac/70">開発プレビュー：購入・購読状態の確認はまだ接続されていません。</p>
      </div>
    </div>
  );
}
