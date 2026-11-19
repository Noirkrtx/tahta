# tahta as a Claude artifact / Claude artifact sürümü

*English below. Türkçesi aşağıda.*

`tahta-artifact.html` is the whole app in one file: JavaScript, CSS, the Caveat font (OFL 1.1, base64) and the five demo boards are inlined. It loads nothing from the network.

- **Inside Claude** (as an artifact that can use Claude) the page finds `window.claude.complete` and switches to *artifact mode*: no API key, no settings dialog, and a note saying the questions run on your Claude account. Each question is one Claude request, plus one repair request if the first reply does not match the [scenario schema](../docs/SCHEMA.md).
- **Anywhere else** (opened from disk, or a host without `window.claude`) it behaves like the normal site: the demos play, and your own questions need an Anthropic API key in Settings.

Rebuild it with `npm ci && npm run build:artifact` (about 260 KiB). `python scripts/artifact_check.py` opens it in Chromium with a fake `window.claude`, runs one question through the repair path and plays the board to the end.

## English

### What Anthropic documents

From the Claude Help Center, [What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310), section "Artifacts that use Claude" (read 2026-11-19):

> Describe what you want, Claude writes the code, and the app runs on Anthropic's infrastructure. People using it sign in with their Claude account and interact with their own instance.
>
> No API keys are required, and there's no cost to you. […] usage counts against each person's own plan limits rather than yours.
>
> […] New artifacts ask you for permission the first time they want to use Claude.

The same article: artifacts need **Cloud code execution and file creation** ("Create and edit files" in the newer layout) turned on in *Settings > Capabilities*; for legacy artifacts (made in a chat before 16 September 2026) Claude access is controlled by the **AI-powered artifacts** setting ("Artifacts that use Claude").

