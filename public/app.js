const input = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const suggestionsBox = document.getElementById("suggestions");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("searchResult");
const trendingList = document.getElementById("trendingList");
const cacheDebug = document.getElementById("cacheDebug");
const trendBasicBtn = document.getElementById("trendBasic");
const trendEnhancedBtn = document.getElementById("trendEnhanced");
const rankPopularBtn = document.getElementById("rankPopular");
const rankRecentBtn = document.getElementById("rankRecent");

let activeIndex = -1;
let currentSuggestions = [];
let trendMode = "basic";
let rankMode = "basic";

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

async function fetchSuggestions() {
  const q = input.value.trim();
  if (!q) {
    hideSuggestions();
    statusEl.textContent = "";
    cacheDebug.textContent = "type something above";
    return;
  }

  statusEl.textContent = "loading...";
  try {
    await loadCacheDebug(q);
    const res = await fetch(
      "/suggest?q=" + encodeURIComponent(q) + "&ranking=" + rankMode
    );
    const data = await res.json();
    currentSuggestions = data.suggestions || [];
    renderSuggestions();
    statusEl.textContent =
      "ranking: " + data.ranking + " | source: " + data.source +
      " | node: " + data.ownerNode + " | latency: " + data.latencyMs + " ms";
  } catch (e) {
    statusEl.textContent = "error loading suggestions";
  }
}

function renderSuggestions() {
  if (currentSuggestions.length === 0) {
    suggestionsBox.innerHTML = '<div class="suggestion-item">no matches</div>';
    suggestionsBox.classList.remove("hidden");
    return;
  }
  suggestionsBox.innerHTML = "";
  currentSuggestions.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "suggestion-item" + (i === activeIndex ? " active" : "");
    div.innerHTML =
      '<span class="text"></span><span class="count"></span>';
    div.querySelector(".text").textContent = s.query;
    div.querySelector(".count").textContent = s.count.toLocaleString();
    div.addEventListener("click", () => {
      input.value = s.query;
      hideSuggestions();
      submitSearch();
    });
    suggestionsBox.appendChild(div);
  });
  suggestionsBox.classList.remove("hidden");
}

function hideSuggestions() {
  suggestionsBox.classList.add("hidden");
  activeIndex = -1;
}

async function submitSearch() {
  const query = input.value.trim();
  if (!query) return;
  try {
    const res = await fetch("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    resultEl.classList.remove("hidden");
    resultEl.textContent = "Response: " + data.message + ' ("' + query + '")';
    loadTrending();
  } catch (e) {
    resultEl.classList.remove("hidden");
    resultEl.textContent = "error submitting search";
  }
}

async function loadTrending() {
  try {
    const res = await fetch("/trending?mode=" + trendMode);
    const data = await res.json();
    trendingList.innerHTML = "";
    data.results.forEach((r) => {
      const li = document.createElement("li");
      const value = trendMode === "enhanced" ? r.score : r.count;
      li.innerHTML = '<span class="text"></span><span class="count"></span>';
      li.querySelector(".text").textContent = r.query;
      li.querySelector(".count").textContent =
        (trendMode === "enhanced" ? "score " : "") + value.toLocaleString();
      trendingList.appendChild(li);
    });
    if (data.results.length === 0) {
      trendingList.innerHTML = "<li>no data yet, submit a few searches</li>";
    }
  } catch (e) {
    trendingList.innerHTML = "<li>error loading trending</li>";
  }
}

async function loadCacheDebug(prefix) {
  try {
    const res = await fetch("/cache/debug?prefix=" + encodeURIComponent(prefix));
    const data = await res.json();
    cacheDebug.textContent = JSON.stringify(
      {
        prefix: data.prefix,
        ownerNode: data.ownerNode,
        hit: data.hit,
        allNodes: data.allNodes,
      },
      null,
      2
    );
  } catch (e) {
    cacheDebug.textContent = "error";
  }
}

input.addEventListener("keydown", (e) => {
  if (suggestionsBox.classList.contains("hidden")) {
    if (e.key === "Enter") submitSearch();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, currentSuggestions.length - 1);
    renderSuggestions();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    renderSuggestions();
  } else if (e.key === "Enter") {
    if (activeIndex >= 0 && currentSuggestions[activeIndex]) {
      input.value = currentSuggestions[activeIndex].query;
    }
    hideSuggestions();
    submitSearch();
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

input.addEventListener("input", debounce(fetchSuggestions, 200));
searchBtn.addEventListener("click", submitSearch);

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) hideSuggestions();
});

trendBasicBtn.addEventListener("click", () => {
  trendMode = "basic";
  trendBasicBtn.classList.add("active");
  trendEnhancedBtn.classList.remove("active");
  loadTrending();
});
trendEnhancedBtn.addEventListener("click", () => {
  trendMode = "enhanced";
  trendEnhancedBtn.classList.add("active");
  trendBasicBtn.classList.remove("active");
  loadTrending();
});

rankPopularBtn.addEventListener("click", () => {
  rankMode = "basic";
  rankPopularBtn.classList.add("active");
  rankRecentBtn.classList.remove("active");
  fetchSuggestions();
});
rankRecentBtn.addEventListener("click", () => {
  rankMode = "recent";
  rankRecentBtn.classList.add("active");
  rankPopularBtn.classList.remove("active");
  fetchSuggestions();
});

loadTrending();
