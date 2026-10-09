import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DYNAMIC_TYPE_ATTR,
  DYNAMIC_TYPE_BOOT_SCRIPT,
  DYNAMIC_TYPE_ENABLED,
  DYNAMIC_TYPE_LARGE_ATTR,
  DYNAMIC_TYPE_LARGE_SCALE,
  DYNAMIC_TYPE_MAX_SCALE,
  DYNAMIC_TYPE_MIN_SCALE,
  IOS_DEFAULT_BODY_PX,
  dynamicTypeRootPx,
} from "@/lib/dynamicType";

describe("dynamicTypeRootPx", () => {
  it("iOS の既定（標準 = 17px）では Web と同じ 16px", () => {
    expect(IOS_DEFAULT_BODY_PX).toBe(17);
    expect(dynamicTypeRootPx(17)).toBe(16);
  });

  it("大きい文字では比例して大きくなる（XL 19px・XXL 21px）", () => {
    expect(dynamicTypeRootPx(19)).toBeCloseTo(17.88, 2);
    expect(dynamicTypeRootPx(21)).toBeCloseTo(19.76, 2);
  });

  it("上限 135% で止める（アクセシビリティサイズでも夜の画面を崩さない）", () => {
    expect(DYNAMIC_TYPE_MAX_SCALE).toBe(1.35);
    expect(dynamicTypeRootPx(28)).toBe(21.6);
    expect(dynamicTypeRootPx(53)).toBe(21.6);
  });

  it("小さい文字の設定でも 16px より小さくしない", () => {
    expect(DYNAMIC_TYPE_MIN_SCALE).toBe(1);
    expect(dynamicTypeRootPx(14)).toBe(16);
  });

  it.each([[NaN], [0], [-3], [undefined], ["abc"]])("読めない値（%s）は null（何もしない）", (value) => {
    expect(dynamicTypeRootPx(value)).toBeNull();
  });
});

// head の同期スクリプトを、偽の window/document で実行する。
function runBoot({ native, bodyPx = "17px" }) {
  const listeners = {};
  const appended = [];
  const root = {
    style: {},
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    appendChild(node) { appended.push(node); node.parentNode = this; },
    removeChild(node) { appended.splice(appended.indexOf(node), 1); },
  };
  const state = { bodyPx };
  const bodyChildren = [];
  const body = {
    appendChild: (node) => { bodyChildren.push(node); node.parentNode = body; },
    removeChild: (node) => { bodyChildren.splice(bodyChildren.indexOf(node), 1); },
  };
  const observers = [];
  const document = {
    documentElement: root,
    body: null,
    visibilityState: "visible",
    createElement: () => ({ style: {}, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } }),
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const isProbe = (node) => node.style.font === "-apple-system-body" || /-apple-system-body/.test(node.style.cssText || "");
  const window = {
    Capacitor: native === undefined ? undefined : { isNativePlatform: () => native },
    getComputedStyle: (node) => ({ fontSize: isProbe(node) ? state.bodyPx : "16px" }),
    ResizeObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe(node) { this.node = node; }
    },
  };
  new Function("window", "document", DYNAMIC_TYPE_BOOT_SCRIPT)(window, document);
  // head で実行された後、body ができて DOMContentLoaded が来る
  const domReady = () => { document.body = body; listeners.DOMContentLoaded?.(); };
  return { root, listeners, appended, state, document, domReady, bodyChildren, observers };
}

