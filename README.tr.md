# Ayva

Bilgisayar ekranını evde ya da her yerden TV'ye veya telefona aktar ve bilgisayarı o cihazdan kontrol et.
Bilgisayarda Ayva'yı aç ve **Paylaşımı başlat**a bas. TV uygulaması bilgisayarı kendisi bulur. Telefon, QR kodla herhangi bir ağdan bağlanabilir.

[English](README.md)

- **TV'de yazı yazmak yok:** Android TV uygulaması ağdaki bilgisayarları bulur ve kendiliğinden bağlanır.
- **Her yerden:** internet erişimini aç, telefonla QR kodu okut. Hesap ya da modem ayarı gerekmez.
- **Uzaktan kontrol:** bilgisayarın faresini ve klavyesini telefondan (touchpad), TV kumandasından ya da başka bir bilgisayarın tarayıcısından kullan.
- **Dosya ve pano:** bilgisayar ile telefon arasında dosya ve yazı gönder.
- **Telefon bilgisayarda:** Android telefonun ekranını ve sesini ya da herhangi bir telefonun kamerasını bilgisayarda bir pencerede göster, telefonu fareyle kullan.
- **Kimin bağlanacağına sen karar verirsin:** yeni cihazlar bilgisayarda onaylanmadan bağlanamaz. Hatırlanan cihazlar sormadan bağlanır, istediğin cihazın bağlantısını tek tıkla kesebilirsin.
- **Doğrudan bağlantı:** görüntü WebRTC ile doğrudan bilgisayardan izleyen cihaza gider. 1440p 60 FPS'e kadar, sesli.
- **Arka planda çalışır:** Ayva saat yanındaki simgeye küçülebilir ve Windows ile birlikte başlayabilir.

## Kurulum

İki dosyayı da [Releases](../../releases) sayfasından indir.

**Bilgisayar (Windows 10/11):** `Ayva-Setup-x.y.z.exe` dosyasını çalıştır. Windows SmartScreen programın imzasız olduğunu söyleyebilir: **Ek bilgi → Yine de çalıştır** de. Kurulum, güvenlik duvarında Ayva'ya sadece yerel ağ için izin verir.

**TV (Android TV / Google TV / Android uydu alıcıları, ör. Next Start 4K):** `Ayva-Android.apk` dosyasını kur:

1. APK'yı bir USB belleğe kopyala ve TV'ye ya da alıcıya tak.
2. Bir dosya yöneticisiyle aç. Yoksa Google Play'den **File Commander** ya da **X-plore** kur.
3. Sorulduğunda bu kaynaktan uygulama yüklenmesine izin ver.

