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
- Fixed auth bypass in middleware.ts by validating request IP is local.
- Fixed 0.0.0.0 binding in server.ts to use localhost.
- Fixed wildcard CORS in socket/index.ts to process.env.SOCKET_CORS_ORIGIN || http://localhost:3000.
- Added key whitelist to setSetting in setting/route.ts.
- Gated debug logs in socket/index.ts behind process.env.NODE_ENV === development.
- Added backpressure drain-await and error event cleanup in upload/route.ts and transfer/route.ts.
- Replaced full-buffer readFile with createReadStream streaming in file/route.ts.
- Added 100-character cap on sanitized filenames in upload/route.ts and transfer/route.ts to prevent ENAMETOOLONG.
- Added global process.on('unhandledRejection') handler in server.ts to prevent process crashes.
- Restored 0.0.0.0 binding in server.ts so mobile devices on the LAN can reach the PC host.
- Fetched and merged/deduped missed messages on socket connect in chatStore.ts.
- Extracted 6KB base64 default profile image from userStore.ts to static /public/default-profile.jpg and updated store to reference URL.
- Added instant message clearing on deviceId change in ChatWindow.tsx to eliminate old message flash between conversation switches.
- Added global persistent connection status indicator to NavigationRail.tsx visible on all views.
- Implemented UDP discovery Socket.io emission in udp.ts and wired live toast notification in chatStore.ts on incoming pings.
- Implemented real-time profile synchronization for Android device name and avatar: extended SYNC_PROFILE in socket/index.ts and sqlite.ts to persist updated names and avatars, broadcasted PROFILE_SYNCED via io.emit to all web clients, updated chatStore.ts and useDeviceStore to reflect updates live in the sidebar (DeviceCard.tsx), and bound live reactive store properties in page.tsx and devices/page.tsx so ChatWindow header displays the actual device name, photo, and ID in real time without refreshing.
- Replaced the "All" dropdown in Chat sidebar with a self-contained in-app ZoomControl stepper (`−`, percentage badge, `+`, `Reset`): integrated `zoomLevel` into persisted `useUserStore` (range 67%–150%), applied `--app-zoom` via CSS `zoom: var(--app-zoom)` on `#app-root` (with `@supports not (zoom: 1)` transform fallback), synced in `NavigationRail.tsx` and restored on pre-hydration in `layout.tsx` to eliminate layout flicker, providing clean high-density layout scaling without browser zoom bars.
- Added natural, subtle UI animations to the web Chat UI:
  - **3-Dot Dropdown Menu (`Select Messages` / `Clear Chat`)**: Anchored entrance animation (`140ms ease-out`, `scale(0.95)` → `scale(1)`, `opacity: 0` → `opacity: 1`, `origin-top-right`) and matching exit animation (`120ms ease-out`, `scale(1)` → `scale(0.95)`, fade-out) when closing via button toggle, outside click, or `Escape` key.
  - **Live Message Entrance Animations**: Subtle slide-up + horizontal nudge + fade-in (`180ms ease-out`, 10px vertical slide with +8px nudge from right for sent messages, -8px nudge from left for received messages) isolated strictly to newly arriving live messages during the active session. Initial history loads, chat switching, and pagination (`loadMore`) render statically with zero animation replays.
- **Image Message Bubble Padding & Frame Polish**:
  - Replaced the edge-to-edge `py-1` (4px top) sliver layout for image messages with an intentional photo frame design: applied uniform `p-2.5` (10px) padding around image content, framing the image with the bubble's full background color (`#1E9CF1` for sent, surface container for received).
  - Styled the image with `rounded-xl` and subtle borders to nest harmoniously inside the bubble's `rounded-2xl` corner radius.
  - Overlayed both the small SVG download button (`absolute bottom-2 left-2`) and the message timestamp badge (`absolute bottom-2 right-2`) directly onto the image with translucent dark pills (`bg-black/50 backdrop-blur-xs`), creating a clean, completely self-contained photo card with no extra bottom bar while leaving text and file bubbles untouched.
  - Enabled native drag-and-drop for chat images to external applications, desktop, and file explorer using Chromium's `DownloadURL` protocol and `text/uri-list`, with `cursor-grab active:cursor-grabbing` cursor feedback, while guarding internal chat dragover events with `isDraggingInternalRef`.
  - Constrained image bubble dimensions to compact chat-native proportions (`max-w-[260px] sm:max-w-[300px]`, `max-h-48 sm:max-h-52`) to eliminate oversized image display on desktop.
  - Preserved existing `flex items-end py-1 pl-3.5 pr-2` padding for text, file, and link preview bubbles with zero visual regressions.
