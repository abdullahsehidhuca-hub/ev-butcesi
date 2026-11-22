// İlk kurulum rehberi: hesap amaçları, kategori dalları ve kurulum adımlarının bilgi penceresi metinleri.
// account.purpose hesabın hangi tarafta olduğunu söyler: gelir tarafı (maaş, birikim, nakit) ya da gider takibi
// tarafı (otomatik ödemeler, kredi kartı aktarımları, günlük harcama). Amacı olmayan eski hesaplar gelir tarafında sayılır.
// category.group: "fixed" (sabit gider) ya da "variable" (değişken gider); dalı olmayan eski kategori değişkendir.

export const LATER_NOTE = "Bunu daha sonra Ayarlar'dan düzenleyebilirsiniz.";

export const INCOME_PURPOSES = [
  { value: "salary", label: "Maaş hesabı", type: "bank", info: "Maaşın ya da diğer bir gelirin yattığı banka hesabı. İki maaşlı evde her maaş hesabını ayrı ekleyin." },
  { value: "savings", label: "Birikim hesabı", type: "bank", info: "Birikim yaptığınız hesap. Birikime para ayırırken ve birikimden bütçeye aktarırken seçilir." },
  { value: "cash", label: "Nakit", type: "cash", info: "Elinizdeki nakit para. Nakitle yaptığınız harcamalar buradan düşer." }
];

export const EXPENSE_PURPOSES = [
  { value: "autopay", label: "Otomatik ödemeler", type: "bank", info: "Kira, fatura gibi talimatlı ödemelerin çekildiği hesap. Ay başında gereken tutarı bütçe hesabından buraya aktarırsınız." },
  { value: "cardTransfer", label: "Kredi kartı aktarımları", type: "bank", info: "Kredi kartı ekstrelerinin ödendiği hesap. Ekstre tutarını ay başında buraya aktarırsınız." },
  { value: "daily", label: "Günlük harcama", type: "bank", info: "Günlük harcamalar için para yüklediğiniz hesap ya da kart (konfor kartı gibi). İsterseniz haftalık yükleme tanımlarsınız." }
];

export const CATEGORY_GROUPS = [
  { value: "fixed", label: "Sabit gider" },
  { value: "variable", label: "Değişken gider" }
];

export const purposeOf = value => [...INCOME_PURPOSES, ...EXPENSE_PURPOSES].find(p => p.value === value) || null;
export const isExpenseAccount = a => EXPENSE_PURPOSES.some(p => p.value === a?.purpose);
export const isSavingsAccount = a => a?.purpose === "savings";
export const groupOf = c => c?.group === "fixed" ? "fixed" : "variable";

// Bilgi penceresi (SetupInfoSheet) metinleri. Adıma ilk kez dokununca ve adımın ⓘ düğmesine basınca açılır.
export const STEP_INFO = {
  budget: {
    title: "Bütçe hesabı",
    body: [
      "Maaşınızın ve diğer gelirlerinizin yattığı hesapları ekleyin. Bankada bugün görünen bakiyeyi yazın; uygulama bu rakamdan devam eder.",
      "İlk eklediğiniz hesap bütçe hesabınız olur. Harcama ve ödeme girerken önce bu hesap önerilir.",
      "Tür olarak maaş hesabı, birikim hesabı ya da nakit seçersiniz. Birikime aktarırken yalnız bu adımda eklediğiniz hesaplar listelenir."
    ],
    types: INCOME_PURPOSES
  },
  cards: {
    title: "Kredi kartları",
    body: [
      "Kullandığınız her kredi kartını ayrı ekleyin. Kartla yaptığınız harcama kartın borcuna yazılır; bütçe hesabından hemen düşmez.",
      "Hesap kesim ve son ödeme gününü girerseniz uygulama ekstre tutarını ve ödeme gününü gösterir."
    ]
  },
  expense: {
    title: "Gider takibi hesapları",
    body: [
      "Bazı giderleri bütçe hesabı yerine ayrı bir hesaptan ödüyorsanız o hesapları burada ekleyin.",
      "Her ay başında uygulama bu hesaplara ne kadar aktarmanız gerektiğini gösterir. Gidere aktarırken yalnız bu adımda eklediğiniz hesaplar listelenir.",
      "Ayrı hesap kullanmıyorsanız adımdaki kutuyu işaretleyin; ödemeler bütçe hesabından takip edilir."
    ],
    types: EXPENSE_PURPOSES
  },
  income: {
    title: "Maaş ve diğer gelirler",
    body: [
      "Her ay düzenli yatan geliri tutarı ve yattığı günle ekleyin. İki maaş varsa ikisini ayrı ekleyin; her biri kendi hesabına yazılır.",
      "İlk girdiğiniz maaşın günü bütçe ayınızın başlangıcı olur. Gelir yattığında Özet'te alındı olarak işaretlersiniz."
    ]
  },
  categories: {
    title: "Gider kategorileri",
    body: [
      "Giderlerinizi iki ana dalda toplarsınız: sabit giderler ve değişken giderler.",
      "Sabit ödemeleri eklerken sabit gider kategorilerinden birini seçersiniz. Raporlar da bu kategorilere göre hazırlanır."
    ]
  },
  catFixed: {
    title: "Sabit gider kategorileri",
    body: [
      "Her ay aşağı yukarı aynı tutarda ödenen giderler: kira, aidat, elektrik, internet, kredi taksiti gibi.",
      "Bu kategorilerdeki ödemeler Ödemeler sekmesinde ödeme gününe göre listelenir."
    ]
  },
  catVariable: {
    title: "Değişken gider kategorileri",
    body: [
      "Tutarı aydan aya değişen harcamalar: market, akaryakıt, yemek, giyim gibi.",
      "Aylık bütçe girerseniz harcamanın bu sınıra göre durumu izlenir. Harcama eklerken bu kategorilerden birini seçersiniz."
    ]
  },
  fixed: {
    title: "Sabit ödemeler",
    body: [
      "Kira, fatura, aidat gibi her ay tekrarlanan ödemeleri tutarı, son ödeme günü ve kategorisiyle ekleyin.",
      "Otomatik talimatla ödenenleri işaretlerseniz ödeme günü gelince kendiliğinden düşer. Diğerlerini ödediğinizde Özet'te işaretlersiniz.",
      "Fatura gibi tutarı değişen ödemelerde ortalamayı yazın; öderken gerçek tutarı girersiniz."
    ]
  }
};
