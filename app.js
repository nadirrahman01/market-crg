const CATEGORY_ORDER = [
  "All",
  "Bonds",
  "Commodities",
  "Macro Policy",
  "Global Risk",
  "Central Banks",
];

const CATEGORY_PREFERENCE = ["Bonds", "Commodities", "Macro Policy", "Global Risk", "Central Banks"];

const TOPIC_RULES = [
  { label: "Inflation", searchTerm: "inflation", patterns: ["inflation", "cpi", "prices"] },
  { label: "US Rates", searchTerm: "rates", patterns: ["fed", "treasury", "yield", "yields", "rate", "rate cut"] },
  { label: "Gold", searchTerm: "gold", patterns: ["gold", "bullion"] },
  { label: "Oil", searchTerm: "oil", patterns: ["oil", "crude", "brent", "wti"] },
  { label: "OPEC+", searchTerm: "opec", patterns: ["opec", "opec+", "hormuz"] },
  { label: "Growth", searchTerm: "growth", patterns: ["growth", "gdp", "recession", "economy"] },
  { label: "Housing", searchTerm: "housing", patterns: ["building permits", "mortgage", "housing"] },
  { label: "Central Banks", searchTerm: "central bank", patterns: ["central bank", "fed", "ecb", "boe", "boj", "rba", "rbi"] },
  { label: "Europe", searchTerm: "europe", patterns: ["europe", "european", "germany", "greece", "spain", "ireland"] },
  { label: "Risk", searchTerm: "risk", patterns: ["risk", "war", "conflict", "iran", "sanctions"] },
  { label: "Equities", searchTerm: "stocks", patterns: ["stocks", "futures", "ftse", "earnings"] },
  { label: "Commodities", searchTerm: "commodities", patterns: ["commodities", "commodity", "farm", "palladium", "platinum"] },
];

const NEGATIVE_PATTERNS = [
  "decline",
  "shrinks",
  "shrink",
  "falls",
  "lower",
  "caution",
  "risks",
  "war",
  "blockade",
  "downside",
  "soft",
  "misses",
];

const POSITIVE_PATTERNS = [
  "rise",
  "rises",
  "surge",
  "surges",
  "higher",
  "record",
  "firm",
  "optimism",
  "strength",
  "beats",
];

const state = {
  stories: [],
  category: "All",
  search: "",
  sort: "latest",
  generatedAt: null,
  refreshTimer: null,
};

const featuredGrid = document.querySelector("#featured-grid");
const feedList = document.querySelector("#feed-list");
const categoryPills = document.querySelector("#category-pills");
const searchInput = document.querySelector("#story-search");
const sortOrder = document.querySelector("#sort-order");
const refreshAgo = document.querySelector("[data-refresh-ago]");
const pulseNew = document.querySelector("[data-pulse-new]");
const pulseCategory = document.querySelector("[data-pulse-category]");
const pulseLatest = document.querySelector("[data-pulse-latest]");
const marketSummary = document.querySelector("#market-summary");
const topicList = document.querySelector("#trending-topics");
const navToggle = document.querySelector("[data-nav-toggle]");
const headerActions = document.querySelector("[data-header-actions]");

renderCategoryPills();
wireNavigation();
wireControls();
loadStories();

