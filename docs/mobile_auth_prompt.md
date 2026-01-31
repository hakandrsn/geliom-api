<!-- Bu dokümanı kopyalayıp Mobil Geliştiriciye veya AI Asistanına verebilirsiniz -->

# React Native (Expo) & Backend Entegrasyon Yönergesi

**Amaç:** Geliom API ile tam uyumlu, Firebase tabanlı Authentication ve Socket katmanını kurmak.

## 1. Backend & Auth Mimarisi

Backend sistemi **"Token-Based Lazy Creation"** mantığıyla çalışır.

- **Register Endpoint'i YOKTUR.**
- Kullanıcı veritabanında (Postgres) önceden kayıtlı değildir.
- Geçerli bir Firebase Token ile gelen **ilk** istekte, backend kullanıcıyı otomatik oluşturur.

**Strateji:**
Mobil tarafta login (Firebase) başarılı olduğunda, veritabanında kaydın oluşması için backend'e "boş" bir istek (Handshake) atılmalıdır.

---

## 2. Uygulama Adımları

Lütfen aşağıdaki yapıyı kur:

### A. Auth Provider & User Sync

1.  **Firebase Login:** Kullanıcıyı Google/Email ile login et.
2.  **Sync İsteği:** `onAuthStateChanged` içinde kullanıcı oturum açtığı an:
    - Backend'in **`GET /auth/me`** endpoint'ine istek at.
    - Bu istek, kullanıcının backend veritabanında oluşmasını sağlar.
3.  **State:** Backend'den dönen kullanıcı bilgilerini (özellikle `customId` vb.) global state'e kaydet.

### B. Axios & Token Yönetimi

- Global bir `axios` instance oluştur.
- **Interceptor:** Her isteğin header'ına güncel token'ı ekle:
  ```javascript
  // Request Interceptor
  const token = await firebase.auth().currentUser.getIdToken(true); // true = force refresh
  config.headers.Authorization = `Bearer ${token}`;
  ```
- Bu yapı, "Token expired" hatalarını önlemek için kritiktir.

### C. Socket.io Client

- Socket bağlantısı **Auth Token** gerektirir.
- **Connection Config:**
  ```javascript
  const socket = io(API_URL, {
    auth: {
      token: await firebase.auth().currentUser.getIdToken(),
    },
  });
  ```
- **Otomatik Oda (Room) Katılımı:** Backend, bağlantı anında kullanıcıyı üye olduğu grupların odalarına otomatik ekler. Client'ın `join` atmasına gerek yoktur.
- **Event Dinleme:** `statusUpdate` eventi ile gruptaki durum güncellemelerini alabilirsin.
  - Payload: `{ userId, groupId, text, emoji, mood }`
