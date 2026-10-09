// テスト用: Capacitor の registerPlugin が返す Proxy を再現する。
// 未知のプロパティ（`then` を含む）はすべて「未実装のネイティブ呼び出し」になる。
// これをそのまま await / async 関数から return すると止まる（storage.capacitorProxy.test.js 参照）。
export function capacitorLikeProxy(name, methods) {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop in methods) return methods[prop];
        return () => Promise.reject(new Error(`"${name}.${String(prop)}()" is not implemented on ios`));
      },
    },
  );
}

export function withTimeout(promise, ms = 500) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}
