/**
 * Azure service status, read live from the public RSS feed.
 *
 * This one is not snapshotted — an incident feed is only useful current, and the
 * feed is small. When Azure is healthy the channel contains no items at all.
 */
const FEED = "https://azure.status.microsoft/en-us/status/feed/";

export interface StatusItem {
  title: string;
  link: string;
  published: string;
  summary: string;
}

function firstMatch(block: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = pattern.exec(block);
  if (!match) return "";
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchAzureStatus(): Promise<{ items: StatusItem[]; fetchedAt: string }> {
  const response = await fetch(FEED, {
    headers: { "User-Agent": "m365-radar (+https://github.com/DimaVasilenko-Intune/m365-radar)" },
  });

  if (!response.ok) {
    throw new Error(`Azure status feed returned ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: firstMatch(match[1], "title"),
    link: firstMatch(match[1], "link"),
    published: firstMatch(match[1], "pubDate"),
    summary: firstMatch(match[1], "description"),
  }));

  return { items, fetchedAt: new Date().toISOString() };
}
