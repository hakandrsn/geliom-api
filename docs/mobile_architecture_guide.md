<!-- Bu doküman mobil geliştirici için bir "Master Prompt" niteliğindedir -->

# Geliom API - Mobil Mimari ve Entegrasyon Rehberi

Bu belge, uygulamanın veri akışını, kurallarını ve API kullanım detaylarını içerir.

---

## 1. Mimari Prensipler

### A. Kimlik Doğrulama (Auth)

- **Sistem:** Firebase Auth + Backend Lazy Sync.
- **Kural:** Uygulama açılışında ve her login sonrasında Mutlaka `GET /auth/me` çağrılmalıdır. Bu, backend'in kullanıcıyı tanımasını ve oluşturmasını sağlar.
- **Header:** Tüm isteklerde `Authorization: Bearer <FIREBASE_ID_TOKEN>` zorunludur. Axios Interceptor ile token her zaman güncel tutulmalıdır.

### B. Premium Sistemi ve Limitler

Backend, tüm limit kontrollerini yapar ve aşım durumunda `409 Conflict` hatası döner. Mobil taraf bu hataları kullanıcıya (Alert/Toast) göstermelidir.

| Özellik              | Free Kullanıcı     | Premium Kullanıcı  | Hata Durumu                                 |
| :------------------- | :----------------- | :----------------- | :------------------------------------------ |
| **Grup Üyeliği**     | Max **1** (Toplam) | Max **7** (Toplam) | `Maksimum grup limitine ulaştınız.`         |
| **Grup Kapasitesi**  | **5** Kişi         | **20** Kişi        | `Bu grup maksimum üye kapasitesine ulaştı.` |
| **Özel Mood Ekleme** | ❌ Yok             | ✅ Var (Max 10)    | `Özel mood eklemek Premium özelliğidir.`    |

### C. Real-Time ve Bildirimler

- **Socket.io:** Durum güncellemeleri anlık olarak socket üzerinden gelir (`statusUpdate` eventi).
- **Push Bildirimleri:**
  - **Debounce:** Kullanıcı durumunu peş peşe değiştirirse, sistem **son 15 saniye** içinde bildirim gittiyse yenisini göndermez (Spam koruması).
  - **Mute (Sessize Alma):** Kullanıcı grubu sessize aldıysa bildirim gitmez. Socket verisi gelmeye devam eder.

---

## 2. API Kullanım Detayları

### Kullanıcı İşlemleri

- **Profil:** `GET /users/me` -> `{ id, customId, displayName, photoUrl, isPremium }`
  - `isPremium` alanı UI'da kilit ikonlarını veya "Premium'a Geç" bannerlarını yönetmek için kullanılmalıdır.
- **Gruplarım:** `GET /users/me/groups` -> Listeleme ekranı için.

### Grup Yönetimi

- **Oluşturma:** `POST /groups` -> `{ name: "..." }` (Limit kontrolü var).
- **Güncelleme:** `PATCH /groups/:id` -> `{ name: "...", description: "..." }` (Sadece Admin).
- **Mute Ayarı (Eksik):** Şu an için `NotificationSetting` backend tarafında var ama endpoint'i (`PUT /groups/:id/mute`) henüz açılmadı. Şimdilik arayüzde "Mute" butonu koyabilirsin, backend hazır olunca bağlanacak.

### Durum Paylaşımı

- **Güncelle:** `POST /status` -> `{ groupId, text, emoji, mood }`
- **Custom Mood Ekle:** `POST /groups/:id/moods` (Bu endpoint henüz servis seviyesinde hazırlandı, controller'a bağlanmadı. Şimdilik sabit moodları kullanın).

---

## 3. Veri Yapıları (Örnek)

### User Object

```json
{
  "id": "firebase_uid",
  "customId": "X9Y2Z1",
  "displayName": "Ahmet",
  "photoUrl": "https://...",
  "isPremium": false
}
```

### Group Object

```json
{
  "id": "uuid",
  "name": "Ailem",
  "description": "Özel aile grubu",
  "ownerId": "firebase_uid",
  "maxMembers": 5 // Grubun kapasitesi (Sahibinin premium durumuna göre değişir)
}
```

### Notification Payload (OneSignal)

```json
{
  "type": "status_update",
  "groupId": "uuid",
  "userId": "firebase_uid"
}
```

---

## 4. Geliştirici Notları (Prompt)

- **Hata Yönetimi:** API'den dönen `message` alanını kullanıcıya göstermek çoğu durumda yeterlidir (Özellikle 409 hatalarında).
- **Optimistik UI:** Status güncellerken cevabı beklemeden UI'ı güncelle, hata gelirse geri al.
- **Socket Reconnection:** Uygulama arka plandan ön plana gelince socket bağlantısını kontrol et (`socket.connect()`).
