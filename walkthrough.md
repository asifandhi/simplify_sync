# Simplify-Sync — Walkthrough

## Recent Fixes & Enhancements (Web App)

### 1. SQLite Database Synchronization 
- **Fixed `FOREIGN KEY constraint failed` error**: 
  - **Issue**: Next.js custom server (`server.ts`) was loading the `sqlite.ts` connection before `.env` was fully initialized. This caused `DB_PATH` to evaluate to `undefined`, which led `better-sqlite3` to silently spin up a volatile in-memory database.
  - **Fix**: Added a robust fallback path in `src/db/sqlite.ts` (`process.env.DB_PATH || path.join(process.cwd(), "database", "Simplify-Sync.db")`), ensuring the Socket.io server and Next.js API routes always share the exact same physical database file.

### 2. Next.js Routing Loops 
- **Fixed `ERR_TOO_MANY_REDIRECTS`**:
  - **Issue**: Modernizing `req.url` parsing with the WHATWG `new URL()` standard broke Next.js's internal routing engine, which strictly expects the legacy `UrlWithParsedQuery` object format.
  - **Fix**: Reverted `server.ts` to use `url.parse(req.url, true)`, successfully eliminating infinite redirect loops on the client.

### 3. Socket.io & React State Duplication
- **Fixed `warnOnInvalidKey` and Duplicate Chat Bubbles**:
  - **Issue 1**: The server was broadcasting `io.to(device_id).emit`, which sent the message back to the sender in addition to the explicit `socket.emit` confirmation. This caused the UI to receive the exact same payload twice.
  - **Issue 2**: React Strict Mode race conditions caused `axios.get` history fetching and live socket appends to collide.
  - **Fix**: Modified `src/lib/socket/index.ts` to use `socket.to(device_id).emit` (broadcasting to everyone *except* the sender). Added strict deduplication logic to the Zustand `messages` array in `src/store/chatStore.ts`. Prefixed React keys with `msg-` and `fallback-` to mathematically guarantee zero key collisions in `ChatWindow.tsx`.

### 4. UI Polish & Theme Optimization
- **Eliminated Theme "Lag"**: Removed a sluggish `0.3s` global `background-color` transition from `src/app/globals.css` to make the theme toggle instant and snappy.
- **Relocated Theme Switcher**: Migrated the theme toggle button out of the Settings panel and directly into the left `NavigationRail` for better accessibility and standard UX.
- **Hydration Safety**: Added `suppressHydrationWarning` to the `layout.tsx` HTML tag to prevent React from complaining about DOM manipulations caused by the theme switcher.

## Historic Setup
- Bootstrapped Next.js 15 app with `socket.io`, `socket.io-client`, `better-sqlite3`, `zustand`, `lucide-react`, and Tailwind CSS.
- Initialized local SQLite database with `devices`, `chat_history`, and `settings` tables.
- Implemented UDP broadcast for automatic local network discovery (`src/lib/discovery/udp.ts`).
- Created dynamic Chat UI with TipTap formatting, drag-and-drop file support, and clipboard synchronization hooks.
- Configured dynamic API routes for device pairing, message retrieval, and file uploads.