import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, type SiteSettings } from "../lib/settings";
import { AccountBadge } from "../components/AccountBadge";

// Зарнаас ирсэн танихгүй хүн мөнгө шилжүүлэхийн өмнө "энэ найдвартай юу?" гэж
// эргэлздэг. Энэ хуудас яг тэр эргэлзээг арилгах зорилготой.
const FAQ: { q: string; a: string }[] = [
  {
    q: "Төлбөрөө төлсний дараа кино хэзээ нээгдэх вэ?",
    a: "QPay-ээр төлмөгц хэдхэн секундын дотор автоматаар нээгдэнэ. Хэрэв удвал бидэнтэй холбогдоорой — шалгаад нээж өгнө.",
  },
  {
    q: "Нэг кино авахад бүртгүүлэх шаардлагатай юу?",
    a: "Үгүй. «QPay-ээр төлөх» дараад шууд төлнө — кино тэр утсан дээр нээгдэнэ. Харин сарын эрх утасны дугаарт холбогддог тул бүртгэл шаардана. Бүртгүүлбэл өмнө нь авсан кинонууд тань бүртгэлд тань автоматаар шилжинэ.",
  },
  {
    q: "Нэг удаа төлөөд хэдэн удаа үзэж болох вэ?",
    a: "Хязгааргүй. Худалдаж авсан кино тань бүрмөсөн нээлттэй үлдэнэ — хүссэн үедээ, хэдэн ч удаа үзнэ. Сар бүрийн төлбөр, захиалгын сунгалт байхгүй.",
  },
  {
    q: "Утсаа сольсон эсвэл програмаа устгасан бол яах вэ?",
    a: "Бүртгэлтэй бол юу ч алдагдахгүй — шинэ утсандаа мөн дугаараараа нэвтрэхэд бүх кино тань хэвээр байна. Бүртгэлгүй авсан кино зөвхөн тэр утасны хөтөч дээр хадгалагддаг тул алдахгүйн тулд бүртгүүлээрэй (үнэгүй).",
  },
  {
    q: "Нууц үг мартсан бол?",
    a: "Утасны дугаараа бичээд бидэнд хандаарай. Бид таны бүртгэлийг шалгаад сэргээж өгнө.",
  },
  {
    q: "Эхлээд үнэгүй үзэж болох уу?",
    a: "Болно. Кино бүрийн эхний хэсэг бүрэн үнэгүй — бүртгэлгүйгээр шууд үзнэ. Таалагдсан тохиолдолд л үргэлжлэлийг нь худалдаж авна.",
  },
];

export function HelpPage() {
  const [bank, setBank] = useState<SiteSettings | null>(null);

  useEffect(() => {
    document.title = "Тусламж — Кино Мандал";
    void getSettings().then(setBank);
    return () => {
      document.title = "Кино Мандал — богино драм монголоор";
    };
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">
          ←
        </Link>
        <div className="brand">Тусламж</div>
        <AccountBadge />
      </header>

      <section className="help-block">
        <h2 className="help-h">Хэрхэн ажилладаг вэ</h2>
        <ol className="help-steps">
          <li>
            <strong>Үнэгүй үзэж танилц</strong>
            <span>Кино бүрийн эхний хэдэн минут үнэгүй. Бүртгүүлэх ч шаардлагагүй.</span>
          </li>
          <li>
            <strong>Таалагдвал худалдаж ав</strong>
            <span>
              «QPay-ээр төлөх» дараад банкны аппаараа төлнө. Нэг кино авахад бүртгэл
              шаардлагагүй.
            </span>
          </li>
          <li>
            <strong>Шууд үз</strong>
            <span>
              Төлбөр ормогц кино автоматаар нээгдэж, зогссон газраасаа үргэлжилнэ.
            </span>
          </li>
        </ol>
      </section>

      <section className="help-block">
        <h2 className="help-h">Түгээмэл асуултууд</h2>
        {FAQ.map((f) => (
          <details key={f.q} className="faq">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <section className="help-block">
        <h2 className="help-h">Холбоо барих</h2>
        <p className="muted small">
          Асуудал гарвал, эсвэл төлбөр удаан баталгаажвал бидэнд хандаарай. Бид ажлын өдрүүдэд
          хурдан хариулна.
        </p>
        {bank?.contact && <p className="help-contact">{bank.contact}</p>}
        {bank?.account_name && (
          <p className="muted small">
            Төлбөр хүлээн авагч: <strong>{bank.account_name}</strong> ·{" "}
            {bank.bank_name}
          </p>
        )}
      </section>

      <footer className="foot">
        <Link className="link-btn" to="/">
          ← Каталог руу буцах
        </Link>
      </footer>
    </div>
  );
}
