'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useReducer, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Sparkles, Lock, AlertCircle, X, ChevronRight, ChevronDown, ChevronUp, HelpCircle, Heart, Smile, Frown, Meh, Angry, Star, Sun, Moon, Cloud, Zap, CloudFog, Palette, Download, Upload, Settings, History, Laugh, Leaf, CloudRain, Droplet, Music, ShieldOff, Timer, EyeOff } from 'lucide-react';
import { deleteHistoryItem, loadHistory, saveHistory, toHistoryRecord, loadProfile, saveProfile, initialStepFor, formatBirthDateJa, isSameReading } from '@/lib/history';
import { buildBackup, backupFileName, parseBackup, applyBackup } from '@/lib/backup';
import KiriChatPanel from '@/components/KiriChatPanel';
import PaywallSheet from '@/components/PaywallSheet';
import { loadChatHistory } from '@/lib/chatHistory';
import { clearAllRecords, hasAnyRecords } from '@/lib/deleteAll';
import {
  APPLE_SUBSCRIPTIONS_URL,
  configurePurchases,
  getAppUserId,
  getChatOffering,
  getEntitlementState,
  isIapEnabled,
  onEntitlementChange,
  purchaseChat,
  restorePurchases,
} from '@/lib/purchases';
import { KIRI_TALK_NAME, entryCardView, purchaseNotice, restoreNotice, talkSettingsView, talkStateAfterPurchase } from '@/lib/kiriTalk';
import SupportCard from '@/components/SupportCard';
import { entryNeedsSupport } from '@/lib/kiriSafety';
import { apiUrl } from '@/lib/apiUrl';
import { getStorage, initStorage } from '@/lib/storage';
import { exportBackupNative } from '@/lib/backupShare';
import { applyStatusBar, armSplashFallback, haptic, hideSplash, isNativePlatform } from '@/lib/native';
import { hasConsent, recordConsent, revokeConsent } from '@/lib/consent';
import ConsentModal from '@/components/ConsentModal';
import { browserSessionStorage, saveEntryDraft, takeEntryDraft } from '@/lib/entryDraft';
import { DEFAULT_MOOD, MOODS, findMood } from '@/lib/moods';
import { describeAnalyzeFailure } from '@/lib/analyzeError';
import { DEFAULT_LOCK_SETTINGS, initialLockState, reduceLock, saveLockSettings } from '@/lib/appLock';
import { createLockController } from '@/lib/lockController';
import { commitBoot, prepareLockBoot } from '@/lib/lockBoot';
import { authenticateForLock, checkLockAvailability } from '@/lib/lockAuth';
import { setPrivacyScreen } from '@/lib/privacyScreen';
import { subscribeAppVisibility } from '@/lib/appState';
import {
  AUTO_LOCK_OPTIONS,
  LOCK_AUTH_REASONS,
  LOCK_SETTINGS_NOTE,
  lockScreenView,
  lockToggleDescription,
  privacyScreenWanted,
  shouldOfferLockSettings,
} from '@/lib/lockUi';
import LockScreen from '@/components/LockScreen';
import { analysisCacheKey, clearCachedAnalyses, loadCachedAnalysis, saveCachedAnalysis } from '@/lib/analysisCache';

// ビルド時定数（next.config が '0'/'1' を埋め込む）。どちらも '0' なら入口・購入画面・チャット欄はバンドルから消える（D-24）。
// IAP_BUILD: 購入「Kiriと話す」あり（iOS で RevenueCat の公開キーあり、または next dev / ios:build --dev のモック）。Web 本番は常に '0'。
// CHAT_DEV_PREVIEW: 開発用のバイパス（購入なしでチャットを開く。サーバーも KIRI_CHAT_PREVIEW=1 の開発環境だけが通す）。
const IAP_BUILD = process.env.NEXT_PUBLIC_KIRI_IAP === '1';
const CHAT_DEV_PREVIEW = process.env.NEXT_PUBLIC_KIRI_CHAT_PREVIEW === '1';
const CHAT_UI_BUILD = IAP_BUILD || CHAT_DEV_PREVIEW;
const TALK_NOT_ENTITLED = { entitled: false, expiresAt: null, willRenew: false, isTrial: false, managementUrl: null };
// エラーの帯は画面上部（設定ボタン・見出しの上）に重なるので、読み終えたころに自動で閉じる。
const ERROR_BANNER_AUTO_DISMISS_MS = 10000;
// 読み解きの後の霧の画面切り替え: 覆うのにかかる時間・覆ったまま待つ時間（そのあと同じ時間で晴れる）
const FOG_FADE_MS = 900;
const FOG_HOLD_MS = 400;

