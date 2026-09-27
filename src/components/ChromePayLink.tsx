import { useState } from "react";
import { chromeUrl, watchChromeHandoff } from "../lib/inapp";

/**
 * iPhone-ийн Facebook/Messenger дотор: захиалга бэлэн болсны дараах ХОЁР ДАХЬ товч.
 * Жинхэнэ <a href> — хүн өөрөө дарахад л Facebook Chrome-г нээхийг зөвшөөрдөг.
 * Chrome дотор Byl-ийн банкны товч ажилладаг. Chrome нээгдэхгүй бол (суугаагүй) хэдэн
 * секундын дараа энэ цонхондоо Byl руу орох холбоос гарна.
 */
export function ChromePayLink({ url, kind }: { url: string; kind: "movie" | "sub" }) {
  const [noChrome, setNoChrome] = useState(false);
  return (
    <>
      <a
        className="btn btn-primary"
        href={chromeUrl(url)}
        onClick={() => watchChromeHandoff(kind, () => setNoChrome(true))}
      >
        Банкаа сонгож төлөх
      </a>
      {noChrome && (
        <a className="btn btn-ghost" href={url}>
          Chrome байхгүй бол энд дарж төлөх
        </a>
      )}
    </>
  );
}