async function loadStories() {
  featuredGrid.innerHTML = `<div class="loading-state">Loading live market stories…</div>`;
  feedList.innerHTML = `<div class="loading-state">Loading live market feed…</div>`;
  marketSummary.textContent = "Loading the current market brief…";
  topicList.innerHTML = "";

  try {
    const response = await fetch("data/feed.json");

    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}`);
    }

    const payload = await response.json();
    state.stories = payload.items ?? [];
    state.generatedAt = payload.generatedAt ?? null;
    scheduleRefreshUpdates();
    render();
  } catch (error) {
    const message =
      "The live feed could not be loaded right now. Check that data/feed.json exists and the refresh workflow has run.";

    featuredGrid.innerHTML = `<div class="empty-state">${message}</div>`;
    feedList.innerHTML = `<div class="empty-state">${message}</div>`;
    marketSummary.textContent = message;
    topicList.innerHTML = "";
    pulseNew.textContent = "—";
    pulseCategory.textContent = "—";
    pulseLatest.textContent = "—";
    console.error(error);
  }
}

function wireNavigation() {
  if (!navToggle || !headerActions) {
    return;
  }

  navToggle.addEventListener("click", () => {
    const isOpen = headerActions.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!headerActions.classList.contains("is-open")) {
      return;
    }

    if (headerActions.contains(event.target) || navToggle.contains(event.target)) {
      return;
    }

    headerActions.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
}

function wireControls() {
  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  sortOrder.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  topicList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-topic]");
    if (!button) {
      return;
    }

    const topic = button.dataset.topic?.toLowerCase() || "";
    const label = button.dataset.label || topic;

    if (state.search === topic) {
      state.search = "";
      searchInput.value = "";
    } else {
      state.search = topic;
      searchInput.value = label;
    }

    render();
  });
}

function renderCategoryPills() {
  categoryPills.innerHTML = "";

  CATEGORY_ORDER.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-pill${state.category === category ? " active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      state.category = category;
      renderCategoryPills();
      render();
    });
    categoryPills.appendChild(button);
  });
}

function render() {
  const stories = getFilteredStories();
  updateRefreshStatus();
  renderMarketIntelligence(stories);
  renderFeaturedStories(stories);
  renderFeedRows(stories);
}

function getFilteredStories() {
  const filtered = state.stories.filter((story) => {
    const categoryMatch = state.category === "All" || story.category === state.category;
    const haystack = [
      story.title,
      story.summary,
      story.category,
      story.desk,
      story.source,
      story.author,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const searchMatch = !state.search || haystack.includes(state.search);
    return categoryMatch && searchMatch;
  });

  return filtered.sort((left, right) => {
    const leftTime = new Date(left.publishedAt).getTime();
    const rightTime = new Date(right.publishedAt).getTime();
    return state.sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  });
}

function renderMarketIntelligence(stories) {
  if (!stories.length) {
    pulseNew.textContent = "0 stories";
    pulseCategory.textContent = "No active view";
    pulseLatest.textContent = "—";
    marketSummary.textContent = "No stories match the current filters. Clear the search or switch back to All to reopen the full tape.";
    topicList.innerHTML = "";
    return;
  }

  const recencyStories = sortStoriesByRecency(stories);
  const insightPool = getInsightPool(recencyStories);
  const topics = extractTopics(insightPool);
  const newStories = recencyStories.filter((story) => hoursSince(story.publishedAt) <= 1).length;
  const latestStory = recencyStories[0] || null;
  const mostActive = getMostActiveCategory(insightPool);

  pulseNew.textContent = `${newStories} ${pluralize("story", newStories)}`;
  pulseCategory.textContent = mostActive ? `${mostActive.category} · ${mostActive.count}` : "—";
  pulseLatest.textContent = latestStory ? formatTimeAgo(latestStory.publishedAt) : "—";
  pulseLatest.title = latestStory ? formatAbsoluteDate(latestStory.publishedAt) : "";

  marketSummary.textContent = buildMarketSummary(stories, insightPool, topics);
  renderTopics(topics);
}

function renderTopics(topics) {
  if (!topics.length) {
    topicList.innerHTML = `<span class="topic-empty">No dominant themes yet.</span>`;
    return;
  }

  topicList.innerHTML = topics
    .slice(0, 5)
    .map((topic) => {
      const isActive = state.search === topic.searchTerm.toLowerCase();
      return `
        <button
          class="topic-link${isActive ? " active" : ""}"
          type="button"
          data-topic="${escapeHtml(topic.searchTerm)}"
          data-label="${escapeHtml(topic.label)}"
        >
          ${escapeHtml(topic.label)}
        </button>
      `;
    })
    .join("");
}

function renderFeaturedStories(stories) {
  if (!stories.length) {
    featuredGrid.innerHTML = `<div class="empty-state">No stories match the current filters.</div>`;
    return;
  }

  const featured = pickFeaturedStories(stories);

  featuredGrid.innerHTML = featured
    .map((story) => {
      const categoryClass = toClassName(story.category);
      return `
        <article class="story-card">
          <div class="story-card__body">
            <span class="story-card__eyebrow story-card__eyebrow--${categoryClass}">
              ${escapeHtml(story.deckLabel)}
            </span>
            <h3>
              <a href="${story.url}" target="_blank" rel="noreferrer">${escapeHtml(story.title)}</a>
            </h3>
            <div class="story-meta">
              <span class="story-meta__badge">${escapeHtml((story.desk || "M").charAt(0))}</span>
              <span>${escapeHtml(story.desk)}</span>
              <span>&bull;</span>
              <span>${escapeHtml(formatTimeAgo(story.publishedAt))}</span>
            </div>
            <p>${escapeHtml(story.summary)}</p>
          </div>
          <a class="story-card__visual" href="${story.url}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(story.title)}">
            <img src="${getStoryImage(story)}" alt="" loading="lazy" />
          </a>
        </article>
      `;
    })
    .join("");
}

function renderFeedRows(stories) {
  if (!stories.length) {
    feedList.innerHTML = `<div class="empty-state">No feed items match the current filters.</div>`;
    return;
  }

  feedList.innerHTML = stories
    .slice(0, 15)
    .map((story) => {
      const categoryClass = toClassName(story.category);
      return `
        <article class="feed-row">
          <div class="feed-time">
            <span class="feed-time__dot feed-time__dot--${categoryClass}" aria-hidden="true"></span>
            <span>${escapeHtml(formatTimeAgo(story.publishedAt))}</span>
          </div>

          <div class="feed-headline">
            <a href="${story.url}" target="_blank" rel="noreferrer">${escapeHtml(story.title)}</a>
          </div>

          <div class="feed-source">${escapeHtml(story.desk)}</div>

          <div>
            <span class="feed-category feed-category--${categoryClass}">
              ${escapeHtml(story.category)}
            </span>
          </div>

          <div class="feed-summary">${escapeHtml(story.summary)}</div>

          <a class="feed-link" href="${story.url}" target="_blank" rel="noreferrer">
            <span>Read more</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 12h15m0 0-4.5-4.5M19 12l-4.5 4.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
          </a>
        </article>
      `;
    })
    .join("");
}

function pickFeaturedStories(stories) {
  const recencyStories = sortStoriesByRecency(stories);
  const freshPool = recencyStories.filter((story) => hoursSince(story.publishedAt) <= 72);
  const primaryPool = freshPool.length >= 3 ? freshPool : recencyStories;
  const preferredCategories = state.category === "All" ? CATEGORY_PREFERENCE : [state.category];
  const featured = [];
  const usedIds = new Set();

  for (const category of preferredCategories) {
    const match = primaryPool.find((story) => story.category === category && !usedIds.has(story.id));
    if (!match) {
      continue;
    }

    featured.push(match);
    usedIds.add(match.id);

    if (featured.length === 3) {
      return featured;
    }
  }

  for (const story of primaryPool) {
    if (usedIds.has(story.id)) {
      continue;
    }

    if (!featured.some((item) => item.category === story.category)) {
      featured.push(story);
      usedIds.add(story.id);
    }

    if (featured.length === 3) {
      return featured;
    }
  }

  for (const story of primaryPool) {
    if (usedIds.has(story.id)) {
      continue;
    }

    featured.push(story);
    usedIds.add(story.id);

    if (featured.length === 3) {
      break;
    }
  }

  return featured.slice(0, 3);
}

function buildMarketSummary(stories, insightPool, topics) {
  const topCategories = getCategoryCounts(insightPool).slice(0, 3);
  const categoryPhrases = topCategories.map((entry) => categoryToPhrase(entry.category));
  const topicLabels = topics.slice(0, 3).map((topic) => topic.label);
  const toneSentence = buildToneSentence(insightPool, topics);

  if (state.search) {
    const searchLabel = searchInput.value.trim() || state.search;
    const focusPhrase = categoryPhrases.length ? formatList(categoryPhrases) : "the visible tape";
    const topicPhrase = topicLabels.length ? `, with ${formatList(topicLabels)} appearing most often` : "";
    return `Results for “${searchLabel}” are clustering in ${focusPhrase}${topicPhrase}. ${toneSentence}`;
  }

  if (state.category !== "All") {
    const topicPhrase = topicLabels.length
      ? formatList(topicLabels)
      : categoryToPhrase(state.category).replace(/^\w/, (letter) => letter.toLowerCase());
    return `${state.category} coverage is currently centered on ${topicPhrase}. ${toneSentence}`;
  }

  const leadPhrase = categoryPhrases.length ? formatList(categoryPhrases) : "market headlines";
  const topicClause = topicLabels.length
    ? `, with ${formatList(topicLabels)} surfacing most often across the latest stories`
    : "";

  return `Today's feed is being led by ${leadPhrase}${topicClause}. ${toneSentence}`;
}

