# FormFlow AI

Turn long, boring forms into a quick conversation. FormFlow AI guides each person step by step and collects clean, validated answers — no more half-finished paperwork.

## What it does
- Conversational onboarding: name, work email, role, start date
- Smart validation as you type (including email checks)
- Step tracker + progress bar so people know where they are
- Celebration recap at the end you can copy into HR tools

## Getting started
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Demo mode vs live AI

Out of the box it runs in **demo mode**: the built-in guide knows the 4 onboarding questions, so everything works with no key and no cost. To plug in a real model:

```bash
cp .env.example .env.local
```

| Flag | What it does | Default |
| ---- | ------------ | ------- |
| `LLM_PROVIDER` | `mock` = built-in demo guide, $0 · `gemini` = Google AI · `openai` = OpenAI | `mock` |
| `GEMINI_API_KEY` | Needed only when `LLM_PROVIDER=gemini` | — |
| `OPENAI_API_KEY` | Needed only when `LLM_PROVIDER=openai` | — |

Going live:
1. Set `LLM_PROVIDER=gemini` (or `openai`) in `.env.local`
2. Add the matching API key
3. Restart `npm run dev` — the chat keeps the exact same questions, validation, and streaming

No key? Leave everything as is — demo mode is the full experience.

## Tech
Next.js (App Router) + TypeScript + Tailwind CSS. Real-time answers with streaming, animated with Framer Motion, end-to-end tested with Playwright (`npm run test:e2e`).
