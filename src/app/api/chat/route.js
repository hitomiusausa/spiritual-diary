import { NextResponse } from "next/server";
import { KIRI_PERSONA } from "@/lib/kiriPersonality";

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1200;

const CHAT_MODE = `
これは占い結果のあとに続く、Kiriとの短い対話です。
- 直前の占い結果と今日の記録を会話の背景として使うが、毎回すべてを説明し直さない
- 返答は日本語の常体で、2〜5文。相手の言葉を一度だけ受け止め、必要なら小さな問いを1つ置く
- 断定、脅し、医療・金融・法律の専門助言はしない
- 相手が求めない限り、占いの柱や専門用語を増やしすぎない
- JSONではなく、返答本文だけを出力する
`;

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content);
}

function compactContext(context) {
  if (!context || typeof context !== "object") return "";
  const result = context.result || {};
  const entry = context.entry || {};
  return `
【今回の占い結果】
深いメッセージ: ${String(result.deepMessage || "").slice(0, 1200)}
直感へのメッセージ: ${String(result.innerMessage || "").slice(0, 600)}
アドバイス: ${String(result.actionAdvice || "").slice(0, 800)}

【今日の記録】
出来事/予定: ${String(entry.event || "").slice(0, 800)}
直感: ${String(entry.intuition || "").slice(0, 400)}
`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const messages = cleanMessages(body?.messages);
    if (!messages.length) {
      return NextResponse.json({ success: false, error: "Chat message is required" }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "Chat is not configured" }, { status: 503 });
    }

    const nickname = String(body?.userProfile?.nickname || "").trim().slice(0, 40);
    const dynamicContext = `${nickname ? `\n【呼びかけ】${nickname}さん` : ""}${compactContext(body?.context)}`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
        max_tokens: 420,
        temperature: 0,
        system: KIRI_PERSONA + CHAT_MODE + dynamicContext,
        messages,
      }),
    });

    if (!response.ok) {
      await response.text();
      console.error("[kiri-chat] upstream status", response.status);
      return NextResponse.json({ success: false, error: "Chat request failed" }, { status: 502 });
    }

    const data = await response.json();
    const reply = String(data?.content?.[0]?.text || "……").trim().slice(0, 1800);
    return NextResponse.json({ success: true, reply: reply || "……" });
  } catch (error) {
    console.error("[kiri-chat] request failed", error?.message ?? String(error));
    return NextResponse.json({ success: false, error: "Chat request failed" }, { status: 500 });
  }
}
