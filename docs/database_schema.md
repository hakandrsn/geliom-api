# Veritabanı Şeması (Database Schema)

Bu belge, **Geliom API** projesinde kullanılan veritabanı yapısını, tabloları, ilişkileri ve kullanılan veri tiplerini açıklamaktadır. Veritabanı **PostgreSQL** kullanılarak oluşturulmuştur ve **Prisma ORM** ile yönetilmektedir.

## Genel Bakış

Veritabanı temel olarak şu varlıklar üzerine kuruludur:

- **Users**: Sistem kullanıcıları (Firebase Auth ile senkronize).
- **Groups**: Kullanıcıların oluşturduğu veya katıldığı gruplar.
- **GroupMembers**: Gruplara üyelik ilişkisi (Many-to-Many).
- **UserStatuses**: Kullanıcıların grup bazlı anlık durumları.
- **JoinRequests**: Gruplara katılma istekleri.

---

## Enum Tipleri

Veritabanında kullanılan sabit liste (enum) tanımları.

| Enum Adı              | Değerler                          | Açıklama                                 |
| :-------------------- | :-------------------------------- | :--------------------------------------- |
| **Role**              | `ADMIN`, `MEMBER`                 | Grup içindeki kullanıcı rolünü belirler. |
| **JoinRequestStatus** | `PENDING`, `APPROVED`, `REJECTED` | Katılım isteğinin durumunu belirtir.     |

---

## Modeller (Tablolar)

### 1. User (users)

Kullanıcıların saklandığı tablodur. Kimlik doğrulama için Firebase UID kullanılır.

| Alan Adı        | Tip        | Özellikler                             | Açıklama                                                  |
| :-------------- | :--------- | :------------------------------------- | :-------------------------------------------------------- |
| **id**          | `String`   | `@id`                                  | Firebase Authentication UID'si (PK).                      |
| **email**       | `String`   | `@unique`                              | Kullanıının e-posta adresi.                               |
| **customId**    | `String`   | `@unique`, `@map("custom_id")`         | Kullanıcıya özel 8 karakterlik benzersiz ID (Görünür ID). |
| **displayName** | `String?`  | `@map("display_name")`                 | Görünen ad.                                               |
| **photoUrl**    | `String?`  | `@map("photo_url")`                    | Profil fotoğrafı URL'si.                                  |
| **createdAt**   | `DateTime` | `default(now())`, `@map("created_at")` | Kayıt tarihi.                                             |
| **updatedAt**   | `DateTime` | `@updatedAt`, `@map("updated_at")`     | Son güncelleme tarihi.                                    |

**İlişkiler:**

- `ownedGroups`: Kullanıcının sahibi olduğu gruplar.
- `groupMemberships`: Kullanıcının üye olduğu gruplar.
- `userStatuses`: Kullanıcının durum güncellemeleri.
- `joinRequests`: Kullanıcının gönderdiği grup katılım istekleri.

---

### 2. Group (groups)

Oluşturulan grupların tutulduğu tablodur.

| Alan Adı       | Tip        | Özellikler                             | Açıklama                                             |
| :------------- | :--------- | :------------------------------------- | :--------------------------------------------------- |
| **id**         | `String`   | `@id`, `UUID`                          | Grubun benzersiz kimliği (PK).                       |
| **name**       | `String`   |                                        | Grup adı.                                            |
| **inviteCode** | `String`   | `@unique`, `@map("invite_code")`       | Gruba katılmak için kullanılan benzersiz davet kodu. |
| **ownerId**    | `String`   | `@map("owner_id")`                     | Grubu kuran kullanıcının ID'si (FK -> User).         |
| **createdAt**  | `DateTime` | `default(now())`, `@map("created_at")` | Oluşturulma tarihi.                                  |

**İlişkiler:**

- `owner`: Grubu oluşturan kullanıcı (User).
- `members`: Gruptaki üyeler (GroupMember).
- `userStatuses`: Grup içindeki kullanıcı durumları.
- `joinRequests`: Gruba gelen katılım istekleri.

---

### 3. GroupMember (group_members)

Kullanıcılar ve Gruplar arasındaki çoktan çoğa (N-N) ilişkiyi tutar. Bir kullanıcı birden fazla gruba üye olabilir.

> **Not:** `userId` ve `groupId` alanları birlikte **Composite Primary Key** oluşturur.

| Alan Adı     | Tip        | Özellikler                 | Açıklama                                   |
| :----------- | :--------- | :------------------------- | :----------------------------------------- |
| **userId**   | `String`   | `@map("user_id")`          | Kullanıcı ID'si (FK).                      |
| **groupId**  | `String`   | `@map("group_id")`, `UUID` | Grup ID'si (FK).                           |
| **role**     | `Role`     | `default(MEMBER)`          | Kullanıcının gruptaki rolü (ADMIN/MEMBER). |
| **joinedAt** | `DateTime` | `default(now())`           | Gruba katılma tarihi.                      |

**İlişkiler:**

- `user`: İlgili kullanıcı.
- `group`: İlgili grup.

---

### 4. UserStatus (user_statuses)

Kullanıcıların belirli bir gruptaki anlık durumunu tutar. Her kullanıcının her grup için SADECE BİR durumu olabilir (Composite PK: userId + groupId).

| Alan Adı      | Tip        | Özellikler                      | Açıklama                            |
| :------------ | :--------- | :------------------------------ | :---------------------------------- |
| **userId**    | `String`   | `@map("user_id")`               | Durumu paylaşan kullanıcı (FK).     |
| **groupId**   | `String`   | `@map("group_id")`, `UUID`      | Durumun paylaşıldığı grup (FK).     |
| **text**      | `String`   |                                 | Durum metni (örn: "Toplantıdayım"). |
| **emoji**     | `String?`  |                                 | Durum emojisi.                      |
| **mood**      | `String?`  |                                 | Kullanıcının mod bilgisi.           |
| **updatedAt** | `DateTime` | `@default(now())`, `@updatedAt` | Durumun son güncellenme zamanı.     |

**İlişkiler:**

- `user`: Durumu paylaşan kullanıcı.
- `group`: Durumun ait olduğu grup.

---

### 5. JoinRequest (join_requests)

Davet kodu dışında, istek göndererek gruba katılma senaryoları için kullanılır.

| Alan Adı      | Tip                 | Özellikler                 | Açıklama                                    |
| :------------ | :------------------ | :------------------------- | :------------------------------------------ |
| **id**        | `String`            | `@id`, `UUID`              | İstek ID (PK).                              |
| **userId**    | `String`            | `@map("user_id")`          | İsteği gönderen kullanıcı (FK).             |
| **groupId**   | `String`            | `@map("group_id")`, `UUID` | Katılmak istenen grup (FK).                 |
| **status**    | `JoinRequestStatus` | `default(PENDING)`         | İsteğin durumu (PENDING/APPROVED/REJECTED). |
| **createdAt** | `DateTime`          | `default(now())`           | İstek tarihi.                               |
| **updatedAt** | `DateTime`          | `@updatedAt`               | Güncellenme tarihi.                         |

**İlişkiler:**

- `user`: İsteği yapan kullanıcı.
- `group`: Hedef grup.
