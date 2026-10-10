import { describe, it, expect, vi } from "vitest";
import { capacitorLikeProxy, withTimeout } from "./capacitorProxy";
import {
  createPurchases,
  createMockBackend,
  periodLabelFor,
  KIRI_ENTITLEMENT_ID,
  KIRI_PRODUCT_ID,
  MOCK_APP_USER_ID,
} from "@/lib/purchases";

const APP_USER_ID = "$RCAnonymousID:0123456789abcdef0123456789abcdef";

const product = (overrides = {}) => ({
  identifier: KIRI_PRODUCT_ID,
  priceString: "¥480",
  introPrice: { price: 0, priceString: "¥0", cycles: 1, period: "P1W", periodUnit: "WEEK", periodNumberOfUnits: 1 },
  ...overrides,
});

const offerings = (prod = product()) => ({
  current: { identifier: "default", monthly: { identifier: "$rc_monthly", product: prod }, availablePackages: [{ identifier: "$rc_monthly", product: prod }] },
});

const customerInfo = ({ active = false, expirationDate = "2026-11-17T00:00:00Z", willRenew = true, managementURL = "https://apps.apple.com/account/subscriptions" } = {}) => ({
  entitlements: {
    active: active ? { [KIRI_ENTITLEMENT_ID]: { identifier: KIRI_ENTITLEMENT_ID, isActive: true, expirationDate, willRenew } } : {},
    all: {},
  },
  managementURL,
});

// RevenueCat プラグインの偽物。Capacitor の Proxy と同じく、未定義のメソッド（then を含む）は reject する。
function fakePlugin(overrides = {}) {
  const listeners = [];
  const methods = {
    configure: vi.fn(async () => {}),
    getOfferings: vi.fn(async () => offerings()),
    checkTrialOrIntroductoryPriceEligibility: vi.fn(async ({ productIdentifiers }) =>
      Object.fromEntries(productIdentifiers.map((id) => [id, { status: 2, description: "eligible" }])),
    ),
    purchasePackage: vi.fn(async () => ({ productIdentifier: KIRI_PRODUCT_ID, customerInfo: customerInfo({ active: true }) })),
    restorePurchases: vi.fn(async () => ({ customerInfo: customerInfo({ active: true }) })),
    getCustomerInfo: vi.fn(async () => ({ customerInfo: customerInfo() })),
    getAppUserID: vi.fn(async () => ({ appUserID: APP_USER_ID })),
    addCustomerInfoUpdateListener: vi.fn(async (listener) => {
      listeners.push(listener);
      return "cb-1";
    }),
    ...overrides,
  };
  const Purchases = capacitorLikeProxy("Purchases", methods);
  return { Purchases, methods, listeners, load: vi.fn(async () => ({ Purchases })) };
}

const nativeIap = (plugin, extra = {}) =>
  createPurchases({ enabled: true, mock: null, native: true, apiKey: "appl_test_key", load: plugin.load, ...extra });

describe("periodLabelFor（トライアル期間の表示）", () => {
  it.each([
    [{ periodUnit: "WEEK", periodNumberOfUnits: 1 }, "1週間"],
    [{ periodUnit: "DAY", periodNumberOfUnits: 7 }, "1週間"],
    [{ periodUnit: "DAY", periodNumberOfUnits: 3 }, "3日間"],
    [{ periodUnit: "WEEK", periodNumberOfUnits: 2 }, "2週間"],
    [{ periodUnit: "MONTH", periodNumberOfUnits: 1 }, "1か月"],
    [{ periodUnit: "YEAR", periodNumberOfUnits: 1 }, "1年"],
  ])("%o → %s", (intro, label) => {
    expect(periodLabelFor(intro)).toBe(label);
  });

  it("分からない単位・回数は null（文言を作らない）", () => {
    expect(periodLabelFor({ periodUnit: "FORTNIGHT", periodNumberOfUnits: 1 })).toBeNull();
    expect(periodLabelFor({ periodUnit: "WEEK", periodNumberOfUnits: 0 })).toBeNull();
    expect(periodLabelFor(null)).toBeNull();
  });

  it("複数回の期間は回数をかける（cycles）", () => {
    expect(periodLabelFor({ periodUnit: "WEEK", periodNumberOfUnits: 1, cycles: 2 })).toBe("2週間");
  });
});

