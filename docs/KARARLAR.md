# Kararlar

Brifte açık bırakılan ya da yoruma dayanan noktalarda verilen kararlar ve gerekçeleri. Tarih: 2026-11-19.

## Ürün

1. **Açık zemin, koyu mürekkep.** Brifteki palet (koyu mürekkep, lacivert, kırmızı, kehribar, yeşil) beyaz tahta/kâğıt zeminde okunur; kara tahta teması eklenmedi. Tek tema, dışa aktarımda renklerin SVG içine doğrudan yazılmasını da basit tutuyor.
2. **Tek tahta, silme yok.** Bir cevap tek tuvale sığar. Silgi ya da çok sayfa hem şemayı hem istemi karmaşıklaştırırdı; istem modele satır bütçesi veriyor.
3. **0. adım otomatik.** Başlık, alt çizgi ve tek cümlelik ana fikir oynatıcı tarafından yazılır; senaryo yazarı (ya da model) bunları öğe olarak tekrar etmez. Böylece her tahta aynı düzenle açılır.
4. **Adım düğmelerinin anlamı.** Duraklatılmışken ileri: süren adımı tamamlar, sonra bir sonraki adımın bitmiş halini gösterir; geri: bir önceki adımın bitmiş hali. Oynarken ileri/geri adım başlangıçlarına atlar. Listeden adıma tıklamak o adımı baştan çizer. Ek olarak sürüklenebilir ilerleme çubuğu var (brifte yoktu, zaman modelinden bedavaya geldi).
5. **Okuma duraklaması.** Otomatik oynatmada her adımdan sonra, sözlü açıklamanın uzunluğuna göre 0,7–5,2 sn beklenir. Açıklama tahtanın altında gösterilir; seslendirme yok.
6. **Demo dili.** Mevsimler TR+EN; kalp, Pisagor ve fotosentez yalnız TR. Demo düğmeleri iki arayüz dilinde de hepsini, dil etiketiyle gösterir. Dil düğmesine basınca, açık demonun öbür dilde karşılığı varsa ona geçilir. Diğer üçünün İngilizcesi süre bütçesi nedeniyle yazılmadı.
7. **Video (WebM) dışa aktarma yapılmadı.** Brifte isteğe bağlıydı. SVG'yi kare kare tuvale basıp MediaRecorder ile kaydetmek ayrı bir iş; bütçeye sığmadı.
8. **Üretilen tahtada uyarı.** Modelin ürettiği her tahtanın altında "hata içerebilir, doğrula" notu çıkar. Hazır demolarda çıkmaz; onların içeriği elle yazıldı ve denetlendi.

## Şema ve doğrulama

9. **Elle yazılmış doğrulayıcı, kütüphane yok.** Çalışma zamanı bağımlılığı sıfır kalsın ve hata iletileri modele geri gönderilecek biçimde (alan yolu + neden) olsun diye.
10. **Bilinmeyen alanlar hata.** "Sıkı doğrulama" böyle yorumlandı. Model fazladan alan eklerse onarım turu bunu düzeltir; karşılığında şema belgesiyle davranış birebir örtüşür.
11. **Renkler yalnız ad olarak.** Onaltılık renk kabul edilmez; palet sınırı şemada zorlanır.
12. **Ek öğe: `polyline`.** Brifteki listede yoktu; düz kenarlı üçgen ve kareler (Pisagor) için gerekliydi. `curve` için `arrowEnd`, daire/elips/eğri/çizgi için `dashed` da eklendi.
13. **Yol verisi.** Yalnız `M L H V C S Q T A Z` ve sayılar; ayrıştırılıp yeniden yazılır. `path` öğeleri titretilmez, verildiği gibi çizilir (keyfi yolu bozmadan pürüz eklemek güvenilir değil).
14. **Adım sayısı.** Şema 1–14 adım kabul eder; istem 4–10 ister. Elle yazılmış ya da paylaşılan kısa senaryolar da yüklenebilsin diye şema daha geniş.

## Çizim