function buildToneSentence(stories, topics) {
  const negativeHits = countSignals(stories, NEGATIVE_PATTERNS);
  const positiveHits = countSignals(stories, POSITIVE_PATTERNS);
  const labels = new Set(topics.map((topic) => topic.label));

  if (labels.has("Inflation") && labels.has("US Rates")) {
    return "Inflation and rate-sensitive releases are doing most of the tone-setting work right now.";
  }

  if (labels.has("Oil") || labels.has("OPEC+") || labels.has("Risk")) {
    return "Energy and geopolitical headlines are carrying more influence than usual through the current flow.";
  }

  if (negativeHits > positiveHits + 1) {
    return "The current tone leans cautious rather than outright risk-on.";
  }

  if (positiveHits > negativeHits + 1) {
    return "The current tone is firmer, with upside surprises carrying more weight than caution.";
  }

  return "Policy-sensitive headlines remain the clearest driver of the tape.";
}

function extractTopics(stories) {
  const counts = new Map();

  for (const story of stories) {
    const haystack = `${story.title} ${story.summary}`.toLowerCase();
    const weight = storyWeight(story.publishedAt);

    for (const rule of TOPIC_RULES) {
      if (!rule.patterns.some((pattern) => matchesKeyword(haystack, pattern))) {
        continue;
      }

      const current = counts.get(rule.label) || {
        label: rule.label,
        searchTerm: rule.searchTerm,
        score: 0,
      };

      current.score += weight;
      counts.set(rule.label, current);
    }
  }

  return Array.from(counts.values()).sort((left, right) => right.score - left.score);
}