describe("IAP が無効・Web のとき（すべて未購読・offering なし）", () => {
  const cases = [
    ["フラグ off", { enabled: false, mock: null, native: true, apiKey: "appl_x" }],
    ["Web（非ネイティブ）", { enabled: true, mock: null, native: false, apiKey: "appl_x" }],
    ["公開キーなし", { enabled: true, mock: null, native: true, apiKey: "" }],
  ];

  it.each(cases)("%s: プラグインを読み込まない", async (_, options) => {
    const plugin = fakePlugin();
    const iap = createPurchases({ ...options, load: plugin.load });
    expect(iap.isIapEnabled()).toBe(false);
    expect(await iap.configurePurchases()).toEqual({ configured: false });
    expect(await iap.getChatOffering()).toBeNull();
    expect(await iap.purchaseChat()).toEqual({ entitled: false, cancelled: false, error: "unavailable" });
    expect(await iap.restorePurchases()).toEqual({ entitled: false, error: "unavailable" });
    expect(await iap.getEntitlementState()).toEqual({ entitled: false, expiresAt: null, willRenew: false, managementUrl: null });
    expect(await iap.getAppUserId()).toBeNull();
    const unsubscribe = iap.onEntitlementChange(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
    expect(plugin.load).not.toHaveBeenCalled();
  });
});

describe("ネイティブ（RevenueCat プラグイン）", () => {
  it("configurePurchases は公開キーで1回だけ configure し、更新の listener を付ける", async () => {
    const plugin = fakePlugin();
    const iap = nativeIap(plugin);
    expect(iap.isIapEnabled()).toBe(true);
    const [a, b] = await Promise.all([iap.configurePurchases(), iap.configurePurchases()]);
    expect(a).toEqual({ configured: true });
    expect(b).toEqual({ configured: true });
    expect(plugin.methods.configure).toHaveBeenCalledTimes(1);
    expect(plugin.methods.configure).toHaveBeenCalledWith({ apiKey: "appl_test_key" });
    expect(plugin.methods.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
  });

  it("Capacitor の Proxy を await しない（止まらずに返る）", async () => {
    const plugin = fakePlugin();
    const iap = nativeIap(plugin);
    expect(await withTimeout(iap.configurePurchases())).toEqual({ configured: true });
    expect(await withTimeout(iap.getEntitlementState())).not.toBe("timeout");
  });

  it("configure が失敗したら未設定として扱い、次の呼び出しでやり直す", async () => {
    let fail = true;
    const plugin = fakePlugin({
      configure: vi.fn(async () => {
        if (fail) throw new Error("boom");
      }),
    });
    const iap = nativeIap(plugin);
    expect(await iap.configurePurchases()).toEqual({ configured: false });
    expect(await iap.getChatOffering()).toBeNull();
    fail = false;
    expect(await iap.configurePurchases()).toEqual({ configured: true });
  });

  it("getChatOffering: 価格は StoreKit の文字列、トライアル適格なら期間ラベルつき", async () => {
    const plugin = fakePlugin();
    const iap = nativeIap(plugin);
    expect(await iap.getChatOffering()).toEqual({
      priceString: "¥480",
      productId: KIRI_PRODUCT_ID,
      trial: { eligible: true, periodLabel: "1週間" },
    });
    expect(plugin.methods.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledWith({ productIdentifiers: [KIRI_PRODUCT_ID] });
  });

  it.each([
    [1, "INELIGIBLE"],
    [0, "UNKNOWN（RevenueCat の推奨どおり通常価格を出す）"],
    [3, "NO_INTRO_OFFER_EXISTS"],
  ])("トライアル判定 status=%s（%s）は eligible: false", async (status) => {
    const plugin = fakePlugin({
      checkTrialOrIntroductoryPriceEligibility: vi.fn(async () => ({ [KIRI_PRODUCT_ID]: { status } })),
    });
    const offering = await nativeIap(plugin).getChatOffering();
    expect(offering.trial).toEqual({ eligible: false, periodLabel: "1週間" });
  });

  it("トライアル判定が失敗したら eligible: false（誤って無料と言わない）", async () => {
    const plugin = fakePlugin({ checkTrialOrIntroductoryPriceEligibility: vi.fn(async () => { throw new Error("x"); }) });
    const offering = await nativeIap(plugin).getChatOffering();
    expect(offering.trial).toEqual({ eligible: false, periodLabel: "1週間" });
  });

  it("導入価格が無い・有料の導入価格は trial: null", async () => {
    const none = fakePlugin({ getOfferings: vi.fn(async () => offerings(product({ introPrice: null }))) });
    expect((await nativeIap(none).getChatOffering()).trial).toBeNull();
    const paid = fakePlugin({
      getOfferings: vi.fn(async () => offerings(product({ introPrice: { price: 120, priceString: "¥120", cycles: 1, periodUnit: "MONTH", periodNumberOfUnits: 1 } }))),
    });
    expect((await nativeIap(paid).getChatOffering()).trial).toBeNull();
  });

  it("monthly が無ければ最初のパッケージ、current が無ければ null", async () => {
    const prod = product();
    const noMonthly = fakePlugin({ getOfferings: vi.fn(async () => ({ current: { monthly: null, availablePackages: [{ product: prod }] } })) });
    expect((await nativeIap(noMonthly).getChatOffering()).priceString).toBe("¥480");
    const empty = fakePlugin({ getOfferings: vi.fn(async () => ({ current: null })) });
    expect(await nativeIap(empty).getChatOffering()).toBeNull();
    const failing = fakePlugin({ getOfferings: vi.fn(async () => { throw new Error("network"); }) });
    expect(await nativeIap(failing).getChatOffering()).toBeNull();
  });

  it("purchaseChat はパッケージを購入し、権利を返して listener に知らせる", async () => {
    const plugin = fakePlugin();
    const iap = nativeIap(plugin);
    const seen = [];
    iap.onEntitlementChange((state) => seen.push(state.entitled));
    expect(await iap.purchaseChat()).toEqual({ entitled: true, cancelled: false });
    expect(plugin.methods.purchasePackage).toHaveBeenCalledTimes(1);
    expect(plugin.methods.purchasePackage.mock.calls[0][0].aPackage.product.identifier).toBe(KIRI_PRODUCT_ID);
    expect(seen).toContain(true);
  });

  it("購入のキャンセルは cancelled: true（エラー扱いにしない）", async () => {
    const plugin = fakePlugin({
      purchasePackage: vi.fn(async () => {
        throw Object.assign(new Error("cancelled"), { code: "1", userCancelled: true });
      }),
    });
    expect(await nativeIap(plugin).purchaseChat()).toEqual({ entitled: false, cancelled: true });
  });

  it("承認待ち（ファミリー共有の承認など）は error: 'pending'", async () => {
    const plugin = fakePlugin({ purchasePackage: vi.fn(async () => { throw Object.assign(new Error("pending"), { code: "20" }); }) });
    expect(await nativeIap(plugin).purchaseChat()).toEqual({ entitled: false, cancelled: false, error: "pending" });
  });

  it("その他の失敗は error: 'failed'（例外を投げない）", async () => {
    const plugin = fakePlugin({ purchasePackage: vi.fn(async () => { throw Object.assign(new Error("x"), { code: "2" }); }) });
    expect(await nativeIap(plugin).purchaseChat()).toEqual({ entitled: false, cancelled: false, error: "failed" });
  });

  it("offering が取れないと購入しない", async () => {
    const plugin = fakePlugin({ getOfferings: vi.fn(async () => ({ current: null })) });
    expect(await nativeIap(plugin).purchaseChat()).toEqual({ entitled: false, cancelled: false, error: "no_offering" });
    expect(plugin.methods.purchasePackage).not.toHaveBeenCalled();
  });

  it("restorePurchases は権利の有無を返す（失敗は error: 'failed'）", async () => {
    expect(await nativeIap(fakePlugin()).restorePurchases()).toEqual({ entitled: true });
    const none = fakePlugin({ restorePurchases: vi.fn(async () => ({ customerInfo: customerInfo() })) });
    expect(await nativeIap(none).restorePurchases()).toEqual({ entitled: false });
    const failing = fakePlugin({ restorePurchases: vi.fn(async () => { throw new Error("x"); }) });
    expect(await nativeIap(failing).restorePurchases()).toEqual({ entitled: false, error: "failed" });
  });

  it("getEntitlementState は kiri_chat の有効な権利だけを見る", async () => {
    const active = fakePlugin({ getCustomerInfo: vi.fn(async () => ({ customerInfo: customerInfo({ active: true, willRenew: false }) })) });
    expect(await nativeIap(active).getEntitlementState()).toEqual({
      entitled: true,
      expiresAt: "2026-11-17T00:00:00Z",
      willRenew: false,
      managementUrl: "https://apps.apple.com/account/subscriptions",
    });
    const other = fakePlugin({
      getCustomerInfo: vi.fn(async () => ({ customerInfo: { entitlements: { active: { other: { isActive: true } } }, managementURL: null } })),
    });
    expect(await nativeIap(other).getEntitlementState()).toEqual({ entitled: false, expiresAt: null, willRenew: false, managementUrl: null });
    const failing = fakePlugin({ getCustomerInfo: vi.fn(async () => { throw new Error("x"); }) });
    expect((await nativeIap(failing).getEntitlementState()).entitled).toBe(false);
  });

  it("getAppUserId は RevenueCat の App User ID を返す", async () => {
    expect(await nativeIap(fakePlugin()).getAppUserId()).toBe(APP_USER_ID);
    const failing = fakePlugin({ getAppUserID: vi.fn(async () => { throw new Error("x"); }) });
    expect(await nativeIap(failing).getAppUserId()).toBeNull();
  });

  it("onEntitlementChange: プラグインの更新通知を権利の状態に直して届け、unsubscribe で止まる", async () => {
    const plugin = fakePlugin();
    const iap = nativeIap(plugin);
    const cb = vi.fn();
    const unsubscribe = iap.onEntitlementChange(cb);
    await iap.configurePurchases();
    plugin.listeners[0](customerInfo({ active: true }));
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ entitled: true }));
    unsubscribe();
    plugin.listeners[0](customerInfo());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("プラグインが読み込めなければ未設定（画面は止めない）", async () => {
    const iap = createPurchases({ enabled: true, mock: null, native: true, apiKey: "appl_x", load: vi.fn(async () => { throw new Error("missing"); }) });
    expect(await iap.configurePurchases()).toEqual({ configured: false });
    expect(await iap.getEntitlementState()).toEqual({ entitled: false, expiresAt: null, willRenew: false, managementUrl: null });
  });
});

describe("モック（NEXT_PUBLIC_KIRI_IAP_MOCK=1・next dev と ios:build --dev 限定）", () => {
  const mockIap = () => createPurchases({ enabled: true, mock: createMockBackend, native: false, apiKey: "", load: vi.fn(), now: () => Date.parse("2026-10-10T00:00:00Z") });

  it("Web でも有効になり、プラグインは読み込まない", async () => {
    const iap = mockIap();
    expect(iap.isIapEnabled()).toBe(true);
    expect(await iap.configurePurchases()).toEqual({ configured: true });
  });

  it("¥480・1週間のトライアル適格、購入で entitled", async () => {
    const iap = mockIap();
    expect(await iap.getChatOffering()).toEqual({ priceString: "¥480", productId: KIRI_PRODUCT_ID, trial: { eligible: true, periodLabel: "1週間" } });
    expect((await iap.getEntitlementState()).entitled).toBe(false);
    const cb = vi.fn();
    iap.onEntitlementChange(cb);
    expect(await iap.purchaseChat()).toEqual({ entitled: true, cancelled: false });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ entitled: true }));
    const state = await iap.getEntitlementState();
    expect(state.entitled).toBe(true);
    expect(state.willRenew).toBe(true);
    expect(state.expiresAt).toBe("2026-10-17T00:00:00.000Z");
    expect(await iap.restorePurchases()).toEqual({ entitled: true });
    expect((await iap.getChatOffering()).trial.eligible).toBe(false);
  });

  it("App User ID はサーバーの形式どおりの固定値", async () => {
    expect(await mockIap().getAppUserId()).toBe(MOCK_APP_USER_ID);
    expect(MOCK_APP_USER_ID).toMatch(/^\$RCAnonymousID:[0-9a-f]{32}$/);
  });

  it("フラグ off ならモックも無効", () => {
    expect(createPurchases({ enabled: false, mock: createMockBackend, native: false }).isIapEnabled()).toBe(false);
  });
});
