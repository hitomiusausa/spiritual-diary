# App Review notes (draft, 2026-11-14)

- Source: adversarial safety/legal/App Store review (B-1, B-2, B-6), building on `docs/releases/app-store-2026-10-16.md`.
- D-27: describe the app honestly as a journal with reflective readings. Do not write "NOT a fortune-telling app".
- D-44 (4.3(b)): lead with journaling, look-back, safety and on-device storage. Do not use the word "Destiny". Screenshots: write → look back → Kiri's reflection → chat → lock/backup; do not show the hint (color/number/direction) or score sections. Category: Health & Fitness. If rejected, reply with the template in `07-appstore-4.3b.md` §6.
- Before submitting, confirm the items marked [CONFIRM] against the actual build and App Store Connect.

---

## Notes for the reviewer (paste into App Store Connect)

```text
Kiri is a Japanese-language journaling app for mood and daily reflection. Users write about their day (events, feelings and intuitions), keep their entries privately on the device, and look back on them in the Look Back (振り返り) screen [CONFIRM: describe the final design]. Kiri, an AI companion, responds to each entry with a short, gentle reflection that helps the user notice patterns in their own words.

To shape the tone of these reflections, the app uses two traditional rhythm systems as a lens: a biorhythm cycle and the East Asian sexagenary calendar (known as Four Pillars). They appear only in collapsed "details" sections of the result screen. Kiri does not make predictions, and its words are not medical, financial or legal advice. The app states in the chat panel and in the Terms that Kiri's words are AI-generated.

No account or sign-in is required for the diary. The UI is bundled in the app. Native features include persistent on-device storage, backup export through the iOS share sheet, backup import, haptics, and App Lock with iOS authentication. A privacy screen can hide the app's content in the app switcher.

To test the diary: enter a nickname and a birth date (birth time and gender are optional), record a short daily event, and tap the reading button. Before the first AI request, a consent dialog explains the transfer to Anthropic (United States) through our server. Declining does not send the entry. Consent can be withdrawn in Settings.

Safety features: if an entry or chat message contains expressions of self-harm or suicidal thoughts, the app shows Japanese crisis hotlines (services listed by the Ministry of Health, Labour and Welfare, including lines for people under 18) before any reading, switches the AI reading to a gentle supportive mode, and does not call the AI for that chat message. The Terms state that the app is not an emergency service.

Subscription "Kiriと話す" (free chat with Kiri, iOS only): [CONFIRM product ID com.kugainc.kiri.talk.monthly and trial] The diary and readings remain free. To test in the sandbox: open a reading result, tap the chat entry, purchase (a one-week free trial is offered to first-time subscribers), send a message, then use "Restore Purchases" in Settings. Chat is limited to 60 messages per day (resets at midnight JST). After the subscription ends, past conversations remain readable on the device but new messages cannot be sent.

A network connection is required for a new AI reading. The server has request and daily usage limits; please contact info@kugainc.com if a limit prevents testing.

Privacy policy: https://kiri.kugainc.com/privacy
Terms: https://kiri.kugainc.com/terms
Support: https://kiri.kugainc.com/support
```

## Before submitting (owner checklist)

- [CONFIRM] The global analysis limit (`DAILY_LIMIT_ANALYZE: "30"` in `wrangler.jsonc`) is shared by all users. Raise it, or exempt the reviewer, around the review and launch dates so the reviewer is not blocked (B-6).
- [CONFIRM] Age rating: 13+ or higher is recommended (diary free text, low mood, AI conversation). Check the current questionnaire items about AI and wellness in App Store Connect (B-5).
- [CONFIRM] App Privacy answers match the subscription build (RevenueCat anonymous ID, purchases, device information) (B-7).
- [CONFIRM] Add a link to the 特定商取引法に基づく表記 page once it exists (see `tokushoho-draft.md`).
- [CONFIRM] Put the EULA / Terms link in the App Store description.
