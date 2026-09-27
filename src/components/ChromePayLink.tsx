import { chromeUrl, watchChromeHandoff } from "../lib/inapp";

/**
 * iPhone-ийн Facebook/Messenger дотор: захиалга бэлэн болсны дараах ХОЁР ДАХЬ товч.
 * Жинхэнэ <a href> — хүн өөрөө дарахад л Facebook Chrome-г нээхийг зөвшөөрдөг.
 * Chrome дотор Byl-ийн банкны товч ажилладаг; Chrome байхгүй бол Byl руу энэ цонхондоо орно.
 */
export function ChromePayLink({ url, kind }: { url: string; kind: "movie" | "sub" }) {
  return (
    <a className="btn btn-primary" href={chromeUrl(url)} onClick={() => watchChromeHandoff(url, kind)}>
      Банкаа сонгож төлөх
    </a>
  );
}
