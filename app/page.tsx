"use client";

// Screen behavior lives here. Demo content and API settings stay in separate files.
// React tools used for forms, API loading, filtering and component state.
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
// Rename the demonstration data so live API results can use the normal names.
import {
  categories,
  newsItems as demoNewsItems,
  videoItems as demoVideoItems,
} from "../data/news";

const Icon = ({ children }: { children: React.ReactNode }) => <span aria-hidden="true" className="icon">{children}</span>;

// Values use the two-letter codes expected by GNews.
// Add more countries or languages here whenever your platform expands.
const countries = [
  { label: "Worldwide", value: "" },
  { label: "Pakistan", value: "pk" },
  { label: "United States", value: "us" },
  { label: "United Kingdom", value: "gb" },
  { label: "India", value: "in" },
  { label: "Canada", value: "ca" },
  { label: "Australia", value: "au" },
] as const;

const languages = [
  { label: "English", value: "en" },
  { label: "Urdu", value: "ur" },
  { label: "Hindi", value: "hi" },
  { label: "Arabic", value: "ar" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Spanish", value: "es" },
] as const;

// Browser storage key used to keep bookmarks after the page is refreshed.
const savedNewsStorageKey = "worldbrief-saved-articles";

// Safely read an optional URL from either a live API object or a demo object.
// Returning null keeps TypeScript from treating an unknown `url` property as `{}`.
function getExternalUrl(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("url" in value)) {
    return null;
  }

  const possibleUrl = (value as { url?: unknown }).url;

  return typeof possibleUrl === "string" && possibleUrl.trim()
    ? possibleUrl
    : null;
}

// Replace blocked or missing third-party thumbnails with a local safe image.
function useFallbackImage(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = "/globe.svg";
}

