'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Lock, AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function SpiritualDiary() {
  const [step, setStep] = useState('start');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [gender, setGender] = useState('');
  const [nickname, setNickname] = useState('');

  const [entry, setEntry] = useState({
    emoji: '😊',
    mood: '',
    type: 'past',
    event: '',
    intuition: ''
  });
  const [placeholders, setPlaceholders] = useState({
    mood: '例: 穏やかで少し眠い',
    event: '例: 朝のコーヒーが美味しくて気分が上がった',
    intuition: '例: 今日は大切な人との繋がりを感じる日'
  });
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    biorhythm: true,
    saju: true
  });

  const emojis = ['😊', '😢', '😡', '😰', '😴', '🤔', '😆', '😌', '😔', '🥺', '😤', '✨', '💪', '🌈', '💤'];

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

  const calcBioHistory = (birth, days = 30) => {
    const b = new Date(birth);
    const history = [];
    const today = new Date();
    
    for (let i = days; i >= 0; i--) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);
      const d = Math.floor((targetDate - b) / 86400000);
      
      history.push({
        date: targetDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
        p: Math.round(Math.sin(2 * Math.PI * d / 23) * 100),
        e: Math.round(Math.sin(2 * Math.PI * d / 28) * 100),
        i: Math.round(Math.sin(2 * Math.PI * d / 33) * 100)
      });
    }
    
    return history;
  };

  const generatePlaceholders = async () => {
    setLoadingPlaceholders(true);
    try {
      const response = await fetch('/api/generate-placeholders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          timeOfDay: new Date().getHours() < 12 ? '朝' : new Date().getHours() < 18 ? '昼' : '夜'
        })
      });

      const data = await response.json();
      if (data.success) {
        setPlaceholders(data.placeholders);
      }
    } catch (error) {
      console.log('プレースホルダー生成エラー（デフォルト値を使用）');
    } finally {
      setLoadingPlaceholders(false);
    }
  };

  useEffect(() => {
    if (step === 'input') {
      generatePlaceholders();
    }
  }, [step]);

  const analyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const bio = calcBio(birthDate);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfile: { birthDate, birthTime, gender, nickname },
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
          bioHistory: calcBioHistory(birthDate),
          ...data.data
        });
        setStep('result');
      } else {
        setError({
          title: '分析エラー',
          message: data.error || '不明なエラーが発生しました',
          details: data.detail
        });
      }
    } catch (error) {
      setError({
        title: '通信エラー',
        message: 'サーバーとの通信に失敗しました',
        details: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const ErrorBanner = () => {
    if (!error) return null;

    return (
      <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
        <div className="bg-red-500/95 backdrop-blur-md text-white p-4 rounded-xl shadow-2xl border border-red-400">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm mb-1">{error.title}</h3>
              <p className="text-xs mb-2">{error.message}</p>
              {error.details && (
                <p className="text-xs opacity-80 bg-black/20 p-2 rounded break-words">
                  詳細: {error.details}
                </p>
              )}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-white hover:bg-white/20 rounded p-1 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const BiorhythmGraph = ({ data }) => {
    const width = 100; // パーセンテージで管理
    const height = 150;
    const padding = 30;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    const createPath = (values, color) => {
      if (!values || values.length === 0) return '';
      
      const points = values.map((value, index) => {
        const x = padding + (index / (values.length - 1)) * graphWidth;
        const y = padding + graphHeight / 2 - (value / 100) * (graphHeight / 2);
        return `${x},${y}`;
      });
      
      return `M ${points.join(' L ')}`;
    };

    const pValues = data.map(d => d.p);
    const eValues = data.map(d => d.e);
    const iValues = data.map(d => d.i);

    return (
      <div className="bg-white/5 rounded-lg p-3 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          <line x1={padding} y1={padding + graphHeight / 2} x2={width - padding} y2={padding + graphHeight / 2} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          
          <text x={padding - 5} y={padding + 2} fill="rgba(255,255,255,0.5)" fontSize="4" textAnchor="end">100</text>
          <text x={padding - 5} y={padding + graphHeight / 2 + 2} fill="rgba(255,255,255,0.5)" fontSize="4" textAnchor="end">0</text>
          <text x={padding - 5} y={height - padding + 2} fill="rgba(255,255,255,0.5)" fontSize="4" textAnchor="end">-100</text>
          
          <path d={createPath(pValues)} stroke="#10b981" strokeWidth="1" fill="none" opacity="0.9" />
          <path d={createPath(eValues)} stroke="#3b82f6" strokeWidth="1" fill="none" opacity="0.9" />
          <path d={createPath(iValues)} stroke="#a855f7" strokeWidth="1" fill="none" opacity="0.9" />
          
          <circle 
            cx={width - padding} 
            cy={padding + graphHeight / 2 - (pValues[pValues.length - 1] / 100) * (graphHeight / 2)} 
            r="1.5" 
            fill="#10b981" 
          />
          <circle 
            cx={width - padding} 
            cy={padding + graphHeight / 2 - (eValues[eValues.length - 1] / 100) * (graphHeight / 2)} 
            r="1.5" 
            fill="#3b82f6" 
          />
          <circle 
            cx={width - padding} 
            cy={padding + graphHeight / 2 - (iValues[iValues.length - 1] / 100) * (graphHeight / 2)} 
            r="1.5" 
            fill="#a855f7" 
          />
          
          <text x={padding} y={height - 5} fill="rgba(255,255,255,0.5)" fontSize="3" textAnchor="start">
            {data[0]?.date}
          </text>
          <text x={width - padding} y={height - 5} fill="rgba(255,255,255,0.5)" fontSize="3" textAnchor="end">
            今日
          </text>
        </svg>
        
        <div className="flex justify-center gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-green-400"></div>
            <span className="text-white/70">身体</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-blue-400"></div>
            <span className="text-white/70">感情</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-purple-400"></div>
            <span className="text-white/70">知性</span>
          </div>
        </div>
      </div>
    );
  };

  const CollapsibleSection = ({ title, isExpanded, onToggle, children, badge }) => (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-purple-300/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-left active:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-yellow-300">{title}</h2>
          {badge && (
            <span className="text-xs bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-purple-300" />
        ) : (
          <ChevronDown className="w-5 h-5 text-purple-300" />
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );

  if (step === 'start') {
    return (
      <>
        <ErrorBanner />
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 flex items-center justify-center">
          <div className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-purple-300/30 shadow-2xl">
            <div className="text-center mb-6">
              <Sparkles className="w-12 h-12 text-yellow-300 mx-auto mb-3" />
              <h1 className="text-2xl font-bold text-white mb-1">心のエネルギー日記</h1>
              <p className="text-sm text-purple-200">スピリチュアル×AI分析</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">ニックネーム（任意）</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="例: さくら、太郎、ミオ"
                  className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-300/50"
                />
                <p className="text-xs text-purple-200 mt-1">💫 AIがあなたに語りかける時に使います</p>
              </div>

              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">生年月日</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">出生時刻（任意）</label>
                <input
                  type="time"
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <p className="text-xs text-purple-200 mt-1">時運分析に使用（未入力は12:00で概算）</p>
              </div>

              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">性別（任意）</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <option value="">未入力</option>
                  <option value="female">女性</option>
                  <option value="male">男性</option>
                  <option value="other">その他</option>
                  <option value="no_answer">答えたくない</option>
                </select>
              </div>

              <button
                onClick={() => birthDate && setStep('input')}
                disabled={!birthDate}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 shadow-lg"
              >
                始める
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 'input') {
    const bio = calcBio(birthDate);
    const bioHistory = calcBioHistory(birthDate);

    return (
      <>
        <ErrorBanner />
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 pb-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-4 pt-2">
              <h1 className="text-xl font-bold text-white mb-1">
                今日の心のエネルギー
              </h1>
              {nickname && <p className="text-yellow-300 text-sm font-medium">{nickname}さん</p>}
              <p className="text-purple-200 text-xs">{new Date().toLocaleDateString('ja-JP')}</p>
            </div>

            <div className="space-y-3">
              {/* バイオリズムセクション */}
              <CollapsibleSection
                title="⚡ バイオリズム"
                isExpanded={expandedSections.biorhythm}
                onToggle={() => setExpandedSections({...expandedSections, biorhythm: !expandedSections.biorhythm})}
              >
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-white/10 rounded-lg p-3 text-center">
                    <div className="text-2xl mb-1">{bio.p > 0 ? '🔥' : '💤'}</div>
                    <div className="text-white text-xs font-bold">身体</div>
                    <div className="text-xl font-bold text-green-400">{bio.p}%</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-3 text-center">
                    <div className="text-2xl mb-1">{bio.e > 0 ? '✨' : '🌙'}</div>
                    <div className="text-white text-xs font-bold">感情</div>
                    <div className="text-xl font-bold text-blue-400">{bio.e}%</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-3 text-center">
                    <div className="text-2xl mb-1">{bio.i > 0 ? '🧠' : '😴'}</div>
                    <div className="text-white text-xs font-bold">知性</div>
                    <div className="text-xl font-bold text-purple-400">{bio.i}%</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-purple-200 mb-2">📈 過去30日間の推移</h3>
                  <BiorhythmGraph data={bioHistory} />
                </div>
              </CollapsibleSection>

              {/* 入力フォーム */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                <div className="space-y-4">
                  <div>
                    <label className="block text-white text-sm mb-2 font-medium">💖 今日の気分</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {emojis.map(e => (
                        <button
                          key={e}
                          onClick={() => setEntry({...entry, emoji: e})}
                          className={`text-2xl p-2 rounded-lg transition-all ${entry.emoji === e ? 'bg-purple-500 scale-110' : 'bg-white/10'} active:scale-95`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={entry.mood}
                      onChange={(e) => setEntry({...entry, mood: e.target.value})}
                      placeholder={loadingPlaceholders ? '例文を生成中...' : placeholders.mood}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-300/70"
                    />
                  </div>

                  <div>
                    <label className="block text-white text-sm mb-2 font-medium">📅 記入内容</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setEntry({...entry, type: 'past'})}
                        className={`flex-1 py-2.5 text-sm rounded-lg font-medium transition-all ${entry.type === 'past' ? 'bg-blue-500 text-white' : 'bg-white/10 text-purple-200'} active:scale-95`}
                      >
                        📖 今日あった出来事
                      </button>
                      <button
                        onClick={() => setEntry({...entry, type: 'future'})}
                        className={`flex-1 py-2.5 text-sm rounded-lg font-medium transition-all ${entry.type === 'future' ? 'bg-green-500 text-white' : 'bg-white/10 text-purple-200'} active:scale-95`}
                      >
                        🔮 今日の予定
                      </button>
                    </div>
                    <textarea
                      value={entry.event}
                      onChange={(e) => setEntry({...entry, event: e.target.value})}
                      placeholder={loadingPlaceholders ? '例文を生成中...' : (entry.type === 'past' ? placeholders.event : placeholders.event.replace('あった', 'の予定は').replace('した', 'する予定'))}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400 h-24 resize-none placeholder-purple-300/70"
                    />
                  </div>

                  <div>
                    <label className="block text-white text-sm mb-2 font-medium">✨ 直感的な一言</label>
                    <input
                      type="text"
                      value={entry.intuition}
                      onChange={(e) => setEntry({...entry, intuition: e.target.value})}
                      placeholder={loadingPlaceholders ? '例文を生成中...' : placeholders.intuition}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-300/70"
                    />
                  </div>

                  <button
                    onClick={analyze}
                    disabled={!entry.mood || !entry.event || loading}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2 text-sm">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        分析中...
                      </span>
                    ) : (
                      '🧠 AIに分析してもらう'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 'result') {
    return (
      <>
        <ErrorBanner />
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 pb-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-4 pt-2">
              <h1 className="text-xl font-bold text-white mb-1">
                ✨ 今日のメッセージ
              </h1>
              {nickname && <p className="text-yellow-300 text-sm font-medium">{nickname}さんへ</p>}
            </div>

            <div className="space-y-3">
              {/* バイオリズムセクション */}
              <CollapsibleSection
                title="📈 バイオリズムの推移"
                isExpanded={expandedSections.biorhythm}
                onToggle={() => setExpandedSections({...expandedSections, biorhythm: !expandedSections.biorhythm})}
              >
                <BiorhythmGraph data={result.bioHistory} />
              </CollapsibleSection>

              {/* 四柱推命セクション */}
              {result.saju && (
                <CollapsibleSection
                  title="🔮 四柱推命"
                  badge="日運・月運・年運"
                  isExpanded={expandedSections.saju}
                  onToggle={() => setExpandedSections({...expandedSections, saju: !expandedSections.saju})}
                >
                  <div className="space-y-3">
                    {/* 生まれた時の四柱 */}
                    <div>
                      <h3 className="text-xs font-bold text-purple-200 mb-2">🌟 あなたの本命</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-purple-200">年柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.year}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-purple-200">月柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.month}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-purple-200">日柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.day}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-purple-200">時柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.hour}</p>
                        </div>
                      </div>
                    </div>

                    {/* 今日の運勢 */}
                    <div>
                      <h3 className="text-xs font-bold text-yellow-200 mb-2">📅 今日の運勢</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-yellow-500/20 p-2 rounded-lg">
                          <p className="text-xs text-yellow-200">日運</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.day}</p>
                        </div>
                        {result.saju.today.hour && (
                          <div className="bg-yellow-500/20 p-2 rounded-lg">
                            <p className="text-xs text-yellow-200">時運</p>
                            <p className="font-bold text-sm text-white">{result.saju.today.hour}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 月運・年運 */}
                    <div>
                      <h3 className="text-xs font-bold text-blue-200 mb-2">📆 月運・年運</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                          <p className="text-xs text-blue-200">月運</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.month}</p>
                        </div>
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                          <p className="text-xs text-blue-200">年運</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.year}</p>
                        </div>
                      </div>
                    </div>

                    {/* 大運 */}
                    {result.saju.taiun && (
                      <div>
                        <h3 className="text-xs font-bold text-purple-200 mb-2">🌌 大運（中長期）</h3>
                        <div className="bg-purple-500/20 p-3 rounded-lg">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-purple-200">現在の大運</span>
                            <span className="text-xs text-purple-300">{result.saju.taiun.age}歳〜</span>
                          </div>
                          <p className="font-bold text-white">{result.saju.taiun.pillar}</p>
                          <p className="text-xs text-purple-200 mt-1">{result.saju.taiun.description}</p>
                        </div>
                      </div>
                    )}

                    {result.saju.note && (
                      <div className="text-xs text-purple-200 bg-purple-500/20 p-2 rounded">
                        ℹ️ {result.saju.note}
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              )}

              {/* メインメッセージ */}
              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-4 text-white shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">{result.time === '朝' ? '🌅' : result.time === '昼' ? '☀️' : '🌙'}</span>
                  <h2 className="text-lg font-bold">{result.energy}エネルギー</h2>
                </div>
                <div className="bg-black/20 p-3 rounded-lg">
                  <p className="text-sm leading-relaxed whitespace-pre-line">{result.deepMessage}</p>
                </div>
              </div>

              {result.innerMessage && (
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                  <h2 className="text-base font-bold text-purple-300 mb-2">💫 直感からのメッセージ</h2>
                  <p className="text-white text-sm leading-relaxed">{result.innerMessage}</p>
                </div>
              )}

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                <h2 className="text-base font-bold text-green-300 mb-2">🎯 具体的なアドバイス</h2>
                <p className="text-white text-sm leading-relaxed whitespace-pre-line">{result.actionAdvice}</p>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                <h2 className="text-base font-bold text-blue-300 mb-3">📖 今日の記録</h2>
                <div className="space-y-2">
                  <div className="bg-white/10 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{entry.emoji}</span>
                      <span className="font-bold text-sm text-white">気分</span>
                    </div>
                    <p className="text-sm text-white">{entry.mood}</p>
                  </div>
                  <div className="bg-white/10 p-3 rounded-lg">
                    <p className="font-bold text-sm mb-1 text-white">{entry.type === 'past' ? '📅 出来事' : '🔮 予定'}</p>
                    <p className="text-sm text-purple-200">{entry.event}</p>
                  </div>
                  {entry.intuition && (
                    <div className="bg-white/10 p-3 rounded-lg">
                      <p className="font-bold text-sm mb-1 text-white">✨ 直感</p>
                      <p className="text-sm text-purple-200">{entry.intuition}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl p-4 border-2 border-yellow-400/50">
                <div className="flex items-start gap-3">
                  <Lock className="text-yellow-300 w-6 h-6 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-yellow-300 mb-1">プレミアム版</h3>
                    <ul className="text-white space-y-0.5 mb-2 text-xs">
                      <li>📚 過去の記録を全て閲覧</li>
                      <li>📊 あなた専用のパターン分析</li>
                      <li>💬 AI対話無制限</li>
                    </ul>
                    <button className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-4 py-2 rounded-lg text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-md">
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
                className="w-full bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white py-3 rounded-xl font-medium text-sm transition-all"
              >
                明日も記録する
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}
