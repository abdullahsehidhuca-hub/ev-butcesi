# 2026-05-02 — Scroll Düzeltmesi + X/Y/B Sembol Temizliği

## Ne yapıldı

### Nasıl Kullanılır Beyaz Ekran Fix
- `useState` koşullu `if (sec === "howto")` bloğunun içindeydi → React hook kuralı ihlali
- `howtoOpen` state'i Settings bileşeninin üst seviyesine taşındı

### Scroll Düzeltmesi (Uygulama Geneli)
- Tüm Settings alt sayfalarına `flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch"` eklendi
- Etkilenen: budget, howto, calendar, reset, theme, logout, fixed, variable, cards, debt, rates, emergency, backup, family
- Padding tutarsızlığı: `100px` → `90px` (EmergencyFund, Backup, FamilyManagement)
- Modal: `85vh` → `85dvh`, `90vh` → `90dvh` (iOS Safari adres çubuğu uyumu)
- `WebkitOverflowScrolling: "touch"` tüm scroll container'lara eklendi (iOS smooth scroll)

### X/Y/B Sembol Temizliği
- Teknik semboller (X, Y, B) kullanıcı arayüzünden kaldırıldı
- Risk kartı açıklamaları: `X = ₺57.429` → `Kullanılabilir bütçe ₺57.429`
- AI prompt: `Bankada (Y)`, `Bloke (B)`, `Kullanılabilir (X)` → düz Türkçe
- Nasıl Kullanılır: `X, Y, B ne demek?` → `Bütçe terimleri ne anlama geliyor?`
- Simülasyon info: `şu kadar X taksitle` → `bu taksitle`

## Neden böyle yapıldı
- Beyaz ekran: CLAUDE.md'de belirtilen hook kuralı (koşullu blokta useState yasak)
- Scroll: iOS Safari'de Settings alt sayfaları kaydırılamıyordu — flex container içinde overflow:auto eksikti
- X/Y/B: Teknik kullanıcılar için anlamlı ama sıradan kullanıcılar için kafa karıştırıcı

## İç düşünme süreci
- Scroll sorunu için tüm bileşenleri sistematik audit ettim (Agent ile)
- Replace-all kullandım: `padding: "20px 16px 90px"` → scroll ekli versiyona toplu geçiş
- X/Y/B temizliğinde kod içi değişken isimlerini (remainingX, remainingY, groupB) DEĞİŞTİRMEDİM — sadece kullanıcıya görünen UI metinlerini düzelttim

## Sonraki adım
- Test grubundan geri bildirim bekleniyor
