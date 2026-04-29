import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const outputPath = path.resolve(process.cwd(), "data/feed.json");

const feeds = [
  {
    id: "bonds-corporate",
    url: "https://uk.investing.com/rss/bonds_Corporate.rss",
    sourceTitle: "Corporate Bonds Analysis",
    fixedCategory: "Bonds",
  },
  {
    id: "news-95",
    url: "https://uk.investing.com/rss/news_95.rss",
    sourceTitle: "Economic Indicators News",
  },
  {
    id: "news-14",
    url: "https://uk.investing.com/rss/news_14.rss",
    sourceTitle: "Economic News",
  },
  {
    id: "commodities-fundamental",
    url: "https://uk.investing.com/rss/commodities_Fundamental.rss",
    sourceTitle: "Commodities Fundamental Analysis",
    fixedCategory: "Commodities",
  },
  {
    id: "bonds-government",
    url: "https://uk.investing.com/rss/bonds_Government.rss",
    sourceTitle: "Government Bonds Analysis",
    fixedCategory: "Bonds",
  },
  {
    id: "news-285",
    url: "https://uk.investing.com/rss/news_285.rss",
    sourceTitle: "Most Popular Financial News",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
});

const keywordRules = {
  "Central Banks": [
    "fed",
    "federal reserve",
    "ecb",
    "boe",
    "bank of england",
    "bank of canada",
    "rba",
    "rbi",
    "boj",
    "central bank",
    "rate cut",
    "rate hike",
    "policy rate",
    "monetary policy",
  ],
  Commodities: [
    "gold",
    "silver",
    "copper",
    "oil",
    "crude",
    "brent",
    "wti",
    "commodity",
    "commodities",
    "palladium",
    "platinum",
    "farm",
  ],
  "Global Risk": [
    "war",
    "conflict",
    "hormuz",
    "risk",
    "opec",
    "iran",
    "sanctions",
    "crisis",
    "futures",
    "stocks",
    "ftse",
    "takeover",
    "earnings",
    "utilities",
    "subsidies",
  ],
  Bonds: [
    "bond",
    "bonds",
    "yield",
    "yields",
    "treasury",
    "auction",
    "t-bills",
    "t bill",
    "debt",
    "corporate",
    "spread",
    "duration",
    "credit",
  ],
};

const deckLabelByCategory = {
  Bonds: "Rates Monitor",
  Commodities: "Commodities Note",
  "Macro Policy": "Macro Brief",
  "Global Risk": "Market Desk",
  "Central Banks": "Policy Watch",
};

const deskByCategory = {
  Bonds: "Market Desk",
  Commodities: "Desk Wire",
  "Macro Policy": "Macro Brief",
  "Global Risk": "Market Desk",
  "Central Banks": "Policy Desk",
};

const categoryRank = {
  "Central Banks": 1,
  Bonds: 2,
  Commodities: 3,
  "Global Risk": 4,
  "Macro Policy": 5,
};

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const feedResults = await Promise.allSettled(feeds.map(fetchFeed));
const collectedStories = [];
const sourceSummaries = [];

for (const result of feedResults) {
  if (result.status === "rejected") {
    console.warn(result.reason);
    continue;
  }

  collectedStories.push(...result.value.items);
  sourceSummaries.push(result.value.summary);
}

if (!collectedStories.length) {
  throw new Error("No stories were collected from the configured RSS feeds.");
}

