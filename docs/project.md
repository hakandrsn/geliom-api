# Geliom

1- kullanıcı mobil den firebase ile login olup token'ı api a gönderir ve burada bir kullanıcısı yoksa oluşur.
2- kullanıcı ilk kez giriyorsa grubu yoktur, oluşturabilir ya da grup id ile katılabilir.
3- kullanıcı grup oluşturursa admin olarak kayıtlı olur.
4- kullanıcı admin olduğu grubun adını değiştirebilir,
5- grubun bir açıklaması olabilir opsiyonel.
6- admin gruba yeni mood ve status ekleyebilir. bunlar eklenirlen sadece mood'da bildirim al ve ya alma seçilebilir.
7- yeni girmiş biri gruba katılma isteği gönderebilir. admin onaylı ya da onaylamaz. kullanıcı ekranda katılma isteklerinni lsitesini görebilir.
8- bir gruba katıldığında o gruba abone olursun o grupdaki değişiklerinin bilrimini alırsın ama istersen grup bildirimlerini kapatabilirsin ve ya kişiye özel bildirim kapatabilirsin.
9- kullanıcılar sadece aktif olduklarında dinleme yaparlar (mobile app'da).
10- admin kullanıcıyı gruptan atabilir.
11- bildirim alma sınırlaması vardır. Kullanıcı her mood değiştiğinde o değeri tutarız ve 15 sn sonra bildirim göndeririz. eğer kullanıcı tekrar mood değişirse 15 sn sıfırlanır. bildirimler onesignal ile gönderilir.

### premium özellikler

1- bir kullanıcı free olarak kayıtlı olur. premium üyelik için ödeme yapar.
2- kullanıcı sadece 1 gruba girebilir free olarak.
3- premium olarak 7 gruba katılabilir.
4- admin free ise gruba mood ve statu ekleyemez premium ise ekleyebilir ama max 10 tane grup başına.
5- free gruplar max 5 üye alır, premium gruplar max 20 üye alabilir.
6- premium işlemleri adapty ile yapılır adapty webhook dan dinlenir ve burası öyle güncellenir. socket ile dinlerken kullanıcının premium olma durumuda dinlenecek eğer olursa anlık değişimi görebilecek.
