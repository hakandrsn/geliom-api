# Geliom API

NestJS + Firestore + Socket.io ile geliştirilmiş, session tabanlı gerçek zamanlı mobil uygulama backend'i.

## Mimari

- **Database**: Firestore (grup başına **tek doküman** — üyeler, status'ler ve custom mood'lar tek objede)
- **Authentication**: Firebase Auth (JWT validation)
- **Real-time**: Socket.io **session** sistemi — kullanıcı bir grup için session açar, grubun tüm verisi sunucu belleğinde tek obje olarak tutulur, her değişiklik session'daki herkese anında yayınlanır
- **Push**: OneSignal — session'da OLMAYAN üyelere 15 sn debounce ile push; session'dakiler değişikliği zaten socket'ten görür
- **Premium**: Adapty webhook ile güncellenir; free 1 grup / premium 7 grup, grup kapasitesi 5/20, custom mood premium-only (max 10)

### Session modeli

- Kullanıcı birden fazla gruba üye olabilir ama **aynı anda tek grupta session** açabilir.
- Başka grupta `session:open` gönderilirse önceki session `switched` sebebiyle otomatik kapanır.
- Grup verisi bellekte "canlı obje" olarak tutulur; yazmalar 1 sn coalesce edilerek Firestore'a yansıtılır. Son üye ayrıldıktan 60 sn sonra obje bellekten düşer.
- REST üzerinden yapılan değişiklikler de (join onayı, grup güncelleme vb.) aynı canlı objeden geçer ve session'a anında yayınlanır.

## Socket Event Sözleşmesi

Bağlantı: `io(URL, { auth: { token: <firebaseIdToken> } })`

### Client → Server (hepsi ack döner: `{ok: true, ...}` veya `{ok: false, error}`)

| Event | Payload | Açıklama |
|---|---|---|
| `session:open` | `{ groupId }` | Grup session'ı açar; `session:state` yayınlanır. Başka gruptaki session otomatik kapanır. |
| `session:close` | `{}` | Aktif session'ı kapatır. |
| `status:update` | `{ text, emoji?, mood? }` | Status/mood günceller. `groupId` gönderilmez — aktif session'dan çözülür. |

### Server → Client

| Event | Payload | Açıklama |
|---|---|---|
| `session:state` | `{ group, version, onlineUserIds }` | Açılışta/resync'te grubun tam objesi. |
| `session:update` | `{ version, event, patch, removed? }` | Değişiklik yayını. `event`: `status.updated`, `member.joined`, `member.left`, `group.updated`, `mood.added`, `premium.changed`. `patch` deep-merge edilir, `removed` path'leri silinir (örn. `members.abc123`). Diziler (`customMoods`) olduğu gibi değiştirilir. |
| `presence:update` | `{ userId, online }` | Session'a giren/çıkan üye. |
| `session:closed` | `{ reason }` | `removed` (gruptan atıldın), `deleted` (grup silindi), `switched` (başka grupta session açtın), `server`. |
| `premium:update` | `{ isPremium }` | Kullanıcının kendi premium durumu değişti. |

**Client resync kuralı:** `session:update.version !== localVersion + 1` ise veya socket reconnect olduysa `session:open`'ı tekrar gönder — tam `session:state` ile eşitlenirsin. Sunucu restart'ı bu şekilde kendini onarır.

## Firestore Veri Modeli

```
users/{uid}                     → email, customId, displayName, photoUrl,
                                  isPremium, subscriptionStatus, groupIds[]
groups/{groupId}                → name, description, inviteCode, ownerId,
                                  ownerIsPremium, version,
                                  members{uid: {role, displayName, photoUrl, customId, isMuted, joinedAt}},
                                  statuses{uid: {text, emoji, mood, updatedAt}},
                                  customMoods[]
groups/{groupId}/joinRequests/  → userId, displayName, status, createdAt, respondedAt
inviteCodes/{CODE}              → groupId        (uniqueness lookup)
customIds/{CUSTOMID}            → userId         (uniqueness lookup)
```

## REST Endpoints (prefix: `/api`)

- `GET  /auth/me`, `GET /auth/health` (public)
- `GET/PATCH/DELETE /users/me`, `GET /users/me/groups`, `GET /users/by-custom-id/:customId`
- `POST /groups`, `POST /groups/join`, `DELETE /groups/:id/leave`
- `POST /groups/:id/join-request`, `GET /groups/:id/requests`, `POST /groups/:id/requests/:requestId/respond`
- `PATCH /groups/:id`, `POST /groups/:id/moods`, `POST /groups/:id/mute`
- `POST /webhooks/adapty` (public, `Authorization: <ADAPTY_WEBHOOK_SECRET>` ile doğrulanır)

Swagger: `/docs`

## Proje Yapısı

```
src/
├── auth/           # Firebase JWT doğrulama, lazy user sync
├── users/          # Kullanıcı yönetimi, custom ID üretimi
├── groups/         # Grup CRUD, join request, mood, mute
├── session/        # Socket.io gateway + session yönetimi (mutateGroup)
├── adapty/         # Adapty webhook → premium güncelleme
├── notifications/  # OneSignal + push debounce (15 sn)
├── firebase/       # Firebase Admin + Firestore provider, doküman tipleri
├── logger/         # Pino logger module
├── rate-limit/     # In-memory rate limiting (HTTP)
└── common/         # Guards, decorators, filters
```

## Kurulum

### Gereksinimler

- Node.js 20+
- Firebase projesi (Auth + Firestore)

### Local Development

1. **Bağımlılıkları yükle:**

```bash
npm install
```

2. **Environment dosyasını oluştur:**

```bash
cp env.example .env
```

3. **Firebase service account anahtarını indir:**

Firebase Console > Project Settings > Service Accounts > Generate new private key
→ `firebase-service-account.json` olarak proje köküne koy (gitignore'da).

4. **Çalıştır:**

```bash
npm run start:dev
```

Lokal test için Firestore emülatörü kullanılabilir:

```bash
firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run start:dev
```

## Bildirim Akışı

1. Kullanıcı `status:update` gönderir → session'daki herkese anında `session:update` yayınlanır.
2. Session'da olmayan, mute etmemiş üyeler için 15 sn'lik debounce başlar; bu sürede yeni güncelleme gelirse süre sıfırlanır.
3. Süre dolunca **en güncel** status ile OneSignal push atılır. Push anında session açmış üyeler listeden çıkarılır.
