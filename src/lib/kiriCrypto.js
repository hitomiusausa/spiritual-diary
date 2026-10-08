// サーバー側の不可逆変換。IPアドレスを平文で保存しないために使う（DECISIONS.md D-18）。
// node:crypto のみに依存する。

import { createHmac } from "node:crypto";

// 用途ごとに入力を分けるドメイン分離文字列。値を変えると既存のカウンタとは別キーになる。
const IP_HASH_DOMAIN = "kiri/v1/ip";
const IP_HASH_LENGTH = 22; // base64urlで約132ビット

export function hashClientIp(secret, ip) {
  return createHmac("sha256", secret)
    .update(`${IP_HASH_DOMAIN}|${ip}`)
    .digest("base64url")
    .slice(0, IP_HASH_LENGTH);
}