function getInsightPool(stories) {
  const recencyStories = sortStoriesByRecency(stories);
  const withinThirtySixHours = recencyStories.filter((story) => hoursSince(story.publishedAt) <= 36);
  if (withinThirtySixHours.length >= 4) {
    return withinThirtySixHours.slice(0, 18);
  }

  const withinWeek = recencyStories.filter((story) => hoursSince(story.publishedAt) <= 168);
  if (withinWeek.length >= 4) {
    return withinWeek.slice(0, 18);
  }

  return recencyStories.slice(0, 18);
}

function getMostActiveCategory(stories) {
  const counts = getCategoryCounts(stories);
  return counts[0] || null;
}

function getCategoryCounts(stories) {
  const counts = stories.reduce((accumulator, story) => {
    accumulator[story.category] = (accumulator[story.category] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return CATEGORY_PREFERENCE.indexOf(left.category) - CATEGORY_PREFERENCE.indexOf(right.category);
    });
}

function getMostRecentStory(stories) {
  return stories.reduce((latest, story) => {
    if (!latest) {
      return story;
    }

    return new Date(story.publishedAt) > new Date(latest.publishedAt) ? story : latest;
  }, null);
}

function updateRefreshStatus() {
  if (!state.generatedAt) {
    refreshAgo.textContent = "Updated just now";
    refreshAgo.removeAttribute("title");
    return;
  }

  refreshAgo.textContent = `Updated ${formatTimeAgo(state.generatedAt)}`;
  refreshAgo.title = formatAbsoluteDate(state.generatedAt);
}

function scheduleRefreshUpdates() {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
  }

  state.refreshTimer = window.setInterval(() => {
    render();
  }, 60000);
}