The function name and signature are **not** in Anthropic's public documentation. `window.claude.complete(prompt)` → `Promise<string>` comes from Claude's artifact instructions as published by third parties; see [docs/KARARLAR.md](../docs/KARARLAR.md#claude-artifact) for the sources and what is unverified. tahta first sends a Messages-style object (`{ system, messages, max_tokens }`) and falls back to the plain string form if the host rejects it.

### Option A: publish the file with Claude Code

Documented in [Share session output as artifacts](https://code.claude.com/docs/en/artifacts): Claude Code can publish an `.html` file of up to 16 MiB as an artifact. Needs a Pro, Max, Ultra, Team or Enterprise plan and a claude.ai login (not an API key).

1. Clone this repository and, in its folder, start Claude Code: `claude`. Sign in with `/login` using your claude.ai account if you have not.
2. Ask: *"Publish artifact/tahta-artifact.html as an artifact exactly as it is, without changing the file."*
3. Claude prints the artifact URL and opens it. To share, use **Share** in the page header and pick who has access.

Not verified: that pages published from Claude Code get `window.claude`. Claude Code's artifact page lists connectors and downloads as runtime capabilities but does not mention calling Claude. If the helper is missing, the page stays in the normal mode, and an API key will not help there either: the artifact sandbox only lets `fetch` reach the page's own origin and Google Fonts. Only the demos will play.

### Option B: a chat on claude.ai or Claude Desktop

1. Check *Settings > Capabilities*: "Cloud code execution and file creation" must be on.
2. Start a new chat, attach `tahta-artifact.html`, and ask Claude to open it as an HTML artifact **unchanged**: it already calls Claude through `window.claude.complete`.
3. The first time you ask a question in the artifact, Claude asks for permission to use Claude. Allow it.
4. To share, open the artifact and click **Share** (legacy artifacts: **Publish**).

Not verified: the Help Center documents starting from pasted code ("paste the code, and describe the changes you want"), not turning an attached file into an artifact word for word. The file is about 260 KiB, mostly the embedded font; Claude may shorten or rewrite it instead of reproducing it. Compare the result with the original before trusting it.

### Limits

- **Sharing:** from [Share artifacts](https://support.claude.com/en/articles/9547008): *"Someone who opens an 'Anyone with the link' artifact from outside your organization, or without signing in, sees the artifact, but the parts that use connected apps or Claude don't work for them"*, and *"On Pro, Max, and Ultra plans, 'outside your organization' means anyone other than you."* For people invited by email from outside your organization, the same page says the parts that use Claude don't work for them either. So with a personal plan, other people get the demos but cannot ask questions; inside a Team or Enterprise organization, members use their own plan. Legacy artifacts published from a chat were different: *"Features that use Claude count toward their own usage limits."*
- **No model choice and no API key settings** in artifact mode. Which model answers, its output limit and the rate limit are decided by Claude, not by tahta (reported, not documented: a Haiku model by default, 1024 output tokens unless `max_tokens` is set, 15 calls per minute).
- **Exports are hidden** in artifact mode (JSON, SVG, PNG). Claude Code's artifact docs say the viewer blocks any download the page starts itself, including `data:` and `blob:` links. *Load JSON* stays.
- Generated boards can contain mistakes; the app says so under each one.

## Türkçe

`tahta-artifact.html` uygulamanın tamamıdır: JavaScript, CSS, Caveat fontu (OFL 1.1, base64) ve beş hazır tahta dosyanın içinde. Ağdan hiçbir şey yüklemez.

- **Claude içinde** (Claude kullanabilen bir artifact olarak) sayfa `window.claude.complete` işlevini bulur ve *artifact kipine* geçer: API anahtarı yok, ayarlar penceresi yok; soruların Claude hesabınla çalıştığını söyleyen bir not görünür. Her soru bir Claude isteğidir; ilk yanıt [senaryo şemasına](../docs/SCHEMA.md) uymazsa bir düzeltme isteği daha gider.
- **Başka her yerde** (diskten açıldığında ya da `window.claude` olmayan bir ortamda) normal site gibi davranır: hazır örnekler oynar, kendi sorun için Ayarlar'a Anthropic API anahtarı gerekir.

Yeniden üretmek için `npm ci && npm run build:artifact` (yaklaşık 260 KiB). `python scripts/artifact_check.py` dosyayı Chromium'da sahte bir `window.claude` ile açar, bir soruyu düzeltme turuyla birlikte geçirir ve tahtayı sonuna kadar oynatır.

### Anthropic'in belgelediği

Claude Yardım Merkezi, [What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310), "Artifacts that use Claude" bölümü (2026-11-19'da okundu):

> Describe what you want, Claude writes the code, and the app runs on Anthropic's infrastructure. People using it sign in with their Claude account and interact with their own instance.
>
> No API keys are required, and there's no cost to you. […] usage counts against each person's own plan limits rather than yours.
>
> […] New artifacts ask you for permission the first time they want to use Claude.

Aynı makaleye göre artifact'ler için *Settings > Capabilities* altında **Cloud code execution and file creation** (yeni düzende "Create and edit files") açık olmalı; eski (legacy, 16 Eylül 2026'dan önce sohbette yapılmış) artifact'lerde Claude erişimini **AI-powered artifacts** ("Artifacts that use Claude") ayarı yönetir.

İşlevin adı ve imzası Anthropic'in herkese açık belgelerinde **yok**. `window.claude.complete(prompt)` → `Promise<string>` bilgisi, Claude'un artifact talimatlarının üçüncü kişilerce yayımlanmış metninden geliyor; kaynaklar ve doğrulanamayanlar [docs/KARARLAR.md](../docs/KARARLAR.md#claude-artifact) içinde. tahta önce Messages biçiminde bir nesne (`{ system, messages, max_tokens }`) gönderir, ortam bunu reddederse düz metin biçimine geçer.

### Yol A: dosyayı Claude Code ile yayımla

[Share session output as artifacts](https://code.claude.com/docs/en/artifacts) sayfasında belgeli: Claude Code en çok 16 MiB'lık bir `.html` dosyasını artifact olarak yayımlayabilir. Pro, Max, Ultra, Team ya da Enterprise planı ve claude.ai girişi gerekir (API anahtarıyla olmaz).

1. Bu depoyu klonla, klasöründe Claude Code'u başlat: `claude`. Giriş yapmadıysan `/login` ile claude.ai hesabınla gir.
2. Şunu iste: *"artifact/tahta-artifact.html dosyasını hiç değiştirmeden artifact olarak yayımla."*
3. Claude artifact adresini yazar ve açar. Paylaşmak için sayfa başlığındaki **Share** ile kimlerin erişeceğini seç.

Doğrulanamadı: Claude Code'dan yayımlanan sayfalarda `window.claude` bulunduğu. Claude Code'un artifact sayfası çalışma zamanı yetenekleri olarak bağlayıcıları ve indirmeyi sayıyor, Claude çağırmaktan söz etmiyor. İşlev yoksa sayfa normal kipte kalır ve API anahtarı da işe yaramaz: artifact korumalı alanı `fetch` isteklerine yalnız sayfanın kendi kaynağına ve Google Fonts'a izin veriyor. Yalnız hazır örnekler oynar.

### Yol B: claude.ai ya da Claude Desktop'ta sohbet

1. *Settings > Capabilities* altında "Cloud code execution and file creation" açık olsun.
2. Yeni bir sohbet aç, `tahta-artifact.html` dosyasını ekle ve Claude'dan bunu **değiştirmeden** HTML artifact olarak açmasını iste: dosya Claude'u zaten `window.claude.complete` ile çağırıyor.
3. Artifact'te ilk soruyu sorduğunda Claude, Claude'u kullanmak için izin ister. İzin ver.
4. Paylaşmak için artifact'i açıp **Share**'e tıkla (eski artifact'lerde **Publish**).

Doğrulanamadı: Yardım Merkezi yapıştırılan koddan başlamayı belgeliyor ("paste the code, and describe the changes you want"); eklenen bir dosyanın birebir artifact'e dönüşmesini değil. Dosya yaklaşık 260 KiB ve çoğu gömülü font; Claude dosyayı aynen yazmak yerine kısaltabilir ya da yeniden yazabilir. Güvenmeden önce sonucu özgün dosyayla karşılaştır.

### Sınırlar

- **Paylaşım:** [Share artifacts](https://support.claude.com/en/articles/9547008) sayfasına göre kuruluşunun dışından ya da giriş yapmadan "Anyone with the link" bağlantısını açan kişi artifact'i görür ama *"the parts that use connected apps or Claude don't work for them"*; ayrıca *"On Pro, Max, and Ultra plans, 'outside your organization' means anyone other than you."* Kuruluş dışından e-postayla davet edilenler için de Claude kullanan bölümlerin çalışmadığı yazıyor. Yani kişisel planla paylaşınca başkaları hazır örnekleri izler ama soru soramaz; Team ya da Enterprise kuruluşu içinde üyeler kendi planlarıyla kullanır. Sohbetten yayımlanmış eski artifact'lerde durum farklıydı: *"Features that use Claude count toward their own usage limits."*
- Artifact kipinde **model seçimi ve API anahtarı ayarı yok.** Hangi modelin yanıtlayacağına, çıktı sınırına ve istek sınırına tahta değil Claude karar verir (belgelenmemiş, aktarılan bilgi: varsayılan bir Haiku modeli, `max_tokens` verilmezse 1024 çıktı token'ı, dakikada 15 çağrı).
- Artifact kipinde **dışa aktarma düğmeleri gizli** (JSON, SVG, PNG). Claude Code'un artifact belgesine göre görüntüleyici, sayfanın kendi başlattığı her indirmeyi (`data:` ve `blob:` bağlantıları dahil) engelliyor. *JSON yükle* duruyor.
- Üretilen tahtalar hata içerebilir; uygulama bunu her birinin altında söyler.
