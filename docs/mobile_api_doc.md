<!-- Bu dokümanı kopyalayıp Mobil Geliştiriciye veya AI Asistanına verebilirsiniz -->

# Geliom API — Mobil Entegrasyon Rehberi

Bu belge mobil uygulamanın API'yi nasıl kullanacağını anlatır. İki katman vardır:

1. **REST API** — profil, grup yönetimi, katılım istekleri gibi "nadir" işlemler.
2. **Socket.io (Session)** — grup ekranı açıkken canlı veri akışı ve status güncelleme.

> Temel model: **Grup ekranına girerken socket üzerinden bir "session" açılır.** Grubun tüm verisi (üyeler, statüler, mood'lar) tek seferde gelir; sonrasında tüm değişiklikler patch event'leriyle canlı akar. Status güncelleme REST'ten değil, **sadece socket'ten** yapılır.

---

## 1. Genel Kurallar

- **Base URL:** `https://<host>/api` (tüm REST endpoint'leri `api/` prefix'i ile başlar)
- **Swagger:** `https://<host>/docs`
- **Auth:** Tüm REST endpoint'leri `Authorization: Bearer <FIREBASE_ID_TOKEN>` ister (istisna: `GET /auth/health` ve webhook).
- **Lazy user creation:** İlk doğrulanmış istekte kullanıcı backend'de otomatik oluşturulur (Firebase token'daki email zorunlu). Login sonrası ilk çağrı olarak `GET /users/me` önerilir.
- **Tarihler:** Her yerde ISO 8601 string (`"2026-07-09T17:30:00.000Z"`).
- **Hata formatı:** Standart NestJS yapısı:
  ```json
  { "statusCode": 409, "message": "Zaten bu grubun üyesisiniz", "error": "Conflict" }
  ```
  Validation hatalarında `message` bir string dizisidir.
- **Bilinmeyen body alanları reddedilir** (`forbidNonWhitelisted`) — fazladan alan göndermeyin, 400 döner.

### Hata kodları

| Kod | Anlam |
|-----|-------|
| 400 | Validation hatası (eksik/geçersiz alan) |
| 401 | Token yok / geçersiz / süresi dolmuş |
| 404 | Kayıt bulunamadı (grup, kullanıcı, istek) |
| 409 | İş kuralı ihlali (limit dolu, zaten üye, admin değil...) |
| 429 | Rate limit aşıldı |

---

## 2. Veri Modelleri

### User