**Android telefon (önerilen):** Releases sayfasını telefonda aç, `Ayva-Android.apk` dosyasını indir (TV'dekiyle aynı uygulama), aç ve tarayıcından uygulama yüklenmesine izin ver. Evde uygulama bilgisayarı kendisi bulur. Dışarısı için **📷 QR kodu tara**'ya dokunup bilgisayardaki Ayva'da görünen kodu tara (telefonun kendi kamerası kodu tarayıcıda açar), ya da **+ Sabit adres ekle**'ye dokunup adresi yapıştır. Sabit adres bir sonraki sefer için saklanır. Uygulama telefonun [cihaz anahtarını](#güvenlik) Android'in güvenli kasasında (Keystore) tutar; mikrofonu, dosya göndermeyi ve kayıtları kaydetmeyi de halleder.

**iPhone / iPad:** Apple, App Store dışından uygulama kurulmasına izin vermediği için Ayva Safari'de çalışır. **Sabit adresi** Safari'de aç, sonra **Paylaş → Ana Ekrana Ekle**'ye dokun. Ayva'nın kendi simgesi olur ve uygulama gibi tam ekran açılır. Kendine ait bir hafızası olur, yani Safari geçmişini silmek cihaz anahtarını silmez. Mikrofon da orada çalışır.

**Diğer telefonlar ve tarayıcılar:** hiçbir şey kurmana gerek yok. QR kodu okut ya da Ayva'da yazan linki aç. Bir tarayıcının hatırlanabilmesi için https bir adres gerekir (sabit adres ya da internet linki). `http://192.168.x.x` adresinde izleyebilir ama her seferinde sorulur.

## Kullanım

1. Bilgisayarda **Ayva**'yı aç, kaliteyi seç (1080p 60 FPS iyi bir başlangıç) ve **Paylaşımı başlat**a bas.
2. **Tüm ekran**'ı ya da tek bir pencereyi seç.
3. **TV:** TV'de Ayva'yı aç. **Evdeki telefon:** "TV'de şunu aç" altındaki adresi aç. **Dışarıdaki telefon:** aşağıdaki bölüme bak.
4. Bir cihaz ilk kez bağlandığında bilgisayar **İzin ver / Reddet** diye sorar. **Bu cihazı hatırla** işaretliyse bir dahaki sefere sormaz.

Ayva penceresinin bölümleri soldadır: **Paylaş**, **İzle** (bir telefonun ekranı ya da kamerası burada), **Cihazlar**, **Uzaktan erişim**, **Geçmiş** ve **Ayarlar**. Logonun altındaki **‹** onları yalnızca simgelere daraltır. Sağ alt köşedeki tutamak pencereyi büyütür ya da küçültür; **Ayarlar → Renkler** altı renk temasından birini seçer (telefonda aynısı **Daha** altında).

Kod ve bu bilgisayarın adresleri Ayva açıldığı andan itibaren **Göster**'e basana kadar **bulanıktır**, böylece kimse ekranından okuyamaz; paylaşım her başladığında ya da durduğunda yeniden bulanıklaşır.

Paylaşım sırasında:

- **Ekranı değiştir**, kimsenin bağlantısını koparmadan paylaşılan ekranı ya da pencereyi değiştirir.
- Ayva penceresinin kendisi **yayına girmez**; **Uzaktan erişim** altındaki linkler de bulanık görünür (kendi **Göster** butonuyla).
- **Dosya gönder**, **Panoyu gönder** ve **Gizlilik modu** paylaşım butonlarının yanındaki **⋯** butonunun altındadır.
- **Bağlı cihazlar** bölümü kimlerin izlediğini gösterir. Her cihazın yanında **Bağlantıyı kes** butonu var. Hatırlanan cihazları da oradan unutabilirsin.

## Her yerden izleme

Ayva'da **Uzaktan erişim** altındaki **İnternetten erişimi aç**'a bas. İlk seferde Cloudflare'in ücretsiz tünel aracı `cloudflared` indirilir (~60 MB, Cloudflare'in GitHub sayfasından).
Ardından Ayva bir `https://….trycloudflare.com` linki ve **QR kod** gösterir. Telefonla mobil veride ya da herhangi bir Wi-Fi'de okut.

- Link uzun, rastgele bir **erişim anahtarı** içerir. İnternet üzerinden 6 haneli kod tek başına yetmez.
- 10 yanlış denemeden sonra o adres 15 dakika engellenir.
- İnternet erişimini kapatıp açınca **yeni link** oluşur, eskisi çalışmaz.
- İnternetten bağlananlar sadece izleyebilir. Kontrol için ayrıca senin izin vermen gerekir.

Cloudflare bu hızlı tünelleri ücretsiz ama test amaçlı sunuyor. Kesintisiz çalışma garantisi yok.

**Görüntü hiç gelmezse** ("Yayına bağlanılıyor…"da kalırsa), iki ağ birbirine doğrudan ulaşamıyor demektir. Bazı mobil operatörlerde ve şirket ağlarında bu olabilir. Çözümü [yedek yol](#yedek-yol-cloudflare-turn).

## Sabit adres (Cloudflare, ücretsiz)

Ayva'da **Uzaktan erişim** altındaki **Sabit adres kur (Cloudflare)**'a bas ve penceredeki adımları izle: ücretsiz bir Cloudflare hesabında "Edit Cloudflare Workers" şablonuyla bir API anahtarı oluşturup Ayva'ya yapıştır, bir izleme şifresi belirle. Ayva kendini hesabına yükler ve `https://ayva.<adın>.workers.dev` gibi **hiç değişmeyen** bir link ve QR kod verir. Telefon bir kez şifre girer, sonra her seferinde aynı linkten bağlanır.

**Telefon "Sunucuya bağlanılıyor"da kalıyorsa:** bazı internet sağlayıcıları `workers.dev` adreslerini engelliyor. Chrome'da **⋮ → Ayarlar → Gizlilik ve güvenlik → Güvenli DNS kullan → Başka bir sağlayıcı seçin → Cloudflare (1.1.1.1)** seç ve sayfayı yeniden aç. (Ayva programı bunu bilgisayarda kendisi yapıyor.) Android uygulamasında ayar gerekmez: böyle ağlarda bağlantının ilk mesajını iki parça hâlinde gönderir, böylece filtre adresi okuyamaz; şifrelemeye dokunulmaz.

## Yedek yol (Cloudflare TURN)

Normalde görüntü bilgisayardan telefona doğrudan gider. Bazı ağlar buna izin vermez ve telefon **Yayına bağlanılıyor…** ekranında kalır. Yedek yol, sadece bu bağlantılarda görüntüyü senin ücretsiz Cloudflare hesabındaki bir aktarma sunucusu üzerinden gönderir.

### Ne zaman işe yarar

| Durum | Yedek yol olmadan | Yedek yolla |
| --- | --- | --- |
| Evde aynı Wi-Fi | Çalışır | Kullanılmaz |
| Çoğu ev interneti ve mobil veri | Doğrudan çalışır | Kullanılmaz |
| Çok kullanıcıyı tek adresin arkasına koyan mobil operatörler (CGNAT) | Çoğu zaman takılır | Çalışır |
| UDP'yi engelleyen iş, okul, otel, kafe ve hastane Wi-Fi'ları | Takılır | Çalışır: aktarma, sıradan bir https sitesi gibi 443 portundan da geçebilir |
| Cloudflare'i tamamen engelleyen ya da sadece birkaç siteye izin veren ağlar | Takılır | Yine takılır |
| Bu ayın sınırı dolduysa (aşağıya bak) | | Gelecek aya kadar kapalı |

Cloudflare'in sunucuları iki tarafa da yakın olduğu için aktarma çok az gecikme ekler. Uzaktan kontrol biraz daha yavaş hissedilebilir.

### Ücreti

Cloudflare her ay **1.000 GB'ı ücretsiz** verir, sonrası GB başına 0,05 $'dır ([fiyatlar](https://developers.cloudflare.com/realtime/sfu/pricing/)). Sadece gerçekten aktarmadan geçen veri sayılır; doğrudan bağlanan cihazlar hiç harcamaz. Kabaca 1080p 60 FPS saatte 4–5 GB, 720p saatte 1,5–2 GB tutar.

Ayva aktarmadan geçen veriyi sayar ve **senin seçtiğin aylık sınırda (varsayılan 800 GB) yedek yolu kullanmayı bırakır**, böylece ücretsiz kotanın içinde kalırsın. Ayva'nın saydığı bir tahmindir; kesin miktar Cloudflare panelinde Realtime → TURN Server → Analytics altındadır.

### Kurulum (yaklaşık 3 dakika)

Yedek yol sabit adresten ayrıdır. Hem sabit adresle hem internet linkiyle çalışır, ama her iki durumda da bir Cloudflare hesabı gerekir (ücretsiz plan yeterli).

1. [dash.cloudflare.com](https://dash.cloudflare.com) adresinde oturum aç (ya da ücretsiz hesap aç).
2. Menüde **Realtime**'ı (bazı hesaplarda **Calls**), ardından **TURN Server**'ı aç ve **Create**'e (ya da **Create TURN Key**'e) bas. İsim olarak herhangi bir şey yazabilirsin, ör. `ayva`.
3. Cloudflare iki değer gösterir: **Turn Token ID** ve **API Token**. API Token **sadece bir kez** gösterilir, sayfayı kapatma.
4. Ayva'da **Uzaktan erişim** altındaki **Yedek yol (Cloudflare TURN)** bölümünü aç, iki değeri yapıştır ve **Aç**'a bas. Ayva bunları saklamadan önce Cloudflare'de kontrol eder.

Kapatmak için Ayva'da **Yedek yolu kapat**'a bas. Anahtarı her yerde geçersiz kılmak için Cloudflare panelinden de sil.

### Ayarlar

- **Aylık sınır (GB):** bir takvim ayında aktarmadan bu kadar veri geçince Ayva yedek yolu vermeyi bırakır ve sana haber verir. Gelecek ay ya da sınırı yükseltince yeniden başlar.
- **Bu bilgisayarın IP adresini gizle:** doğrudan bağlantıda izleyen cihaz evinin IP adresini görebilir; bu, kabaca nerede olduğunu ve internet sağlayıcını ortaya çıkarır. Bu seçenek işaretliyse internetten bağlanan cihazlar her zaman aktarma üzerinden bağlanır ve sadece Cloudflare'in adresini görür. Bu durumda kota sadece zor bağlantılarda değil, her internet bağlantısında harcanır.

Bir cihaz aktarmayı kullanırken **Bağlı cihazlar** listesinde yanında **yedek yol** yazar.

### Güvenlik

- **Görüntü gizli kalır.** Görüntü, ses ve kontrol WebRTC ile uçtan uca şifrelidir. Aktarma sadece şifreli paketleri iletir; Cloudflare ne paylaştığını göremez. Hangi adreslerin ne zaman bağlandığını ve ne kadar veri geçtiğini görebilir.
- **Anahtar bu bilgisayardan çıkmaz.** API Token, Windows'un kendi veri korumasıyla (DPAPI) şifreli saklanır; hiçbir sayfaya, telefona ya da sabit adrese gönderilmez. Ayva onu sadece Cloudflare'den kısa süreli giriş bilgisi almak için kullanır.
- **Her cihaz, sen içeri aldıktan sonra kendi giriş bilgisini alır.** Bunları sadece internetten bağlanan cihazlar alır, o da onaydan ve [cihaz anahtarı](#güvenlik) kontrolünden sonra. Ev ağındaki cihazlar hiç almaz. Giriş bilgileri 4 saat geçerlidir, cihaz izledikçe yenilenir ve **cihaz ayrılır ayrılmaz** ya da bağlantısını kestiğin anda iptal edilir.
- **En kötü durum.** Biri bir cihazın giriş bilgisini kopyalasa bile sadece aktarmayı kullanabilir (ekranını göremez, bilgisayarına ulaşamaz); bu da bilgi iptal edilene ya da süresi dolana kadar ve hiçbir zaman aylık sınırını aşmadan olur. API Token'ın kendisinin sızdığından şüphelenirsen (bunun için bilgisayarına erişmiş olmak gerekir) anahtarı Cloudflare panelinden sil ve yenisini oluştur.

## Uzaktan kontrol

Paylaşım açıkken **Kontrolü aç**'a bas. İzleyen cihazlar bilgisayarın faresini ve klavyesini kullanabilir:

| Cihaz | Nasıl |
| --- | --- |
| **Telefon / tablet** | Görüntü touchpad gibi çalışır: kaydır = fare, dokun = tıkla, iki parmakla dokun = sağ tık, iki parmakla kaydır = sayfa kaydırma, dokunup kaydır = sürükle. **Klavye** telefon klavyesini açar, Esc, Tab, yön ve Win tuşlarını da ekler. |
| **TV uygulaması** | Yön tuşları imleci hareket ettirir, basılı tuttukça hızlanır. OK = tıkla, basılı tutulan OK = sağ tık, Oynat/Duraklat = bilgisayardaki oynatıcı, kanal ▲▼ = kaydırma. |
| **Başka bilgisayarın tarayıcısı** | Görüntünün üstünde tıkla ve normal şekilde yaz. Pencere paylaşılıyorsa fareyi yakalamak için görüntüye tıkla, bırakmak için Esc'e bas. |

Kontrol **varsayılan olarak kapalıdır**. Paylaşım durunca ya da Ayva yeniden açılınca kapanır. Bilgisayarda **Ctrl+Alt+K** kontrolü anında kapatır.
Windows, yönetici olarak çalışan pencerelerin (ör. Görev Yöneticisi) kontrol edilmesine izin vermez. Ctrl+Alt+Del de gönderilemez.

**Gizlilik modu.** Bir telefon bilgisayarı kullanırken telefondaki **Bilgisayar ekranını karart** (ya da Ayva'daki **Gizlilik modu**) bilgisayarın monitörlerini karartır; odadakiler ne yaptığını görmez, yayın ise masaüstünü göstermeye devam eder. Kararan ekranlarda bilgisayarın uzaktan kullanıldığı yazar; bilgisayarda **Ctrl+Alt+P** ekranları geri açar. Kimse bilgisayarı kontrol etmediğinde ya da paylaşım durduğunda gizlilik modu kendiliğinden kapanır. Bilgisayardaki klavye ve fare çalışmaya devam eder. Windows 10 sürüm 2004 veya daha yenisi gerekir.

## Dosya ve pano

- **Bilgisayar → telefon:** telefon ya da tarayıcı izlerken **Dosya gönder** ve **Panoyu gönder** butonları çıkar. Gelenler telefonda **Kaydet** ya da **Kopyala** butonuyla görünür.
- **Telefon → bilgisayar:** kontrol açıkken telefonda **Gönder** butonu çıkar. Birlikte seçilen dosyalar `Masaüstü\Ayva` içinde gönderim tarih ve saatini taşıyan tek bir klasöre kaydedilir (ör. `Masaüstü\Ayva\2026-10-30 15.42.07`), yazılar bilgisayarın panosuna gider.
  Kontrol kapalıyken bilgisayar dosya ve yazı kabul etmez. Böylece bilgisayarına sadece fare ve klavye konusunda güvendiğin cihazlar dosya bırakabilir.

## Telefondan ya da TV'den başlatma

Programın **Cihazlar** bölümünde **İzinler ve PIN** her hatırlanan cihazın anahtarlarını açar, hepsi varsayılan olarak kapalıdır. İkisi bu bilgisayarda geçerlidir:

- **Paylaşımı başlatabilir:** cihaz beklerken **Paylaşımı başlat**, izlerken **Paylaşımı durdur** butonunu görür. Bilgisayarın ana ekranı paylaşılır (seçicide işareti kaldırmadıysan sesiyle birlikte) ve bilgisayar her seferinde bildirim gösterir.
- **Kontrol edebilir:** paylaşım sırasında cihaz, sen **Kontrolü aç**'a basmadan fareyi ve klavyeyi kullanabilir (dosya da gönderebilir). Diğer cihazlar yalnızca izler. **Ctrl+Alt+K** bunu paylaşım yeniden başlayana kadar durdurur.

Bu kutular yalnızca izin verirken hatırladığın cihazlarda çıkar; bir kerelik izin verdiklerinde çıkmaz. **Unut** iki hakkı da hemen kaldırır.

**Ekran seçme:** Birden fazla monitör varsa, paylaşımı başlatabilen ya da kontrol edebilen bir cihaz izlerken bir ekran menüsü görür (soldan sağa Ekran 1, Ekran 2 (ana)) ve bağlantı kopmadan ekran değiştirebilir. Bilgisayar kimin değiştirdiğini gösterir.

## Güvenlik

**Cihaz anahtarı (mühür).** Bir cihazı hatırlattığında cihaz, kendisinden hiç çıkmayan bir anahtar üretir. Android uygulaması bunu Android'in güvenli kasasında (Keystore), tarayıcılar ise dışarı çıkarılamayan bir WebCrypto anahtarı olarak tutar. Cihaz her bağlandığında bilgisayar ona tek seferlik bir soru gönderir ve cihaz bunu anahtarıyla imzalar. İmza doğrulanmadan cihaza hiçbir şey (görüntü, haklar) gitmez. Böylece cihazın numarasını ağda duyan ya da kopyalayan biri onun yerine geçemez: bilgisayar bağlantısını keser ve sana haber verir. Kendi cihazlarından biri anahtarını kaybederse (ör. tarayıcı verileri silindiyse) onu **Unut** ve yeniden izin ver. 0.8.0'dan önce hatırlanan cihazlar, anahtar alabilmeleri için bir kez daha sorulur.

Her imza, cihazın o an baktığı adresi de içerir ve bilgisayar sadece kendi adreslerini kabul eder: ev ağındaki adresi, sabit adres ya da o anki internet linki. Android uygulamasında adresi sayfa değil uygulamanın kendisi ekler. Böylece başka bir yerdeki benzer bir sayfa (ör. birinin gönderdiği, Ayva uygulamasında başka bir `workers.dev` sayfası açan link ya da QR kod) bilgisayarında geçerli olacak bir imza alamaz. Güncellemeden önce açık kalmış bir sayfanın bağlantısı bir kez kesilir; sayfayı yenilemek yeterlidir.

**PIN.** **Cihazlar** bölümünde **İzinler ve PIN → PIN** ile bir cihaza 4–8 haneli bir PIN koyabilirsin. O cihaz her bağlantıda, paylaşımı başlatmadan ya da kontrol etmeden önce PIN'i girer. Böylece kilidi açık bir telefon çalınsa bile yetmez. PIN bilgisayarda yalnızca tuzlanmış bir özet olarak saklanır, cihaz o bağlantıya özel bir özet gönderir. 5 yanlış denemede cihazın hakları 15 dakika kilitlenir ve bilgisayar sana haber verir.

**Bağlantı geçmişi.** **Geçmiş** bölümü kimin ne zaman bağlandığını, ne kadar kaldığını, kime izin verip kimi reddettiğini, kimin paylaşımı başlattığını, kaydettiğini ya da mikrofonu açtığını gösterir. Yanlış PIN ve kanıtlanamayan mühür gibi şüpheli olaylar kırmızı görünür. Geçmiş yalnızca bu bilgisayarda tutulur (son 300 olay) ve **Geçmişi temizle** ile silinir.

## Telefonda kayıt

Telefondaki ya da tarayıcıdaki **Kayıt** izlenen görüntüyü o cihazda kaydeder. Durdurunca video (destekleniyorsa MP4, değilse WebM) **Kaydet** butonuyla görünür. Ağdan fazladan bir şey gitmez. Bilgisayar o cihazı **kaydediyor** olarak gösterir ve bildirim verir, yani kayıt gizlice yapılamaz.
Kayıt kaydedilene kadar telefonun belleğinde durur (dakikada yaklaşık 30 MB). Çok uzun kayıtlarda eski telefonların belleği yetmeyebilir.

## Bilgisayardan konuşma

İzlerken **Konuş** telefonun mikrofonunu bilgisayarın hoparlörüne verir. Bilgisayar bunu hatırlanan cihazlardan ya da kontrol açıkken herhangi bir cihazdan kabul eder ve yanında **mikrofon açık** yazar. **Bağlantıyı kes** ya da **Unut** hemen durdurur.
Tarayıcılar mikrofona yalnızca https sayfalarında izin verdiği için tarayıcıda bu özellik sabit adreste ya da internet linkinde çalışır, `http://192.168.x.x` adresinde çalışmaz. Android uygulaması evde de izin verir: bilgisayarı telefonun kendi adresi (127.0.0.1) üzerinden açar, bu adres güvenli sayılır. **Kendi sesini duymazsın.** Bilgisayarın sesi hoparlöre giden karışımdan alınır; bu karışımda bilgisayarın çaldığı senin sesin de vardır. Sen konuşurken Ayva, geri gönderdiği sesten tam olarak o sesi çıkarır; telefona diğer her şey (başka kişiler, oyun, müzik) gider ama kendi sesin gitmez. Konuşmaya başladıktan sonra kilitlenmesi yaklaşık üç saniye sürer; sonrasında sesin geri dönen seste yaklaşık 45 dB kısılır, yani duyulmaz. Sen konuşurken Ayva'da çıkış seçicinin altındaki satır durumu gösterir (bulunan gecikme, sesinin ne kadar kısıldığı ve bilgisayar fazla meşgulken oluşan kesintiler); **Tanı kaydı (10 sn)** sorun gidermek için `Masaüstü\Ayva` klasörüne kısa bir WAV kaydeder, bu dosya bilgisayardan kendiliğinden çıkmaz.

**Telefonda Bluetooth kulaklık:** Bluetooth kulaklığın mikrofonu kullanılınca kulaklık "telefon görüşmesi" moduna geçer ve Android yayının sesini kulaklıkta keser. Bu yüzden kulaklık bağlıyken **Konuş** telefonun yankı engelleyicisini kapatır (kulaklıkta yankı olmaz); telefon medya modunda kalır, yayın kulaklıkta çalmaya devam eder ve sesini telefonun kendi mikrofonu alır.

### Discord'da (ya da başka bir programda) konuşma

Ayva telefonun sesini bilgisayarda çalar. Windows'ta bir programın sesini başka bir programa mikrofon olarak vermenin yerleşik bir yolu yok; ücretsiz bir sanal ses kablosu bunu yapar:

1. [vb-audio.com/Cable](https://vb-audio.com/Cable/) adresinden **VB-CABLE**'ı kur (kurulumu yönetici olarak çalıştır, sonra Windows'u yeniden başlat).
2. Ayva'da **Telefonun sesi ("Konuş") şuradan çıksın** bölümünde **CABLE Input**'u seç.
3. Discord'da **Kullanıcı Ayarları → Ses ve Görüntü** bölümünde **Giriş Cihazı** olarak **CABLE Output**'u seç.

Artık telefona söylediklerin Discord'a gider. Bilgisayarın sesi paylaşılıyorsa telefon Discord'daki diğer kişileri de duyar; kendi sesin ise hoparlöre değil kabloya gittiği için sana geri gelmez. Telefonu yeniden bilgisayarın hoparlöründen duymak için çıkışı **Varsayılan hoparlör**'e geri al.

## Telefon bilgisayarda

Bu sefer tersi: telefon ekranını ya da kamerasını bilgisayarda bir pencerede gösterir. Bunun için masaüstü uygulaması gerekir ve yalnızca hatırladığın cihazlar yapabilir. **Cihazlar → İzinler ve PIN** altında her cihazın bunlar için anahtarları var, hepsi varsayılan olarak kapalı:

- **Ekranını gösterebilir** (yalnızca Android uygulaması)
- **Kamerasını gösterebilir** (Android uygulaması ya da https adresindeki bir tarayıcı)
- **Buradan kontrol edilebilir** (**Ekranını gösterebilir** işaretlenince görünür)

Telefon bunu **Ekranımı göster** ya da **Kameramı göster** ile kendisi başlatır, ya da bilgisayar ister: **İzle** bölümü buna izinli bağlı telefonları **Ekranını iste** ve **Kamerasını iste** butonlarıyla listeler. Telefonda soru çıkar; oradan onay vermeden hiçbir şey başlamaz.

Bilgisayar her seferinde bildirim gösterir, **Bağlı cihazlar** listesinde cihazın yanında **ekranını gösteriyor** ya da **kamerasını gösteriyor** yazar, [bağlantı geçmişi](#güvenlik) de ne kadar sürdüğünü ve neden bittiğini not eder. Pencereyi kapatmak bitirir; telefon durdurunca pencere nedenini kısa bir süre gösterip kendiliğinden kapanır. Butonları birkaç saniye hareketsiz kalınca kaybolur, sol üst köşedeki silik düğme de onları tamamen kaldırır.

### Telefonun ekranı ve sesi

Android uygulamasında bilgisayara bağlan (bilgisayarın paylaşım yapıyor olması gerekmez) ve **Ekranımı göster**'e dokun. Android her seferinde izin ister ve ekran gösterildiği sürece **Durdur** butonlu bir bildirim tutar. Ekrandaki her şey, bildirimler de dahil, bilgisayarda görünür; özel bir şey açmadan önce durdur.

- Görüntüyü telefonun donanımı kodlar ve 60 FPS'e kadar doğrudan bilgisayara gider. Tam ekran için pencereye çift tıkla (telefon kontrol edilmiyorken). Alttaki satır durumu gösterir (kare hızları, kesintiler, ses düzeyi).
- **Ses** (Android 10 ve sonrası) görüntüyle birlikte, eş zamanlı gelir. Android bunun için mikrofon izni ister, çünkü uygulamaların çaldığı sesi almayı kayıt sayar. **Ses: PC + telefon** iki yerde de çalar; **Ses: yalnız PC** telefonun medya sesini kısar. Bunun bilgisayara giden sesi de kestiği telefonlarda Ayva kendiliğinden ikisine döner. Penceredeki **Ses** butonu ses düzeyini (%200'e kadar), hoparlörü (başka seçmezsen Windows'un varsayılan çıkışı) ve yalnız PC ya da ikisi ayarını açar. Bazı uygulamalar seslerinin alınmasına izin vermez, telefon görüşmeleri hiç alınmaz.
- Telefonda başka uygulamalara geçince de devam eder. Ekran kapanırsa görüntü bekler ve ekran açılınca devam eder; telefonu kilitlemek bitirebilir.
- **Pil tasarrufu** Ayva'yı arka planda kapatabilir. Telefon Ayva'nın pil kullanımını kısıtlıyorsa **Pil kısıtlamasını kaldır** doğru ayar sayfasını açar (**Kısıtlamasız**'ı seç). Ekran gösterme kendiliğinden durduysa uygulama bir sonraki açılışta nedenini söyler.

### Telefonun kamerası

**Kameramı göster**'e dokun (ön kamera için **Kamerayı çevir**). Kamera kendi penceresinde, sessiz gösterilir. Uygulama ya da tarayıcı ekranda değilken Android kamerayı durdurur.

### Telefonu bilgisayardan kontrol etme

**Buradan kontrol edilebilir** işaretliyse telefonun penceresinde fare parmak gibi çalışır: tıklamak dokunur, sürüklemek kaydırır, sağ tık Geri'dir, tekerlek kaydırır. Pencerenin altında **Geri**, **Ana ekran** ve **Son uygulamalar** butonları var.

Telefonun penceresi öndeyken bilgisayarın klavyesi telefona yazar: harfler ve işaretler, Enter, Backspace, Delete, Tab, ok tuşları (Shift ile seçim), Home/End ve Ctrl+A/C/X/Z/Y. **Ctrl+V** bilgisayarın panosundakini telefona yapıştırır. Android'de tuşu olmayan karakterler (ş, ğ ya da emoji gibi) telefonun panosu üzerinden yapıştırılır, bu yüzden telefon bunlar için "kopyalandı" önizlemesi gösterebilir.

Android, bir uygulamanın başka uygulamalara dokunmasına yalnızca erişilebilirlik hizmetiyle izin verir; Google Play Protect de Play Store dışından kurulan böyle uygulamaları engeller. Bu yüzden Ayva bunun yerine Android'in **Kablosuz hata ayıklama** özelliğini kullanır, [scrcpy](https://github.com/Genymobile/scrcpy) gibi. Kurulumu bir kez, birkaç dakika sürer:

1. Telefonun penceresinde **Kontrolü ayarla**'ya, sonra **adb'yi Google'dan indir**'e bas. Google'ın `adb` aracı (yaklaşık 7 MB) Ayva'yla birlikte dağıtılamadığı için, sen isteyince Google'dan Ayva'nın kendi klasörüne indirilir.
2. Telefonda **Geliştirici seçenekleri**'ni aç (Ayarlar → Telefon hakkında → **Derleme numarası**'na 7 kez dokun), sonra Geliştirici seçenekleri altında **Kablosuz hata ayıklama**'yı aç. Telefon bilgisayarla aynı Wi-Fi'da olmalı.
3. **Kablosuz hata ayıklama → Cihazı eşleme koduyla eşle**'ye dokun, orada görünen IP adresini, bağlantı noktasını ve 6 haneli kodu pencereye yaz, **Eşleştir**'e bas.

Bundan sonra telefon ekranını her gösterdiğinde kontrol kendiliğinden başlar. Telefon başka bir Wi-Fi'a geçerse Android Kablosuz hata ayıklamayı kapatabilir; yeniden aç (eşleşme kalır).

Eşleşen bilgisayar telefonda geniş yetki kazanır, bu yüzden yalnızca kendi bilgisayarını eşleştir. Ayva telefonda yalnızca birkaç sabit komut çalıştırır ve bir sayfanın gönderdiği hiçbir şey telefonun kabuğuna ulaşmaz. Bazı banka uygulamaları Geliştirici seçenekleri açıkken çalışmaz.

## Arka planda çalışma

Pencereyi kapatınca Ayva saat yanındaki simgede çalışmaya devam eder, TV'ler bilgisayarı bulmayı sürdürür. Çıkmak için simgeye sağ tıklayıp **Çıkış**'ı seç.
**Ayarlar**'daki (ya da simge menüsündeki) **Windows açılınca Ayva'yı arka planda başlat** seçeneğiyle Ayva otomatik açılır.
İnternet linki her açılışta değiştiği için yeniden başlatmadan sonra dışarıdan bağlanmak için yeni linki görmen gerekir.

## Güncellemeler

Kurulu program açılışta ve birkaç saatte bir GitHub Releases'te yeni sürüm olup olmadığına bakar, varsa arka planda indirir.
Yeniden başlatmak süren paylaşımı keseceği için Ayva kendi kendine kurmaz: uygun olduğunda bildirime ya da **Ayarlar**'daki (veya simge menüsündeki) **Yeniden başlat ve güncelle**'ye tıkla. Aynı satır kurulu sürümü de gösterir; oradaki **Güncellemeleri denetle** hemen kontrol eder.

Android uygulaması (0.8.1 ve sonrası) da açılışta GitHub Releases'e bakar. Yeni sürüm varsa açılış ekranının en üstünde **⬆ Ayva x.y.z sürümüne güncelle** şeridi görünür; dokununca indirir ve Android'in kendi kurulum sorusunu açar. İlk seferde Android, Ayva'nın uygulama kurmasına izin vermeni ister. Listenin altındaki sürüm satırı hemen denetler. 0.8.0'dan 0.8.1'e geçiş bir kez elle yapılır.

## Sadece tarayıcı (kurulumsuz)

Sunucu masaüstü programı olmadan da çalışır (uzaktan kontrol, internet erişimi ve izleyiciden dosya almak için program gerekir):

1. [Node.js](https://nodejs.org) 18 veya üstünü kur.
2. Projeyi indir ve `start.bat`'a çift tıkla (Windows), ya da `npm install` ardından `npm start` çalıştır.
3. Bilgisayarda **http://localhost:3000/share** adresini aç. TV'de orada yazan adresi aç.

## Lisans

[MIT](LICENSE)
