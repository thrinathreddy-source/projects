import { absoluteUrl, SITE } from "@/lib/seo";

/**
 * IndexNow — one POST tells Bing, Yandex, Seznam and Naver that URLs changed,
 * instead of waiting for them to re-crawl on their own schedule. Google does
 * not participate; its side of this is the sitemap in Search Console.
 *
 * The key is public by design: crawlers verify ownership by fetching
 * https://www.themayatara.com/<key>.txt and checking it contains this string.
 * That file lives in public/ and must keep matching this constant.
 */
export const INDEXNOW_KEY = "2b1438ced72ea9a8d6eb8b441fba230c";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

// The same public pages the sitemap lists. Anything noindex stays out — the
// protocol is for content you want crawled.
export function indexableUrls(): string[] {
  return [
    absoluteUrl("/"),
    absoluteUrl("/register"),
    absoluteUrl("/compatibility"),
    absoluteUrl("/philosophy"),
    absoluteUrl("/login"),
    absoluteUrl("/terms"),
    absoluteUrl("/contact"),
  ];
}

export interface IndexNowResult {
  status: number;
  ok: boolean;
  submitted: string[];
}

/**
 * Submit a batch. The protocol asks that you only call this when something
 * actually changed — repeatedly resubmitting unchanged URLs is what gets a
 * host's submissions throttled or ignored.
 */
export async function submitToIndexNow(urls: string[] = indexableUrls()): Promise<IndexNowResult> {
  const host = new URL(SITE).host;

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  });

  // 200 accepted, 202 accepted but key still being validated. Both are fine.
  return { status: res.status, ok: res.ok, submitted: urls };
}
