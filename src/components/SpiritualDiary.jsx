'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Lock, AlertCircle, X, ChevronDown, ChevronUp, HelpCircle, Heart, Smile, Frown, Meh, Angry, Star, Sun, Moon, Cloud, Zap, CircleHelp, Download, Upload } from 'lucide-react';
import { clearHistory, deleteHistoryItem, loadHistory, saveHistory, toHistoryRecord, loadProfile, saveProfile } from '@/lib/history';
import { buildBackup, backupFileName, parseBackup, applyBackup } from '@/lib/backup';
import KiriChatPanel from '@/components/KiriChatPanel';

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
    event: '例: 朝のコーヒーが美味しくて気分が上がった。今日までの仕事も無事終わらせることができた。/nこれから買い物に行って、晩酌しながらドラマの続きを観る予定。',
    intuition: '例: 大切な人との繋がりを感じる'
  });
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [openedRecord, setOpenedRecord] = useState(null);
  const [backupNotice, setBackupNotice] = useState(null);
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
  const [showPremiumInfo, setShowPremiumInfo] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const profileHydrated = useRef(false);
  const importInputRef = useRef(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(buildBackup(window.localStorage), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName();
    link.click();
    URL.revokeObjectURL(url);
    setBackupNotice({ type: 'ok', text: 'バックアップを書き出しました' });
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const summary = applyBackup(window.localStorage, parseBackup(await file.text()));
      setHistory(loadHistory(window.localStorage));
      if (summary.profileApplied) {
        const restored = loadProfile(window.localStorage);
        setNickname(restored?.nickname || '');
        setBirthDate(restored?.birthDate || '');
        setBirthTime(restored?.birthTime || '');
        setGender(restored?.gender || '');
      }
      setBackupNotice({ type: 'ok', text: `読み込みました（追加された記録 ${summary.historyAdded}件・全${summary.historyTotal}件）` });
    } catch (importError) {
      console.error('[kiri-backup]', importError);
      setBackupNotice({ type: 'error', text: 'このファイルは読み込めませんでした' });
    }
  };

  const moodIconMap = {
    '🥰': Heart, '❤️': Heart, '😆': Smile, '💓': Heart,
    '😊': Smile, '😌': Smile, '✨': Sparkles, '🌈': Star, '⭐': Star, '😋': Smile,
    '☀️': Sun, '💚': Heart, '💙': Heart,
    '😴': Moon, '💤': Moon,
    '😔': Frown, '😰': Cloud, '🌧️': Cloud,
    '😢': Frown, '😭': Frown,
    '😤': Angry, '😠': Angry,
    '🤔': CircleHelp, '😮': Meh,
  };

  const MoodIcon = ({ value, className = 'w-7 h-7' }) => {
    const Icon = moodIconMap[value] || Sparkles;
    return <Icon className={className} strokeWidth={1.6} aria-hidden="true" />;
  };

  const setBirthPart = (part, value) => {
    const [year = '', month = '', day = ''] = birthDate.split('-');
    const next = { year, month, day, [part]: value };
    if (next.year && next.month && next.day) {
      const maxDay = new Date(Number(next.year), Number(next.month), 0).getDate();
      next.day = String(Math.min(Number(next.day), maxDay)).padStart(2, '0');
    }
    setBirthDate(`${next.year}-${next.month}-${next.day}`);
  };

  const selectedYear = Number(birthDate.split('-')[0]);
  const selectedMonth = Number(birthDate.split('-')[1]);
  const daysInSelectedMonth = selectedYear && selectedMonth
    ? new Date(selectedYear, selectedMonth, 0).getDate()
    : 31;

  useEffect(() => {
    const storedProfile = loadProfile(window.localStorage);
    if (storedProfile) {
      setNickname(storedProfile.nickname || '');
      setBirthDate(storedProfile.birthDate || '');
      setBirthTime(storedProfile.birthTime || '');
      setGender(storedProfile.gender || '');
    }
    setHistory(loadHistory(window.localStorage));
    profileHydrated.current = true;
  }, []);

  useEffect(() => {
    if (profileHydrated.current) {
      saveProfile(window.localStorage, { nickname, birthDate, birthTime, gender });
    }
  }, [nickname, birthDate, birthTime, gender]);

  // テキスト内の**強調**を処理する関数
  const renderHighlightedText = (text) => {
    if (!text) return null;
    
    // **テキスト** を太字+黄色に変換
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const content = part.slice(2, -2);
        return (
          <strong key={index} className="font-bold text-kiri-gold drop-shadow-md">
            {content}
          </strong>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

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

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setStep('loading'); // ローディング画面に遷移

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

        const nextResult = {
          energy,
          time,
          bio,
          timestamp: now,
          ...data.data
        };
        setResult(nextResult);
        const record = toHistoryRecord({
          result: nextResult,
          entry,
          userProfile: { birthDate, birthTime, gender, nickname },
        });
        setHistory(saveHistory(window.localStorage, record));
        
        // ホワイトアウト遷移
        setIsTransitioning(true);
        setTimeout(() => {
          setStep('result');
          setTimeout(() => {
            setIsTransitioning(false);
          }, 400);
        }, 1000);
      } else {
        setStep('input'); // エラー時は入力画面に戻る
        setError({
          title: '分析エラー',
          message: data.error || '不明なエラーが発生しました',
          details: data.detail
        });
      }
    } catch (error) {
      setStep('input'); // エラー時は入力画面に戻る
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
    setEntry({emoji: '😊', mood: '', type: 'past', event: '', intuition: ''});
    setResult(null);
  };

  const ErrorBanner = () => {
    if (!error) return null;

    return (
      <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
        <div className="bg-kiri-plum/95 backdrop-blur-md text-white p-4 rounded-xl shadow-2xl border border-kiri-danger/60">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-kiri-danger" />
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
  const BiorhythmBar = ({ label, value, color, barColor, icon }) => {
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
            <span className="text-kiri-fog">{icon}</span>
            <span className="text-white font-bold text-sm">{label}</span>
          </div>
          <span className={`text-lg font-bold ${color}`}>{value}%</span>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
          <div 
            className={`h-full rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${percentage}%`, opacity: opacity }}
          />
        </div>
      </div>
    );
  };

  // テーマ別運勢バー（色濃淡対応）
  const ThemeBar = ({ icon, label, value, baseColor }) => {
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
            <span className="text-kiri-fog">{icon}</span>
            <span className="text-white text-sm font-medium">{label}</span>
          </div>
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <span key={i} className={`text-kiri-gold ${i < stars ? 'opacity-100' : 'opacity-20'}`}>★</span>
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
        <div className="kiri-card-strong rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold text-kiri-gold">{title}</h3>
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

  const HintItem = ({ icon, title, value, message, bgColor, textColor, onInfoClick }) => {
    return (
      <div className="bg-white/5 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <span className="text-kiri-fog">{icon}</span>
            <span className="text-xs font-bold text-white">{title}</span>
          </div>
          <button 
            onClick={onInfoClick}
            className="text-kiri-lilac hover:text-kiri-gold transition-colors"
          >
            <HelpCircle className="w-3 h-3" />
          </button>
        </div>
        
        <div className="relative mb-2 text-center">
          <p className={`text-2xl font-bold ${textColor}`} style={{textShadow: '0 3px 12px rgba(255,255,255,0.4), 0 0 30px rgba(255,255,255,0.2)'}}>
            {value}
          </p>
        </div>
        
        <p className="text-sm text-white/90 leading-relaxed text-center">
          {message.split('\n')[0]}
        </p>
      </div>
    );
  };

  const CollapsibleSection = ({ title, isExpanded, onToggle, children, badge, onInfoClick }) => (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-kiri-lilac/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-left active:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-bold text-kiri-gold">{title}</h2>
          {badge && (
            <span className="text-xs bg-kiri-gold/20 text-kiri-gold px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
          {onInfoClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick();
              }}
              className="ml-1 text-kiri-lilac hover:text-kiri-gold transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-kiri-lilac" />
        ) : (
          <ChevronDown className="w-5 h-5 text-kiri-lilac" />
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );

  // 霧に包まれる画面遷移（白飛びさせず、薄紫の霧で覆う）
  const WhiteoutTransition = () => (
    <div
      className={`fixed inset-0 z-50 transition-all ease-in-out ${
        isTransitioning ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        background: 'radial-gradient(circle, rgba(230,222,240,0.96) 0%, rgba(216,205,232,0.92) 45%, rgba(196,183,218,0.86) 75%, rgba(178,164,204,0.8) 100%)',
        transitionDuration: '1200ms'
      }}
    />
  );

  // 過去の記録の詳細（履歴タップで開く読み返しモーダル）
  const RecordDetail = ({ record, onClose }) => {
    if (!record) return null;
    const dateLabel = record.createdAt
      ? new Date(record.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      : '記録';
    const entryLabel = record.entry?.type === 'future' ? '予定' : '出来事';
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label="過去の記録">
        <div className="kiri-card-strong rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden kiri-rise" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-kiri-fog"><MoodIcon value={record.entry?.emoji || '✨'} className="w-6 h-6" /></span>
              <div>
                <h2 className="font-display font-bold text-kiri-gold">{dateLabel}</h2>
                <p className="text-[11px] text-kiri-lilac">{entryLabel}の記録</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="閉じる" className="text-kiri-lilac hover:text-white p-1"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-xs font-bold text-kiri-lilac mb-1">{entryLabel}</p>
              <p className="text-sm text-white leading-relaxed whitespace-pre-line">{record.entry?.event || '記録なし'}</p>
            </div>
            {record.entry?.intuition && (
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs font-bold text-kiri-lilac mb-1">ひらめき・直感</p>
                <p className="text-sm text-white leading-relaxed">{record.entry.intuition}</p>
              </div>
            )}
            {record.result?.deepMessage && (
              <div className="bg-black/15 rounded-lg p-3">
                <p className="text-xs font-bold text-kiri-gold mb-2">Kiriが映したエネルギー</p>
                <p className="kiri-voice text-sm text-white whitespace-pre-line">{renderHighlightedText(record.result.deepMessage)}</p>
              </div>
            )}
            {record.result?.innerMessage && (
              <div className="bg-black/15 rounded-lg p-3">
                <p className="text-xs font-bold text-kiri-gold mb-2">直感へのメッセージ</p>
                <p className="kiri-voice text-sm text-white whitespace-pre-line">{renderHighlightedText(record.result.innerMessage)}</p>
              </div>
            )}
            {record.result?.actionAdvice && (
              <div className="bg-black/15 rounded-lg p-3">
                <p className="text-xs font-bold text-kiri-gold mb-2">Kiriからのアドバイス</p>
                <p className="kiri-voice text-sm text-white whitespace-pre-line">{renderHighlightedText(record.result.actionAdvice)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (step === 'start') {
    return (
      <>
        <WhiteoutTransition />
        <ErrorBanner />
        <RecordDetail record={openedRecord} onClose={() => setOpenedRecord(null)} />
        <div className="min-h-screen kiri-shell p-4 py-8 flex items-center justify-center relative overflow-hidden">
          {/* 霧の谷: トップページの静かな光 */}
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="kiri-fog-orb w-80 h-80 top-[-6%] left-[-10%] bg-kiri-lilac" style={{'--drift': '76s', '--breathe': '12s', '--fog-min': 0.1, '--fog-max': 0.22}} />
            <div className="kiri-fog-orb w-96 h-96 top-[30%] right-[-14%] bg-kiri-gold" style={{'--drift': '88s', '--breathe': '14s', '--delay': '-32s', '--fog-min': 0.06, '--fog-max': 0.15}} />
            <div className="kiri-fog-orb w-72 h-72 bottom-[-8%] left-[18%] bg-kiri-rain" style={{'--drift': '70s', '--breathe': '11s', '--delay': '-50s', '--fog-min': 0.07, '--fog-max': 0.16}} />
          </div>

          <div className="w-full max-w-md kiri-card rounded-2xl p-6 relative kiri-rise">
            <div className="text-center mb-6">
              <Sparkles className="w-12 h-12 text-kiri-gold mx-auto mb-3" />
              <h1 className="font-display text-2xl font-bold text-white mb-1">Mind & Energy Note</h1>
              <p className="text-sm text-kiri-lilac">バイオリズム×四柱推命から読み解く心の分析ノート</p>
            </div>

            {/* Kiriの紹介 */}
            <div className="kiri-card-strong rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <img 
                  src="/kiri.png" 
                  alt="Kiri" 
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <h2 className="font-display text-lg font-bold text-kiri-gold">Kiri</h2>
                  <p className="text-xs text-kiri-lilac">わたしはKiri。あなたの心を映す鏡</p>
                </div>
              </div>
              <p className="text-sm text-white/90 leading-relaxed">
                Kiriは、心のエネルギーを読み解き、あなたの日々にそっと寄り添います
              </p>
            </div>

            {history.length > 0 && (
              <div className="bg-white/10 rounded-xl p-4 mb-6 border border-kiri-lilac/30">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-kiri-gold">最近の記録</h2>
                  <button
                    type="button"
                    onClick={() => setHistory(clearHistory(window.localStorage))}
                    className="text-xs text-kiri-lilac hover:text-white"
                  >
                    すべて削除
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {history.slice(0, 5).map((item) => (
                    <div key={item.id} className="bg-black/15 rounded-lg flex items-stretch">
                      <button
                        type="button"
                        onClick={() => setOpenedRecord(item)}
                        className="flex-1 min-w-0 p-2.5 flex items-start gap-2 text-left rounded-l-lg hover:bg-white/5 transition-colors"
                      >
                        <span className="text-kiri-fog"><MoodIcon value={item.entry?.emoji || '✨'} className="w-5 h-5" /></span>
                        <span className="min-w-0 flex-1 block">
                          <span className="block text-xs text-kiri-lilac">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ja-JP') : '記録'}
                          </span>
                          <span className="block text-sm text-white truncate">{item.entry?.event || '記録なし'}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="この記録を削除"
                        onClick={() => setHistory(deleteHistoryItem(window.localStorage, item.id))}
                        className="text-kiri-lilac hover:text-white px-2.5 rounded-r-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-kiri-lilac/80 mt-2">タップすると当時のKiriの読み解きを読み返せます。記録はこの端末内にのみ保存されます。</p>
              </div>
            )}

            <div className="bg-white/10 rounded-xl p-4 mb-6 border border-kiri-lilac/30">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-kiri-gold">バックアップ</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={exportBackup}
                    className="flex items-center gap-1 text-xs text-kiri-lilac hover:text-white"
                  >
                    <Download className="w-4 h-4" />書き出す
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-kiri-lilac hover:text-white"
                  >
                    <Upload className="w-4 h-4" />読み込む
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={importBackup}
                    className="hidden"
                  />
                </div>
              </div>
              <p className="text-[11px] text-kiri-lilac/80 mt-2">記録・プロフィール・会話をJSONファイルとして保存/復元できます。読み込みは既存の記録を消しません。</p>
              {backupNotice && (
                <p className={`text-xs mt-1 ${backupNotice.type === 'error' ? 'text-kiri-danger' : 'text-kiri-gold'}`}>{backupNotice.text}</p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">ニックネーム（任意）</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="例: さくら、太郎、ミオ"
                  className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac placeholder-kiri-lilac/50"
                />
                <p className="text-xs text-kiri-lilac mt-1">Kiriがあなたに語りかける時に使います</p>
              </div>

              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">生年月日</label>
                <div className="grid grid-cols-[1.25fr_1fr_1fr] gap-2">
                  <select
                    aria-label="生まれた年"
                    value={birthDate.split('-')[0] || ''}
                    onChange={(e) => setBirthPart('year', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
                  >
                    <option value="">年</option>
                    {Array.from({ length: new Date().getFullYear() - 1899 }, (_, index) => new Date().getFullYear() - index).map((year) => (
                      <option key={year} value={year}>{year}年</option>
                    ))}
                  </select>
                  <select
                    aria-label="生まれた月"
                    value={birthDate.split('-')[1] || ''}
                    onChange={(e) => setBirthPart('month', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
                  >
                    <option value="">月</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <option key={month} value={String(month).padStart(2, '0')}>{month}月</option>
                    ))}
                  </select>
                  <select
                    aria-label="生まれた日"
                    value={birthDate.split('-')[2] || ''}
                    onChange={(e) => setBirthPart('day', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
                  >
                    <option value="">日</option>
                    {Array.from({ length: daysInSelectedMonth }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={String(day).padStart(2, '0')}>{day}日</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-kiri-lilac mt-1">年・月・日を順番に選んでください</p>
              </div>

              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">出生時刻（任意）</label>
                <input
                  type="time"
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
                />
                <p className="text-xs text-kiri-lilac mt-1">時運分析に使います（未入力は12:00で概算）</p>
              </div>

              <div>
                <label className="block text-white text-sm mb-1.5 font-medium">性別（任意）</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
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
                disabled={!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)}
                className="w-full kiri-button py-3 rounded-xl font-bold text-sm hover:scale-[1.01] active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                はじめる
              </button>
            </div>

            <div className="flex items-center justify-center gap-4 mt-5 text-[11px] text-kiri-lilac/80">
              <Link href="/privacy" className="hover:text-white">プライバシー</Link>
              <Link href="/terms" className="hover:text-white">利用規約</Link>
              <Link href="/support" className="hover:text-white">サポート</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 'input') {
    return (
      <>
        <WhiteoutTransition />
        <ErrorBanner />
        <div className="min-h-screen kiri-shell p-4 pb-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-4 pt-2">
              <h1 className="font-display text-xl font-bold text-white mb-1">
                今日の心のエネルギー
              </h1>
              {nickname && <p className="text-kiri-gold text-sm font-medium">{nickname}さん</p>}
              <p className="text-kiri-lilac text-xs">{new Date().toLocaleDateString('ja-JP')}</p>
            </div>

            <div className="space-y-3">
              <div className="kiri-card rounded-xl p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-white text-sm mb-2 font-medium text-center">今日の気分を選んでください</label>
                    <div className="flex flex-wrap gap-2 justify-center" role="group" aria-label="今日の気分">
                      {emojis.map(e => (
                        <button
                          key={e}
                          type="button"
                          aria-label={`気分: ${e}`}
                          onClick={() => setEntry({...entry, emoji: e})}
                          className={`p-2.5 rounded-lg transition-all text-kiri-fog ${entry.emoji === e ? 'bg-kiri-lilac/50 text-kiri-gold scale-110 ring-1 ring-kiri-gold/70' : 'bg-white/10 hover:bg-white/20'} active:scale-95`}
                        >
                          <MoodIcon value={e} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-white text-sm mb-2 font-medium">記録する</label>
                    <p className="text-xs text-kiri-lilac mb-2">今日の予定や出来事をあなたの言葉で自由に記入して</p>
                    <textarea
                      value={entry.event}
                      onChange={(e) => setEntry({...entry, event: e.target.value})}
                      placeholder={placeholders.event}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac h-32 resize-none placeholder-kiri-lilac/70"
                    />
                  </div>

                  <div>
                    <label className="block text-white text-sm mb-2 font-medium">ひらめき・直感的な一言</label>
                    <input
                      type="text"
                      value={entry.intuition}
                      onChange={(e) => setEntry({...entry, intuition: e.target.value})}
                      placeholder={placeholders.intuition}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/20 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac placeholder-kiri-lilac/70"
                    />
                  </div>

                  <button
                    onClick={analyze}
                    disabled={!entry.event || loading}
                    className="w-full kiri-button py-3 rounded-xl font-bold hover:scale-[1.01] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
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
                      'Kiriに読み解いてもらう'
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

  // Kiriの読み解き画面（ローディング）
  if (step === 'loading') {
    return (
      <>
        <WhiteoutTransition />
        <ErrorBanner />
        <div className="min-h-screen kiri-shell p-4 flex items-center justify-center relative overflow-hidden">
          {/* 霧の谷: 静かに漂う光 */}
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="kiri-fog-orb w-80 h-80 top-[12%] left-[8%] bg-kiri-lilac" style={{'--drift': '52s', '--breathe': '9s', '--fog-min': 0.14, '--fog-max': 0.3}} />
            <div className="kiri-fog-orb w-96 h-96 top-[38%] right-[-8%] bg-kiri-gold" style={{'--drift': '64s', '--breathe': '12s', '--delay': '-21s', '--fog-min': 0.08, '--fog-max': 0.2}} />
            <div className="kiri-fog-orb w-72 h-72 bottom-[8%] left-[22%] bg-kiri-rain" style={{'--drift': '58s', '--breathe': '10s', '--delay': '-37s', '--fog-min': 0.1, '--fog-max': 0.22}} />
          </div>

          <div className="relative z-10 text-center kiri-rise">
            {/* 中央の灯り: ゆっくり息をする */}
            <div className="relative mx-auto mb-10 h-28 w-28" aria-hidden="true">
              <div className="absolute inset-0 rounded-full bg-kiri-gold blur-2xl kiri-ember" style={{'--breathe': '5s', '--fog-min': 0.3, '--fog-max': 0.7}} />
              <div className="absolute inset-6 rounded-full bg-kiri-fog blur-md kiri-ember" style={{'--breathe': '5s', '--delay': '-2.5s', '--fog-min': 0.45, '--fog-max': 0.85}} />
            </div>

            <h2 className="font-display text-2xl font-bold text-white mb-3">Kiriが読み解いています</h2>
            <p className="text-kiri-lilac text-sm mb-8">あなたの心のエネルギーを感じ取っています</p>

            <div className="flex justify-center gap-2" aria-hidden="true">
              <div className="w-1.5 h-1.5 bg-kiri-gold rounded-full kiri-ember" style={{'--breathe': '2.4s', '--fog-min': 0.2, '--fog-max': 0.9}} />
              <div className="w-1.5 h-1.5 bg-kiri-gold rounded-full kiri-ember" style={{'--breathe': '2.4s', '--delay': '-1.6s', '--fog-min': 0.2, '--fog-max': 0.9}} />
              <div className="w-1.5 h-1.5 bg-kiri-gold rounded-full kiri-ember" style={{'--breathe': '2.4s', '--delay': '-0.8s', '--fog-min': 0.2, '--fog-max': 0.9}} />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 'result') {
    return (
      <>
        <WhiteoutTransition />
        <ErrorBanner />
        {showChat && (
          <KiriChatPanel
            userProfile={{ nickname, birthDate, birthTime, gender }}
            entry={entry}
            result={result}
            onClose={() => setShowChat(false)}
          />
        )}
        <InfoPopup 
          show={showBioInfo} 
          onClose={() => setShowBioInfo(false)}
          title="バイオリズムとは？"
        >
          <p>バイオリズムは、人間の身体・感情・知性の状態が一定の周期で変動するという理論です。</p>
          <div className="space-y-2 mt-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-leaf">身体（23日周期）</p>
              <p className="text-xs mt-1">体力、持久力、免疫力などの身体的な状態</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-rain">感情（28日周期）</p>
              <p className="text-xs mt-1">気分、感受性、創造力などの精神的な状態</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-lilac">知性（33日周期）</p>
              <p className="text-xs mt-1">思考力、判断力、記憶力などの知的な状態</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-kiri-lilac">※本アプリでは生年月日から計算し、参考情報として提示しています。</p>
        </InfoPopup>

        <InfoPopup 
          show={showSajuInfo} 
          onClose={() => setShowSajuInfo(false)}
          title="四柱推命とは？"
        >
          <p>四柱推命は、中国発祥の占術で、生年月日時から人の運命や性格を読み解く東洋占星術です。</p>
          <div className="space-y-2 mt-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-gold">あなたの本命（生まれた時）</p>
              <p className="text-xs mt-1">年柱・月柱・日柱・時柱の4つの柱から、あなたの本質を表します</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-gold">日運・時運（今この瞬間の運勢）</p>
              <p className="text-xs mt-1">日運は毎日変わり、時運は2時間ごとに変わります。このアプリでは特にこの2つを重視しています</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-rain">月運・年運・大運（背景の流れ）</p>
              <p className="text-xs mt-1">月運は今月、年運は今年、大運は10年周期の大きな流れを示します（参考情報）</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-kiri-lilac">※本アプリでは lunar-javascript ライブラリを使用して算出しています。</p>
        </InfoPopup>

        <InfoPopup 
          show={showThemeInfo} 
          onClose={() => setShowThemeInfo(false)}
          title="テーマ別運勢の算出方法"
        >
          <p>このスコアは、以下を総合的に判断しています。</p>
          <div className="space-y-2 mt-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-gold">四柱推命</p>
              <p className="text-xs mt-1">生まれた日と今日の五行の相性（主要因）</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-rain">バイオリズム</p>
              <p className="text-xs mt-1">身体・感情・知性の周期的な波（主要因）</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="font-bold text-kiri-rose">今日の気分</p>
              <p className="text-xs mt-1">気分の絵文字から読み取った雰囲気（微調整）</p>
            </div>
            {result.saju?.birth?.hour && (
              <div className="bg-white/10 p-3 rounded-lg">
                <p className="font-bold text-kiri-lilac">時柱の相性</p>
                <p className="text-xs mt-1">出生時刻による精密化</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-kiri-lilac">※これらをKiriの直感で組み合わせています。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.color} 
          onClose={() => setShowHintInfo({...showHintInfo, color: false})}
          title="今日の色について"
        >
          <p>この色は、四柱推命の五行論と色彩心理学から導いています。</p>
          <p className="mt-2">五行（木火土金水）にはそれぞれ対応する色があり、今日の運勢（日運）の五行とバイオリズムを組み合わせて、Kiriがイメージした色をお伝えしています。</p>
          <p className="mt-2 text-kiri-lilac text-xs">感覚的なイメージをKiriからのヒントとして受け取ってください。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.number} 
          onClose={() => setShowHintInfo({...showHintInfo, number: false})}
          title="今日の数字について"
        >
          <p>この数字は、干支の数理とバイオリズムの周期から導いています。</p>
          <p className="mt-2">十二支にはそれぞれ数字が割り当てられていて、今日の運勢とあなたのバイオリズムから、今日のペースに合いそうな数字をKiriが選んでいます。</p>
          <p className="mt-2 text-kiri-lilac text-xs">迷った時に、ふと思い出してもらえたら、助けになるかもしてません。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.direction} 
          onClose={() => setShowHintInfo({...showHintInfo, direction: false})}
          title="今日の方角について"
        >
          <p>この方角は、五行の方位論（風水）から導いています。</p>
          <p className="mt-2">五行（木火土金水）にはそれぞれ方角があり、今日の運勢の五行とバイオリズムから、Kiriが感じた方向をお伝えしています。</p>
          <p className="mt-2 text-kiri-lilac text-xs">気にしなくても大丈夫。気が向いたときだけ、Kiriと視線を合わせてみてください。</p>
        </InfoPopup>

        <InfoPopup 
          show={showHintInfo.distance} 
          onClose={() => setShowHintInfo({...showHintInfo, distance: false})}
          title="今日の距離感について"
        >
          <p>この距離感は、今日のテーマ別運勢とバイオリズムから導いています。</p>
          <p className="mt-2">あなたの今日のエネルギー状態を、人との距離感やものとの関わり方に例えてみました。</p>
          <p className="mt-2 text-kiri-lilac text-xs">正解はないので、心地よい距離を自分で選んでくださいね。</p>
        </InfoPopup>

        <InfoPopup
          show={showPremiumInfo}
          onClose={() => setShowPremiumInfo(false)}
          title="Kiriとの対話（プレミアム）"
        >
          <p>今日の占い結果と過去の記録をもとに、Kiriへ続けて相談できる機能です。</p>
          <div className="bg-white/10 p-3 rounded-lg space-y-1.5">
            <p>・今日の無料占い結果：このまま利用できます</p>
            <p>・端末内の履歴保存：この端末で利用できます</p>
            <p>・Kiriとの対話：有料機能として準備中です</p>
          </div>
          <p className="text-xs text-kiri-lilac">購入機能はまだ接続されていません。App Store公開前にStoreKitまたはRevenueCatとサーバー側の購読確認を追加します。</p>
        </InfoPopup>

        <div className="min-h-screen kiri-shell p-4 pb-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-4 pt-2">
              <h1 className="font-display text-xl font-bold text-white mb-1">
                今日のメッセージ
              </h1>
              {nickname && <p className="text-kiri-gold text-sm font-medium">{nickname}さんへ</p>}
            </div>

            <div className="space-y-3">

              {/* 1. バイオリズム */}
              {/* バイオリズムセクション */}
              <CollapsibleSection
                  title="バイオリズム"
                isExpanded={expandedSections.biorhythm}
                onToggle={() => setExpandedSections({...expandedSections, biorhythm: !expandedSections.biorhythm})}
                onInfoClick={() => setShowBioInfo(true)}
              >
                <div className="space-y-2">
                  <BiorhythmBar label="身体" value={result.bio.p} color="text-kiri-leaf" barColor="bg-kiri-leaf" icon={<Zap className="w-6 h-6" />} />
                  <BiorhythmBar label="感情" value={result.bio.e} color="text-kiri-rain" barColor="bg-kiri-rain" icon={<Heart className="w-6 h-6" />} />
                  <BiorhythmBar label="知性" value={result.bio.i} color="text-kiri-lilac" barColor="bg-kiri-lilac" icon={<Sparkles className="w-6 h-6" />} />
                </div>
              </CollapsibleSection>

              {/* 2. 四柱推命 */}
              {/* 四柱推命セクション */}
              {result.saju && (
                <CollapsibleSection
                  title="四柱推命"
                  badge="日運・月運・年運"
                  isExpanded={expandedSections.saju}
                  onToggle={() => setExpandedSections({...expandedSections, saju: !expandedSections.saju})}
                  onInfoClick={() => setShowSajuInfo(true)}
                >
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-xs font-bold text-kiri-lilac mb-1">あなたの本命</h3>
                      <p className="text-xs text-kiri-lilac mb-2">自分自身（本質・性格・運勢の根幹）を表す最も重要な要素</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-kiri-lilac">年柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.year}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-kiri-lilac">月柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.month}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-kiri-lilac">日柱（最重要）</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.day}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg">
                          <p className="text-xs text-kiri-lilac">時柱</p>
                          <p className="font-bold text-sm text-white">{result.saju.birth.hour || '未入力'}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-kiri-gold mb-2">今日の運勢</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-kiri-gold/20 p-2 rounded-lg">
                          <p className="text-xs text-kiri-gold">日運（今日）</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.day}</p>
                          {result.saju.today.dayDescription && (
                            <p className="text-xs text-kiri-gold mt-1">{result.saju.today.dayDescription}</p>
                          )}
                        </div>
                        {result.saju.today.hour && (
                          <div className="bg-kiri-gold/20 p-2 rounded-lg">
                            <p className="text-xs text-kiri-gold">時運（現在）</p>
                            <p className="font-bold text-sm text-white">{result.saju.today.hour}</p>
                            {result.saju.today.hourDescription && (
                              <p className="text-xs text-kiri-gold mt-1">{result.saju.today.hourDescription}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-kiri-rain mb-2">月運・年運</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-kiri-rain/20 p-2 rounded-lg">
                          <p className="text-xs text-kiri-rain">月運（今月）</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.month}</p>
                        </div>
                        <div className="bg-kiri-rain/20 p-2 rounded-lg">
                          <p className="text-xs text-kiri-rain">年運（今年）</p>
                          <p className="font-bold text-sm text-white">{result.saju.today.year}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-kiri-rain mb-2">大運（中長期）</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {result.saju.taiun && (
                          <div className="bg-kiri-rain/20 p-2 rounded-lg">
                            <p className="text-xs text-kiri-rain">現在の大運</p>
                            <p className="font-bold text-sm text-white">{result.saju.taiun.pillar}</p>
                            <p className="text-xs text-kiri-rain mt-0.5">{result.saju.taiun.age}歳〜</p>
                          </div>
                        )}
                        {result.saju.note && (
                          <div className="bg-kiri-rain/20 p-2 rounded-lg flex items-center">
                            <p className="text-xs text-kiri-rain">
                              {result.saju.note}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              {/* テーマ別運勢セクション - メインメッセージの前に配置 */}
              {result.themeScores && (
                <CollapsibleSection
                  title="今日のテーマ別運勢"
                  isExpanded={expandedSections.themes}
                  onToggle={() => setExpandedSections({...expandedSections, themes: !expandedSections.themes})}
                  onInfoClick={() => setShowThemeInfo(true)}
                >
                  <div className="space-y-2">
                    <ThemeBar icon={<Heart className="w-5 h-5" />} label="恋愛・人間関係" value={result.themeScores.love} baseColor="bg-kiri-rose" />
                    <ThemeBar icon={<Star className="w-5 h-5" />} label="お金・判断感覚" value={result.themeScores.money} baseColor="bg-kiri-gold" />
                    <ThemeBar icon={<Zap className="w-5 h-5" />} label="仕事・学び" value={result.themeScores.work} baseColor="bg-kiri-rain" />
                    <ThemeBar icon={<Heart className="w-5 h-5" />} label="健康・活力" value={result.themeScores.health} baseColor="bg-kiri-leaf" />
                  </div>
                </CollapsibleSection>
              )}

              {/* 今日のヒントセクション */}
              {result.todayHints && (
                <CollapsibleSection
                  title="今日のヒント"
                  badge="色・数字・方角・距離感"
                  isExpanded={expandedSections.hints}
                  onToggle={() => setExpandedSections({...expandedSections, hints: !expandedSections.hints})}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <HintItem
                      icon={<CircleHelp className="w-4 h-4" />}
                      title="色"
                      value={result.todayHints.color.value}
                      message={result.todayHints.color.message}
                      bgColor={result.todayHints.color.bgColor}
                      textColor={result.todayHints.color.textColor}
                      onInfoClick={() => setShowHintInfo({...showHintInfo, color: true})}
                    />
                    
                    <HintItem
                      icon={<Star className="w-4 h-4" />}
                      title="数字"
                      value={result.todayHints.number.value}
                      message={result.todayHints.number.message}
                      bgColor="bg-kiri-lilac"
                      textColor="text-kiri-lilac"
                      onInfoClick={() => setShowHintInfo({...showHintInfo, number: true})}
                    />
                    
                    <HintItem
                      icon={<Zap className="w-4 h-4" />}
                      title="方角"
                      value={result.todayHints.direction.value}
                      message={result.todayHints.direction.message}
                      bgColor="bg-kiri-rain"
                      textColor="text-kiri-rain"
                      onInfoClick={() => setShowHintInfo({...showHintInfo, direction: true})}
                    />
                    
                    <HintItem
                      icon={<Heart className="w-4 h-4" />}
                      title="距離感"
                      value={result.todayHints.distance.value}
                      message={result.todayHints.distance.message}
                      bgColor="bg-kiri-rose"
                      textColor="text-kiri-rose"
                      onInfoClick={() => setShowHintInfo({...showHintInfo, distance: true})}
                    />
                  </div>
                </CollapsibleSection>
              )}

              {/* メインメッセージ */}
              <div className="kiri-card-strong rounded-xl p-4 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-kiri-fog">{result.time === '朝' ? <Sun className="w-8 h-8" /> : result.time === '昼' ? <Sparkles className="w-8 h-8" /> : <Moon className="w-8 h-8" />}</span>
                  <h2 className="font-display text-lg font-bold drop-shadow-md">Kiriが映すあなたのエネルギー</h2>
                </div>
                <div className="bg-black/15 p-3 rounded-lg backdrop-blur-sm">
                  <p className="kiri-voice text-sm whitespace-pre-line text-white drop-shadow-sm">
                    {renderHighlightedText(result.deepMessage)}
                  </p>
                </div>
              </div>

              {result.innerMessage && (
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-kiri-lilac/30">
                  <h2 className="text-base font-bold text-kiri-lilac mb-2">あなたの直感から読み取ったメッセージ</h2>
                  <p className="kiri-voice text-white text-sm">
                    {renderHighlightedText(result.innerMessage)}
                  </p>
                </div>
              )}

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-kiri-lilac/30">
                <h2 className="text-base font-bold text-kiri-leaf mb-2">Kiriからのアドバイス</h2>
                <p className="kiri-voice text-white text-sm whitespace-pre-line">
                  {renderHighlightedText(result.actionAdvice)}
                </p>
              </div>


              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-kiri-lilac/30">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-kiri-rain">今日の記録</h2>
                  <p className="text-xs text-kiri-lilac">
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
                      <span className="text-kiri-fog"><MoodIcon value={entry.emoji} className="w-6 h-6" /></span>
                      <span className="font-bold text-sm text-white">今日の気分</span>
                    </div>
                  </div>
                  <div className="bg-white/10 p-3 rounded-lg">
                    <p className="font-bold text-sm mb-1 text-white">{entry.type === 'past' ? '出来事' : '予定'}</p>
                    <p className="text-sm text-kiri-lilac">{entry.event}</p>
                  </div>
                  {entry.intuition && (
                    <div className="bg-white/10 p-3 rounded-lg">
                      <p className="font-bold text-sm mb-1 text-white">ひらめき・直感</p>
                      <p className="text-sm text-kiri-lilac">{entry.intuition}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="kiri-card-strong rounded-xl p-4">
                  <div className="flex items-start gap-3">
                  <Lock className="text-kiri-gold w-6 h-6 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-kiri-gold mb-1">プレミアム版</h3>
                    <p className="text-xs text-kiri-gold/90 mb-2">今日の占い結果は無料。Kiriとの継続チャットは有料オプションです。</p>
                    <ul className="text-white space-y-0.5 mb-2 text-xs">
                      <li>Kiriとの対話無制限</li>
                      <li>Kiriとの会話ログの読み返し</li>
                      <li>あなた専用のパターン分析</li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => setShowPremiumInfo(true)}
                      className="kiri-button px-4 py-2 rounded-lg text-sm font-bold hover:scale-[1.01] active:scale-[0.98] transition-transform"
                    >
                      詳細を見る
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowChat(true)}
                      className="mt-2 w-full rounded-lg border border-kiri-gold/40 px-3 py-2 text-xs font-bold text-kiri-gold hover:bg-white/10 transition-colors"
                    >
                      開発プレビューでKiriに聞く
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
                  今日の記録をクリアする
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