15. **Font: Caveat (OFL 1.1), 500 ve 700 ağırlık, latin + latin-ext alt kümeleri.** Kalam ve Patrick Hand de düşünüldü; Caveat dar olduğu için aynı sütuna daha büyük punto sığıyor ve el yazısına en yakın duran o. Türkçe kapsamı testte font dosyasının cmap tablosu okunarak doğrulanıyor (ğ, ş, ı, İ, ç, ö, ü dahil). Ok (→) ve alt simge (₂) glifleri fontta yok; demolarda tahta metninde kullanılmadı, istem de modeli uyarıyor.
16. **Metin kırpma ile belirir.** Harfleri kalem darbesine çevirmek font yollarını işlemek demek; soldan sağa açılan kırpma dikdörtgeni aynı izlenimi çok daha az kodla veriyor. README'de sınır olarak yazıldı.
17. **Darbe uzunluğu ölçülmüyor.** Her yola `pathLength="1"` verilip `stroke-dashoffset` 1'den 0'a indiriliyor; DOM ölçümü gerekmediği için zamanlama testlerde de aynı.
18. **Kesikli çizgi = ayrı kısa darbeler.** SVG'de kesik deseni her alt yolda baştan başladığı için tek yolla sıralı çizim olmuyor; kesikler ayrı yol olarak sırayla çiziliyor.
19. **Çakışma düzeltmesi yalnız metin–metin.** Çakışan metin bloğu aşağı itilir, tuvalden taşacaksa itilmez. Şekil ve etiketler yerinde kalır. Demolarda gerçek fontla sıfır düzeltme gerekiyor (ekran kodu bunu denetliyor).
20. **Sol sütun sarma kuralı.** `maxWidth` verilmemiş ve sol sütunda başlayan metin x = 690'da satır kırar; böylece model genişlik vermeyi unutsa da metin çizim alanına girmez.

## LLM

21. **Tek onarım turu, ardından açık hata.** Brifteki gibi. Onarım isteğinde modelin ilk yanıtı ve hata listesi (en çok 25 satır) geri gönderilir.
22. **JSON çıkarma.** Yanıttaki ilk `{` ile son `}` arası alınır; kod çiti ya da çevredeki cümleler sorun olmaz. Önceden doldurma ya da araç çağrısı kullanılmadı: serbest metinle girilen her modelde çalışsın diye.
23. **Varsayılan model `claude-fable-5-2`**, serbest metin; ayarlarda "daha ucuz model de çalışır" notu var. Varsayılan dışındaki değer localStorage'a yazılır.
24. **Anahtar.** Yalnız `localStorage['tahta.apiKey']`; yalnız `x-api-key` başlığında gider. Hata nesnelerine ve konsola yazılmaz (testte denetleniyor). Ağ hatasında alttaki istisna iletisi kullanıcıya aktarılmaz.
25. **Gerçek API çağrısı yapılmadı.** Anahtar yok; LLM yolu sahte `fetch` ile test edildi. İstemin gerçek modelde ne kadar iyi tahta ürettiği ölçülmedi.

## Araçlar

26. **`npm run preview` kendi küçük sunucumuz.** Bu ortamda `vite preview` (8.3.8), tarayıcının `Sec-Fetch-Dest: script` başlığıyla istediği derlenmiş JS dosyasına 404 döndü (curl ile 200). Nedeni araştırılmadı; yerine `scripts/onizle.mjs` dist klasörünü `/tahta/` altında sunuyor. Geliştirme sunucusu (`npm run dev`) sorunsuz.
27. **Ekran görüntüleri Python Playwright ile.** `scripts/ekran.py` üretim derlemesini kendi iş parçacığındaki statik sunucudan açar; her demo için ara ve son kare alır, klavye kontrollerini ve PNG/SVG/JSON dışa aktarımını dener, dış ağa istek çıkarsa ya da konsolda hata olursa başarısız olur. Playwright'in kendi Chromium'u yoksa `TAHTA_CHROMIUM` ile ikili dosya yolu verilir.
28. **TypeScript 7, Vite 8, vitest 5** (kurulum anındaki güncel sürümler). Çalışma zamanı bağımlılığı yok; dört geliştirme bağımlılığı var.

## Bilimsel içerik denetimi (demolar)

- **Mevsimler:** eksen eğikliği 23,4°; günberi ocak başı ≈147 milyon km, günöte temmuz başı ≈152 milyon km (fark ≈%3); eksen yıl boyunca aynı yöne bakar; haziranda kuzey Güneş'e dönük. "Yazın Güneş'e daha yakınız" yanılgısı ilk adımda adıyla anılıp düzeltiliyor. Yörüngenin elips görünmesi eğik bakıştan; tahtada ve açıklamada belirtildi.
- **Kalp:** vücut → sağ kulakçık → sağ karıncık → akciğerler → sol kulakçık → sol karıncık → aort → vücut. Akciğer atardamarının oksijeni az kan taşıdığı açıklamada var. Şema basitleştirilmiş: aort yandan çıkıyor gibi çizildi; açıklamada söyleniyor.
- **Pisagor:** yeniden düzenleme ispatı; çizimde a = 120, b = 210 ve iç dörtgenin gerçekten kare olduğu testte sayısal olarak denetleniyor.
- **Fotosentez:** oksijenin sudan geldiği, klorofilin en çok kırmızı ve maviyi soğurduğu, Calvin döngüsünde ATP ve NADPH kullanıldığı; toplam denklem açıklamada, tek adımda gerçekleşmediği notuyla.
