<!-- Bu dokümanı Mobil Geliştiriciye veya AI Asistanına Prompt olarak veriniz -->

# Geliom API - Derinlemesine Teknik Dokümantasyon

**Rol:** Senior Backend Engineer & Architect
**Bağlam:** Mobil uygulama (React Native) geliştiricisi için API kullanım kılavuzu.

---

## 1. Kimlik Doğrulama (Authentication)

Tüm endpoint'ler entegre **Firebase Auth** yapısını kullanır.

- **Header Formatı:** `Authorization: Bearer <FIREBASE_ID_TOKEN>`
- **Token Refresh:** Her istekte `currentUser.getIdToken(true)` ile taze token alınıp gönderilmelidir.
- **Lazy Sync:** Backend'de "Kayıt Ol" butonu/endpoint'i yoktur. Login olan kullanıcı token ile `GET /auth/me` veya `GET /users/me` çağırdığında veritabanında otomatik oluşturulur.

---

## 2. API Endpoint Detayları

### A. Kullanıcılar (Users)

**Base URL:** `/users`

| Metod    | Endpoint     | Açıklama                              | Body / Params                 | Response            |
| :------- | :----------- | :------------------------------------ | :---------------------------- | :------------------ |
| `GET`    | `/me`        | Kişisel profil bilgileri (Handshake). | -                             | `User` Objesi       |
| `PATCH`  | `/me`        | Profil güncelleme.                    | `{ displayName?, photoUrl? }` | `User` Objesi       |
| `DELETE` | `/me`        | Hesabı silme.                         | -                             | `{ success: true }` |
| `GET`    | `/me/groups` | Üye olunan grupları listeleme.        | -                             | `Group[]` Listesi   |

### B. Gruplar (Groups)

**Base URL:** `/groups`

| Metod   | Endpoint                           | Açıklama               | Body                                     | Kurallar & Hatalar                                       |
| :------ | :--------------------------------- | :--------------------- | :--------------------------------------- | :------------------------------------------------------- |
| `POST`  | `/`                                | Yeni grup oluştur.     | `{ name: string }`                       | **Limit:** Free (1), Premium (7). Hata: 409 Conflict.    |
| `POST`  | `/join`                            | Kod ile katıl.         | `{ inviteCode: string }`                 | **Kapasite:** Grup doluysa (Free:5, Prem:20) hata döner. |
| `PATCH` | `/:id`                             | Grup güncelle (Admin). | `{ name?, description? }`                | Sadece Admin yapabilir.                                  |
| `POST`  | `/:id/join-request`                | Katılma isteği gönder. | -                                        | Davet kodu yoksa bu kullanılır.                          |
| `GET`   | `/:id/requests`                    | İstekleri gör (Admin). | -                                        | Pending istekleri listeler.                              |
| `POST`  | `/:id/requests/:requestId/respond` | İsteği onayla/reddet.  | `{ response: 'APPROVED' \| 'REJECTED' }` | Onaylarken kapasite kontrolü yapılır.                    |

### C. Durum (Status)

**Base URL:** `/status`

| Metod  | Endpoint | Açıklama        | Body                               | Response     |
| :----- | :------- | :-------------- | :--------------------------------- | :----------- |
| `POST` | `/`      | Durum güncelle. | `{ groupId, text, emoji?, mood? }` | `UserStatus` |

**Not:** Bu endpoint çağrıldığında backend şunları yapar:

1.  Veritabanını günceller.
2.  Socket.io üzerinden gruba `statusUpdate` eventi atar.
3.  **Bildirim Mantığı:**
    - Eğer son 15 saniye içinde bildirim gitmediyse, grup üyelerine Push Notification gönderir.
    - Grubu sessize alan (Mute) üyeler bildirim almaz.

---

## 3. Veri Modelleri (Types)

### Status Update Payload (Socket & API)

```typescript
interface StatusUpdate {
  userId: string;
  groupId: string;
  text: string; // Örn: "Toplantıdayım"
  emoji?: string; // Örn: "💻"
  mood?: string; // Örn: "busy" (Teknik kod)
  updatedAt: string; // ISO Date
}
```

### Premium Limits (Referans)

Mobil uygulama bu limitlere göre UI gösterebilir (Kilit ikonu vb).

```javascript
/* src/common/constants/premium.constants.ts */
export const LIMITS = {
  FREE: {
    MAX_GROUPS: 1,
    MAX_MEMBERS: 5,
    CUSTOM_MOOD: false,
  },
  PREMIUM: {
    MAX_GROUPS: 7,
    MAX_MEMBERS: 20,
    CUSTOM_MOOD: true,
  },
};
```

---

## 4. Özel Durumlar (Edge Cases)

1.  **Grup Kapasitesi Dolu:**
    - Kullanıcı katılmaya çalıştığında `409 Conflict` döner. Mesaj: `"Bu grup maksimum üye kapasitesine ulaştı..."`
    - Mobil taraf bu mesajı kullanıcıya göstermelidir.

2.  **Socket Bağlantısı:**
    - Socket bağlantısı koparsa, tekrar bağlandığında son durumları görmek için `GET /users/me/groups` (veya ilgili grup detay endpointi) çağrılmalıdır.

3.  **Hata Kodları:**
    - 401: Unauthorized (Token yok/geçersiz).
    - 404: Grup/Kullanıcı bulunamadı.
    - 409: Mantıksal çakışma (Limit aşımı, Zaten üye, Yetki yok).