const dedupedStories = dedupeAndSort(collectedStories);
const payload = {
  generatedAt: new Date().toISOString(),
  refreshHintMinutes: 5,
  itemCount: dedupedStories.length,
  sourceCount: sourceSummaries.length,
  sources: sourceSummaries,
  items: dedupedStories,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${dedupedStories.length} normalized stories to ${outputPath}`);

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: {
      "user-agent": userAgent,
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Feed ${feed.id} failed with ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const channel = parsed.rss?.channel ?? parsed.feed ?? {};
  const rawItems = asArray(channel.item ?? channel.entry);
  const items = rawItems.map((item, index) => normalizeStory(item, index, feed));

  return {
    items,
    summary: {
      id: feed.id,
      url: feed.url,
      title: channel.title || feed.sourceTitle,
      itemCount: items.length,
    },
  };
}

function normalizeStory(item, index, feed) {
  const title = cleanText(item.title);
  const url = cleanText(item.link?.href || item.link);
  const category = inferCategory(title, feed);
  const publishedAt = parsePublishedAt(cleanText(item.pubDate || item.published || item.updated));
  const image = cleanText(
    item.enclosure?.url || item["media:thumbnail"]?.url || item["media:content"]?.url,
  );

  return {
    id: `${feed.id}-${index}-${slugify(title).slice(0, 48)}`,
    feedId: feed.id,
    source: "Investing.com",
    sourceTitle: feed.sourceTitle,
    author: cleanText(item.author) || "Investing.com",
    title,
    url,
    category,
    deckLabel: deckLabelByCategory[category],
    desk: deskByCategory[category],
    summary: buildSummary(title, category),
    image: image || null,
    publishedAt: publishedAt.toISOString(),
    publishedAtDisplay: publishedAt.toISOString(),
  };
}

function inferCategory(title, feed) {
  const lower = title.toLowerCase();

  if (feed.fixedCategory) {
    return feed.fixedCategory;
  }

  for (const [category, words] of Object.entries(keywordRules)) {
    if (words.some((word) => matchesKeyword(lower, word))) {
      return category;
    }
  }

  return "Macro Policy";
}

function buildSummary(title, category) {
  const lower = title.toLowerCase();

  if (category === "Central Banks") {
    if (hasAnyKeyword(lower, ["fed", "rate cut", "rate hike", "policy rate"])) {
      return "Rate-path expectations are moving with every policy-sensitive headline and pricing signal.";
    }

    return "Central-bank messaging is shaping short-end expectations and the tone across rate-sensitive assets.";
  }

  if (category === "Bonds") {
    if (hasAnyKeyword(lower, ["t-bills", "t bill", "auction", "treasury"])) {
      return "Sovereign funding costs remain in focus as investors test demand for new paper and duration.";
    }

    if (hasAnyKeyword(lower, ["yield", "yields"])) {
      return "Yield moves are still doing most of the work for duration and cross-asset positioning.";
    }

    return "Credit conditions are being judged through spreads, carry, and the market’s appetite for duration.";
  }

  if (category === "Commodities") {
    if (hasAnyKeyword(lower, ["gold"])) {
      return "Gold is acting as a live read on haven demand, oil spillovers, and the policy backdrop.";
    }

    if (hasAnyKeyword(lower, ["oil", "crude", "brent", "wti"])) {
      return "Energy pricing remains tightly linked to supply risk and its spillover into inflation expectations.";
    }

    if (hasAnyKeyword(lower, ["farm", "commodities", "commodity"])) {
      return "Agricultural contracts are reacting to supply-route stress and renewed upstream cost pressure.";
    }

    return "Commodity pricing is reflecting a tighter mix of supply risk, inflation pressure, and haven demand.";
  }

  if (category === "Global Risk") {
    if (hasAnyKeyword(lower, ["war", "conflict", "iran", "hormuz", "sanctions", "opec"])) {
      return "Geopolitical headlines are feeding directly into market pricing, especially through energy-linked risk.";
    }

    if (hasAnyKeyword(lower, ["stocks", "futures", "ftse", "earnings"])) {
      return "Risk sentiment is being filtered through equity positioning, earnings flow, and headline sensitivity.";
    }

    if (hasAnyKeyword(lower, ["takeover"])) {
      return "Deal-driven moves are standing out against a broader backdrop that still looks headline-sensitive.";
    }

    return "Cross-asset positioning is adjusting to a more fragile and headline-sensitive backdrop.";
  }

  if (hasAnyKeyword(lower, ["inflation"])) {
    return "Inflation data remains the clearest test of how quickly policymakers can afford to ease.";
  }

  if (hasAnyKeyword(lower, ["gdp", "growth"])) {
    return "Growth-sensitive releases are sharpening the market’s read on underlying demand and momentum.";
  }

  if (hasAnyKeyword(lower, ["building permits", "mortgage", "housing"])) {
    return "Housing-sensitive releases are giving a fresh read on demand resilience and financing conditions.";
  }

  if (hasAnyKeyword(lower, ["durable goods"])) {
    return "Capex-sensitive data is helping frame the market’s latest view on industrial demand.";
  }

  if (hasAnyKeyword(lower, ["inventory", "inventories"])) {
    return "Inventory data is offering a more immediate signal on demand, supply, and production balances.";
  }

  if (hasAnyKeyword(lower, ["rate", "rates", "central bank", "fed", "ecb", "boe"])) {
    return "Policy-sensitive headlines are keeping the rate path and front-end pricing firmly in view.";
  }

  const fallbacks = {
    Bonds: "Rates markets are recalibrating around sovereign supply, duration demand, and relative carry.",
    Commodities: "Commodity pricing is balancing supply pressure, inflation risk, and haven demand.",
    "Macro Policy": "Macro releases are refining the picture on growth, inflation, and the policy path.",
    "Global Risk": "Investors are reassessing the latest headlines through the lens of cross-asset risk.",
    "Central Banks": "Central-bank signals are still setting expectations for the next policy move.",
  };

  return fallbacks[category];
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => matchesKeyword(text, keyword));
}

function dedupeAndSort(stories) {
  const byKey = new Map();

  for (const story of stories) {
    const key = dedupeKey(story);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, story);
      continue;
    }

    const existingDate = new Date(existing.publishedAt).getTime();
    const candidateDate = new Date(story.publishedAt).getTime();
    const existingRank = categoryRank[existing.category] ?? 99;
    const candidateRank = categoryRank[story.category] ?? 99;

    if (
      candidateDate > existingDate ||
      (candidateDate === existingDate && candidateRank < existingRank) ||
      (!existing.image && story.image)
    ) {
      byKey.set(key, story);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const timeDiff = new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return (categoryRank[left.category] ?? 99) - (categoryRank[right.category] ?? 99);
  });
}

function dedupeKey(story) {
  const normalizedUrl = story.url
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[?#].*$/, "")
    .trim();

  if (normalizedUrl) {
    return normalizedUrl.toLowerCase();
  }

  return cleanText(story.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parsePublishedAt(value) {
  if (!value) {
    return new Date();
  }

  if (/^\d{4}-\d{2}-\d{2} /.test(value)) {
    const [datePart, timePart] = value.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return new Date();
}

function asArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