export default function SpiritualDiary() {
  // 'boot' はプロフィール復元前。基本情報画面が一瞬見えないよう背景だけ描く。
  const [step, setStep] = useState('boot');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [gender, setGender] = useState('');
  const [nickname, setNickname] = useState('');

  const [entry, setEntry] = useState({
    emoji: DEFAULT_MOOD,
    mood: '',
    type: 'past',
    event: '',
    intuition: ''
  });
  const [placeholders, setPlaceholders] = useState({
    mood: '例: 穏やかで少し眠い',
    event: '例: 朝のコーヒーが美味しくて気分が上がった。今日までの仕事も無事終わらせることができた。\nこれから買い物に行って、晩酌しながらドラマの続きを観る予定。',
    intuition: '例: 大切な人との繋がりを感じる'
  });
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [openedRecord, setOpenedRecord] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryList, setShowHistoryList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // null | { type: 'one', id } | { type: 'all' }
  const [deleteNotice, setDeleteNotice] = useState(null);
  const [backupNotice, setBackupNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // バイオリズムとテーマ別運勢は詳細を見たい人だけ開く（結果が長く、Kiriの読み解きまで進めないように見えるため。2026-10-10）
  const [expandedSections, setExpandedSections] = useState({
    biorhythm: false,
    saju: true,
    themes: false,
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
  const [showChat, setShowChat] = useState(false);
  // 「Kiriと話す」（D-28/D-30）。iapActive は実行時の判定（iOS アプリ＋公開キー、またはモック）。
  const [iapActive, setIapActive] = useState(false);
  const [talk, setTalk] = useState(TALK_NOT_ENTITLED);
  // undefined = 読み込み中・未取得 / null = 取れなかった / { priceString, productId, trial }
  const [talkOffering, setTalkOffering] = useState(undefined);
  const talkOfferingRequested = useRef(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [talkNotice, setTalkNotice] = useState(null);
  const [talkBusy, setTalkBusy] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  // 同意せずに閉じたとき、記録に危機の言葉があれば送信せずに相談窓口カードを出す（D-15）。
  const [declinedSupport, setDeclinedSupport] = useState(false);
  const declinedSupportRef = useRef(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  // 復元が反映されるまで保存しない（復元前の空の値で端末のプロフィールを上書きしないため）。
  const [profileHydrated, setProfileHydrated] = useState(false);
  const importInputRef = useRef(null);

  // アプリのロック（iOS のみ。D-25）。Web では lockNative が false のままで、ロックの UI も処理も一切動かない。
  const [lockNative, setLockNative] = useState(false);
  const [lockState, dispatchLock] = useReducer(reduceLock, initialLockState);
  const [lockSettings, setLockSettings] = useState(DEFAULT_LOCK_SETTINGS);
  const [lockAvailability, setLockAvailability] = useState(null);
  const [lockNotice, setLockNotice] = useState(null);
  const [lockBusy, setLockBusy] = useState(false);
  // 閉じたフェイルオープンの帯の回数。新しくフェイルオープンしたら（failOpenSeq が進んだら）もう一度出す（監査 P2-7）。
  const [failOpenDismissedSeq, setFailOpenDismissedSeq] = useState(0);

  // OS 認証・再認証・オン/オフの結線は lockController.js（テスト済み）。状態は reduceLock に dispatch する。
  // 切り替え画面の目隠しは OS 認証の間も付けたまま（@capacitor/privacy-screen 2.0.1 の不具合はパッチで直した。D-25）。
  // だから Face ID の画面のまま背景へ回っても、切り替え画面には記録が写らない。
  const lockSettingsRef = useRef(lockSettings);
  lockSettingsRef.current = lockSettings;
  const lockStateRef = useRef(lockState);
  lockStateRef.current = lockState;
  const [lockController] = useState(() => createLockController({
    dispatch: dispatchLock,
    getLockState: () => lockStateRef.current,
    getSettings: () => lockSettingsRef.current,
    authenticate: authenticateForLock,
    setPrivacyScreen,
  }));
  const unlockApp = (options) => lockController.unlock(options);

  const updateLockSettings = (next) => {
    const saved = saveLockSettings(getStorage(), next);
    setLockSettings(saved);
    dispatchLock({ type: 'configure', settings: saved });
    return saved;
  };

  const toggleLock = async () => {
    if (lockBusy) return;
    setLockBusy(true);
    setLockNotice(null);
    try {
      const { change, notice } = await lockController.toggleLock(lockSettings.enabled);
      if (change === 'enable') {
        updateLockSettings({ enabled: true });
      } else if (change === 'disable') {
        updateLockSettings({ enabled: false });
      }
      setLockNotice(notice);
    } finally {
      setLockBusy(false);
    }
  };

  const exportBackup = async () => {
    // ロックがオンなら、端末の外へ記録を出す前に本人か確かめる（Ruling 11。Web ではロックが無いので素通し）。
    const { proceed, notice } = await lockController.confirmWithLock(LOCK_AUTH_REASONS.export);
    if (!proceed) {
      if (notice) setBackupNotice({ type: 'error', text: notice });
      return;
    }
    const json = JSON.stringify(buildBackup(getStorage()), null, 2);
    if (isNativePlatform()) {
      // iOS アプリ: シェアシートで"ファイル"に保存・AirDrop など（Ruling 6）。閉じただけなら書き出し済みと言わない。
      try {
        const { shared } = await exportBackupNative({ json, fileName: backupFileName(), title: 'Kiriのバックアップ' });
        setBackupNotice(shared
          ? { type: 'ok', text: 'バックアップを書き出しました' }
          : { type: 'ok', text: '書き出しを取りやめました' });
      } catch (exportError) {
        console.error('[kiri-backup]', exportError?.message);
        setBackupNotice({ type: 'error', text: 'バックアップを書き出せませんでした' });
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
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
      const summary = applyBackup(getStorage(), parseBackup(await file.text()));
      setHistory(loadHistory(getStorage()));
      if (summary.profileApplied) {
        const restored = loadProfile(getStorage());
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

  const moodIconMap = { Laugh, Heart, Leaf, Sparkles, Music, Sun, Moon, CloudRain, Droplet, Angry, CloudFog, Meh, Smile, Star, Frown, Cloud };

  const MoodIcon = ({ value, className = 'w-7 h-7' }) => {
    const Icon = moodIconMap[findMood(value)?.icon] || Sparkles;
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
    let cancelled = false;
    // iOS: スプラッシュは復元の後に隠す。例外や停止でも残さないよう、タイマーの保険も張る（Ruling 7）。
    armSplashFallback();
    applyStatusBar();
    (async () => {
      try {
        await initStorage();
      } catch (storageError) {
        console.error('[kiri-storage]', storageError?.message);
      }
      if (cancelled) return;
      // アプリのロック（iOS のみ）: 設定を読み、オンなら端末の認証方法も先に調べる（スプラッシュの裏。監査 P2-7）。
      // 例外が出ても起動を止めない（ロックなしの計画で進み、後の effect が調べ直す。再監査 P2-B）。
      const lockPlan = await prepareLockBoot({
        native: isNativePlatform(),
        storage: getStorage(),
        checkAvailability: checkLockAvailability,
      }).catch((lockError) => {
        console.error('[kiri-lock] boot', lockError?.message);
        return null;
      });
      if (cancelled) return;
      try {
        const storage = getStorage();
        const storedProfile = loadProfile(storage);
        if (storedProfile) {
          setNickname(storedProfile.nickname || '');
          setBirthDate(storedProfile.birthDate || '');
          setBirthTime(storedProfile.birthTime || '');
          setGender(storedProfile.gender || '');
        }
        setHistory(loadHistory(storage));
        setAiConsent(hasConsent(storage));
        const initialStep = initialStepFor(storedProfile);
        // 同意画面からポリシーを読みに行って戻ったときは、書きかけの記録を戻す。
        const draft = takeEntryDraft(browserSessionStorage());
        if (draft && initialStep === 'input') setEntry((current) => ({ ...current, ...draft }));
        // ロックの判定を画面より先に、同じ同期処理の中で反映する（Ruling 6・8。ロック画面と復元した画面は同じ描画で出て、
        // スプラッシュはその後に隠れる）。順序は lockBoot.test.js で固定。
        commitBoot({
          lock: lockPlan,
          step: initialStep,
          apply: { setLockNative, setLockSettings, setLockAvailability, dispatchLock, setStep, setProfileHydrated },
        });
      } catch (hydrateError) {
        // 復元に失敗してもスプラッシュは残さない（通常は描画後の effect で隠す）。
        console.error('[kiri-storage]', hydrateError?.message);
        hideSplash();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 復元した画面が描画されてからスプラッシュを隠す（iOS。Web では何もしない）。
  useEffect(() => {
    if (profileHydrated) hideSplash();
  }, [profileHydrated]);

  // 端末が Face ID・パスコードに対応しているか（設定に「アプリのロック」を出すかの判断）。
  useEffect(() => {
    // 起動時に調べ済み（ロックがオンのとき）なら繰り返さない。
    if (!lockNative || lockAvailability) return undefined;
    let cancelled = false;
    checkLockAvailability().then((availability) => {
      if (cancelled) return;
      setLockAvailability(availability);
      // ロック中に端末の認証が使えないと分かったら、フェイルオープン（監査 P1-3・D-09）。
      dispatchLock({ type: 'availability', availability });
    });
    return () => {
      cancelled = true;
    };
  }, [lockNative, lockAvailability]);

  // 設定を開くたびに調べ直す。起動後に Face ID・パスコードを設定した人にも「アプリのロック」を出すため
  // （起動時の1回だけだと、未設定のときの結果が残り続ける）。
  useEffect(() => {
    if (!lockNative || !showSettings) return undefined;
    let cancelled = false;
    checkLockAvailability().then((availability) => {
      if (cancelled) return;
      setLockAvailability(availability);
      dispatchLock({ type: 'availability', availability });
    });
    return () => {
      cancelled = true;
    };
  }, [lockNative, showSettings]);

  // 切り替え画面の目隠しは、ロックがオン かつ「記録を隠す」がオンのときだけ（Ruling 5）。
  useEffect(() => {
    if (!lockNative) return;
    setPrivacyScreen(privacyScreenWanted(lockSettings));
  }, [lockNative, lockSettings]);

  // 背景にいた時間で自動ロック（Ruling 7）。ロックがオンの間だけ購読する。
  useEffect(() => {
    if (!lockNative || !lockState.enabled) return undefined;
    return subscribeAppVisibility({
      onHide: (now) => {
        lockController.notifyHide();
        // 「すぐに」は背景へ回った時点でロック画面を描く（復帰の最初のフレームに本文を残さない。監査 P1-2）。
        flushSync(() => dispatchLock({ type: 'hide', now }));
      },
      onShow: (now) => dispatchLock({ type: 'show', now }),
    });
  }, [lockNative, lockState.enabled, lockController]);

  // ロック画面では OS 認証を自動で始めない。先にロック画面を見せ、「Face IDでひらく」を押してもらう（2026-10-09 ひとみうさ決定）。

  useEffect(() => {
    if (profileHydrated) {
      saveProfile(getStorage(), { nickname, birthDate, birthTime, gender });
    }
  }, [profileHydrated, nickname, birthDate, birthTime, gender]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(null), ERROR_BANNER_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (declinedSupport) declinedSupportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [declinedSupport]);

  useEffect(() => {
    if (!deleteNotice) return undefined;
    const timer = setTimeout(() => setDeleteNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [deleteNotice]);

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

  // 初回の読み解き前に、第三者AIへの送信の同意を取る（5.1.2(i)）。
  const requestAnalyze = () => {
    haptic('analyze');
    if (!hasConsent(getStorage())) {
      setShowConsent(true);
      return;
    }
    analyze();
  };

  const acceptConsent = () => {
    recordConsent(getStorage());
    setAiConsent(true);
    setShowConsent(false);
    setDeclinedSupport(false);
    analyze();
  };

  // 同意しない（今はやめる・×・背景タップ）。何も送らない。判定は端末内だけで行い、ログにも残さない。
  const declineConsent = () => {
    setShowConsent(false);
    setDeclinedSupport(entryNeedsSupport(entry));
  };

  const withdrawConsent = () => {
    revokeConsent(getStorage());
    setAiConsent(false);
  };

  // 「Kiriと話す」: 起動時に RevenueCat を設定し、購読状態を読んで、変化（購入・更新・期限切れ）を受け取る。
  // AI 送信の同意（D-23）は購入の前提にしない（Ruling 7。同意はチャットの送信時に確かめる）。
  useEffect(() => {
    if (!IAP_BUILD || !isIapEnabled()) return undefined;
    let cancelled = false;
    setIapActive(true);
    const unsubscribe = onEntitlementChange((state) => {
      if (!cancelled) setTalk(state);
    });
    configurePurchases()
      .then(() => getEntitlementState())
      .then((state) => {
        if (!cancelled) setTalk(state);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // 購読が付いたら offering を読み直せるようにする（期限切れ後の入口カードは、トライアルなしの価格に。F-B7）。
  useEffect(() => {
    if (talk.entitled) talkOfferingRequested.current = false;
  }, [talk.entitled]);

  // 結果画面で未購読なら、入口カードの価格・トライアル表示のために offering を1回だけ読む。
  useEffect(() => {
    if (!IAP_BUILD || !iapActive || talk.entitled || step !== 'result' || talkOfferingRequested.current) return;
    talkOfferingRequested.current = true;
    getChatOffering().then(setTalkOffering);
  }, [iapActive, talk.entitled, step]);

  // 設定を開いたら購読状態を読み直す（次の更新日・解約の反映）。
  useEffect(() => {
    if (!IAP_BUILD || !iapActive || !showSettings) return undefined;
    let cancelled = false;
    getEntitlementState().then((state) => {
      if (!cancelled) setTalk(state);
    });
    return () => {
      cancelled = true;
    };
  }, [iapActive, showSettings]);

  // 設定はモーダルなので、開いたら中へフォーカスを移し、Tab は中で回し、Esc で閉じ、閉じたら元の場所へ戻す（見やすさテスト 2026-10-10）。
  useEffect(() => {
    if (!showSettings) return undefined;
    const opener = document.activeElement;
    const dialog = () => document.querySelector('[data-kiri-settings]');
    const focusables = () => Array.from(dialog()?.querySelectorAll('button, [href], input:not([type="hidden"]):not(.hidden), select, textarea, [tabindex]:not([tabindex="-1"])') || [])
      .filter((el) => !el.disabled && el.offsetParent !== null);
    focusables()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowSettings(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog()?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [showSettings]);

  // 開発用プレビュー（購入なし）では購読中と同じに扱う。それ以外は RevenueCat の状態。
  const devPreviewChat = CHAT_DEV_PREVIEW && !iapActive;
  const talkEntitled = devPreviewChat || talk.entitled;
  const talkAvailable = CHAT_UI_BUILD && (iapActive || CHAT_DEV_PREVIEW);

  const reloadTalkOffering = async () => {
    setTalkOffering(undefined);
    talkOfferingRequested.current = true;
    setTalkOffering(await getChatOffering());
  };

  // チャット欄は、権利が無ければ（未購読・解約後・開いている間に期限切れ）読むだけになる（D-28・F-B9）。
  const openChat = () => setShowChat(true);

  // 購入画面を開くたびに offering を読み直す（トライアル適格は購入・期限切れで変わる。F-B7）。
  const openPaywall = () => {
    setShowPaywall(true);
    reloadTalkOffering();
  };

  // 入口カードのボタン: 購読中ならチャット、未購読なら購入画面。
  const openTalk = () => {
    if (talkEntitled) openChat();
    else openPaywall();
  };

  // 購入・復元で権利が付いたら、購入画面を閉じてそのまま話せるようにする。
  // 読み直しが失敗しても購入の結果で上書きしない（F-B8）。
  const enterTalkAfterPurchase = async (outcome) => {
    setTalk(talkStateAfterPurchase(await getEntitlementState(), outcome));
    setShowPaywall(false);
    openChat();
  };

  const handlePurchase = async () => {
    const outcome = await purchaseChat();
    if (outcome.entitled) {
      await enterTalkAfterPurchase(outcome);
      return null;
    }
    return purchaseNotice(outcome);
  };

  const handlePaywallRestore = async () => {
    const outcome = await restorePurchases();
    if (outcome.entitled) {
      await enterTalkAfterPurchase(outcome);
      return null;
    }
    return restoreNotice(outcome);
  };

  // サーバーが「権利なし」（403 not_entitled）と返したら、購読状態を読み直す（期限切れなら読むだけに切り替わる。F-B9）。
  const refreshTalkState = async () => {
    if (!IAP_BUILD || !iapActive) return;
    setTalk(await getEntitlementState());
  };

  const handleSettingsRestore = async () => {
    if (talkBusy) return;
    setTalkBusy(true);
    setTalkNotice(null);
    try {
      const outcome = await restorePurchases();
      setTalk(talkStateAfterPurchase(await getEntitlementState(), outcome));
      setTalkNotice(restoreNotice(outcome));
    } finally {
      setTalkBusy(false);
    }
  };

  // App Store のサブスクリプション管理へ。iOS の Capacitor は window.open（新しいウインドウ）を
  // UIApplication.open に渡す（WebViewDelegationHandler の createWebViewWith）＝外部の Safari／App Store が開く。
  // タップの処理の中で同期的に呼ぶ（await をはさむとポップアップ扱いで止められることがある）。
  const manageSubscription = () => {
    window.open(talk.managementUrl || APPLE_SUBSCRIPTIONS_URL, '_blank', 'noopener,noreferrer');
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setStep('loading'); // ローディング画面に遷移

    try {
      const bio = calcBio(birthDate);
      const now = new Date();

      const userProfile = { birthDate, birthTime, gender, nickname };

      // 同じJST日・同じ入力なら端末内の前回結果を使い、APIを呼ばない（D-16, D-18）。
      // 成功した結果だけを保存する（寄り添いモードの結果も同日同入力なら同じ文を返す）。
      const cacheKey = await analysisCacheKey({ userProfile, biorhythm: bio, entry }, now);
      const cacheStorage = getStorage();
      const cached = loadCachedAnalysis(cacheStorage, cacheKey, now);
      let data;
      if (cached) {
        data = { success: true, data: cached };
      } else {
        const response = await fetch(apiUrl('/api/analyze'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userProfile,
            biorhythm: bio,
            entry: entry,
            timestamp: now.toISOString()
          })
        });

        // HTML のエラーページなど JSON でない応答は、ステータスだけで判定する。
        data = await response.json().catch(() => null);
        if (!data) data = { success: false, status: response.status };
        else data.status = response.status;
        if (data.success && data.data) {
          saveCachedAnalysis(cacheStorage, cacheKey, data.data, now);
        }
      }

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
        // 新しい読み解きでは、バイオリズムとテーマ別運勢を閉じた状態から始める（寄り添いモードで点数を開かない D-15 もこれで満たす）
        setExpandedSections((sections) => ({ ...sections, biorhythm: false, themes: false }));
        const record = toHistoryRecord({
          result: nextResult,
          entry,
          userProfile,
        });
        // 端末キャッシュの結果を見直しただけなら、同じ記録を履歴へ重ねない。
        const latest = loadHistory(getStorage())[0];
        if (!(cached && isSameReading(latest, record))) {
          setHistory(saveHistory(getStorage(), record));
        }
        
        // ホワイトアウト遷移
        // 霧が画面を覆いきってから結果へ切り替える（途中で切り替えると、薄くなった霧ごしに文字が見える）
        setIsTransitioning(true);
        setTimeout(() => {
          setStep('result');
          haptic('success');
          setTimeout(() => {
            setIsTransitioning(false);
          }, FOG_HOLD_MS);
        }, FOG_FADE_MS);
      } else {
        setStep('input'); // エラー時は入力画面に戻る
        setError(describeAnalyzeFailure({ status: data.status, code: data.code }));
      }
    } catch (error) {
      // fetch 自体の失敗（オフライン・CORS 拒否・DNS など）。例外の文言（"Load failed" 等）は出さない。
      console.warn('[kiri-analyze] request failed', error?.name);
      setStep('input'); // エラー時は入力画面に戻る
      setError(describeAnalyzeFailure({ network: true }));
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setStep(initialStepFor({ birthDate }));
    setEntry({emoji: DEFAULT_MOOD, mood: '', type: 'past', event: '', intuition: ''});
    setResult(null);
  };

  const ErrorBanner = () => {
    if (!error) return null;

    return (
      <div role="alert" className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-4 right-4 z-50 max-w-md mx-auto">
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
              type="button"
              onClick={() => setError(null)}
              aria-label="お知らせを閉じる"
              className="kiri-hit text-white hover:bg-white/20 rounded-full p-2 -m-1 flex-shrink-0"
            >
              <X className="w-5 h-5" />
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
      <div className="bg-white/[0.055] rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-kiri-fog">{icon}</span>
            <span className="text-white font-bold text-sm">{label}</span>
          </div>
          <span className={`text-xl font-bold ${color}`}>{value}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
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
      <div className="bg-white/[0.03] rounded-lg p-3">
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
        <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={onClose}>
        <div className="kiri-card-strong rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold text-kiri-gold">{title}</h3>
            <button type="button" onClick={onClose} aria-label="閉じる" className="kiri-hit text-white hover:bg-white/20 rounded-full p-1">
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
      <div className="bg-white/[0.03] rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <span className="text-kiri-fog">{icon}</span>
            <span className="text-xs font-bold text-white">{title}</span>
          </div>
          <button
            type="button"
            aria-label={`${title}の説明`}
            onClick={onInfoClick}
            className="kiri-hit text-kiri-lilac-ink hover:text-kiri-gold transition-colors"
          >
            <HelpCircle className="w-3 h-3" />
          </button>
        </div>
        
        <div className="relative mb-2 text-center">
          <p className={`text-2xl font-bold ${textColor}`} style={{textShadow: '0 1px 8px rgba(255,255,255,0.12)'}}>
            {value}
          </p>
        </div>
        
        <p className="text-sm text-white/90 leading-relaxed text-center">
          {message.split('\n')[0]}
        </p>
      </div>
    );
  };

  // 見出し行はdiv+個別ボタン構成にする（button入れ子はHTML違反でhydrationエラーになる）
  // 開いているときは見出し→中身を12px（カード見出し→中身の共通値。D-29）。行の高さは56px（閉じて60px）でタップ範囲は足りる
  // collapsedHint: 閉じているときだけ右に小さく出す案内（例「タップで確認」）
  const CollapsibleSection = ({ title, isExpanded, onToggle, children, badge, onInfoClick, collapsedHint }) => (
    <div className="bg-white/[0.055] backdrop-blur-md rounded-xl border border-kiri-lilac/30 overflow-hidden">
      <div
        onClick={onToggle}
        className={`w-full p-4 ${isExpanded ? 'pb-3' : ''} flex items-center justify-between cursor-pointer active:bg-white/5 transition-colors`}
      >
        <div className="kiri-dt-section-head flex flex-1 min-w-0 items-center gap-2">
          <h2 className="font-display text-lg font-bold text-kiri-gold">{title}</h2>
          {badge && (
            <span className="text-xs bg-kiri-gold/11 text-kiri-gold px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
          {onInfoClick && (
            <button
              type="button"
              aria-label={`${title}の説明`}
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick();
              }}
              className="kiri-hit ml-1 text-kiri-lilac-ink hover:text-kiri-gold transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
          {/* 見出しと同じまとまりに置く。大きい文字では見出しの下へ回り込む（kiri-dt-section-head が折り返す） */}
          {collapsedHint && !isExpanded && (
            <span className="ml-auto text-xs text-kiri-lilac-ink whitespace-nowrap" aria-hidden="true">{collapsedHint}</span>
          )}
        </div>
        <div className="flex items-center shrink-0">
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `${title}を折りたたむ` : `${title}を開く`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="text-kiri-lilac-ink hover:text-white p-1"
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );

  // 霧に包まれる画面遷移（白飛びさせず、薄紫の霧で覆う）
  // 部品として {renderWhiteoutTransition()} で置くと再描画のたびに作り直され、ふわっと出る・晴れるアニメーションが効かないので、関数として呼ぶ。
  const renderWhiteoutTransition = () => (
    <div
      className={`fixed inset-0 z-50 transition-all ease-in-out ${
        isTransitioning ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        // 不透明にする（半透明だと後ろの白い文字が薄紫の上に透けて読めない文字の画面に見えていた。2026-10-10）
        background: 'radial-gradient(circle, rgb(230,222,240) 0%, rgb(216,205,232) 45%, rgb(196,183,218) 75%, rgb(178,164,204) 100%)',
        transitionDuration: `${FOG_FADE_MS}ms`
      }}
    />
  );

  // 設定のスイッチ（アプリのロック用）。VoiceOver では「スイッチ・オン/オフ」と読まれる。
  const LockSwitch = ({ checked, onChange, label, disabled }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative shrink-0 w-[51px] h-[31px] rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-kiri-gold' : 'bg-white/15'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[2px] w-[27px] h-[27px] rounded-full transition-all ${checked ? 'left-[22px] bg-kiri-night' : 'left-[2px] bg-kiri-text'}`}
      />
    </button>
  );

  // 設定の「アプリのロック」（iOS のみ。Web・非対応端末では出さない。Ruling 16）
  const renderLockSettings = () => {
    if (!shouldOfferLockSettings({ native: lockNative, availability: lockAvailability, enabled: lockSettings.enabled })) return null;
    const enabled = lockSettings.enabled;
    const description = lockToggleDescription(lockAvailability?.biometryType);
    return (
      <div className="bg-white/[0.055] rounded-xl p-4 mb-3">
        <h4 className="text-sm font-bold text-kiri-gold mb-2">アプリのロック</h4>
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 shrink-0 text-kiri-gold" strokeWidth={1.6} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p id="kiri-lock-toggle-label" className="text-sm text-white">アプリのロック</p>
            <p className="text-xs text-kiri-lilac-ink leading-relaxed">
              {description}
              {enabled && lockState.failOpen && '（端末のパスコードが未設定のため、いまは一時的に外れています）'}
            </p>
          </div>
          <LockSwitch checked={enabled} onChange={toggleLock} label="アプリのロック" disabled={lockBusy} />
        </div>
        {enabled && (
          <>
            <div className="border-t border-white/10 mt-3 pt-3">
              <div className="flex items-center gap-3">
                <Timer className="w-5 h-5 shrink-0 text-kiri-gold" strokeWidth={1.6} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p id="kiri-autolock-label" className="text-sm text-white">自動ロック</p>
                  <p className="text-xs text-kiri-lilac-ink leading-relaxed">アプリを閉じたとき・ほかのアプリへ移ったときから数えます。</p>
                </div>
              </div>
              <div role="radiogroup" aria-labelledby="kiri-autolock-label" className="grid grid-cols-4 gap-1 p-1 mt-2 rounded-xl bg-black/25">
                {AUTO_LOCK_OPTIONS.map((option) => {
                  const selected = lockSettings.autoLockMinutes === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => updateLockSettings({ autoLockMinutes: option.value })}
                      className={`min-h-[40px] rounded-[9px] text-sm transition-colors ${selected ? 'bg-kiri-plum text-kiri-gold font-bold ring-1 ring-kiri-gold/25' : 'text-kiri-lilac-ink hover:text-white'}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-white/10 mt-3 pt-3 flex items-center gap-3">
              <EyeOff className="w-5 h-5 shrink-0 text-kiri-gold" strokeWidth={1.6} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">切り替え画面で記録を隠す</p>
                <p className="text-xs text-kiri-lilac-ink leading-relaxed">ほかのアプリへ移るとき、画面がぼかされます。</p>
              </div>
              <LockSwitch
                checked={lockSettings.hideInSwitcher}
                onChange={() => updateLockSettings({ hideInSwitcher: !lockSettings.hideInSwitcher })}
                label="切り替え画面で記録を隠す"
              />
            </div>
          </>
        )}
        <p className="text-[0.75rem] text-kiri-lilac-ink mt-3 leading-relaxed">{LOCK_SETTINGS_NOTE}</p>
        {lockNotice && <p className="text-xs mt-2 text-kiri-danger" role="status">{lockNotice}</p>}
      </div>
    );
  };

  // 設定の「Kiriと話す」（D-30。iOS で購入機能があるときだけ）。Apple は購入画面の外でも「購入を復元」と解約の手段を求める。
  const renderTalkSettings = () => {
    if (!IAP_BUILD || !iapActive) return null;
    const view = talkSettingsView(talk);
    // 1行: 左に項目名（その下に小さな補足）、右に値か矢印。狭い設定カードでも項目名を折らない。
    const rowClass = 'w-full min-h-12 py-2 flex items-center justify-between gap-3 border-t border-white/10 text-left text-sm text-white';
    const restoreRow = (
      <button type="button" onClick={handleSettingsRestore} disabled={talkBusy} aria-busy={talkBusy} className={`${rowClass} hover:text-kiri-gold disabled:opacity-60`}>
        <span className="min-w-0">
          <span className="block">{talkBusy ? '確認しています…' : '購入を復元'}</span>
          <span className="block text-xs text-kiri-lilac-ink mt-0.5">機種変更・再インストールのとき</span>
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 text-kiri-lilac-ink" aria-hidden="true" />
      </button>
    );
    return (
      <div className="bg-white/[0.055] rounded-xl p-4 mb-3">
        <h4 className="text-sm font-bold text-kiri-gold mb-1 flex items-center gap-2">
          {KIRI_TALK_NAME}
          {view.subscribed && <span className="rounded-full border border-kiri-gold/50 px-2 py-0.5 text-[0.75rem] font-medium text-kiri-gold">{view.status}</span>}
        </h4>
        {view.subscribed ? (
          <>
            {view.renewalDate && (
              <div className={`${rowClass} border-t-0`}>
                <span>{view.renewalLabel}</span>
                <span className="text-xs text-kiri-lilac-ink">{view.renewalDate}</span>
              </div>
            )}
            <button type="button" onClick={manageSubscription} className={`${rowClass} hover:text-kiri-gold${view.renewalDate ? '' : ' border-t-0'}`}>
              <span className="min-w-0">
                <span className="block">サブスクリプションを管理</span>
                <span className="block text-xs text-kiri-lilac-ink mt-0.5">解約・変更（App Store）</span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-kiri-lilac-ink" aria-hidden="true" />
            </button>
            {restoreRow}
          </>
        ) : (
          <>
            <div className={`${rowClass} border-t-0`}>
              <span>いまの状態</span>
              <span className="text-xs text-kiri-lilac-ink">{view.status}</span>
            </div>
            {restoreRow}
          </>
        )}
        {talkNotice && <p className="text-xs mt-2 text-kiri-gold" role="status">{talkNotice}</p>}
      </div>
    );
  };

  // 設定（バックアップの書き出し/読み込み）
  // 部品として <SettingsModal /> で置くと再描画のたびに作り直されてフォーカスが外れるので、関数として呼ぶ。
  const renderSettingsModal = () => {
    if (!showSettings) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={() => setShowSettings(false)} role="dialog" aria-modal="true" aria-label="設定" data-kiri-settings>
        {/* iOS アプリではロックの項目で縦に長くなるので、画面に収まらないときは中でスクロールする（Web は従来どおり。監査 P2-5） */}
        <div className={`kiri-card-strong rounded-2xl w-full max-w-md p-6 kiri-rise${lockNative || iapActive ? ' max-h-full overflow-y-auto' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold text-kiri-gold">設定</h3>
            <button type="button" onClick={() => setShowSettings(false)} aria-label="閉じる" className="kiri-hit text-white hover:bg-white/20 rounded-full p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
          {renderLockSettings()}
          {renderTalkSettings()}
          {/* カードどうしは12px。カードの中は 見出し→説明 4px・説明→ボタン 8px で詰め、ひとまとまりに見せる（D-29） */}
          <div className="bg-white/[0.055] rounded-xl p-4">
            <h4 className="text-sm font-bold text-kiri-gold mb-1">バックアップ</h4>
            <p className="text-xs text-kiri-lilac-ink mb-2 leading-relaxed">記録・プロフィール・会話をJSONファイルとして保存/復元できます。読み込みは既存の記録を消しません。バックアップは自動では行われないので、大切な記録は設定アイコンの「バックアップ」を選択して定期的に書き出してください。</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportBackup}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white/[0.055] hover:bg-white/20 text-white text-sm py-2.5 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />書き出す
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white/[0.055] hover:bg-white/20 text-white text-sm py-2.5 rounded-lg transition-colors"
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
            {backupNotice && (
              <p className={`text-xs mt-2 ${backupNotice.type === 'error' ? 'text-kiri-danger' : 'text-kiri-gold'}`}>{backupNotice.text}</p>
            )}
          </div>
          <div className="bg-white/[0.055] rounded-xl p-4 mt-3">
            <h4 className="text-sm font-bold text-kiri-gold mb-1">AI送信の同意</h4>
            <p className="text-xs text-kiri-lilac-ink mb-2 leading-relaxed">
              {aiConsent
                ? '読み解きのため、入力内容をAnthropic社のAI（Claude）へ送ることに同意しています。取り消すと、次の読み解きで改めて確認します。'
                : '現在は同意していません。次に「読み解く」を押したときに確認します。'}
            </p>
            {aiConsent && (
              <button
                type="button"
                onClick={withdrawConsent}
                className="w-full flex items-center justify-center gap-1.5 bg-white/[0.055] hover:bg-white/20 text-white text-sm py-2.5 rounded-lg transition-colors"
              >
                <ShieldOff className="w-4 h-4" />AI送信の同意を取り消す
              </button>
            )}
          </div>
          <p className="text-[0.75rem] text-kiri-lilac-ink mt-3">記録はこの端末内にのみ保存されます。</p>
        </div>
      </div>
    );
  };

  // 最近の記録の一覧（結果画面の「今日の記録」下から開く）
  const HistoryListModal = () => {
    if (!showHistoryList) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onClick={() => setShowHistoryList(false)} role="dialog" aria-modal="true" aria-label="最近の記録">
        <div className="kiri-card-strong rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden kiri-rise" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-display font-bold text-kiri-gold">最近の記録</h2>
            <div className="flex items-center gap-3">
              {/* 日記の記録が0件でも、会話が残っていれば出す（すべて削除は会話も消す。F-B2） */}
              {hasAnyRecords(history, getStorage()) && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ type: 'all' })}
                  className="text-xs text-kiri-lilac-ink hover:text-white"
                >
                  すべて削除
                </button>
              )}
              <button type="button" onClick={() => setShowHistoryList(false)} aria-label="閉じる" className="kiri-hit text-kiri-lilac-ink hover:text-white"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {deleteNotice && (
              <p className="text-xs text-kiri-gold" role="status">{deleteNotice}</p>
            )}
            {history.length === 0 && (
              <p className="text-sm text-kiri-lilac-ink leading-relaxed">まだ記録がありません。今日の記録が、最初のひとつになるよ。</p>
            )}
            {history.map((item) => (
              <div key={item.id} className="bg-black/15 rounded-lg flex items-stretch">
                <button
                  type="button"
                  onClick={() => setOpenedRecord(item)}
                  className="flex-1 min-w-0 p-2.5 flex items-start gap-2 text-left rounded-l-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-kiri-fog"><MoodIcon value={item.entry?.emoji || '✨'} className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1 block">
                    <span className="block text-xs text-kiri-lilac-ink">
                      記入日: {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) : '不明'}
                    </span>
                    <span className="block text-sm text-white truncate">{item.entry?.event || '記録なし'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="この記録を削除"
                  onClick={() => setConfirmDelete({ type: 'one', id: item.id })}
                  className="text-kiri-lilac-ink hover:text-white px-2.5 rounded-r-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="px-4 pb-3 text-[0.75rem] text-kiri-lilac-ink">タップすると当時のKiriの読み解きを読み返せます。</p>
        </div>
      </div>
    );
  };

  // 削除前の確認（バックアップは手動のみのため、復元不可を明示する）
  const ConfirmDeleteModal = () => {
    if (!confirmDelete) return null;
    const isAll = confirmDelete.type === 'all';
    return (
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={() => setConfirmDelete(null)} role="alertdialog" aria-modal="true" aria-label="削除の確認">
        <div className="kiri-card-strong rounded-2xl w-full max-w-sm p-6 kiri-rise" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-display text-lg font-bold text-white mb-2">
            {isAll ? '記録と会話をすべて削除しますか？' : 'この記録を削除しますか？'}
          </h3>
          <p className="text-sm text-kiri-lilac-ink leading-relaxed mb-4">
            {isAll ? '日記の記録・読み解き・Kiriとの会話がすべて消え、元に戻せません。' : '削除した記録は元に戻せません。'}バックアップを取っていない場合、復元はできません（バックアップは設定アイコンの「バックアップ」を選択して書き出せます）。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="flex-1 bg-white/[0.055] hover:bg-white/20 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => {
                haptic('delete');
                if (isAll) {
                  // 日記の記録・端末の読み解き（D-18）・Kiriとの会話をまとめて消す（F-B2）
                  setHistory(clearAllRecords(getStorage()));
                } else {
                  setHistory(deleteHistoryItem(getStorage(), confirmDelete.id));
                  // 端末に一時保存した当日の読み解きも一緒に消す（D-18）
                  clearCachedAnalyses(getStorage());
                }
                setConfirmDelete(null);
                setDeleteNotice(isAll ? '記録と会話をすべて削除しました' : '記録を削除しました');
              }}
              className="flex-1 bg-kiri-danger text-kiri-night py-2.5 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
            >
              削除する
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 過去の記録の詳細（履歴タップで開く読み返しモーダル）
  const RecordDetail = ({ record, onClose }) => {
    if (!record) return null;
    const dateLabel = record.createdAt
      ? new Date(record.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      : '記録';
    const entryLabel = record.entry?.type === 'future' ? '予定' : '出来事';
    return (
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onClick={onClose} role="dialog" aria-modal="true" aria-label="過去の記録">
        <div className="kiri-card-strong rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden kiri-rise" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-kiri-fog"><MoodIcon value={record.entry?.emoji || '✨'} className="w-6 h-6" /></span>
              <div>
                <h2 className="font-display font-bold text-kiri-gold">{dateLabel}</h2>
                <p className="text-[0.75rem] text-kiri-lilac-ink">{entryLabel}の記録</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="閉じる" className="kiri-hit text-kiri-lilac-ink hover:text-white p-1"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="bg-white/[0.055] rounded-lg p-3">
              <p className="text-xs font-bold text-kiri-lilac-ink mb-1">{entryLabel}</p>
              <p className="text-sm text-white leading-relaxed whitespace-pre-line">{record.entry?.event || '記録なし'}</p>
            </div>
            {record.entry?.intuition && (
              <div className="bg-white/[0.055] rounded-lg p-3">
                <p className="text-xs font-bold text-kiri-lilac-ink mb-1">ひらめき・直感</p>
                <p className="text-sm text-white leading-relaxed">{record.entry.intuition}</p>
              </div>
            )}
            {record.result?.support && <SupportCard compact />}
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

  // 画面の本体（step ごと）。ロック中もアンマウントしないよう、下の return で常に同じ位置に置く。
  const renderScreen = () => {
    if (step === 'boot') {
      return <div className="min-h-screen kiri-shell" aria-hidden="true" />;
    }

    if (step === 'start') {
      return (
        <>
          {renderWhiteoutTransition()}
          <ErrorBanner />
          {renderSettingsModal()}
          <div className="min-h-screen kiri-shell p-4 py-8 flex items-center justify-center relative overflow-hidden">
            {/* 霧の谷: トップページの静かな光 */}
            <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="kiri-fog-orb w-80 h-80 top-[-6%] left-[-10%] bg-kiri-lilac" style={{'--drift': '76s', '--breathe': '12s', '--fog-min': 0.1, '--fog-max': 0.22}} />
              <div className="kiri-fog-orb w-96 h-96 top-[30%] right-[-14%] bg-kiri-gold" style={{'--drift': '88s', '--breathe': '14s', '--delay': '-32s', '--fog-min': 0.06, '--fog-max': 0.15}} />
              <div className="kiri-fog-orb w-72 h-72 bottom-[-8%] left-[18%] bg-kiri-rain" style={{'--drift': '70s', '--breathe': '11s', '--delay': '-50s', '--fog-min': 0.07, '--fog-max': 0.16}} />
            </div>

            <div className="w-full max-w-md kiri-card rounded-2xl p-6 relative kiri-rise">
              <button
                type="button"
                aria-label="設定"
                onClick={() => setShowSettings(true)}
                className="absolute top-4 right-4 text-kiri-lilac-ink hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
              <div className="text-center mb-6">
                <Sparkles className="w-12 h-12 text-kiri-gold mx-auto mb-3" />
                <h1 className="font-display text-2xl font-bold text-white mb-1">Mind & Energy Note</h1>
                <p className="text-sm text-kiri-lilac-ink">バイオリズム×四柱推命から読み解く心の分析ノート</p>
              </div>

              {/* Kiriの紹介 */}
              <div className="kiri-card-strong rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Image
                    src="/kiri-avatar-144.png"
                    alt="Kiri"
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <h2 className="font-display text-lg font-bold text-kiri-gold">Kiri</h2>
                    <p className="text-xs text-kiri-lilac-ink">わたしはKiri。あなたの心を映す鏡</p>
                  </div>
                </div>
                <p className="text-sm text-white/90 leading-relaxed">
                  Kiriは、心のエネルギーを読み解き、あなたの日々にそっと寄り添います
                </p>
              </div>

              {/* 項目どうしは16px（大きい文字は14px）。見出し→入力欄6px・入力欄→補足4pxより広く空けて、項目の切れ目を見せる（D-29） */}
              <div className="space-y-4 kiri-dt-stack">
                <div>
                  <label htmlFor="kiri-nickname" className="block text-white text-sm mb-1.5 font-medium">ニックネーム（任意）</label>
                  <input
                    id="kiri-nickname"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="例: さくら、太郎、ミオ"
                    className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/10 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac placeholder-kiri-lilac-ink"
                  />
                  <p className="text-xs text-kiri-lilac-ink mt-1">Kiriがあなたに語りかける時に使います</p>
                </div>

                <div>
                  <label className="block text-white text-sm mb-1.5 font-medium">生年月日</label>
                  <div className="grid grid-cols-[1.25fr_1fr_1fr] gap-2">
                    <select
                      aria-label="生まれた年"
                      value={birthDate.split('-')[0] || ''}
                      onChange={(e) => setBirthPart('year', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/10 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
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
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/10 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
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
                      className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/10 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
                    >
                      <option value="">日</option>
                      {Array.from({ length: daysInSelectedMonth }, (_, index) => index + 1).map((day) => (
                        <option key={day} value={String(day).padStart(2, '0')}>{day}日</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-kiri-lilac-ink mt-1">年・月・日を順番に選んでください</p>
                </div>

                <div>
                  <label htmlFor="kiri-birth-time" className="block text-white text-sm mb-1.5 font-medium">出生時刻（任意）</label>
                  <input
                    id="kiri-birth-time"
                    type="time"
                    value={birthTime}
                    onChange={(e) => setBirthTime(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/10 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
                  />
                  <p className="text-xs text-kiri-lilac-ink mt-1">時運分析に使います（未入力は12:00で概算）</p>
                </div>

                <div>
                  <label htmlFor="kiri-gender" className="block text-white text-sm mb-1.5 font-medium">性別（任意）</label>
                  <select
                    id="kiri-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/10 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac"
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

              <div className="flex items-center justify-center gap-4 mt-5 text-[0.75rem] text-kiri-lilac-ink">
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
          {renderWhiteoutTransition()}
          <ErrorBanner />
          {renderSettingsModal()}
          <ConsentModal
            show={showConsent}
            onAccept={acceptConsent}
            onDecline={declineConsent}
            onReadPolicy={() => saveEntryDraft(browserSessionStorage(), entry)}
          />
          <div className="min-h-screen kiri-shell p-4 pb-20">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-4 pt-2 relative kiri-dt-header">
                <button
                  type="button"
                  aria-label="設定"
                  onClick={() => setShowSettings(true)}
                  className="absolute top-0 right-0 text-kiri-lilac-ink hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <h1 className="font-display text-xl font-bold text-white mb-1">
                  今日の心のエネルギー
                </h1>
                {nickname && <p className="text-kiri-gold text-sm font-medium">{nickname}さん</p>}
                <p className="text-kiri-lilac-ink text-xs flex items-center justify-center">
                  <span>{formatBirthDateJa(birthDate)}生まれ</span>
                  <span className="mx-1.5" aria-hidden="true">・</span>
                  <button
                    type="button"
                    onClick={() => setStep('start')}
                    className="min-h-[44px] px-2 -mx-2 inline-flex items-center text-kiri-gold underline underline-offset-2 hover:text-white transition-colors"
                  >
                    変更する
                  </button>
                </p>
                <p className="text-kiri-lilac-ink text-xs">{new Date().toLocaleDateString('ja-JP')}</p>
              </div>

              <div className="space-y-3">
                <div className="kiri-card rounded-xl p-4 kiri-dt-card">
                  <div className="space-y-4 kiri-dt-stack">
                    <div>
                      <label className="block text-white text-sm mb-1.5 font-medium text-center">今日の気分を選んでください</label>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" role="group" aria-label="今日の気分">
                        {MOODS.map(mood => (
                          <button
                            key={mood.value}
                            type="button"
                            aria-label={`気分: ${mood.label}`}
                            aria-pressed={entry.emoji === mood.value}
                            onClick={() => {
                              haptic('select');
                              setEntry({...entry, emoji: mood.value});
                            }}
                            className={`flex flex-col items-center gap-1 py-2 rounded-lg transition-all text-kiri-fog ${entry.emoji === mood.value ? 'bg-kiri-lilac/25 text-kiri-gold ring-1 ring-kiri-gold/70' : 'bg-white/[0.055] hover:bg-white/20'} active:scale-95`}
                          >
                            <MoodIcon value={mood.value} />
                            <span className="text-[0.75rem] leading-none">{mood.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-white text-sm mb-1 font-medium">記録する</label>
                      <p className="text-xs text-kiri-lilac-ink mb-2">今日の予定や出来事を、自由に記録してください</p>
                      {/* 枠と内側の余白は外の箱に持たせ、文字は内側でスクロールさせる（上下の余白が文字で埋まらない。2026-10-09） */}
                      <label className="block w-full px-3 py-2.5 rounded-lg bg-white/10 border border-kiri-lilac/50 focus-within:ring-2 focus-within:ring-kiri-lilac h-32 kiri-dt-event cursor-text">
                        <textarea
                          value={entry.event}
                          onChange={(e) => setEntry({...entry, event: e.target.value})}
                          placeholder={placeholders.event}
                          aria-label="記録する"
                          className="block w-full h-full p-0 text-sm bg-transparent text-white border-0 focus:outline-none resize-none placeholder-kiri-lilac-ink"
                        />
                      </label>
                    </div>

                    <div>
                      <label className="block text-white text-sm mb-1.5 font-medium">ひらめき・直感的な一言</label>
                      <input
                        type="text"
                        value={entry.intuition}
                        onChange={(e) => setEntry({...entry, intuition: e.target.value})}
                        placeholder={placeholders.intuition}
                        className="w-full px-3 py-2.5 text-sm rounded-lg bg-white/10 text-white border border-kiri-lilac/50 focus:outline-none focus:ring-2 focus:ring-kiri-lilac placeholder-kiri-lilac-ink"
                      />
                    </div>

                    <button
                      onClick={requestAnalyze}
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

                  </div>
                </div>

                {declinedSupport && (
                  <div ref={declinedSupportRef}>
                    <SupportCard />
                  </div>
                )}
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
          {renderWhiteoutTransition()}
          <ErrorBanner />
          <div className="min-h-screen kiri-shell p-4 flex items-center justify-center relative overflow-hidden">
            {/* 霧の谷: 静かに漂う光 */}
            <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="kiri-fog-orb w-80 h-80 top-[12%] left-[8%] bg-kiri-lilac" style={{'--drift': '52s', '--breathe': '9s', '--fog-min': 0.14, '--fog-max': 0.3}} />
              <div className="kiri-fog-orb w-96 h-96 top-[38%] right-[-8%] bg-kiri-gold" style={{'--drift': '64s', '--breathe': '12s', '--delay': '-21s', '--fog-min': 0.08, '--fog-max': 0.2}} />
              <div className="kiri-fog-orb w-72 h-72 bottom-[8%] left-[22%] bg-kiri-rain" style={{'--drift': '58s', '--breathe': '10s', '--delay': '-37s', '--fog-min': 0.1, '--fog-max': 0.22}} />
            </div>

            {/* 霧が出始めたら文字を先に消す（霧ごしに白い文字が透けて読めない画面にならないように） */}
            {/* 外側で消す（内側の kiri-rise のアニメーションが opacity を握っているため） */}
            <div className={`relative z-10 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            <div className="text-center kiri-rise">
              {/* 中央の灯り: ゆっくり息をする */}
              <div className="relative mx-auto mb-10 h-28 w-28" aria-hidden="true">
                <div className="absolute inset-0 rounded-full bg-kiri-gold blur-2xl kiri-ember" style={{'--breathe': '5s', '--fog-min': 0.3, '--fog-max': 0.7}} />
                <div className="absolute inset-6 rounded-full bg-kiri-fog blur-md kiri-ember" style={{'--breathe': '5s', '--delay': '-2.5s', '--fog-min': 0.45, '--fog-max': 0.85}} />
              </div>

              <h2 className="font-display text-2xl font-bold text-white mb-3">Kiriが読み解いています</h2>
              <p className="text-kiri-lilac-ink text-sm mb-8">あなたの心のエネルギーを感じ取っています</p>

              <div className="flex justify-center gap-2" aria-hidden="true">
                <div className="w-1.5 h-1.5 bg-kiri-gold rounded-full kiri-ember" style={{'--breathe': '2.4s', '--fog-min': 0.2, '--fog-max': 0.9}} />
                <div className="w-1.5 h-1.5 bg-kiri-gold rounded-full kiri-ember" style={{'--breathe': '2.4s', '--delay': '-1.6s', '--fog-min': 0.2, '--fog-max': 0.9}} />
                <div className="w-1.5 h-1.5 bg-kiri-gold rounded-full kiri-ember" style={{'--breathe': '2.4s', '--delay': '-0.8s', '--fog-min': 0.2, '--fog-max': 0.9}} />
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
          {renderWhiteoutTransition()}
          <ErrorBanner />
          <HistoryListModal />
          <ConfirmDeleteModal />
          <RecordDetail record={openedRecord} onClose={() => setOpenedRecord(null)} />
          {/* チャット欄と購入画面は購入機能（または開発用プレビュー）のあるビルドにだけ入れる（定数で囲み、Web 本番のバンドルから消す）。 */}
          {CHAT_UI_BUILD && showChat && (
            <KiriChatPanel
              userProfile={{ nickname, birthDate, birthTime, gender }}
              entry={entry}
              result={result}
              readOnly={!talkEntitled}
              onOpenPaywall={openPaywall}
              onNotEntitled={refreshTalkState}
              getAppUserId={getAppUserId}
              onClose={() => setShowChat(false)}
            />
          )}
          {IAP_BUILD && (
            <PaywallSheet
              open={showPaywall}
              offering={talkOffering}
              entitled={talk.entitled}
              onPurchase={handlePurchase}
              onRestore={handlePaywallRestore}
              onRetry={reloadTalkOffering}
              onManage={manageSubscription}
              onClose={() => setShowPaywall(false)}
            />
          )}
          <InfoPopup 
            show={showBioInfo} 
            onClose={() => setShowBioInfo(false)}
            title="バイオリズムとは？"
          >
            <p>バイオリズムは、人間の身体・感情・知性の状態が一定の周期で変動するという理論です。</p>
            <div className="space-y-2 mt-3">
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-leaf-ink">身体（23日周期）</p>
                <p className="text-xs mt-1">体力、持久力、免疫力などの身体的な状態</p>
              </div>
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-rain-ink">感情（28日周期）</p>
                <p className="text-xs mt-1">気分、感受性、創造力などの精神的な状態</p>
              </div>
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-lilac-ink">知性（33日周期）</p>
                <p className="text-xs mt-1">思考力、判断力、記憶力などの知的な状態</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-kiri-lilac-ink">※本アプリでは生年月日から計算し、参考情報として提示しています。</p>
          </InfoPopup>

          <InfoPopup 
            show={showSajuInfo} 
            onClose={() => setShowSajuInfo(false)}
            title="四柱推命とは？"
          >
            <p>四柱推命は、中国発祥の占術で、生年月日時から人の運命や性格を読み解く東洋占星術です。</p>
            <div className="space-y-2 mt-3">
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-gold">あなたの本命（生まれた時）</p>
                <p className="text-xs mt-1">年柱・月柱・日柱・時柱の4つの柱から、あなたの本質を表します</p>
              </div>
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-gold">日運・時運（今この瞬間の運勢）</p>
                <p className="text-xs mt-1">日運は毎日変わり、時運は2時間ごとに変わります。このアプリでは特にこの2つを重視しています</p>
              </div>
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-rain-ink">月運・年運・大運（背景の流れ）</p>
                <p className="text-xs mt-1">月運は今月、年運は今年、大運は10年周期の大きな流れを示します（参考情報）</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-kiri-lilac-ink">※本アプリでは lunar-javascript ライブラリを使用して算出しています。</p>
          </InfoPopup>

          <InfoPopup 
            show={showThemeInfo} 
            onClose={() => setShowThemeInfo(false)}
            title="テーマ別運勢の算出方法"
          >
            <p>このスコアは、以下を総合的に判断しています。</p>
            <div className="space-y-2 mt-3">
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-gold">四柱推命</p>
                <p className="text-xs mt-1">生まれた日と今日の五行の相性（主要因）</p>
              </div>
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-rain-ink">バイオリズム</p>
                <p className="text-xs mt-1">身体・感情・知性の周期的な波（主要因）</p>
              </div>
              <div className="bg-white/[0.055] p-3 rounded-lg">
                <p className="font-bold text-kiri-rose-ink">今日の気分</p>
                <p className="text-xs mt-1">気分の絵文字から読み取った雰囲気（微調整）</p>
              </div>
              {result.saju?.birth?.hour && (
                <div className="bg-white/[0.055] p-3 rounded-lg">
                  <p className="font-bold text-kiri-lilac-ink">時柱の相性</p>
                  <p className="text-xs mt-1">出生時刻による精密化</p>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-kiri-lilac-ink">※これらをKiriの直感で組み合わせています。</p>
          </InfoPopup>

          <InfoPopup 
            show={showHintInfo.color} 
            onClose={() => setShowHintInfo({...showHintInfo, color: false})}
            title="今日の色について"
          >
            <p>この色は、四柱推命の五行論と色彩心理学から導いています。</p>
            <p className="mt-2">五行（木火土金水）にはそれぞれ対応する色があり、今日の運勢（日運）の五行とバイオリズムを組み合わせて、Kiriがイメージした色をお伝えしています。</p>
            <p className="mt-2 text-kiri-lilac-ink text-xs">感覚的なイメージをKiriからのヒントとして受け取ってください。</p>
          </InfoPopup>

          <InfoPopup 
            show={showHintInfo.number} 
            onClose={() => setShowHintInfo({...showHintInfo, number: false})}
            title="今日の数字について"
          >
            <p>この数字は、干支の数理とバイオリズムの周期から導いています。</p>
            <p className="mt-2">十二支にはそれぞれ数字が割り当てられていて、今日の運勢とあなたのバイオリズムから、今日のペースに合いそうな数字をKiriが選んでいます。</p>
            <p className="mt-2 text-kiri-lilac-ink text-xs">迷った時に、ふと思い出してもらえたら、助けになるかもしてません。</p>
          </InfoPopup>

          <InfoPopup 
            show={showHintInfo.direction} 
            onClose={() => setShowHintInfo({...showHintInfo, direction: false})}
            title="今日の方角について"
          >
            <p>この方角は、五行の方位論（風水）から導いています。</p>
            <p className="mt-2">五行（木火土金水）にはそれぞれ方角があり、今日の運勢の五行とバイオリズムから、Kiriが感じた方向をお伝えしています。</p>
            <p className="mt-2 text-kiri-lilac-ink text-xs">気にしなくても大丈夫。気が向いたときだけ、Kiriと視線を合わせてみてください。</p>
          </InfoPopup>

          <InfoPopup 
            show={showHintInfo.distance} 
            onClose={() => setShowHintInfo({...showHintInfo, distance: false})}
            title="今日の距離感について"
          >
            <p>この距離感は、今日のテーマ別運勢とバイオリズムから導いています。</p>
            <p className="mt-2">あなたの今日のエネルギー状態を、人との距離感やものとの関わり方に例えてみました。</p>
            <p className="mt-2 text-kiri-lilac-ink text-xs">正解はないので、心地よい距離を自分で選んでくださいね。</p>
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

                {result.support && <SupportCard />}

                {/* 1. バイオリズム */}
                {/* バイオリズムセクション */}
                <CollapsibleSection
                    title="バイオリズム"
                    collapsedHint="タップで確認"
                  isExpanded={expandedSections.biorhythm}
                  onToggle={() => setExpandedSections({...expandedSections, biorhythm: !expandedSections.biorhythm})}
                  onInfoClick={() => setShowBioInfo(true)}
                >
                  <div className="space-y-2">
                    <BiorhythmBar label="身体" value={result.bio.p} color="text-kiri-leaf-ink" barColor="bg-kiri-leaf" icon={<Zap className="w-6 h-6" />} />
                    <BiorhythmBar label="感情" value={result.bio.e} color="text-kiri-rain-ink" barColor="bg-kiri-rain" icon={<Heart className="w-6 h-6" />} />
                    <BiorhythmBar label="知性" value={result.bio.i} color="text-kiri-lilac-ink" barColor="bg-kiri-lilac" icon={<Sparkles className="w-6 h-6" />} />
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
                    {/* グループ（本命／今日の運勢／月運・年運／大運）どうしは16px（大きい文字は14px）、見出し→格子は6px（D-29） */}
                    <div className="space-y-4 kiri-dt-stack">
                      <div>
                        <h3 className="text-xs font-bold text-kiri-lilac-ink mb-1">あなたの本命</h3>
                        <p className="text-xs text-kiri-lilac-ink mb-2">自分自身（本質・性格・運勢の根幹）を表す最も重要な要素</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white/[0.055] p-2 rounded-lg">
                            <p className="text-xs text-kiri-lilac-ink">年柱</p>
                            <p className="font-bold text-sm text-white">{result.saju.birth.year}</p>
                          </div>
                          <div className="bg-white/[0.055] p-2 rounded-lg">
                            <p className="text-xs text-kiri-lilac-ink">月柱</p>
                            <p className="font-bold text-sm text-white">{result.saju.birth.month}</p>
                          </div>
                          <div className="bg-white/[0.055] p-2 rounded-lg">
                            <p className="text-xs text-kiri-lilac-ink">日柱（最重要）</p>
                            <p className="font-bold text-sm text-white">{result.saju.birth.day}</p>
                          </div>
                          <div className="bg-white/[0.055] p-2 rounded-lg">
                            <p className="text-xs text-kiri-lilac-ink">時柱</p>
                            <p className="font-bold text-sm text-white">{result.saju.birth.hour || '未入力'}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-bold text-kiri-gold mb-1.5">今日の運勢</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-kiri-gold/11 p-2 rounded-lg">
                            <p className="text-xs text-kiri-gold">日運（今日）</p>
                            <p className="font-bold text-sm text-white">{result.saju.today.day}</p>
                            {result.saju.today.dayDescription && (
                              <p className="text-xs text-kiri-gold mt-1">{result.saju.today.dayDescription}</p>
                            )}
                          </div>
                          {result.saju.today.hour && (
                            <div className="bg-kiri-gold/11 p-2 rounded-lg">
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
                        <h3 className="text-xs font-bold text-kiri-rain-ink mb-1.5">月運・年運</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-kiri-rain/11 p-2 rounded-lg">
                            <p className="text-xs text-kiri-rain-ink">月運（今月）</p>
                            <p className="font-bold text-sm text-white">{result.saju.today.month}</p>
                          </div>
                          <div className="bg-kiri-rain/11 p-2 rounded-lg">
                            <p className="text-xs text-kiri-rain-ink">年運（今年）</p>
                            <p className="font-bold text-sm text-white">{result.saju.today.year}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-bold text-kiri-rain-ink mb-1.5">大運（中長期）</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {result.saju.taiun && (
                            <div className="bg-kiri-rain/11 p-2 rounded-lg">
                              <p className="text-xs text-kiri-rain-ink">現在の大運</p>
                              <p className="font-bold text-sm text-white">{result.saju.taiun.pillar}</p>
                              <p className="text-xs text-kiri-rain-ink mt-0.5">{result.saju.taiun.age}歳〜</p>
                            </div>
                          )}
                          {result.saju.note && (
                            <div className="bg-kiri-rain/11 p-2 rounded-lg flex items-center">
                              <p className="text-xs text-kiri-rain-ink">
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
                    collapsedHint="タップで確認"
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
                    <div className="kiri-dt-hint-grid grid grid-cols-2 gap-2">
                      <HintItem
                        icon={<Palette className="w-4 h-4" />}
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
                        textColor="text-kiri-lilac-ink"
                        onInfoClick={() => setShowHintInfo({...showHintInfo, number: true})}
                      />
                      
                      <HintItem
                        icon={<Zap className="w-4 h-4" />}
                        title="方角"
                        value={result.todayHints.direction.value}
                        message={result.todayHints.direction.message}
                        bgColor="bg-kiri-rain"
                        textColor="text-kiri-rain-ink"
                        onInfoClick={() => setShowHintInfo({...showHintInfo, direction: true})}
                      />
                      
                      <HintItem
                        icon={<Heart className="w-4 h-4" />}
                        title="距離感"
                        value={result.todayHints.distance.value}
                        message={result.todayHints.distance.message}
                        bgColor="bg-kiri-rose"
                        textColor="text-kiri-rose-ink"
                        onInfoClick={() => setShowHintInfo({...showHintInfo, distance: true})}
                      />
                    </div>
                  </CollapsibleSection>
                )}

                {/* メインメッセージ */}
                <div className="kiri-card-strong rounded-xl p-4 text-white">
                  <div className="flex items-center gap-2 mb-3">
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
                  <div className="bg-white/[0.055] backdrop-blur-md rounded-xl p-4 border border-kiri-lilac/30">
                    <h2 className="text-base font-bold text-kiri-lilac-ink mb-2">あなたの直感から読み取ったメッセージ</h2>
                    <p className="kiri-voice text-white text-sm">
                      {renderHighlightedText(result.innerMessage)}
                    </p>
                  </div>
                )}

                <div className="bg-white/[0.055] backdrop-blur-md rounded-xl p-4 border border-kiri-lilac/30">
                  <h2 className="text-base font-bold text-kiri-leaf-ink mb-2">Kiriからのアドバイス</h2>
                  <p className="kiri-voice text-white text-sm whitespace-pre-line">
                    {renderHighlightedText(result.actionAdvice)}
                  </p>
                </div>


                <div className="bg-white/[0.055] backdrop-blur-md rounded-xl p-4 border border-kiri-lilac/30">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-kiri-rain-ink">今日の記録</h2>
                    <p className="text-xs text-kiri-lilac-ink">
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
                    <div className="bg-white/[0.055] p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-kiri-fog"><MoodIcon value={entry.emoji} className="w-6 h-6" /></span>
                        <span className="font-bold text-sm text-white">今日の気分</span>
                        {findMood(entry.emoji)?.label && <span className="text-sm text-kiri-fog">{findMood(entry.emoji).label}</span>}
                      </div>
                    </div>
                    <div className="bg-white/[0.055] p-3 rounded-lg">
                      <p className="font-bold text-sm mb-1 text-white">{entry.type === 'past' ? '出来事' : '予定'}</p>
                      <p className="text-sm text-kiri-lilac-ink">{entry.event}</p>
                    </div>
                    {entry.intuition && (
                      <div className="bg-white/[0.055] p-3 rounded-lg">
                        <p className="font-bold text-sm mb-1 text-white">ひらめき・直感</p>
                        <p className="text-sm text-kiri-lilac-ink">{entry.intuition}</p>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHistoryList(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-white/[0.055] hover:bg-white/20 active:scale-[0.98] text-white py-2.5 rounded-lg font-medium text-sm transition-all"
                  >
                    <History className="w-4 h-4" />最近の記録
                  </button>
                </div>

                {/* 入口カード「Kiriに続けて聞く」（D-30）。購入機能のあるビルド（iOS・開発のモック）か開発用プレビューでだけ出す（Web 本番には無い）。 */}
                {CHAT_UI_BUILD && talkAvailable && (() => {
                  const card = entryCardView({
                    entitled: talkEntitled,
                    offering: talkOffering,
                    hasLog: !talkEntitled && loadChatHistory(getStorage()).length > 0,
                  });
                  return (
                    <div className="kiri-card-strong rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Image src="/kiri-avatar-144.png" alt="" width={44} height={44} className="w-11 h-11 rounded-full border border-kiri-gold/25 object-cover" />
                        <div className="min-w-0">
                          <h3 className="font-display text-base font-bold text-kiri-gold">Kiriに続けて聞く</h3>
                          <p className="text-xs text-kiri-lilac-ink mt-0.5">{KIRI_TALK_NAME}（月額）</p>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed text-kiri-fog mb-3">今日の読み解きと記録をふまえて、気になったところをKiriに話しかけられます。</p>
                      <button
                        type="button"
                        onClick={openTalk}
                        className="w-full min-h-11 rounded-full bg-kiri-gold px-4 text-sm font-bold tracking-wider text-kiri-night hover:brightness-105 active:scale-[0.98] transition-transform"
                      >
                        {card.primaryLabel}
                      </button>
                      {card.note && <p className="text-xs text-kiri-lilac-ink text-center mt-2">{card.note}</p>}
                      {card.showReadLog && (
                        <button
                          type="button"
                          onClick={openChat}
                          className="mt-2 w-full min-h-11 rounded-full border border-white/15 px-4 text-sm text-kiri-fog hover:bg-white/10"
                        >
                          これまでの会話を読む
                        </button>
                      )}
                      {devPreviewChat && <p className="text-[0.75rem] text-kiri-lilac-ink text-center mt-2">開発プレビュー（購入なし。サーバーも開発環境だけが通します）</p>}
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('input')}
                    className="flex-1 bg-white/[0.055] hover:bg-white/20 active:scale-[0.98] text-white py-3 rounded-xl font-medium text-sm transition-all"
                  >
                    前の画面に戻る
                  </button>
                  <button
                    onClick={clearAll}
                    className="flex-1 bg-white/[0.055] hover:bg-white/20 active:scale-[0.98] text-white py-3 rounded-xl font-medium text-sm transition-all"
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
  };

  // ロック画面（最上位 z-[90]・同意モーダル z-[80] より上）と、フェイルオープンの理由の帯。
  const renderLockLayer = () => {
    if (!lockNative) return null;
    if (lockState.locked) {
      return (
        <LockScreen
          view={lockScreenView(lockState, lockAvailability?.biometryType)}
          onUnlock={() => unlockApp()}
        />
      );
    }
    if (lockState.failOpen && lockState.message && lockState.failOpenSeq !== failOpenDismissedSeq) {
      return (
        <div className="fixed top-0 inset-x-0 z-[85] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]" role="status">
          <div className="max-w-md mx-auto rounded-xl p-3 flex items-start gap-2 text-sm text-white border border-kiri-gold/30 shadow-lg" style={{ background: 'rgba(40, 35, 58, 0.98)' }}>
            <Lock className="w-4 h-4 mt-0.5 shrink-0 text-kiri-gold" strokeWidth={1.6} aria-hidden="true" />
            <p className="flex-1 leading-relaxed">{lockState.message}</p>
            <button type="button" onClick={() => setFailOpenDismissedSeq(lockState.failOpenSeq)} aria-label="閉じる" className="kiri-hit text-kiri-lilac-ink hover:text-white p-1 -m-1">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  const screen = renderScreen();
  return (
    <>
      {/* ロック中は本体を操作・読み上げの対象から外す（inert＋aria-hidden。Ruling 8・15）。Web では常に素通し。 */}
      <div inert={lockState.locked} aria-hidden={lockState.locked ? 'true' : undefined}>
        {screen}
      </div>
      {renderLockLayer()}
    </>
  );
}
