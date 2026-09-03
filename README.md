# NYVEN V1 — Frontend

**Intelligence, built for what’s next.**

NYVEN is a premium AI platform frontend created by VEXDYN.  
This repository contains the complete V1 frontend experience.

## Status

- ✅ Complete polished frontend
- ✅ All primary pages (Home, Chat, Build, Builder, Projects, NYVEN+, Settings, Profile)
- ✅ Official NYVEN visual identity & N states
- ✅ First-visit cinematic intro + returning visitor loading
- ✅ Thinking / processing animation language
- ✅ Mobile-first responsive design
- ✅ Mock interactions ready for later backend integration
- ❌ No Gemini / Supabase / Auth / Payments (intentionally deferred)

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- React Router
- Lucide icons

## Getting started

```bash
cd nyven
npm install
npm run dev
```

Open the local URL shown in the terminal.

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  assets/          # Official NYVEN N + wordmark (transparent)
  components/      # Reusable UI (NIdentity, Sidebar, ChatMessage, Composer…)
  pages/           # Home, Chat, Build, Builder, Projects, NYVEN+, Settings, Profile
  lib/             # Types + mock data
  App.tsx          # Routing + intro orchestration
  index.css        # Design system + ambient background
```

## Design system

- Background: `#07090D`
- Surface: `#111722`
- Text: `#F5F7FA` / `#8993A4`
- Accent cyan: `#62E6FF`
- Accent violet: `#8B7CFF`
- Display: Space Grotesk
- UI: Inter

## Future integration path

```
NYVEN Frontend
      ↓
Supabase (auth, projects, conversations)
      ↓
Secure server function
      ↓
Gemini API
      ↓
NYVEN response
```

All mock data and response generators are isolated in `src/lib/mockData.ts` so they can be replaced cleanly.

## Notes

- Assets are used exactly as supplied (processed only for transparency).
- No Login / Sign Up pages in V1.
- Respects `prefers-reduced-motion`.
- Mobile navigation: bottom bar + drawer for secondary items.
```
