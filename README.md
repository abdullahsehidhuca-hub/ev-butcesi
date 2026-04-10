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

## Deployment (Vercel)

1. Bu projeyi GitHub'a push edin
2. [vercel.com](https://vercel.com) üzerinden projeyi import edin
3. Build ayarları otomatik algılanır (Vite)
4. Deploy'u başlatın

## iPhone/iPad'e Ana Ekran Uygulaması Olarak Ekleme

1. Vercel deploy linkini Safari'de açın
2. Paylaş butonuna basın
3. "Ana Ekrana Ekle" seçeneğini seçin
4. Uygulama simgesi ana ekranda görünür, tam ekran çalışır

## Mac'e Ana Ekran Uygulaması Olarak Ekleme

1. Vercel deploy linkini Safari'de açın
2. Dosya menüsü → "Dock'a Ekle" veya paylaş → "Dock'a Ekle"

## Veri Saklama

Tüm veriler tarayıcının `localStorage`'ında saklanır. Veri kaybı riskini minimize etmek için uygulama her hafta başında zorunlu yedekleme modalı açar.