function formatTimeAgo(value) {
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const absSeconds = Math.round(Math.abs(diff) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

  if (absSeconds < 30) {
    return "just now";
  }

  if (absSeconds < 60) {
    return rtf.format(Math.round(diff / 1000), "second");
  }

  const absMinutes = Math.round(absSeconds / 60);
  if (absMinutes < 60) {
    return rtf.format(Math.round(diff / 60000), "minute");
  }

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) {
    return rtf.format(Math.round(diff / 3600000), "hour");
  }

  return rtf.format(Math.round(diff / 86400000), "day");
}

function formatAbsoluteDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStoryImage(story) {
  return story.image || createPlaceholderDataUri(story.category, story.title);
}

function createPlaceholderDataUri(category, title) {
  const palette = {
    Bonds: { top: "#f5f1ea", bottom: "#ece4d9", accent: "#4f69c3" },
    Commodities: { top: "#f4ecd8", bottom: "#efe2c9", accent: "#9f6d12" },
    "Macro Policy": { top: "#f2edf7", bottom: "#e8dff2", accent: "#6852c6" },
    "Global Risk": { top: "#edf4e9", bottom: "#dfead8", accent: "#5f8d4c" },
    "Central Banks": { top: "#f1eef8", bottom: "#e6def5", accent: "#5d48ba" },
  };

  const colors = palette[category] ?? {
    top: "#f4efe8",
    bottom: "#ede4d8",
    accent: "#845f0f",
  };

  const label = title
    .split(" ")
    .slice(0, 2)
    .join(" ")
    .toUpperCase()
    .slice(0, 20);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${colors.top}"/>
          <stop offset="100%" stop-color="${colors.bottom}"/>
        </linearGradient>
      </defs>
      <rect width="320" height="220" rx="28" fill="url(#g)"/>
      <circle cx="251" cy="48" r="60" fill="${colors.accent}" fill-opacity="0.08"/>
      <circle cx="86" cy="190" r="70" fill="${colors.accent}" fill-opacity="0.05"/>
      <path d="M36 154c38-30 76-40 116-30 26 6 49 4 67-7 18-10 37-28 58-56" fill="none" stroke="${colors.accent}" stroke-opacity="0.32" stroke-width="4" stroke-linecap="round"/>
      <path d="M42 120h234M42 143h184M42 166h138" fill="none" stroke="${colors.accent}" stroke-opacity="0.12" stroke-width="4" stroke-linecap="round"/>
      <text x="38" y="53" fill="${colors.accent}" font-family="Helvetica Neue, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1.2">${escapeHtml(label)}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function categoryToPhrase(category) {
  const map = {
    Bonds: "rates",
    Commodities: "commodities",
    "Macro Policy": "macro releases",
    "Global Risk": "risk headlines",
    "Central Banks": "central-bank signals",
  };

  return map[category] || category.toLowerCase();
}

function storyWeight(publishedAt) {
  const hours = hoursSince(publishedAt);
  if (hours <= 6) {
    return 3;
  }

  if (hours <= 24) {
    return 2;
  }

  return 1;
}

function sortStoriesByRecency(stories) {
  return [...stories].sort(
    (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
}

function countSignals(stories, signals) {
  return stories.reduce((total, story) => {
    const haystack = `${story.title} ${story.summary}`.toLowerCase();
    const hits = signals.filter((signal) => matchesKeyword(haystack, signal)).length;
    return total + hits;
  }, 0);
}

function hoursSince(value) {
  return Math.abs(Date.now() - new Date(value).getTime()) / 36e5;
}

function formatList(values) {
  const filtered = values.filter(Boolean);
  if (!filtered.length) {
    return "";
  }

  if (filtered.length === 1) {
    return filtered[0];
  }

  if (filtered.length === 2) {
    return `${filtered[0]} and ${filtered[1]}`;
  }

  return `${filtered.slice(0, -1).join(", ")}, and ${filtered.at(-1)}`;
}

function pluralize(word, count) {
  if (word.endsWith("y")) {
    return count === 1 ? word : `${word.slice(0, -1)}ies`;
  }

  return count === 1 ? word : `${word}s`;
}

function toClassName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function matchesKeyword(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
