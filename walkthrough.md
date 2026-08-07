# Simplify-Sync — Walkthrough

ran command : npm i socket.io socket.io-client better-sqlite3 multer zod react-hook-form @hookform/resolvers zustand @tiptap/react @tiptap/pm @tiptap/starter-kit lucide-react qrcode.react
ran command : npm i -D @types/better-sqlite3 @types/multer tsx nodemon concurrently
updated scripts in package.json : #L4-8
updated next.config.ts added serverExternalPackages : #L4-5
created .env.local at project root
created database folder with .gitkeep
created uploads folder with .gitkeep
updated .gitignore added database and uploads exclusions
created src/db/sqlite.ts with database init and helpers : #L1-192
created src/lib/utils/ApiError.ts : #L1-12
created src/lib/utils/ApiResponse.ts : #L1-17
created src/lib/utils/asyncHandler.ts : #L1-21
created server.ts : #L1-33
created src/lib/discovery/udp.ts : #L1-27
created src/lib/discovery/qr/route.ts : #L1-41
created src/components/pairing/QRgenerator.tsx : #L1-67
created src/components/pairing/PairingCheckingModal.tsx : #L1-96
ran command : npm i axios
created middleware.ts : #L1-27
created src/app/api/device/route.ts : #L1-15
created src/app/api/device/[id]/route.ts : #L1-28
created src/store/deviceStore.ts : #L1-19
created src/components/devices/DeviceCard.tsx : #L1-37
created src/components/devices/DeviceManager.tsx : #L1-41
created src/lib/socket/index.ts : #L1-49
updated server.ts : #L1-36
created src/store/chatStore.ts : #L1-69
created src/app/api/chat/route.ts : #L1-16
created src/components/chat/ChatWindow.tsx : #L1-105
updated src/components/devices/DeviceCard.tsx : #L1-46
updated src/components/devices/DeviceManager.tsx : #L1-53
updated src/app/page.tsx : #L1-31
created src/app/api/upload/route.ts : #L1-35
created src/app/api/file/route.ts : #L1-33
updated src/app/api/chat/route.ts : #L1-20
updated src/components/chat/ChatWindow.tsx : #L1-120