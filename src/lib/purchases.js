// アプリ内課金「Kiriと話す」の窓口（Phase 3・D-28/D-30。設計書 Ruling 2・16）。
// - iOS アプリでは @revenuecat/purchases-capacitor 13.6.1 を動的 import（Web では読み込まない）。
// - IAP が無効（ビルド時定数 NEXT_PUBLIC_KIRI_IAP が '1' でない・非ネイティブ・公開キーなし）なら、
//   どの関数も「未購読・offering なし」を返す。例外は投げない（画面の動作を止めない）。
// - NEXT_PUBLIC_KIRI_IAP_MOCK=1（next dev と ios:build --dev 限定。本番ビルドはスクリプトが止める）では
//   メモリ上のモック（¥480・1週間のトライアル適格・購入で entitled）を使う。
// - 権利の正はサーバー（/api/chat が RevenueCat に問い合わせる）。ここは画面の出し分けのため。
// - Capacitor のプラグインは Proxy なので、async 関数から返したり await したりしない（storage.js の注意書き参照）。

import { isNativePlatform } from "./native";

// 商品・権利の識別子（D-28/D-30。ASC と RevenueCat の設定と一致させる）。
export const KIRI_ENTITLEMENT_ID = "kiri_chat";
export const KIRI_PRODUCT_ID = "com.kugainc.kiri.talk.monthly";
// サブスクリプションの管理画面（managementURL が取れないときの代わり）。
export const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

// RevenueCat のエラーコード（purchases-typescript-internal-esm 19.3.1 の PURCHASES_ERROR_CODE）。
const PURCHASE_CANCELLED_ERROR = "1";
const PAYMENT_PENDING_ERROR = "20";
// INTRO_ELIGIBILITY_STATUS_ELIGIBLE。UNKNOWN(0) は RevenueCat の推奨どおり「通常価格を出す」側に倒す。
const INTRO_ELIGIBLE = 2;

// モック（開発用）。本番の書き出しに "kiri-iap-mock" が残っていたら ios:build が失敗する。
const MOCK_MARKER = "kiri-iap-mock";
export const MOCK_APP_USER_ID = "$RCAnonymousID:0000000000000000000000000000c0de";
const MOCK_PRICE_STRING = "¥480";
const MOCK_TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const NOT_ENTITLED = Object.freeze({ entitled: false, expiresAt: null, willRenew: false, managementUrl: null });

const loadRevenueCat = () => import("@revenuecat/purchases-capacitor");

// 導入価格の期間を画面の言葉にする（「1週間 無料で試す」の「1週間」）。分からなければ null。
export function periodLabelFor(intro) {
  const units = Number(intro?.periodNumberOfUnits) * (Number(intro?.cycles) > 1 ? Number(intro.cycles) : 1);
  if (!Number.isInteger(units) || units <= 0) return null;
  switch (intro?.periodUnit) {
    case "DAY":
      return units % 7 === 0 ? `${units / 7}週間` : `${units}日間`;
    case "WEEK":
      return `${units}週間`;
    case "MONTH":
      return `${units}か月`;
    case "YEAR":
      return `${units}年`;
    default:
      return null;
  }
}

function stateFrom(customerInfo) {
  const entitlement = customerInfo?.entitlements?.active?.[KIRI_ENTITLEMENT_ID];
  if (!entitlement?.isActive) return { ...NOT_ENTITLED, managementUrl: customerInfo?.managementURL ?? null };
  return {
    entitled: true,
    expiresAt: entitlement.expirationDate ?? null,
    willRenew: Boolean(entitlement.willRenew),
    managementUrl: customerInfo?.managementURL ?? null,
  };
}

function packageOf(offerings) {
  const current = offerings?.current;
  return current?.monthly ?? current?.availablePackages?.[0] ?? null;
}

// モックの中身。createPurchases の mock に渡す（既定のインスタンスはフラグが '1' のときだけ渡す＝本番では参照が消える）。
export function createMockBackend(now) {
  let entitled = false;
  let trialUsed = false;
  let expiresAt = null;
  const state = () =>
    entitled ? { entitled: true, expiresAt, willRenew: true, managementUrl: APPLE_SUBSCRIPTIONS_URL } : { ...NOT_ENTITLED };
  return {
    marker: MOCK_MARKER,
    offering: () => ({
      priceString: MOCK_PRICE_STRING,
      productId: KIRI_PRODUCT_ID,
      trial: { eligible: !trialUsed, periodLabel: "1週間" },
    }),
    purchase: () => {
      entitled = true;
      trialUsed = true;
      expiresAt = new Date(now() + MOCK_TRIAL_DAYS * DAY_MS).toISOString();
      return state();
    },
    state,
  };
}