describe("DYNAMIC_TYPE_BOOT_SCRIPT", () => {
  it("Web（Capacitor なし・Web プラットフォーム）では何も変えない", () => {
    for (const native of [undefined, false]) {
      const { root, listeners } = runBoot({ native, bodyPx: "21px" });
      expect(root.style.fontSize).toBeUndefined();
      expect(root.attrs).toEqual({});
      expect(listeners.visibilitychange).toBeUndefined();
    }
  });

  it("iOS アプリでは文字の大きさを html に反映し、目印を付ける（測った要素は残さない）", () => {
    const { root, appended } = runBoot({ native: true, bodyPx: "21px" });
    expect(root.style.fontSize).toBe("19.76px");
    expect(root.attrs[DYNAMIC_TYPE_ATTR]).toBeDefined();
    expect(appended).toHaveLength(0);
  });

  it("iOS の既定サイズでも目印を付け、16px のまま", () => {
    const { root } = runBoot({ native: true, bodyPx: "17px" });
    expect(root.style.fontSize).toBe("16px");
    expect(root.attrs[DYNAMIC_TYPE_ATTR]).toBeDefined();
  });

  it("設定アプリで変えて戻ってきたら（visibilitychange）測り直す", () => {
    const { root, listeners, state } = runBoot({ native: true, bodyPx: "17px" });
    state.bodyPx = "23px";
    listeners.visibilitychange();
    expect(root.style.fontSize).toBe("21.6px");
  });

  it("前景のまま（コントロールセンターなどで）変えても、見えない測り用の要素の大きさの変化で測り直す", () => {
    const { root, state, domReady, bodyChildren, observers } = runBoot({ native: true, bodyPx: "17px" });
    domReady();
    expect(bodyChildren).toHaveLength(1);
    expect(bodyChildren[0].attrs["aria-hidden"]).toBe("true");
    expect(observers).toHaveLength(1);
    expect(observers[0].node).toBe(bodyChildren[0]);
    state.bodyPx = "21px";
    observers[0].fn();
    expect(root.style.fontSize).toBe("19.76px");
  });

  it("Web では測り用の要素を置かない", () => {
    const { domReady, bodyChildren, listeners } = runBoot({ native: false });
    expect(listeners.DOMContentLoaded).toBeUndefined();
    domReady();
    expect(bodyChildren).toHaveLength(0);
  });

  it("大きい文字（120% 以上）では、狭い画面向けの組み方に切り替える目印も付け、戻したら外す", () => {
    expect(DYNAMIC_TYPE_LARGE_SCALE).toBe(1.2);
    const xl = runBoot({ native: true, bodyPx: "19px" });
    expect(xl.root.attrs[DYNAMIC_TYPE_LARGE_ATTR]).toBeUndefined();
    const { root, listeners, state } = runBoot({ native: true, bodyPx: "21px" });
    expect(root.attrs[DYNAMIC_TYPE_LARGE_ATTR]).toBeDefined();
    state.bodyPx = "17px";
    listeners.visibilitychange();
    expect(root.attrs[DYNAMIC_TYPE_LARGE_ATTR]).toBeUndefined();
  });

  it("測れないときは何も変えない", () => {
    const { root } = runBoot({ native: true, bodyPx: "" });
    expect(root.style.fontSize).toBeUndefined();
    expect(root.attrs).toEqual({});
  });
});

describe("結線", () => {
  const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

  it("layout が head でスクリプトを読み込む（フラグで切れる）", () => {
    expect(typeof DYNAMIC_TYPE_ENABLED).toBe("boolean");
    const layout = read("src/app/layout.js");
    expect(layout).toContain("DYNAMIC_TYPE_BOOT_SCRIPT");
    expect(layout).toContain("DYNAMIC_TYPE_ENABLED");
  });

  it("目印があるときだけ余白（--spacing）を px に固定し、文字だけを大きくする", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(new RegExp(`html\\[${DYNAMIC_TYPE_ATTR}\\]\\s*\\{[^}]*--spacing:\\s*4px`));
  });

  it("大きい文字の目印のときだけ、見出し・ヒント・同意ボタンの組み方を変える（Web と標準サイズは不変）", () => {
    const css = read("src/app/globals.css");
    for (const hook of ["kiri-dt-section-head", "kiri-dt-hint-grid", "kiri-dt-actions"]) {
      expect(css).toMatch(new RegExp(`html\\[${DYNAMIC_TYPE_LARGE_ATTR}\\][^{]*\\.${hook}`));
      expect(css).not.toMatch(new RegExp(`^\\s*\\.${hook}`, "m"));
    }
    const diary = read("src/components/SpiritualDiary.jsx");
    expect(diary).toContain("kiri-dt-section-head");
    expect(diary).toContain("kiri-dt-hint-grid");
    expect(read("src/components/ConsentModal.jsx")).toContain("kiri-dt-actions");
  });

  it("画面の文字に px 固定の text-[NNpx] を使わない（大きくならないため）", () => {
    for (const file of ["SpiritualDiary.jsx", "LockScreen.jsx", "ConsentModal.jsx", "SupportCard.jsx", "KiriChatPanel.jsx", "DocPage.jsx"]) {
      expect(read(`src/components/${file}`)).not.toMatch(/text-\[\d+px\]/);
    }
  });
});
