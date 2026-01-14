'use client';

import { useState } from 'react';
import { Sparkles, Lock } from 'lucide-react';

export default function SpiritualDiary() {
  const [step, setStep] = useState('start');
  const [birthDate, setBirthDate] = useState('');
  const [entry, setEntry] = useState({
    emoji: '😊',
    mood: '',
    type: 'past',
    event: '',
    intuition: ''
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const emojis = ['😊', '😢', '😡', '😰', '😴', '🤔', '😆', '😌', '😓', '🥺', '😤', '✨', '💪', '🌈', '💤'];

  const calcBio = (birth) => {
    const b = new Date(birth);
    const t = new Date();
    const d = Math.floor((t - b) / 86400000);
    return {
      p: Math.round(Math.sin(2 * Math.PI * d / 23) * 100),
      e: Math.round(Math.sin(2 * Math.PI * d / 28) * 100),
      i: Math.round(Math.sin(2 * Math.PI * d / 33) * 100)
    };
  };

  const analyze = async () => {
    setLoading(true);

    try {
      const bio = calcBio(birthDate);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfile: { birthDate },
          biorhythm: bio,
          entry: entry
        })
      });

      const data = await response.json();

      if (data.success) {
        const avg = (bio.p + bio.e + bio.i) / 3;
        const h = new Date().getHours();
        const energy = avg > 30 ? '高揚' : avg > -30 ? '調和' : '内省';
        const time = h < 11 ? '朝' : h < 16 ? '昼' : '夜';

        setResult({
          energy,
          time,
          bio,
          ...data.data
        });
        setStep('result');
      } else {
        alert('エラーが発生しました: ' + data.error);
      }
    } catch (error) {
      alert('通信エラー: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'start') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-purple-300/30">
          <div className="text-center mb-6">
            <Sparkles className="w-16 h-16 text-yellow-300 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">心のエネルギー日記</h1>
            <p className="text-purple-200">スピリチュアル×AI分析</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-white mb-2 font-medium">生年月日</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            <button
              onClick={() => birthDate && setStep('input')}
              disabled={!birthDate}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-lg font-bold hover:scale-105 transition-transform disabled:opacity-50"
            >
              始める
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'input') {
    const bio = calcBio(birthDate);

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">今日の心のエネルギー</h1>
            <p className="text-purple-200">{new Date().toLocaleDateString('ja-JP')}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-purple-300/30">
            <h2 className="text-xl font-bold text-yellow-300 mb-4">⚡ 今日のバイオリズム</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-lg p-4 text-center">
                <div className="text-3xl mb-2">{bio.p > 0 ? '🔥' : '💤'}</div>
                <div className="text-white font-bold">身体</div>
                <div className="text-2xl font-bold text-green-400">{bio.p}%</div>
              </div>
              <div className="bg-white/10 rounded-lg p-4 text-center">
                <div className="text-3xl mb-2">{bio.e > 0 ? '✨' : '🌙'}</div>
                <div className="text-white font-bold">感情</div>
                <div className="text-2xl font-bold text-blue-400">{bio.e}%</div>
              </div>
              <div className="bg-white/10 rounded-lg p-4 text-center">
                <div className="text-3xl mb-2">{bio.i > 0 ? '🧠' : '😴'}</div>
                <div className="text-white font-bold">知性</div>
                <div className="text-2xl font-bold text-purple-400">{bio.i}%</div>
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-purple-300/30">
            <div className="space-y-6">
              <div>
                <label className="block text-white mb-2 font-medium">💖 今日の気分</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {emojis.map(e => (
                    <button
                      key={e}
                      onClick={() => setEntry({...entry, emoji: e})}
                      className={`text-3xl p-2 rounded-lg transition-all ${entry.emoji === e ? 'bg-purple-500 scale-110' : 'bg-white/10'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={entry.mood}
                  onChange={(e) => setEntry({...entry, mood: e.target.value})}
                  placeholder="気分を言葉で表現"
                  className="w-full px-4 py-3 rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none placeholder-purple-300"
                />
              </div>

              <div>
                <label className="block text-white mb-3 font-medium">📅 記入内容</label>
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={() => setEntry({...entry, type: 'past'})}
                    className={`flex-1 py-3 rounded-lg font-medium transition-all ${entry.type === 'past' ? 'bg-blue-500 text-white' : 'bg-white/10 text-purple-200'}`}
                  >
                    📖 今日あった出来事
                  </button>
                  <button
                    onClick={() => setEntry({...entry, type: 'future'})}
                    className={`flex-1 py-3 rounded-lg font-medium transition-all ${entry.type === 'future' ? 'bg-green-500 text-white' : 'bg-white/10 text-purple-200'}`}
                  >
                    🔮 今日の予定
                  </button>
                </div>
                <textarea
                  value={entry.event}
                  onChange={(e) => setEntry({...entry, event: e.target.value})}
                  placeholder={entry.type === 'past' ? '今日あった出来事' : '今日の予定'}
                  className="w-full px-4 py-3 rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none h-32 resize-none placeholder-purple-300"
                />
              </div>

              <div>
                <label className="block text-white mb-2 font-medium">✨ 直感的な一言</label>
                <input
                  type="text"
                  value={entry.intuition}
                  onChange={(e) => setEntry({...entry, intuition: e.target.value})}
                  placeholder="心に浮かんだ言葉（任意）"
                  className="w-full px-4 py-3 rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none placeholder-purple-300"
                />
              </div>

              <button
                onClick={analyze}
                disabled={!entry.mood || !entry.event || loading}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-lg font-bold text-lg hover:scale-105 transition-transform disabled:opacity-50"
              >
                {loading ? '分析中...' : '🧠 AIに分析してもらう'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">✨ 今日のメッセージ</h1>
          </div>

          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-6 mb-6 text-white">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-4xl">{result.time === '朝' ? '🌅' : result.time === '昼' ? '☀️' : '🌙'}</span>
              <h2 className="text-2xl font-bold">{result.energy}エネルギー</h2>
            </div>
            <div className="bg-black/20 p-4 rounded-lg">
              <p className="leading-relaxed whitespace-pre-line">{result.deepMessage}</p>
            </div>
          </div>

          {result.innerMessage && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-purple-300/30">
              <h2 className="text-xl font-bold text-purple-300 mb-3">💫 直感からのメッセージ</h2>
              <p className="text-white leading-relaxed">{result.innerMessage}</p>
            </div>
          )}

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-purple-300/30">
            <h2 className="text-xl font-bold text-green-300 mb-3">🎯 具体的なアドバイス</h2>
            <p className="text-white leading-relaxed">{result.actionAdvice}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-purple-300/30">
            <h2 className="text-xl font-bold text-blue-300 mb-4">📖 今日の記録</h2>
            <div className="space-y-3 text-white">
              <div className="bg-white/10 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">{entry.emoji}</span>
                  <span className="font-bold">気分</span>
                </div>
                <p>{entry.mood}</p>
              </div>
              <div className="bg-white/10 p-4 rounded-lg">
                <p className="font-bold mb-2">{entry.type === 'past' ? '📅 出来事' : '🔮 予定'}</p>
                <p className="text-purple-200">{entry.event}</p>
              </div>
              {entry.intuition && (
                <div className="bg-white/10 p-4 rounded-lg">
                  <p className="font-bold mb-2">✨ 直感</p>
                  <p className="text-purple-200">{entry.intuition}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl p-6 border-2 border-yellow-400/50 mb-6">
            <div className="flex items-start gap-4">
              <Lock className="text-yellow-300 w-8 h-8 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-yellow-300 mb-2">プレミアム版</h3>
                <ul className="text-white space-y-1 mb-3 text-sm">
                  <li>📚 過去の記録を全て閲覧</li>
                  <li>📊 あなた専用のパターン分析</li>
                  <li>💬 AI対話無制限</li>
                </ul>
                <button className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-lg font-bold hover:scale-105 transition-transform">
                  月額500円
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setStep('input');
              setEntry({emoji: '😊', mood: '', type: 'past', event: '', intuition: ''});
              setResult(null);
            }}
            className="w-full bg-white/10 hover:bg-white/20 text-white py-3 rounded-lg font-medium"
          >
            明日も記録する
          </button>
        </div>
      </div>
    );
  }

  return null;
}