export default function Home() {
  // Start with demonstration content.
  // Live API results replace this content after loading.
  const [newsItems, setNewsItems] = useState(demoNewsItems);
  const [videoItems, setVideoItems] = useState(demoVideoItems);

  // These states control the filters, search box and chatbot.
  const [category, setCategory] = useState("Top stories");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("en");
  const [isLoadingNews, setIsLoadingNews] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [videoError, setVideoError] = useState("");
  const [savedArticles, setSavedArticles] = useState<typeof demoNewsItems>([]);
  const [viewSaved, setViewSaved] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<(typeof demoNewsItems)[number] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreNews, setHasMoreNews] = useState(true);
  const [newsError, setNewsError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: "Hi! Ask me to explain, compare or summarize any story on this page." }]);
    // Convert frontend category names into categories supported by GNews.
  const gnewsCategories: Record<string, string> = {
    "Top stories": "general",
    World: "world",
    Business: "business",
    Technology: "technology",
    Science: "science",
    Culture: "entertainment",
    Sports: "sports",
  };

  // Read saved articles once in the browser. Invalid old data is safely ignored.
  useEffect(() => {
    try {
      const storedArticles = localStorage.getItem(savedNewsStorageKey);
      if (!storedArticles) return;

      const parsedArticles: unknown = JSON.parse(storedArticles);
      if (Array.isArray(parsedArticles)) {
        setSavedArticles(parsedArticles as typeof demoNewsItems);
      }
    } catch (error) {
      console.error("Unable to read saved articles:", error);
    }
  }, []);

  // Close the article panel with Escape and stop the page scrolling behind it.
  useEffect(() => {
    if (!selectedArticle) return;

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedArticle(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeWithEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [selectedArticle]);

  // Load category news immediately. When the user types, wait briefly before
  // searching GNews so one API request is not made for every keyboard press.
  useEffect(() => {
    const controller = new AbortController();

    async function loadNews() {
      try {
        setIsLoadingNews(true);
        setNewsError("");

        const cleanSearch = search.trim();
        const apiCategory = gnewsCategories[category] || "general";
        // URLSearchParams safely builds the internal API address.
        const parameters = new URLSearchParams({
          category: apiCategory,
          lang: language,
          page: "1",
        });

        if (cleanSearch.length >= 2) parameters.set("q", cleanSearch);
        if (country) parameters.set("country", country);

        const endpoint = `/api/news?${parameters.toString()}`;

        const response = await fetch(endpoint, { signal: controller.signal });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to retrieve news.");
        }

        // An empty array is valid and displays the "No matching stories" message.
        setNewsItems(Array.isArray(data.articles) ? data.articles : []);
        setCurrentPage(1);
        setHasMoreNews(Boolean(data.hasMore));
      } catch (error) {
        // Cancelling an old request during fast typing is expected.
        if (error instanceof Error && error.name === "AbortError") return;

        console.error("Unable to load live news:", error);
        setNewsError(
          error instanceof Error ? error.message : "Unable to retrieve news."
        );

        // Keep demonstration news visible if a live request fails.
        setNewsItems(demoNewsItems);
        setHasMoreNews(false);
      } finally {
        if (!controller.signal.aborted) setIsLoadingNews(false);
      }
    }

    // Category clicks feel immediate; typed searches are debounced for 600 ms.
    const delay = search.trim().length >= 2 ? 600 : 0;
    const timer = window.setTimeout(loadNews, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [category, search, country, language]);

  // Request the next GNews page and add it beneath the existing cards.
  async function loadMoreNews() {
    if (isLoadingMore || !hasMoreNews) return;

    try {
      setIsLoadingMore(true);
      setNewsError("");

      const cleanSearch = search.trim();
      const apiCategory = gnewsCategories[category] || "general";
      const nextPage = currentPage + 1;
      const parameters = new URLSearchParams({
        category: apiCategory,
        lang: language,
        page: String(nextPage),
      });

      if (cleanSearch.length >= 2) parameters.set("q", cleanSearch);
      if (country) parameters.set("country", country);

      const response = await fetch(`/api/news?${parameters.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load more news.");
      }

      const newArticles = Array.isArray(data.articles) ? data.articles : [];

      // Remove repeated publisher URLs before adding the next page.
      setNewsItems((oldArticles) => {
        const existingUrls = new Set(oldArticles.map(getExternalUrl));
        const uniqueArticles = newArticles.filter((article: unknown) => {
          const articleUrl = getExternalUrl(article);
          return !articleUrl || !existingUrls.has(articleUrl);
        });

        return [...oldArticles, ...uniqueArticles];
      });

      setCurrentPage(nextPage);
      setHasMoreNews(Boolean(data.hasMore));
    } catch (error) {
      console.error("Unable to load more news:", error);
      setNewsError(
        error instanceof Error ? error.message : "Unable to load more news."
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Load YouTube videos on startup and whenever the main search changes.
  // The delay avoids spending YouTube quota on every keyboard press.
  useEffect(() => {
    const controller = new AbortController();

    async function loadVideos() {
      try {
        setIsLoadingVideos(true);
        setVideoError("");

        const cleanSearch = search.trim();
        const videoQuery = cleanSearch.length >= 2
          ? `${cleanSearch} news`
          : "world news today";
        const response = await fetch(
          `/api/youtube?q=${encodeURIComponent(videoQuery)}`,
          { signal: controller.signal }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to retrieve videos.");
        }

        // An empty result is valid and should not display unrelated old videos.
        setVideoItems(Array.isArray(data.videos) ? data.videos : []);
      } catch (error) {
        // Ignore cancelled requests when the user continues typing.
        if (error instanceof Error && error.name === "AbortError") return;

        console.error("Unable to load YouTube videos:", error);
        setVideoError(
          error instanceof Error ? error.message : "Unable to retrieve videos."
        );

        // Keep demonstration videos visible if the API request fails.
        setVideoItems(demoVideoItems);
      } finally {
        if (!controller.signal.aborted) setIsLoadingVideos(false);
      }
    }

    const delay = search.trim().length >= 2 ? 600 : 0;
    const timer = window.setTimeout(loadVideos, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  // Filter both live API articles and fallback demonstration articles.
  const filteredNews = useMemo(() => {
    const query = search.toLowerCase().trim();

    // The server already selected relevant results for a live text search.
    if (query.length >= 2) return newsItems;

    return newsItems.filter((item) => {
      // API categories may be lowercase, while interface categories are capitalized.
      const itemCategory = item.category.toLowerCase();
      const selectedCategory = category.toLowerCase();

      const matchesCategory =
        category === "Top stories" ||
        itemCategory === selectedCategory ||
        (category === "Culture" && itemCategory === "entertainment");
      return matchesCategory;
    });
  }, [category, search, newsItems]);

  // The grid can show either live results or the user's browser bookmarks.
  const displayedNews = viewSaved ? savedArticles : filteredNews;

  // A publisher URL is the best bookmark identity; title is a safe fallback.
  function articleKey(article: unknown) {
    if (typeof article === "object" && article !== null && "title" in article) {
      return getExternalUrl(article) || String(article.title);
    }

    return "";
  }

  function isArticleSaved(article: unknown) {
    const key = articleKey(article);
    return savedArticles.some((savedArticle) => articleKey(savedArticle) === key);
  }

  // Add or remove a bookmark, then immediately update browser storage.
  function toggleSavedArticle(article: (typeof demoNewsItems)[number]) {
    setSavedArticles((oldArticles) => {
      const key = articleKey(article);
      const alreadySaved = oldArticles.some(
        (savedArticle) => articleKey(savedArticle) === key
      );
      const updatedArticles = alreadySaved
        ? oldArticles.filter((savedArticle) => articleKey(savedArticle) !== key)
        : [article, ...oldArticles];

      localStorage.setItem(savedNewsStorageKey, JSON.stringify(updatedArticles));
      return updatedArticles;
    });
  }

  // Always keep the hero safe, including when a search returns no articles.
  const leadStory = newsItems[0] || demoNewsItems[0];

  // Send the user's question and current articles to the secure chat route.
  async function sendQuestion(event: FormEvent) {
    event.preventDefault();

    const asked = question.trim();

    if (!asked) return;

    // Empty the input after the message is submitted.
    setQuestion("");

    // Display the user's message and a temporary loading message.
    setMessages((old) => [
      ...old,
      {
        role: "user",
        text: asked,
      },
      {
        role: "assistant",
        text: "Checking the available news sources…",
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          question: asked,

          // Limit context to avoid unnecessarily large model requests.
          articles: displayedNews.slice(0, 8),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Chat request failed.");
      }

      // Remove the temporary loading message and show the actual answer.
      setMessages((old) => [
        ...old.slice(0, -1),
        {
          role: "assistant",
          text: data.answer,
        },
      ]);
    } catch (error) {
      console.error("Chat error:", error);

      // Display the actual safe error returned by /api/chat.
      const errorMessage =
        error instanceof Error
          ? error.message
          : "The AI assistant is temporarily unavailable.";

      setMessages((old) => [
        ...old.slice(0, -1),
        {
          role: "assistant",
          text: `Chat error: ${errorMessage}`,
        },
      ]);
    }
  }

  return (
    <main>
      {/* Sticky navigation keeps search and the assistant easy to reach. */}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="WorldBrief home"><span className="brand-mark">W</span><span>WORLD<span>BRIEF</span></span></a>
        <nav className="desktop-nav" aria-label="Main navigation"><a className="active" href="#top">Discover</a><a href="#latest">Latest</a><a href="#video">Watch</a></nav>
        <label className="searchbox"><Icon>⌕</Icon><input value={search} onChange={(event) => { setSearch(event.target.value); setViewSaved(false); }} onKeyDown={(event) => { if (event.key === "Escape") setSearch(""); }} placeholder="Search the world…" aria-label="Search live news" /><kbd>{isLoadingNews ? "…" : search ? "ESC" : "⌘ K"}</kbd></label>
        <button className="ask-top" onClick={() => setChatOpen(true)}><Icon>✦</Icon> Ask AI</button>
      </header>

      <div className="page" id="top">
        {/* Editorial hero inspired by the supplied dark news reference. */}
        <section className="hero">
          <img src={leadStory.image} onError={useFallbackImage} alt="Image for the lead world story" /><div className="hero-shade" />
          <div className="hero-copy"><div className="eyebrow"><span /> LIVE BRIEFING · RECENT</div><h1>{leadStory.title}</h1><p>{leadStory.summary}</p><div className="hero-actions"><button onClick={() => setChatOpen(true)}><Icon>✦</Icon> Ask about this story</button>{getExternalUrl(leadStory) ? <a href={getExternalUrl(leadStory) ?? undefined} target="_blank" rel="noopener noreferrer">Read full coverage <span>↗</span></a> : <a href="#latest">Read full coverage <span>↗</span></a>}</div></div>
          <aside className="hero-pulse"><span className="pulse-dot" /><div><small>GLOBAL PULSE</small><strong>128 developing stories</strong></div></aside>
        </section>

        {/* Plain buttons make category behavior easy to understand and change. */}
        <section className="category-row" aria-label="News categories">{categories.map((item) => <button key={item} className={!viewSaved && category === item ? "selected" : ""} onClick={() => { setCategory(item); setViewSaved(false); }}>{item}</button>)}<button className={viewSaved ? "selected" : ""} onClick={() => setViewSaved(true)}>♡ Saved ({savedArticles.length})</button></section>

        {/* Country and language values are sent only to our internal news route. */}
        <section className="news-filters" aria-label="Country and language filters">
          <label>
            <span>Country</span>
            <select value={country} onChange={(event) => { setCountry(event.target.value); setViewSaved(false); }}>
              {countries.map((item) => <option key={item.value || "world"} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span>Language</span>
            <select value={language} onChange={(event) => { setLanguage(event.target.value); setViewSaved(false); }}>
              {languages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { setCountry(""); setLanguage("en"); setCategory("Top stories"); setSearch(""); setViewSaved(false); }}>Reset filters</button>
        </section>

        <section className="news-section" id="latest">
          <div className="section-heading"><div><p>{viewSaved ? "YOUR BOOKMARKS" : isLoadingNews ? "SEARCHING LIVE SOURCES…" : search.trim().length >= 2 ? `RESULTS FOR “${search.trim()}”` : "CURATED FOR YOU"}</p><h2>{viewSaved ? "Saved stories" : search.trim().length >= 2 ? "News search" : category}</h2></div><span>{displayedNews.length} STORIES{!viewSaved && <> · {countries.find((item) => item.value === country)?.label} · {languages.find((item) => item.value === language)?.label}</>}</span></div>
          {newsError && <div className="empty" role="status">Live news error: {newsError}. Showing demonstration stories.</div>}
          {displayedNews.length ? <div className="news-grid">{displayedNews.map((item, index) => (
            <article
              className={`news-card ${index === 0 ? "wide" : ""}`}
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                // Open an in-app detail panel before sending users elsewhere.
                setSelectedArticle(item);
              }}
              onKeyDown={(event) => {
                // Keyboard users can open the detail panel with Enter or Space.
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedArticle(item);
                }
              }}
            >
              <div className="thumb"><img src={item.image} onError={useFallbackImage} alt="" />{item.isVideo && <span className="play">▶</span>}<span className="category-tag">{item.category}</span></div>
              <div className="card-copy"><div className="source-line"><span>{item.source.slice(0, 1)}</span>{item.source}<i />{item.age}</div><h3>{item.title}</h3><p>{item.summary}</p><footer><span>◎ {item.readTime} read</span><button className={`bookmark-button ${isArticleSaved(item) ? "saved" : ""}`} aria-label={isArticleSaved(item) ? `Remove ${item.title} from saved stories` : `Save ${item.title}`} aria-pressed={isArticleSaved(item)} onClick={(event) => { event.stopPropagation(); toggleSavedArticle(item); }}>{isArticleSaved(item) ? "♥" : "♡"}</button></footer></div>
            </article>
          ))}</div> : <div className="empty">{viewSaved ? "No saved stories yet. Select the heart on any article to save it here." : "No matching stories. Try another category or search term."}</div>}
          {!viewSaved && displayedNews.length > 0 && hasMoreNews && (
            <div className="load-more-wrap">
              <button type="button" onClick={loadMoreNews} disabled={isLoadingMore}>
                {isLoadingMore ? "Loading more stories…" : "Load more stories"}
              </button>
            </div>
          )}
        </section>

        {/* YouTube results will map into this video-platform-style shelf. */}
        <section className="video-section" id="video">
          <div className="section-heading light"><div><p>{isLoadingVideos ? "SEARCHING YOUTUBE…" : search.trim().length >= 2 ? `VIDEOS FOR “${search.trim()}”` : "FROM NEWS CHANNELS"}</p><h2>{search.trim().length >= 2 ? "Related videos" : "Watch the news"}</h2></div><a href="#video">{videoItems.length} VIDEOS</a></div>
          {videoError && <div className="empty" role="status">YouTube error: {videoError}. Showing demonstration videos.</div>}
          {videoItems.length ? <div className="video-grid">{videoItems.map((video) => <article
            className="video-card"
            key={video.id}
            role={getExternalUrl(video) ? "link" : undefined}
            tabIndex={getExternalUrl(video) ? 0 : undefined}
            onClick={() => {
              // Open the selected video on YouTube.
              const videoUrl = getExternalUrl(video);
              if (videoUrl) {
                window.open(videoUrl, "_blank", "noopener,noreferrer");
              }
            }}
            onKeyDown={(event) => {
              const videoUrl = getExternalUrl(video);
              if (event.key === "Enter" && videoUrl) {
                window.open(videoUrl, "_blank", "noopener,noreferrer");
              }
            }}
          ><div className="video-thumb"><img src={video.image} onError={useFallbackImage} alt="" /><span className="play">▶</span><b>{video.duration}</b></div><div className="video-info"><span>{video.channel.slice(0, 1)}</span><div><h3>{video.title}</h3><p>{video.channel} · {video.views} views · {video.age}</p></div></div></article>)}</div> : <div className="empty">No matching YouTube videos. Try another search term.</div>}
        </section>
      </div>

      <footer className="site-footer"><div className="brand"><span className="brand-mark">W</span><span>WORLD<span>BRIEF</span></span></div><p>One world. Every angle. Clearly explained.</p><div><a href="#top">About</a><a href="#top">Sources</a><a href="#top">Privacy</a></div></footer>

      {/* Article details remain on this website while preserving the source link. */}
      {selectedArticle && (
        <div className="article-modal" role="presentation" onClick={() => setSelectedArticle(null)}>
          <article className="article-detail" role="dialog" aria-modal="true" aria-labelledby="article-detail-title" onClick={(event) => event.stopPropagation()}>
            <button className="detail-close" type="button" onClick={() => setSelectedArticle(null)} aria-label="Close article details">×</button>
            <div className="detail-image"><img src={selectedArticle.image} onError={useFallbackImage} alt="" /><span>{selectedArticle.category}</span></div>
            <div className="detail-copy">
              <div className="source-line"><span>{selectedArticle.source.slice(0, 1)}</span>{selectedArticle.source}<i />{selectedArticle.age}</div>
              <h2 id="article-detail-title">{selectedArticle.title}</h2>
              <p>{selectedArticle.summary}</p>
              <div className="detail-actions">
                <button type="button" onClick={() => { setQuestion(`Explain this story: ${selectedArticle.title}`); setChatOpen(true); setSelectedArticle(null); }}><Icon>✦</Icon> Ask AI about this story</button>
                <button className={isArticleSaved(selectedArticle) ? "saved" : ""} type="button" onClick={() => toggleSavedArticle(selectedArticle)}>{isArticleSaved(selectedArticle) ? "♥ Saved" : "♡ Save story"}</button>
                {getExternalUrl(selectedArticle) && <a href={getExternalUrl(selectedArticle) ?? undefined} target="_blank" rel="noopener noreferrer">Read original source ↗</a>}
              </div>
            </div>
          </article>
        </div>
      )}

      {/* Interactive assistant connected to the secure /api/chat server route. */}
      <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)} aria-label="Open news assistant"><Icon>✦</Icon><span>Ask WorldBrief</span></button>
      {chatOpen && <aside className="chat-panel" aria-label="News AI assistant"><header><div><span className="ai-orb">✦</span><div><strong>WorldBrief AI</strong><small><i /> Ready to help</small></div></div><button onClick={() => setChatOpen(false)} aria-label="Close chat">×</button></header><div className="chat-body">{messages.map((message, index) => <p className={message.role} key={index}>{message.text}</p>)}<div className="prompts"><button onClick={() => setQuestion("Summarize today's top stories")}>Summarize top stories</button><button onClick={() => setQuestion("Compare coverage of the lead story")}>Compare coverage</button></div></div><form onSubmit={sendQuestion}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the news…" /><button aria-label="Send question">↑</button></form><small className="disclaimer">AI can make mistakes. Check the original source.</small></aside>}
    </main>
  );
}