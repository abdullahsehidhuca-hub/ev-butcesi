# Ev Bütçesi

Kişisel ev bütçesi yönetim uygulaması. React + Vite ile geliştirilmiş, PWA olarak iPhone/Mac ana ekranına eklenebilir.

## Özellikler

- Bütçe yönetimi, sabit ve değişken zorunlu giderler
- Kredi kartı tek çekim ve taksitli harcama takibi
- Çoklu para birimi (TL, USD, EUR, Altın) birikim havuzu
- Risk skoru ve somut yönlendirmeler
- Ay kapatma ritüeli
- Haftalık zorunlu yedekleme
- Banka ekstresi dökümü analizi (CSV)
- Acil durum fonu hedefi

## Yerel Çalıştırma

```bash
npm install
npm run dev
```

`http://localhost:3000` adresinde açılır.

## Build

```bash
npm run build
```

`dist/` klasöründe üretim dosyaları oluşur.

## iPhone'da Çalıştırma

Uygulama Capacitor ile iOS kabuğunda çalışır; web sitesi yayını yoktur.

- `npm run ios:sim`: iOS Simülatöründe açar
- `npm run ios:cihaz`: eşleşmiş iPhone'a doğrudan kurar (aynı Wi-Fi, Geliştirici Modu açık)
- `npm run ios:testflight`: TestFlight iç teste yükler (Apple incelemesi gerekmez)

Ayrıntılar: `docs/IOS-SIMULATOR-VE-TESTFLIGHT-REHBERI.md`.

## Android'de Çalıştırma

Aynı web kodu Capacitor'ın Android kabuğunda (`android/`) çalışır. Android Studio ve Java 21 (`brew install openjdk@21`) gerekir.

- `npm run android:emu`: Android Emulator'da (Pixel 10 Pro XL) açar ve ekran görüntüsü alır
- `npm run android:paket`: Google Play'e yüklenecek imzalı `.aab` paketini üretir
- `npm run android:open`: projeyi Android Studio'da açar

Ayrıntılar: `docs/ANDROID-PLAN-VE-KURULUM-REHBERI.md`. Her düzenleme iOS ve Android'e birlikte işlenir.

## Veri Saklama

Tüm veriler tarayıcının `localStorage`'ında saklanır. Veri kaybı riskini minimize etmek için uygulama her hafta başında zorunlu yedekleme modalı açar.
