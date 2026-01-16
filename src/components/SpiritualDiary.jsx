'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Lock, AlertCircle, X, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

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
    event: '例: 朝のコーヒーが美味しくて気分が上がった。今日までの仕事も無事終わらせることができた。',
    intuition: '例: 今日は大切な人との繋がりを感じる日'
  });
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    biorhythm: true,
    saju: true,
    themes: true,
    hints: true
  });
  const [showBioInfo, setShowBioInfo] = useState(false);
  const [showSajuInfo, setShowSajuInfo] = useState(false);
  const [showThemeInfo, setShowThemeInfo] = useState(false);
  const [showHintInfo, setShowHintInfo] = useState({ 
    color: false, 
    number: false, 
    direction: false, 
    distance: false 
  });

  // 絵文字24種類（感情タイプ別）
  const emojis = [
    '🥰', '❤️', '😆', '💓', // 喜び・愛 (+20%)
    '😊', '😌', '✨', '🌈', '⭐', '😋', // 穏やか・希望 (+12%)
    '☀️', '💚', '💙', // エネルギー (+8%)
    '😴', '💤', // 眠い・疲れ (-5%)
    '😔', '😰', // 不安・憂鬱 (-12%)
    '😢', '😭', // 悲しい (-18%)
    '😤', '😠', // 怒り (-15%)
    '🤔', '😮'  // 中立 (0%)
  ];

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
      const now = new Date();

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfile: { birthDate, birthTime, gender, nickname },
          biorhythm: bio,
          entry: entry,
          timestamp: now.toISOString()
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
          timestamp: now,
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

  const clearAll = () => {
    setStep('start');
    setBirthDate('');
    setBirthTime('');
    setGender('');
    setNickname('');
    setEntry({emoji: '😊', mood: '', type: 'past', event: '', intuition: ''});
    setResult(null);
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

  // バイオリズムバー表示（色濃淡対応）
  const BiorhythmBar = ({ label, value, color, emoji }) => {
    const percentage = ((value + 100) / 200) * 100;
    
    // 色の濃淡計算（0-100%の値に基づく）
    const getOpacity = (val) => {
      const normalizedVal = (val + 100) / 2; // -100〜100を0〜100に変換
      if (normalizedVal >= 80) return 1.0;
      if (normalizedVal >= 60) return 0.85;
      if (normalizedVal >= 40) return 0.7;
      if (normalizedVal >= 20) return 0.55;
      return 0.4;
    };
    
    const opacity = getOpacity(value);
    
    return (
      <div className="bg-white/10 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <span className="text-white font-bold text-sm">{label}</span>
          </div>
          <span className={`text-lg font-bold ${color}`}>{value}%</span>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
          <div 
            className={`h-full rounded-full ${color.replace('text-', 'bg-')} transition-all duration-500`}
            style={{ width: `${percentage}%`, opacity: opacity }}
          />
        </div>
      </div>
    );
  };

  // テーマ別運勢バー（色濃淡対応）
  const ThemeBar = ({ emoji, label, value, baseColor }) => {
    // 星の数を計算
    const stars = Math.round(value / 20); // 0-5段階
    
    // 色の濃淡計算
    const getOpacity = (val) => {
      if (val >= 80) return 1.0;
      if (val >= 60) return 0.85;
      if (val >= 40) return 0.7;
      if (val >= 20) return 0.55;
      return 0.4;
    };
    
    const opacity = getOpacity(value);
    
    return (
      <div className="bg-white/5 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{emoji}</span>
            <span className="text-white text-sm font-medium">{label}</span>
          </div>
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <span key={i} className={`text-yellow-400 ${i < stars ? 'opacity-100' : 'opacity-20'}`}>★</span>
            ))}
          </div>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
          <div 
            className={`h-full rounded-full ${baseColor} transition-all duration-500`}
            style={{ width: `${value}%`, opacity: opacity }}
          />
        </div>
        <div className="text-right mt-1">
          <span className="text-white text-xs font-bold">{value}%</span>
        </div>
      </div>
    );
  };

  const InfoPopup = ({ show, onClose, title, children }) => {
    if (!show) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-2xl p-6 max-w-md w-full border-2 border-purple-400/50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-yellow-300">{title}</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="text-white text-sm leading-relaxed space-y-3">
            {children}
          </div>
        </div>
      </div>
    );
  };

  const HintItem = ({ emoji, title, value, message, bgColor, textColor, onInfoClick }) => {
    return (
      <div className="bg-white/5 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <span className="text-base">{emoji}</span>
            <span className="text-xs font-bold text-white">{title}</span>
          </div>
          <button 
            onClick={onInfoClick}
            className="text-purple-300 hover:text-yellow-300 transition-colors"
          >
            <HelpCircle className="w-3 h-3" />
          </button>
        </div>
        
        <div className="relative mb-2 text-center">
          <p className={`text-2xl font-bold ${textColor}`} style={{textShadow: '0 2px 8px rgba(255,255,255,0.5), 0 0 20px rgba(255,255,255,0.3)'}}>
            {value}
          </p>
        </div>
        
        <p className="text-xs text-white/80 leading-relaxed text-center">
          {message.split('\n')[0]}
        </p>
      </div>
    );
  };

  const CollapsibleSection = ({ title, isExpanded, onToggle, children, badge, onInfoClick }) => (
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
          {onInfoClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick();
              }}
              className="ml-1 text-purple-300 hover:text-yellow-300 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
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
              <h1 className="text-2xl font-bold text-white mb-1">Mind & Energy Diary</h1>
              <p className="text-sm text-purple-200">バイオリズム×四柱推命から読み解く心の分析日記</p>
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
                <p className="text-xs text-purple-200 mt-1">💫 Kiriがあなたに語りかける時に使います</p>
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
                <p className="text-xs text-purple-200 mt-1">時運分析に使います（未入力は12:00で概算）</p>
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
                はじめる
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 'input') {
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
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                <div className="space-y-4">
                  <div>
                    <label className="block text-white text-sm mb-2 font-medium">💖 今日の気分（絵文字を選んでください）</label>
                    <div className="flex flex-wrap gap-2">
                      {emojis.map(e => (
                        <button
                          key={e}
                          onClick={() => setEntry({...entry, emoji: e})}
                          className={`text-3xl p-2 rounded-lg transition-all ${entry.emoji === e ? 'bg-purple-500 scale-110' : 'bg-white/10'} active:scale-95`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
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
                      placeholder={loadingPlaceholders ? 'ちょっと待って...' : (entry.type === 'past' ? placeholders.event : placeholders.event.replace('あった', 'の予定は').replace('した', 'する予定'))}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400 h-24 resize-none placeholder-purple-300/70"
                    />
                  </div>

                  <div>
                    <label className="block text-white text-sm mb-2 font-medium">✨ ひらめき・直感的な一言</label>
                    <input
                      type="text"
                      value={entry.intuition}
                      onChange={(e) => setEntry({...entry, intuition: e.target.value})}
                      placeholder={loadingPlaceholders ? 'ちょっと待って...' : placeholders.intuition}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-purple-300/70"
                    />
                  </div>

                  <button
                    onClick={analyze}
                    disabled={!entry.event || loading}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2 text-sm">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        コンタクト中...
                      </span>
                    ) : (
                      '🧠 Kiriに読み解いてもらう'
                    )}
                  </button>

                  <button
                    onClick={() => setStep('start')}
                    className="w-full bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-xl font-medium text-sm transition-all"
                  >
                    前の画面に戻る
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
        <InfoPopup 
          show={showBioInfo} 
          onClose={() => setShowBioInfo(false)}
          title="📈 バイオリズムとは？"
        >
          <p>バイオリズムは、人間の身体・感情・知性の状態が一定の周期で変動するという理論です。</p>
          <div className="space-y-2 mt-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-green-400">身体（23日周期）</p>
              <p className="text-xs mt-1">体力、持久力、免疫力などの身体的な状態</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-blue-400">感情（28日周期）</p>
              <p className="text-xs mt-1">気分、感受性、創造力などの精神的な状態</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-purple-400">知性（33日周期）</p>
              <p className="text-xs mt-1">思考力、判断力、記憶力などの知的な状態</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-purple-200">※本アプリでは生年月日から計算し、参考情報として提示しています。</p>
        </InfoPopup>

        <InfoPopup 
          show={showSajuInfo} 
          onClose={() => setShowSajuInfo(false)}
          title="🔮 四柱推命とは？"
        >
          <p>四柱推命は、中国発祥の占術で、生年月日時から人の運命や性格を読み解く東洋占星術です。</p>
          <div className="space-y-2 mt-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-yellow-300">あなたの本命（生まれた時）</p>
              <p className="text-xs mt-1">年柱・月柱・日柱・時柱の4つの柱から、あなたの本質を表します</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-yellow-300">日運・月運・年運（今の運勢）</p>
              <p className="text-xs mt-1">現在の時間の柱から、今日・今月・今年の運勢を読み解きます</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-yellow-300">大運（人生の流れ）</p>
              <p className="text-xs mt-1">10年周期で変わる大きな運勢の流れを示します</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-purple-200">※本アプリでは lunar-javascript ライブラリを使用して算出しています。</p>
        </InfoPopup>

        <InfoPopup 
          show={showThemeInfo} 
          onClose={() => setShowThemeInfo(false)}
          title="🌟 テーマ別運勢の算出方法"
        >
          <p>このスコアは、以下の3つの要素から算出されています。</p>
          <div className="space-y-2 mt-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-yellow-300">四柱推命（40%）</p>
              <p className="text-xs mt-1">生まれた日と今日の五行の相性</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-blue-400">バイオリズム（30%）</p>
              <p className="text-xs mt-1">身体・感情・知性の周期的な波</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-pink-400">あなたのコメント（30%）</p>
              <p className="text-xs mt-1">気分の絵文字と文章から読み取った雰囲気</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-purple-200">※これらをKiriの直感で組み合わせています。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.color} 
          onClose={() => setShowHintInfo({...showHintInfo, color: false})}
          title="💙 今日の色について"
        >
          <p>この色は、四柱推命の五行論と色彩心理学から導いています。</p>
          <p className="mt-2">五行（木火土金水）にはそれぞれ対応する色があり、今日の運勢（日運）の五行とバイオリズムを組み合わせて、Kiriがイメージした色をお伝えしています。</p>
          <p className="mt-2 text-purple-200 text-xs">感覚的なイメージをKiriからのヒントとして受け取ってください。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.number} 
          onClose={() => setShowHintInfo({...showHintInfo, number: false})}
          title="🔢 今日の数字について"
        >
          <p>この数字は、干支の数理とバイオリズムの周期から導いています。</p>
          <p className="mt-2">十二支にはそれぞれ数字が割り当てられていて、今日の運勢とあなたのバイオリズムから、今日のペースに合いそうな数字をKiriが選んでいます。</p>
          <p className="mt-2 text-purple-200 text-xs">迷った時に、ふと思い出してもらえたら、助けになるかもしてません。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.direction} 
          onClose={() => setShowHintInfo({...showHintInfo, direction: false})}
          title="🧭 今日の方角について"
        >
          <p>この方角は、五行の方位論（風水）から導いています。</p>
          <p className="mt-2">五行（木火土金水）にはそれぞれ方角があり、今日の運勢の五行とバイオリズムから、Kiriが感じた方向をお伝えしています。</p>
          <p className="mt-2 text-purple-200 text-xs">気にしなくても大丈夫。気が向いたときだけ、Kiriに寄り添ってみてください。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.distance} 
          onClose={() => setShowHintInfo({...showHintInfo, distance: false})}
          title="👥 今日の距離感について"
        >
          <p>この距離感は、今日のテーマ別運勢とバイオリズムから導いています。</p>
          <p className="mt-2">あなたの今日のエネルギー状態を、人との距離感やものとの関わり方に例えてみました。</p>
          <p className="mt-2 text-purple-200 text-xs">正解はないので、心地よい距離を自分で選んでくださいね。</p>
        </InfoPopup>

        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 pb-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-4 pt-2">
              <h1 className="text-xl font-bold text-white mb-1">
                ✨ 今日のメッセージ
              </h1>
              {nickname && <p className="text-yellow-300 text-sm font-medium">{nickname}さんへ</p>}
            </div>

            <div className="space-y-3">

              {/* 1. バイオリズム */}
              {/* バイオリズムセクション */}
              <CollapsibleSection
                title="📈 バイオリズム"
                isExpanded={expandedSections.biorhythm}
                onToggle={() => setExpandedSections({...expandedSections, biorhythm: !expandedSections.biorhythm})}
                onInfoClick={() => setShowBioInfo(true)}
              >
                <div className="space-y-2">
                  <BiorhythmBar label="身体" value={result.bio.p} color="text-green-400" emoji="🔥" />
                  <BiorhythmBar label="感情" value={result.bio.e} color="text-blue-400" emoji="✨" />
                  <BiorhythmBar label="知性" value={result.bio.i} color="text-purple-400" emoji="🧠" />
                </div>
              </CollapsibleSection>

              {/* 2. 四柱推命 */}
              {/* 四柱推命セクション */}
              {result.saju && (
                <CollapsibleSection
                  title="🔮 四柱推命"
                  badge="日運・月運・年運"
                  isExpanded={expandedSections.saju}
                  onToggle={() => setExpandedSections({...expandedSections, saju: !expandedSections.saju})}
                  onInfoClick={() => setShowSajuInfo(true)}
                >
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-xs font-bold text-purple-200 mb-1">🌟 あなたの本命</h3>
                      <p className="text-xs text-purple-300 mb-2">自分自身（本質・性格・運勢の根幹）を表す最も重要な要素</p>
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
                          <p className="text-xs text-purple-200">日柱（最重要）</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.day}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-purple-200">時柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.hour || '未入力'}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-yellow-200 mb-2">📅 今日の運勢</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-yellow-500/20 p-2 rounded-lg">
                          <p className="text-xs text-yellow-200">日運（今日）</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.day}</p>
                        </div>
                        {result.saju.today.hour && (
                          <div className="bg-yellow-500/20 p-2 rounded-lg">
                            <p className="text-xs text-yellow-200">時運（現在）</p>
                            <p className="font-bold text-sm text-white">{result.saju.today.hour}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-blue-200 mb-2">📆 月運・年運</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                          <p className="text-xs text-blue-200">月運（今月）</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.month}</p>
                        </div>
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                          <p className="text-xs text-blue-200">年運（今年）</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.year}</p>
                        </div>
                      </div>
                    </div>

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

              {/* テーマ別運勢セクション - メインメッセージの前に配置 */}
              {result.themeScores && (
                <CollapsibleSection
                  title="🌟 今日のテーマ別運勢"
                  isExpanded={expandedSections.themes}
                  onToggle={() => setExpandedSections({...expandedSections, themes: !expandedSections.themes})}
                  onInfoClick={() => setShowThemeInfo(true)}
                >
                  <div className="space-y-2">
                    <ThemeBar emoji="💕" label="恋愛・人間関係" value={result.themeScores.love} baseColor="bg-pink-500" />
                    <ThemeBar emoji="💰" label="お金・判断感覚" value={result.themeScores.money} baseColor="bg-yellow-500" />
                    <ThemeBar emoji="🖋" label="仕事・学び" value={result.themeScores.work} baseColor="bg-blue-500" />
                    <ThemeBar emoji="🍀" label="健康・活力" value={result.themeScores.health} baseColor="bg-green-500" />
                  </div>
                </CollapsibleSection>
              )}

              {/* 今日のヒントセクション */}
              {result.todayHints && (
                <CollapsibleSection
                  title="🎨 今日のヒント"
                  badge="色・数字・方角・距離感"
                  isExpanded={expandedSections.hints}
                  onToggle={() => setExpandedSections({...expandedSections, hints: !expandedSections.hints})}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <HintItem
                      emoji={result.todayHints.color.emoji}
                      title="色"
                      value={result.todayHints.color.value}
                      message={result.todayHints.color.message}
                      bgColor={result.todayHints.color.bgColor}
                      textColor={result.todayHints.color.textColor}
                      onInfoClick={() => setShowHintInfo({...showHintInfo, color: true})}
                    />
                    
                    <HintItem
                      emoji={result.todayHints.number.emoji}
                      title="数字"
                      value={result.todayHints.number.value}
                      message={result.todayHints.number.message}
                      bgColor="bg-purple-500"
                      textColor="text-purple-400"
                      onInfoClick={() => setShowHintInfo({...showHintInfo, number: true})}
                    />
                    
                    <HintItem
                      emoji={result.todayHints.direction.emoji}
                      title="方角"
                      value={result.todayHints.direction.value}
                      message={result.todayHints.direction.message}
                      bgColor="bg-indigo-500"
                      textColor="text-indigo-400"
                      onInfoClick={() => setShowHintInfo({...showHintInfo, direction: true})}
                    />
                    
                    <HintItem
                      emoji={result.todayHints.distance.emoji}
                      title="距離感"
                      value={result.todayHints.distance.value}
                      message={result.todayHints.distance.message}
                      bgColor="bg-pink-500"
                      textColor="text-pink-400"
                      onInfoClick={() => setShowHintInfo({...showHintInfo, distance: true})}
                    />
                  </div>
                </CollapsibleSection>
              )}

              {/* メインメッセージ */}
              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-4 text-white shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">{result.time === '朝' ? '🌅' : result.time === '昼' ? '☀️' : '🌙'}</span>
                  <h2 className="text-lg font-bold">Kiriが映すあなたのエネルギー</h2>
                </div>
                <div className="bg-black/20 p-3 rounded-lg">
                  <p className="text-sm leading-relaxed whitespace-pre-line">{result.deepMessage}</p>
                </div>
              </div>

              {result.innerMessage && (
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                  <h2 className="text-base font-bold text-purple-300 mb-2">💫 直感から読み取られるメッセージ</h2>
                  <p className="text-white text-sm leading-relaxed">{result.innerMessage}</p>
                </div>
              )}

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                <h2 className="text-base font-bold text-green-300 mb-2">🎯 Kiriからのアドバイス</h2>
                <p className="text-white text-sm leading-relaxed whitespace-pre-line">{result.actionAdvice}</p>
              </div>


              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-purple-300/30">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-blue-300">📖 今日の記録</h2>
                  <p className="text-xs text-purple-200">
                    {result.timestamp && new Date(result.timestamp).toLocaleString('ja-JP', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="bg-white/10 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{entry.emoji}</span>
                      <span className="font-bold text-sm text-white">今日の気分</span>
                    </div>
                  </div>
                  <div className="bg-white/10 p-3 rounded-lg">
                    <p className="font-bold text-sm mb-1 text-white">{entry.type === 'past' ? '📅 出来事' : '🔮 予定'}</p>
                    <p className="text-sm text-purple-200">{entry.event}</p>
                  </div>
                  {entry.intuition && (
                    <div className="bg-white/10 p-3 rounded-lg">
                      <p className="font-bold text-sm mb-1 text-white">✨ ひらめき・直感</p>
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

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white py-3 rounded-xl font-medium text-sm transition-all"
                >
                  前の画面に戻る
                </button>
                <button
                  onClick={clearAll}
                  className="flex-1 bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white py-3 rounded-xl font-medium text-sm transition-all"
                >
                  記入した情報をクリアする
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}
