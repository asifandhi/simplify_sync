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