```json
{
  "id": "firebase_uid",
  "email": "user@test.com",
  "customId": "A1B2C3D4",
  "displayName": "Hakan",
  "photoUrl": "https://...",
  "isPremium": false,
  "subscriptionStatus": null,
  "groupIds": ["grp_abc"],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Group (session state'in tamamı)

```json
{
  "id": "grp_abc",
  "name": "Aile",
  "description": null,
  "inviteCode": "AB3K9X",
  "ownerId": "uid_1",
  "ownerIsPremium": true,
  "version": 42,
  "members": {
    "uid_1": {
      "role": "ADMIN",
      "displayName": "Hakan",
      "photoUrl": null,
      "customId": "A1B2C3D4",
      "isMuted": false,
      "joinedAt": "..."
    },
    "uid_2": { "role": "MEMBER", "...": "..." }
  },
  "statuses": {
    "uid_1": { "text": "Toplantıdayım", "emoji": "💻", "mood": "busy", "updatedAt": "..." }
  },
  "customMoods": [
    { "id": "mood_...", "text": "Kahve molası", "emoji": "☕", "mood": "relaxed", "createdAt": "..." }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

- `members` ve `statuses` **userId ile key'lenmiş map**'lerdir, dizi değildir.
- `version` her değişimde artar — client, patch'leri sırayla uygulamak ve kaçırılan güncellemeyi tespit etmek için kullanır (bkz. §4.4).

### Premium limitleri (409 mesajlarının kaynağı)

| Limit | Free | Premium |
|-------|------|---------|
| Üye olunabilecek grup sayısı | 1 | 7 |
| Grup üye kapasitesi (owner'ın planına göre) | 5 | 20 |
| Custom mood ekleme | ❌ | ✅ (grup başına 10) |

---

## 3. REST Endpoint'leri

### Auth

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/auth/me` | Token'ı doğrular, kullanıcı yoksa oluşturur; kısa profil döner |
| GET | `/auth/health` | Public health check |

### Users

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/users/me` | Tam kullanıcı profili (yukarıdaki User modeli) |
| PATCH | `/users/me` | Profil güncelle — body: `{ "displayName"?, "photoUrl"? }`. Rate limit: 10/dk. Değişiklik, üyesi olunan tüm gruplara canlı yansıtılır. |
| GET | `/users/me/groups` | Grup listesi özeti (aşağıda) |
| GET | `/users/by-custom-id/:customId` | customId ile kullanıcı ara — `{ found, user? }` döner (sadece public alanlar) |
| DELETE | `/users/me` | Hesabı kalıcı siler. Sahibi olduğu gruplar tamamen silinir, üyesi olduklarından çıkarılır. Rate limit: 1/saat. |

`GET /users/me/groups` response elemanı:

```json
{
  "id": "grp_abc",
  "name": "Aile",
  "description": null,
  "inviteCode": "AB3K9X",
  "ownerId": "uid_1",
  "role": "ADMIN",
  "memberCount": 4,
  "joinedAt": "..."
}
```

> Grup listesi ekranı için bu endpoint yeterlidir. Üyeler/statüler dahil **tam grup verisi** yalnızca socket'te `session:open` ile gelir — ayrı bir `GET /groups/:id` endpoint'i yoktur ve gerekmez.

### Groups

| Method | Path | Body | Açıklama |
|--------|------|------|----------|
| POST | `/groups` | `{ "name": string }` (1-100 kr) | Grup oluştur; çağıran ADMIN olur. Tam grup objesi döner (`inviteCode` içinde). |
| POST | `/groups/join` | `{ "inviteCode": string }` (6 kr) | Davet koduyla direkt katıl |
| DELETE | `/groups/:id/leave` | — | Gruptan ayrıl (aktif session varsa kapanır). **Admin başka üyeler varken ayrılamaz (409)** — önce tüm üyeleri çıkarmalıdır. Grupta yalnızsa ayrılmak grubu siler (`groupDeleted: true` döner). |
| DELETE | `/groups/:id/members/:userId` | — | **Admin:** üyeyi gruptan çıkar (kendini çıkaramaz — 409). Çıkarılana `session:closed { reason: 'removed' }`, kalanlara `member.left` patch'i gider. |
| POST | `/groups/:id/join-request` | — | Katılım isteği gönder (admin onaylı akış). Admin'e push gider. |
| GET | `/groups/:id/requests` | — | **Admin:** bekleyen istekler — `[{ id, userId, displayName, status, createdAt, respondedAt }]` |
| POST | `/groups/:id/requests/:requestId/respond` | `{ "response": "APPROVED" \| "REJECTED" }` | **Admin:** isteği yanıtla. Onaylanana push gider. |
| PATCH | `/groups/:id` | `{ "name"?, "description"? }` | **Admin:** grubu güncelle (canlı yayınlanır) |
| POST | `/groups/:id/moods` | `{ "text", "emoji"?, "mood" }` | **Admin + Premium:** custom mood ekle (canlı yayınlanır) |
| DELETE | `/groups/:id/moods/:moodId` | — | **Admin:** custom mood sil (canlı yayınlanır) — `{ id, deleted: true }` döner |
| POST | `/groups/:id/mute` | `{ "isMuted": boolean }` | Bu grubun push bildirimlerini benim için aç/kapat |

---

## 4. Socket.io — Session Katmanı

### 4.1 Bağlantı

```ts
import { io } from 'socket.io-client';

const socket = io('https://<host>', {
  auth: { token: firebaseIdToken }, // Firebase ID token — Bearer prefix YOK
});
```

- Token geçersizse sunucu bağlantıyı anında keser.
- Bağlantı, kullanıcının tüm hedefli event'leri (`premium:update` gibi) alması için yeterlidir; grup verisi için ayrıca session açılır.
- **Reconnect sonrası session otomatik geri gelmez** — `connect` event'inde grup ekranı açıksa `session:open`'ı tekrar gönderin.
- Firebase ID token ~1 saatte expire olur; reconnect'te güncel token'ı verin (`auth` callback veya yeniden bağlanmadan önce `socket.auth` güncelleyin).

### 4.2 Client → Server event'leri

Hepsi **ack callback** ile yanıt döner: `{ ok: true, ...data }` veya `{ ok: false, error: "mesaj" }`.

**`session:open`** — grup ekranına girerken:

```ts
socket.emit('session:open', { groupId }, (res) => {
  if (res.ok) {
    // res.group  : tam Group objesi (§2)
    // res.version: mevcut versiyon
    // res.onlineUserIds: şu an session'da online olan userId listesi
  }
});
```

- Kullanıcı başına **tek aktif session** vardır: başka grupta session açıksa otomatik kapanır (o ekrana `session:closed { reason: 'switched' }` gelir).
- Üyesi olunmayan grup için `ok: false` döner.

**`session:close`** — grup ekranından çıkarken:

```ts
socket.emit('session:close', {}, (res) => { /* { ok: true } */ });
```

**`status:update`** — durum paylaş (aktif session'daki gruba işlenir, `groupId` gönderilmez):

```ts
socket.emit('status:update', { text: 'Toplantıdayım', emoji: '💻', mood: 'busy' }, (res) => {
  // res.ok === true ise res.status işlenen StatusEntry'dir
});
```

- Kurallar: `text` zorunlu (1-200 kr), `emoji` ≤16 kr, `mood` ≤50 kr.
- Rate limit: 10 istek / 10 sn (aşımda `ok: false`).
- Önce `session:open` gerekir; yoksa `ok: false` döner.

### 4.3 Server → Client event'leri

| Event | Payload | Ne zaman |
|-------|---------|----------|
| `session:state` | `{ group, version, onlineUserIds }` | `session:open` sonrası tam state (ack ile aynı içerik) |
| `session:update` | `{ version, event, patch?, removed? }` | Gruptaki her değişimde |
| `presence:update` | `{ userId, online }` | Bir üye session'a girip çıktığında |
| `session:closed` | `{ reason }` | Session sunucu tarafından kapatıldığında |
| `premium:update` | `{ isPremium }` | Kendi premium durumun değiştiğinde (session gerekmez) |

**`session:update` event tipleri:** `status.updated`, `member.joined`, `member.left`, `group.updated`, `mood.added`, `mood.removed`, `premium.changed`

> `mood.added` / `mood.removed` patch'i her zaman **tam `customMoods` listesini** içerir (diziler olduğu gibi değiştirilir).

**`session:closed` reason değerleri:**

| reason | Anlam | Mobil aksiyonu |
|--------|-------|----------------|
| `removed` | Gruptan çıktın/çıkarıldın | Grup ekranını kapat, listeyi yenile |
| `deleted` | Grup silindi | Grup ekranını kapat, listeyi yenile |
| `switched` | Başka grupta session açtın | Eski ekranı kapat |
| `server` | Sunucu kaynaklı kapanış | Yeniden `session:open` dene |

### 4.4 Patch uygulama

`session:update` geldiğinde local `group` objesine uygulayın:

1. **`patch`** — deep-partial merge: objeler derin birleştirilir, **diziler olduğu gibi değiştirilir** (`customMoods` her zaman tam liste gelir).
2. **`removed`** — silinecek path listesi, örn. `["members.uid_2", "statuses.uid_2"]` → o key'leri map'ten silin.
3. **`version`** — local versiyonla karşılaştırın: `version !== localVersion + 1` ise güncelleme kaçırdınız demektir → `session:open`'ı tekrar gönderip tam state alın.

Örnek `status.updated` event'i:

```json
{
  "version": 43,
  "event": "status.updated",
  "patch": {
    "statuses": {
      "uid_2": { "text": "Evdeyim", "emoji": "🏠", "updatedAt": "..." }
    }
  }
}
```

---

## 5. Push Bildirimleri (OneSignal)

- Mobil taraf OneSignal SDK'da **external user ID = Firebase UID** set etmelidir (`OneSignal.login(firebaseUid)`). Backend hedeflemeyi bununla yapar.
- **Status push kuralı:** Bir üye status güncellediğinde 15 sn'lik debounce sonrası, gruptaki diğer üyelere push gider. Şu kişilere **gitmez**: statüyü paylaşan, grubu mute edenler (`POST /groups/:id/mute`), o an session'da olanlar (zaten canlı gördüler).
- Diğer push'lar: katılım isteği (admin'e), istek onayı (istek sahibine).
- Push `data` alanı: `{ type: "status_update" | "join_request" | "request_approved", groupId, ... }` — deep-link için kullanın.

---

## 6. Önerilen Mobil Akış

1. **Login sonrası:** `GET /users/me` → profil + `groupIds`. Socket bağlantısını kur.
2. **Ana ekran:** `GET /users/me/groups` ile listeyi doldur.
3. **Grup ekranına giriş:** `session:open` → gelen `group` ile ekranı çiz, `onlineUserIds` ile online göstergelerini işaretle. `session:update` / `presence:update` dinle.
4. **Status paylaş:** `status:update` emit et; ack'teki `status` ile optimistic UI'ı doğrula.
5. **Grup ekranından çıkış:** `session:close` gönder (arka plana düşünce de önerilir — socket kopunca sunucu zaten kapatır).
6. **Grup yönetimi:** oluşturma/katılma/istek işlemleri REST'ten; sonuçları zaten session event'leri veya liste yenilemesi yansıtır.