// 依存を差し替えられる形で作る（テスト用）。画面は下の既定のインスタンスを使う。
export function createPurchases({
  enabled = false,
  mock = null, // createMockBackend（開発用モック）か null
  native = false,
  apiKey = "",
  load = loadRevenueCat,
  now = () => Date.now(),
} = {}) {
  const mockBackend = enabled && typeof mock === "function" ? mock(now) : null;
  const nativeEnabled = enabled && !mockBackend && native && Boolean(apiKey);
  const listeners = new Set();
  let configuring = null;
  let plugin = null; // プラグインのモジュール（Proxy そのものは返さない・await しない）
  let lastPackage = null;

  const emit = (state) => {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        // 画面側の例外で通知を止めない
      }
    }
  };

  async function doConfigure() {
    try {
      const mod = await load();
      await mod.Purchases.configure({ apiKey });
      await mod.Purchases.addCustomerInfoUpdateListener((customerInfo) => emit(stateFrom(customerInfo)));
      plugin = mod;
      return true;
    } catch {
      return false;
    }
  }

  // 成功したら以後は同じ結果を返す。失敗したら次の呼び出しでやり直す。
  async function ensureConfigured() {
    if (!nativeEnabled) return false;
    if (plugin) return true;
    if (!configuring) {
      configuring = doConfigure().then((ok) => {
        if (!ok) configuring = null;
        return ok;
      });
    }
    return configuring;
  }

  const isIapEnabled = () => Boolean(mockBackend) || nativeEnabled;

  async function configurePurchases() {
    if (mockBackend) return { configured: true };
    return { configured: await ensureConfigured() };
  }

  async function trialFor(product) {
    const intro = product?.introPrice;
    // 有料の導入価格（割引）は「無料トライアル」と言えないので出さない。
    if (!intro || Number(intro.price) !== 0) return null;
    const periodLabel = periodLabelFor(intro);
    if (!periodLabel) return null;
    let eligible = false;
    try {
      const result = await plugin.Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: [product.identifier] });
      eligible = result?.[product.identifier]?.status === INTRO_ELIGIBLE;
    } catch {
      // 判定できなければ通常価格を出す（誤って「無料」と言わない）
    }
    return { eligible, periodLabel };
  }

  async function getChatOffering() {
    if (mockBackend) return mockBackend.offering();
    if (!(await ensureConfigured())) return null;
    try {
      const pkg = packageOf(await plugin.Purchases.getOfferings());
      const product = pkg?.product;
      if (!product?.priceString) return null;
      lastPackage = pkg;
      return { priceString: product.priceString, productId: product.identifier, trial: await trialFor(product) };
    } catch {
      return null;
    }
  }

  async function purchaseChat() {
    if (mockBackend) {
      const state = mockBackend.purchase();
      emit(state);
      return { entitled: state.entitled, cancelled: false };
    }
    if (!(await ensureConfigured())) return { entitled: false, cancelled: false, error: "unavailable" };
    if (!lastPackage) await getChatOffering();
    if (!lastPackage) return { entitled: false, cancelled: false, error: "no_offering" };
    try {
      const { customerInfo } = await plugin.Purchases.purchasePackage({ aPackage: lastPackage });
      const state = stateFrom(customerInfo);
      emit(state);
      return { entitled: state.entitled, cancelled: false };
    } catch (error) {
      const code = String(error?.code ?? "");
      if (code === PURCHASE_CANCELLED_ERROR || error?.userCancelled === true) return { entitled: false, cancelled: true };
      if (code === PAYMENT_PENDING_ERROR) return { entitled: false, cancelled: false, error: "pending" };
      return { entitled: false, cancelled: false, error: "failed" };
    }
  }

  async function restorePurchases() {
    if (mockBackend) return { entitled: mockBackend.state().entitled };
    if (!(await ensureConfigured())) return { entitled: false, error: "unavailable" };
    try {
      const { customerInfo } = await plugin.Purchases.restorePurchases();
      const state = stateFrom(customerInfo);
      emit(state);
      return { entitled: state.entitled };
    } catch {
      return { entitled: false, error: "failed" };
    }
  }

  async function getEntitlementState() {
    if (mockBackend) return mockBackend.state();
    if (!(await ensureConfigured())) return { ...NOT_ENTITLED };
    try {
      const { customerInfo } = await plugin.Purchases.getCustomerInfo();
      return stateFrom(customerInfo);
    } catch {
      return { ...NOT_ENTITLED };
    }
  }

  async function getAppUserId() {
    if (mockBackend) return MOCK_APP_USER_ID;
    if (!(await ensureConfigured())) return null;
    try {
      const { appUserID } = await plugin.Purchases.getAppUserID();
      return typeof appUserID === "string" && appUserID ? appUserID : null;
    } catch {
      return null;
    }
  }

  function onEntitlementChange(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  return {
    isIapEnabled,
    configurePurchases,
    getChatOffering,
    purchaseChat,
    restorePurchases,
    getEntitlementState,
    getAppUserId,
    onEntitlementChange,
  };
}

// 既定のインスタンス。ビルド時定数は next.config（scripts/lib/nextConfigFor.mjs）が '0'/'1' で埋め込む。
// Web の本番では NEXT_PUBLIC_KIRI_IAP='0' なので、呼んでも何もしない。
let instance = null;
function purchases() {
  if (!instance) {
    instance = createPurchases({
      enabled: process.env.NEXT_PUBLIC_KIRI_IAP === "1",
      mock: process.env.NEXT_PUBLIC_KIRI_IAP_MOCK === "1" ? createMockBackend : null,
      native: isNativePlatform(),
      apiKey: process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY || "",
    });
  }
  return instance;
}

export const isIapEnabled = () => purchases().isIapEnabled();
export const configurePurchases = () => purchases().configurePurchases();
export const getChatOffering = () => purchases().getChatOffering();
export const purchaseChat = () => purchases().purchaseChat();
export const restorePurchases = () => purchases().restorePurchases();
export const getEntitlementState = () => purchases().getEntitlementState();
export const getAppUserId = () => purchases().getAppUserId();
export const onEntitlementChange = (callback) => purchases().onEntitlementChange(callback);
