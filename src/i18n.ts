import type { Lang } from './schema';

type Dict = Record<string, string>;

const tr: Dict = {
  tagline: 'Sor, tahtada adım adım anlatılsın.',
  questionPlaceholder: 'Bir soru yaz: örn. Gökyüzü neden mavi?',
  ask: 'Anlat',
  asking: 'Tahta hazırlanıyor…',
  repairing: 'Yanıt düzeltiliyor…',
  demos: 'Hazır örnekler (anahtar gerekmez):',
  settings: 'Ayarlar',
  steps: 'Adımlar',
  introStep: 'Başlık ve ana fikir',
  play: 'Oynat',
  pause: 'Duraklat',
  prev: 'Önceki adım',
  next: 'Sonraki adım',
  restart: 'Baştan',
  speed: 'Hız',
  progress: 'İlerleme',
  downloadJson: 'Senaryo (JSON)',
  loadJson: 'JSON yükle',
  downloadSvg: 'SVG',
  downloadPng: 'PNG',
  exportLabel: 'Dışa aktar:',
  keyboardHint: 'Klavye: boşluk = oynat/duraklat, ← → = adım geri/ileri',
  settingsTitle: 'Ayarlar',
  apiKeyLabel: 'Anthropic API anahtarı',
  apiKeyWarning:
    'Anahtarın yalnız bu tarayıcıda (localStorage) saklanır ve yalnız api.anthropic.com adresine, doğrudan bu sayfadan gönderilir. Aracı sunucu yoktur. Paylaşılan bir bilgisayarda kullanıyorsan işin bitince anahtarı sil. Tarayıcı eklentileri localStorage’ı okuyabilir; mümkünse harcama sınırı olan ayrı bir anahtar kullan.',
  modelLabel: 'Model',
  modelNote: 'Model adını serbestçe yazabilirsin. Daha ucuz bir model de çalışır; çizim kalitesi modele göre değişir.',
  save: 'Kaydet',
  removeKey: 'Anahtarı sil',
  close: 'Kapat',
  keySaved: 'Kaydedildi.',
  keyRemoved: 'Anahtar silindi.',
  errNoKey: 'Kendi sorun için bir Anthropic API anahtarı gerekir. Ayarlar’dan ekleyebilir ya da hazır örnekleri anahtarsız izleyebilirsin.',
  errNoQuestion: 'Önce bir soru yaz.',
  errNetwork: 'API’ye ulaşılamadı. İnternet bağlantını ve tarayıcı engellerini (reklam engelleyici vb.) kontrol et.',
  errHttp401: 'API anahtarı kabul edilmedi (401). Ayarlar’dan anahtarı kontrol et.',
  errHttp404: 'Model bulunamadı (404). Ayarlar’daki model adını kontrol et.',
  errHttp429: 'İstek sınırı aşıldı (429). Biraz bekleyip yeniden dene.',
  errHttp: 'API hata döndürdü (HTTP {status}).',
  errEmpty: 'Model boş bir yanıt döndürdü. Yeniden dene.',
  errInvalid:
    'Model geçerli bir tahta senaryosu üretemedi (bir kez düzeltme istendi, o da geçersizdi). Soruyu sadeleştirip yeniden dene ya da başka bir model seç.',
  errFile: 'Bu dosya geçerli bir tahta senaryosu değil.',
  errDetails: 'Ayrıntılar',
  repairedNote: 'Not: modelin ilk yanıtı şemaya uymuyordu; düzeltme isteğiyle onarıldı.',
  aiNote: 'Bu tahta bir dil modeli tarafından üretildi; hata içerebilir. Önemli bilgileri doğrula.',
  footer: 'Açık kaynak (MIT). Anahtarın ve soruların bu tarayıcıdan yalnız Anthropic API’sine gider.',
  artifactNote: 'Claude hesabınla çalışır: soruların kendi Claude planının kullanımından düşer, API anahtarı gerekmez.',
  demosArtifact: 'Hazır örnekler:',
  footerArtifact: 'Açık kaynak (MIT). Bu sürüm Claude içinde artifact olarak çalışır; soruların Claude hesabın üzerinden gider.',
  errNoClaude: 'Claude bağlantısı bulunamadı. Bu sürüm Claude içinde artifact olarak açıldığında soru yanıtlar; hazır örnekler her yerde çalışır.',
  errClaude:
    'Claude isteği tamamlanamadı. İzin istemini reddetmiş, kullanım sınırına ulaşmış ya da oturumun kapanmış olabilir. Biraz bekleyip yeniden dene.',
  errInvalidArtifact:
    'Claude geçerli bir tahta senaryosu üretemedi (bir kez düzeltme istendi, o da geçersizdi). Soruyu sadeleştirip yeniden dene.',
};

