# Ayva

Bilgisayar ekranını evde ya da her yerden TV'ye veya telefona aktar ve bilgisayarı o cihazdan kontrol et.
Bilgisayarda Ayva'yı aç ve **Paylaşımı başlat**a bas. TV uygulaması bilgisayarı kendisi bulur. Telefon, QR kodla herhangi bir ağdan bağlanabilir.

[English](README.md)

- **TV'de yazı yazmak yok:** Android TV uygulaması ağdaki bilgisayarları bulur ve kendiliğinden bağlanır.
- **Her yerden:** internet erişimini aç, telefonla QR kodu okut. Hesap ya da modem ayarı gerekmez.
- **Uzaktan kontrol:** bilgisayarın faresini ve klavyesini telefondan (touchpad), TV kumandasından ya da başka bir bilgisayarın tarayıcısından kullan.
- **Dosya ve pano:** bilgisayar ile telefon arasında dosya ve yazı gönder.
- **Kimin bağlanacağına sen karar verirsin:** yeni cihazlar bilgisayarda onaylanmadan bağlanamaz. Hatırlanan cihazlar sormadan bağlanır, istediğin cihazın bağlantısını tek tıkla kesebilirsin.
- **Doğrudan bağlantı:** görüntü WebRTC ile doğrudan bilgisayardan izleyen cihaza gider. 1440p 60 FPS'e kadar, sesli.
- **Arka planda çalışır:** Ayva saat yanındaki simgeye küçülebilir ve Windows ile birlikte başlayabilir.

## Kurulum

İki dosyayı da [Releases](../../releases) sayfasından indir.

**Bilgisayar (Windows 10/11):** `Ayva-Setup-x.y.z.exe` dosyasını çalıştır. Windows SmartScreen programın imzasız olduğunu söyleyebilir: **Ek bilgi → Yine de çalıştır** de. Kurulum, güvenlik duvarında Ayva'ya sadece yerel ağ için izin verir.

**TV (Android TV / Google TV / Android uydu alıcıları, ör. Next Start 4K):** `Ayva-TV.apk` dosyasını kur:

1. APK'yı bir USB belleğe kopyala ve TV'ye ya da alıcıya tak.
2. Bir dosya yöneticisiyle aç. Yoksa Google Play'den **File Commander** ya da **X-plore** kur.
3. Sorulduğunda bu kaynaktan uygulama yüklenmesine izin ver.

**Telefon:** hiçbir şey kurmana gerek yok. QR kodu okut ya da Ayva'da yazan linki aç.

## Kullanım

1. Bilgisayarda **Ayva**'yı aç, kaliteyi seç (1080p 60 FPS iyi bir başlangıç) ve **Paylaşımı başlat**a bas.
2. **Tüm ekran**'ı ya da tek bir pencereyi seç.
3. **TV:** TV'de Ayva'yı aç. **Evdeki telefon:** "TV'de şunu aç" altındaki adresi aç. **Dışarıdaki telefon:** aşağıdaki bölüme bak.
4. Bir cihaz ilk kez bağlandığında bilgisayar **İzin ver / Reddet** diye sorar. **Bu cihazı hatırla** işaretliyse bir dahaki sefere sormaz.

Paylaşım sırasında:

- **Ekranı değiştir**, kimsenin bağlantısını koparmadan paylaşılan ekranı ya da pencereyi değiştirir.
- Kod, linkler ve QR kod **bulanık** görünür (görmek için **Göster**). Ayva penceresinin kendisi de **yayına girmez**.
- **Bağlı cihazlar** bölümü kimlerin izlediğini gösterir. Her cihazın yanında **Bağlantıyı kes** butonu var. Hatırlanan cihazları da oradan unutabilirsin.

## Her yerden izleme

Ayva'da **İnternetten erişimi aç**'a bas. İlk seferde Cloudflare'in ücretsiz tünel aracı `cloudflared` indirilir (~60 MB, Cloudflare'in GitHub sayfasından).
Ardından Ayva bir `https://….trycloudflare.com` linki ve **QR kod** gösterir. Telefonla mobil veride ya da herhangi bir Wi-Fi'de okut.

- Link uzun, rastgele bir **erişim anahtarı** içerir. İnternet üzerinden 6 haneli kod tek başına yetmez.
- 10 yanlış denemeden sonra o adres 15 dakika engellenir.
- İnternet erişimini kapatıp açınca **yeni link** oluşur, eskisi çalışmaz.
- İnternetten bağlananlar sadece izleyebilir. Kontrol için ayrıca senin izin vermen gerekir.

Cloudflare bu hızlı tünelleri ücretsiz ama test amaçlı sunuyor. Kesintisiz çalışma garantisi yok.

