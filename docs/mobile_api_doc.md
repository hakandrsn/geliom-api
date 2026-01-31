<!-- Bu dokümanı kopyalayıp Mobil Geliştiriciye veya AI Asistanına verebilirsiniz -->

# Geliom API - Detaylı Endpoint Dokümantasyonu

Bu belge, Frontend/Mobil ekibi için hazırlanmış **API Entegrasyon Rehberi** niteliğindedir.

---

## 1. Temel Prensipler

- **Authentication:** Tüm endpointler (aksi belirtilmedikçe) `Authorization: Bearer <FIREBASE_ID_TOKEN>` header'ını zorunlu kılar.
- **Response Format:** Başarılı istekler genellikle JSON döner. Hatalar standart HTTP kodları (400, 401, 404, 409) ve JSON hata mesajı içerir.
- **Socket.io:** Real-time işlemler için Socket gateway kullanılır (Ayrıca detaylandırılmıştır).

---

## 2. Kullanıcı Modülü (Users)

Kullanıcının kendi profili ve hesap ayarları ile ilgili işlemler.

### A. Profil Bilgileri (`/users/me`)

- **GET** `/users/me`
  - Mevcut kullanıcının detaylarını getirir. Login sonrası **ilk** çağrılması gereken endpoint budur (Handshake görevi görür).
  - **Response:**
    ```json
    {
      "id": "firebase_uid",
      "email": "user@test.com",
      "customId": "A1B2C3D4", // Kullanıcının paylaşılabilir ID'si
      "displayName": "User Name",
      "photoUrl": "...",
      "createdAt": "..."
    }
    ```

- **PATCH** `/users/me`
  - Profili günceller.
  - **Body:**
    ```json
    {
      "displayName": "Yeni İsim", // Opsiyonel
      "photoUrl": "..." // Opsiyonel
    }
    ```

- **DELETE** `/users/me`
  - Hesabı kalıcı olarak siler.
  - **Not:** Rate Limit (1 saatte 1 deneme) vardır.

### B. Kullanıcı Arama (`/users/by-custom-id/:customId`)

- **GET** `/users/by-custom-id/:customId`
  - Başka bir kullanıcıyı `customId` (8 karakterlik kod) ile aramak için kullanılır.
  - **Response:**
    ```json
    {
      "found": true,
      "user": {
        "displayName": "...",
        "photoUrl": "..."
      }
    }
    ```

### C. Gruplarım (`/users/me/groups`)

- **GET** `/users/me/groups`
  - Kullanıcının üye olduğu (**veya sahibi olduğu**) tüm grupları listeler.
  - **Kullanım:** "Gruplarım" ekranını doldurmak için kullanılır.

---

## 3. Grup Modülü (Groups)

Grup oluşturma, katılma ve yönetme işlemleri.

### A. Grup Oluşturma (`/groups`)

- **POST** `/groups`
  - Yeni bir grup oluşturur. Oluşturan kişi otomatik olarak **ADMIN** (Owner) olur.
  - **Body:**
    ```json
    {
      "name": "Aile Grubu"
    }
    ```
  - **Response:** Oluşturulan grup objesi (içinde benzersiz `inviteCode` bulunur).

### B. Gruba Katılma (Kod ile) (`/groups/join`)

- **POST** `/groups/join`
  - Davet kodu (`inviteCode`) ile bir gruba direkt katılmak için kullanılır.
  - **Body:**
    ```json
    {
      "inviteCode": "XYZ123"
    }
    ```

### C. Gruba Katılma İsteği (`/groups/:id/join-request`)

- **POST** `/groups/:id/join-request`
  - Davet kodu olmadan, grup ID'si bilinen bir gruba katılma isteği gönderir (Admin onayı gerektirir).

### D. Grup Yönetimi (Admin Only)

- **GET** `/groups/:groupId/requests`
  - Gruba gelen bekleyen (PENDING) katılım isteklerini listeler.
  - Sadece Grup Admin'i çağırabilir.

- **POST** `/groups/:groupId/requests/:requestId/respond`
  - İsteği onaylar veya reddeder.
  - **Body:**
    ```json
    {
      "response": "APPROVED" // veya "REJECTED"
    }
    ```

### E. Gruptan Ayrılma (`/groups/:id/leave`)

- **DELETE** `/groups/:id/leave`
  - Kullanıcının gruptan çıkmasını sağlar.

---

## 4. Durum Modülü (Status)

Anlık durum paylaşımı.

### A. Durum Güncelleme (`/status`)

- **POST** `/status`
  - Belirli bir grupta durumunu günceller.
  - Bunu çağırdığınızda backend otomatik olarak o gruptaki herkese **Socket Event** gönderir.
  - **Body:**
    ```json
    {
      "groupId": "uuid-...",
      "text": "Toplantıdayım",
      "emoji": "💻", // Opsiyonel
      "mood": "happy" // Opsiyonel
    }
    ```

---

## 5. Eksik / Notlar (Backend ile Görüşülecek)

- ⚠️ **Grup Üyeleri Listesi:** Mevcut API'de bir grubun **üyelerini** (`members`) listeleyen public bir endpoint (`GET /groups/:id/members`) görünmüyor. Üye listesini görmek için Backend developer'dan bu endpoint'in açılmasını talep etmelisiniz veya `GET /users/me/groups` içindeki detaylara bakmalısınız (eğer member listesi gömülüyse).
- ⚠️ **Grup Detayı:** `GET /groups/:id` endpoint'i de mevcut listede görünmüyor.

## 6. Önerilen Mobil Akış (Prompt)

1.  **Ana Sayfa:** `GET /users/me/groups` ile grupları listele.
2.  **Grup Detay:** Listeden bir gruba tıklandığında, o grubun ID'si ile işlem yap.
3.  **Durum Paylaş:** Kullanıcı bir durum seçtiğinde `POST /status` çağır. (Socket dinlemeyi unutma).
4.  **Yeni Grup:** "+" butonuna basınca `POST /groups` veya `POST /groups/join` kullandır.
