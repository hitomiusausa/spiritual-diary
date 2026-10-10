// サーバー側の不可逆変換。IPアドレスを平文で保存しないために使う（DECISIONS.md D-18）。
// node:crypto のみに依存する。

import { createHmac } from "node:crypto";

// 用途ごとに入力を分けるドメイン分離文字列。値を変えると既存のカウンタとは別キーになる。
const IP_HASH_DOMAIN = "kiri/v1/ip";
const IP_HASH_LENGTH = 22; // base64urlで約132ビット
// RevenueCatの匿名App User IDをRedisのキーやログに出すときの変換（DECISIONS.md D-26）。IPとは別ドメイン。
const APP_USER_ID_HASH_DOMAIN = "kiri/v1/rcid";
const APP_USER_ID_HASH_LENGTH = 22;

export function hashClientIp(secret, ip) {
  return createHmac("sha256", secret)
    .update(`${IP_HASH_DOMAIN}|${ip}`)
    .digest("base64url")
    .slice(0, IP_HASH_LENGTH);
}

// App User IDは購読の持ち主を指す値なので、平文ではキーにもログにも残さない。
export function hashAppUserId(secret, id) {
  return createHmac("sha256", secret)
    .update(`${APP_USER_ID_HASH_DOMAIN}|${id}`)
    .digest("base64url")
    .slice(0, APP_USER_ID_HASH_LENGTH);
}