const en: Dict = {
  tagline: 'Ask, and watch it explained on the board, step by step.',
  questionPlaceholder: 'Type a question, e.g. Why is the sky blue?',
  ask: 'Explain',
  asking: 'Preparing the board…',
  repairing: 'Repairing the reply…',
  demos: 'Ready-made examples (no key needed):',
  settings: 'Settings',
  steps: 'Steps',
  introStep: 'Title and main idea',
  play: 'Play',
  pause: 'Pause',
  prev: 'Previous step',
  next: 'Next step',
  restart: 'Restart',
  speed: 'Speed',
  progress: 'Progress',
  downloadJson: 'Scenario (JSON)',
  loadJson: 'Load JSON',
  downloadSvg: 'SVG',
  downloadPng: 'PNG',
  exportLabel: 'Export:',
  keyboardHint: 'Keyboard: space = play/pause, ← → = step back/forward',
  settingsTitle: 'Settings',
  apiKeyLabel: 'Anthropic API key',
  apiKeyWarning:
    'Your key is stored only in this browser (localStorage) and is sent only to api.anthropic.com, directly from this page. There is no server in between. On a shared computer, remove the key when you are done. Browser extensions can read localStorage; if possible use a separate key with a spending limit.',
  modelLabel: 'Model',
  modelNote: 'You can type any model name. A cheaper model works too; drawing quality depends on the model.',
  save: 'Save',
  removeKey: 'Remove key',
  close: 'Close',
  keySaved: 'Saved.',
  keyRemoved: 'Key removed.',
  errNoKey: 'Your own questions need an Anthropic API key. Add one in Settings, or watch the ready-made examples without a key.',
  errNoQuestion: 'Type a question first.',
  errNetwork: 'Could not reach the API. Check your connection and any blockers (ad blockers etc.).',
  errHttp401: 'The API key was rejected (401). Check it in Settings.',
  errHttp404: 'Model not found (404). Check the model name in Settings.',
  errHttp429: 'Rate limit reached (429). Wait a moment and try again.',
  errHttp: 'The API returned an error (HTTP {status}).',
  errEmpty: 'The model returned an empty reply. Try again.',
  errInvalid:
    'The model could not produce a valid board scenario (one repair was requested and it was invalid too). Simplify the question and retry, or pick another model.',
  errFile: 'This file is not a valid board scenario.',
  errDetails: 'Details',
  repairedNote: 'Note: the model’s first reply did not match the schema; it was fixed by a repair request.',
  aiNote: 'This board was generated by a language model and may contain mistakes. Verify anything important.',
  footer: 'Open source (MIT). Your key and questions go from this browser to the Anthropic API only.',
  artifactNote: 'Runs with your Claude account: your questions count against your own Claude plan, no API key needed.',
  demosArtifact: 'Ready-made examples:',
  footerArtifact: 'Open source (MIT). This build runs as an artifact inside Claude; your questions go through your Claude account.',
  errNoClaude: 'No Claude connection found. This build answers questions when opened as an artifact inside Claude; the ready-made examples work anywhere.',
  errClaude:
    'The Claude request did not complete. You may have declined the permission prompt, reached your usage limit, or been signed out. Wait a moment and try again.',
  errInvalidArtifact:
    'Claude could not produce a valid board scenario (one repair was requested and it was invalid too). Simplify the question and retry.',
};

const DICTS: Record<Lang, Dict> = { tr, en };

export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function dictKeys(lang: Lang): string[] {
  return Object.keys(DICTS[lang]);
}