**Görüntü hiç gelmezse** ("Yayına bağlanılıyor…"da kalırsa), iki ağ birbirine doğrudan ulaşamıyor demektir. Bazı mobil operatörlerde ve şirket ağlarında bu olabilir. Çözümü bir **TURN** aktarma sunucusu (bkz. [README.md](README.md#configuration)).

## Sabit adres (Cloudflare, ücretsiz)

Ayva'da **Sabit adres kur (Cloudflare)**'a bas ve penceredeki adımları izle: ücretsiz bir Cloudflare hesabında "Edit Cloudflare Workers" şablonuyla bir API anahtarı oluşturup Ayva'ya yapıştır, bir izleme şifresi belirle. Ayva kendini hesabına yükler ve `https://ayva.<adın>.workers.dev` gibi **hiç değişmeyen** bir link ve QR kod verir. Telefon bir kez şifre girer, sonra her seferinde aynı linkten bağlanır.

**Telefon "Sunucuya bağlanılıyor"da kalıyorsa:** bazı internet sağlayıcıları `workers.dev` adreslerini engelliyor. Chrome'da **⋮ → Ayarlar → Gizlilik ve güvenlik → Güvenli DNS kullan → Başka bir sağlayıcı seçin → Cloudflare (1.1.1.1)** seç ve sayfayı yeniden aç. (Ayva programı bunu bilgisayarda kendisi yapıyor.)

## Uzaktan kontrol

Paylaşım açıkken **Kontrolü aç**'a bas. İzleyen cihazlar bilgisayarın faresini ve klavyesini kullanabilir:

| Cihaz | Nasıl |
| --- | --- |
| **Telefon / tablet** | Görüntü touchpad gibi çalışır: kaydır = fare, dokun = tıkla, iki parmakla dokun = sağ tık, iki parmakla kaydır = sayfa kaydırma, dokunup kaydır = sürükle. **Klavye** telefon klavyesini açar, Esc, Tab, yön ve Win tuşlarını da ekler. |
| **TV uygulaması** | Yön tuşları imleci hareket ettirir, basılı tuttukça hızlanır. OK = tıkla, basılı tutulan OK = sağ tık, Oynat/Duraklat = bilgisayardaki oynatıcı, kanal ▲▼ = kaydırma. |
| **Başka bilgisayarın tarayıcısı** | Görüntünün üstünde tıkla ve normal şekilde yaz. Pencere paylaşılıyorsa fareyi yakalamak için görüntüye tıkla, bırakmak için Esc'e bas. |

Kontrol **varsayılan olarak kapalıdır**. Paylaşım durunca ya da Ayva yeniden açılınca kapanır. Bilgisayarda **Ctrl+Alt+K** kontrolü anında kapatır.
Windows, yönetici olarak çalışan pencerelerin (ör. Görev Yöneticisi) kontrol edilmesine izin vermez. Ctrl+Alt+Del de gönderilemez.

## Dosya ve pano

- **Bilgisayar → telefon:** telefon ya da tarayıcı izlerken **Dosya gönder** ve **Panoyu gönder** butonları çıkar. Gelenler telefonda **Kaydet** ya da **Kopyala** butonuyla görünür.
- **Telefon → bilgisayar:** kontrol açıkken telefonda **Gönder** butonu çıkar. Birlikte seçilen dosyalar `Masaüstü\Ayva` içinde gönderim tarih ve saatini taşıyan tek bir klasöre kaydedilir (ör. `Masaüstü\Ayva\2026-10-30 15.42.07`), yazılar bilgisayarın panosuna gider.
  Kontrol kapalıyken bilgisayar dosya ve yazı kabul etmez. Böylece bilgisayarına sadece fare ve klavye konusunda güvendiğin cihazlar dosya bırakabilir.

## Arka planda çalışma

Pencereyi kapatınca Ayva saat yanındaki simgede çalışmaya devam eder, TV'ler bilgisayarı bulmayı sürdürür. Çıkmak için simgeye sağ tıklayıp **Çıkış**'ı seç.
Programdaki (ya da simge menüsündeki) **Windows açılınca Ayva'yı arka planda başlat** seçeneğiyle Ayva otomatik açılır.
İnternet linki her açılışta değiştiği için yeniden başlatmadan sonra dışarıdan bağlanmak için yeni linki görmen gerekir.

## Sadece tarayıcı (kurulumsuz)

Sunucu masaüstü programı olmadan da çalışır (uzaktan kontrol, internet erişimi ve izleyiciden dosya almak için program gerekir):

1. [Node.js](https://nodejs.org) 18 veya üstünü kur.
2. Projeyi indir ve `start.bat`'a çift tıkla (Windows), ya da `npm install` ardından `npm start` çalıştır.
3. Bilgisayarda **http://localhost:3000/share** adresini aç. TV'de orada yazan adresi aç.

## Lisans

[MIT](LICENSE)
