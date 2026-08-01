// ========================================================================
// ЭЗНИЙ ТОХИРГОО — энд өөрийн мэдээллээ бичээд tools/deploy.ps1 ажиллуулна
// ========================================================================

export const CONFIG = {
  // true байхад "демо coin" товчнууд харагдана (туршилтын үе).
  // Дансаа бичиж, жинхэнэ ажиллагаанд орохдоо false болгоно.
  demoMode: true,

  // Шилжүүлэг хүлээн авах данс — TODO: өөрийн мэдээллээр солино уу
  bank: {
    bankName: "Хаан банк",
    accountNumber: "XXXXXXXXXX",
    accountName: "ТАНЫ НЭР",
  },

  // Шилжүүлсний дараа хэрэглэгч хаана мэдэгдэх вэ (Facebook хуудас, утас г.м)
  contact: "Шилжүүлсний дараа Facebook хуудас руу гүйлгээний баримтаа илгээнэ үү",

  // Coin-ий багцууд (₮ үнэ)
  packs: [
    { coins: 100, price: 3000 },
    { coins: 300, price: 8000 },
    { coins: 500, price: 12000 },
  ],

  // Supabase (S2 — сервер). Anon түлхүүр нь client-д зориулагдсан нээлттэй түлхүүр.
  supabaseUrl: "https://uloxtmssvloffbwfwzki.supabase.co",
  supabaseAnonKey: "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1",
};
