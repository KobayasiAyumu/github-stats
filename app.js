const searchForm = document.getElementById('search-form');
const usernameInput = document.getElementById('username-input');
const searchBtn = document.getElementById('search-btn');
const searchSection = document.getElementById('search-section');
const loadingSection = document.getElementById('loading-section');
const errorSection = document.getElementById('error-section');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const dashboard = document.getElementById('dashboard');
const backBtn = document.getElementById('back-btn');
const quickBtns = document.querySelectorAll('.quick-btn');

const GITHUB_API = 'https://api.github.com';
const THEME_KEY = 'github-stats-theme';
const HISTORY_KEY = 'github-stats-history';
const MAX_HISTORY = 5;
const CACHE_TTL = 5 * 60 * 1000;

let lastSearchedUsername = '';
let currentExportData = null;
const apiCache = new Map();

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.innerHTML = theme === 'dark'
      ? '<i class="fa-solid fa-moon"></i>'
      : '<i class="fa-solid fa-sun"></i>';
  }

  if (currentExportData) {
    renderLanguageChart(currentExportData.languages);
    renderActivityChart(currentExportData.repos);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconMap = {
    success: 'check',
    error: 'xmark',
    info: 'circle-info',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid fa-${iconMap[type] || iconMap.info}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(username) {
  const normalized = username.toLowerCase();
  const history = loadHistory().filter((item) => item.toLowerCase() !== normalized);
  history.unshift(username);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function renderHistoryDropdown() {
  const dropdown = document.getElementById('history-dropdown');
  if (!dropdown) return;

  const history = loadHistory();
  if (!history.length) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  dropdown.innerHTML = history.map((user) => `
    <div class="history-item" data-user="${escapeHtml(user)}">
      <i class="fa-solid fa-clock-rotate-left"></i>
      <span>${escapeHtml(user)}</span>
    </div>
  `).join('');
  dropdown.classList.remove('hidden');

  dropdown.querySelectorAll('.history-item').forEach((item) => {
    item.addEventListener('click', () => {
      const user = item.dataset.user;
      usernameInput.value = user;
      dropdown.classList.add('hidden');
      loadUserStats(user);
    });
  });
}

function getCached(username) {
  const entry = apiCache.get(username.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    apiCache.delete(username.toLowerCase());
    return null;
  }
  return entry.data;
}

function setCache(username, data) {
  apiCache.set(username.toLowerCase(), {
    data,
    timestamp: Date.now(),
  });
}

function updatePageUrl(username) {
  const url = new URL(window.location.href);
  url.searchParams.set('user', username);
  history.replaceState({}, '', url.toString());
}

function clearPageUrl() {
  history.replaceState({}, '', window.location.pathname);
}

async function shareProfile() {
  if (!lastSearchedUsername) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(lastSearchedUsername)}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${lastSearchedUsername} の GitHub Stats`,
        url: shareUrl,
      });
      return;
    } catch {
      // Fall back to clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast('共有 URL をコピーしました');
  } catch {
    showToast('URL のコピーに失敗しました', 'error');
  }
}

function calcTotalStars(repos) {
  return repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
}

function calcTotalForks(repos) {
  return repos.reduce((sum, repo) => sum + repo.forks_count, 0);
}

function exportJSON() {
  if (!currentExportData) return;

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      login: currentExportData.user.login,
      name: currentExportData.user.name,
      html_url: currentExportData.user.html_url,
      followers: currentExportData.user.followers,
      public_repos: currentExportData.user.public_repos,
    },
    stats: {
      totalStars: calcTotalStars(currentExportData.repos),
      totalForks: calcTotalForks(currentExportData.repos),
    },
    topRepositories: [...currentExportData.repos]
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 10)
      .map((repo) => ({
        name: repo.name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        url: repo.html_url,
      })),
    languages: currentExportData.languages,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `github-stats-${lastSearchedUsername}-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('JSON をエクスポートしました');
}

function showSection(section) {
  [searchSection, loadingSection, errorSection, dashboard].forEach((target) => target.classList.add('hidden'));

  if (section === 'search') searchSection.classList.remove('hidden');
  if (section === 'loading') loadingSection.classList.remove('hidden');
  if (section === 'error') errorSection.classList.remove('hidden');
  if (section === 'dashboard') dashboard.classList.remove('hidden');
}

function showError(title, message) {
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  showSection('error');
}

async function fetchGitHubAPI(endpoint) {
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error('NOT_FOUND');
    if (response.status === 403) throw new Error('RATE_LIMIT');
    throw new Error(`HTTP_ERROR_${response.status}`);
  }

  return response.json();
}

async function fetchAllRepositories(username) {
  const allRepos = [];
  let page = 1;
  const perPage = 100;

  while (page <= 5) {
    const repos = await fetchGitHubAPI(`/users/${encodeURIComponent(username)}/repos?per_page=${perPage}&page=${page}&sort=updated`);
    allRepos.push(...repos);
    if (repos.length < perPage) break;
    page += 1;
  }

  return allRepos.filter((repo) => !repo.fork);
}

async function fetchAggregatedLanguages(username, repos) {
  const targetRepos = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 20);

  const results = await Promise.allSettled(
    targetRepos.map((repo) => fetchGitHubAPI(`/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/languages`))
  );

  const aggregated = {};
  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    Object.entries(result.value).forEach(([lang, bytes]) => {
      aggregated[lang] = (aggregated[lang] ?? 0) + bytes;
    });
  });

  return aggregated;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function animateCounter(elementId, target) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const duration = 600;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatNumber(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function formatJoinDate(isoDate) {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

function renderProfile(user) {
  document.getElementById('avatar').src = user.avatar_url;
  document.getElementById('avatar').alt = `${user.login} のアバター`;
  document.getElementById('profile-name').textContent = user.name || user.login;
  document.getElementById('profile-login').textContent = `@${user.login}`;
  document.getElementById('profile-bio').textContent = user.bio || 'プロフィール文はありません。';

  const locationEl = document.getElementById('profile-location');
  if (user.location) {
    locationEl.querySelector('span').textContent = user.location;
    locationEl.classList.remove('hidden');
  } else {
    locationEl.classList.add('hidden');
  }

  const blogEl = document.getElementById('profile-blog');
  if (user.blog) {
    const blogUrl = user.blog.startsWith('http') ? user.blog : `https://${user.blog}`;
    blogEl.href = blogUrl;
    blogEl.querySelector('span').textContent = user.blog.replace(/^https?:\/\//, '');
    blogEl.classList.remove('hidden');
  } else {
    blogEl.classList.add('hidden');
  }

  document.getElementById('profile-joined').querySelector('span').textContent = `${formatJoinDate(user.created_at)} 参加`;
  document.getElementById('github-link').href = user.html_url;
}

function renderStats(user, repos) {
  animateCounter('stat-stars', calcTotalStars(repos));
  animateCounter('stat-repos', user.public_repos);
  animateCounter('stat-followers', user.followers);
  animateCounter('stat-forks', calcTotalForks(repos));
}

function renderTopRepos(repos) {
  const repoGrid = document.getElementById('repo-grid');
  repoGrid.innerHTML = '';

  const topRepos = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 6);

  if (!topRepos.length) {
    repoGrid.innerHTML = '<p style="color:var(--text-muted)">表示できる公開リポジトリがありません</p>';
    return;
  }

  topRepos.forEach((repo) => {
    const languageDot = repo.language
      ? `
        <span class="repo-meta">
          <span class="repo-lang-dot" style="background:${getLangColor(repo.language)}"></span>
          ${escapeHtml(repo.language)}
        </span>
      `
      : '';

    const card = document.createElement('a');
    card.className = 'repo-card glass-card';
    card.href = repo.html_url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.setAttribute('aria-label', `${repo.name} を開く`);
    card.innerHTML = `
      <div class="repo-name">
        <i class="fa-solid fa-book-open" style="color:var(--accent-blue);font-size:0.8rem;"></i>
        ${escapeHtml(repo.name)}
      </div>
      <p class="repo-desc">${escapeHtml(repo.description || '説明はありません')}</p>
      <div class="repo-footer">
        ${languageDot}
        <span class="repo-meta">
          <i class="fa-solid fa-star" style="color:#e3b341;"></i>
          ${formatNumber(repo.stargazers_count)}
        </span>
        <span class="repo-meta">
          <i class="fa-solid fa-code-fork" style="color:#8b949e;"></i>
          ${formatNumber(repo.forks_count)}
        </span>
      </div>
    `;
    repoGrid.appendChild(card);
  });
}

function renderAll(user, repos, languages) {
  currentExportData = { user, repos, languages };
  renderProfile(user);
  renderStats(user, repos);
  renderTopRepos(repos);
  renderLanguageChart(languages);
  renderActivityChart(repos);
}

async function loadUserStats(username) {
  const normalized = username.trim();
  if (!normalized) return;

  lastSearchedUsername = normalized;
  searchBtn.disabled = true;
  showSection('loading');

  const cached = getCached(normalized);
  if (cached) {
    renderAll(cached.user, cached.repos, cached.languages);
    updatePageUrl(normalized);
    saveHistory(normalized);
    showSection('dashboard');
    searchBtn.disabled = false;
    return;
  }

  try {
    const [user, repos] = await Promise.all([
      fetchGitHubAPI(`/users/${encodeURIComponent(normalized)}`),
      fetchAllRepositories(normalized),
    ]);

    const languages = await fetchAggregatedLanguages(normalized, repos);
    const payload = { user, repos, languages };
    setCache(normalized, payload);
    saveHistory(normalized);
    renderAll(user, repos, languages);
    updatePageUrl(normalized);
    showSection('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('GitHub API error:', error);
    if (error.message === 'NOT_FOUND') {
      showError('ユーザーが見つかりません', `"${normalized}" という GitHub ユーザーは存在しません。`);
    } else if (error.message === 'RATE_LIMIT') {
      showError('API レート制限', 'GitHub API のレート制限に達しました。時間をおいて再試行してください。');
    } else {
      showError('データ取得に失敗しました', `通信または API 応答に問題があります。詳細: ${error.message}`);
    }
  } finally {
    searchBtn.disabled = false;
  }
}

function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const user = params.get('user');
  if (user && /^[a-zA-Z0-9-]{1,39}$/.test(user)) {
    usernameInput.value = user;
    loadUserStats(user);
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (username) {
    document.getElementById('history-dropdown')?.classList.add('hidden');
    loadUserStats(username);
  }
});

retryBtn.addEventListener('click', () => {
  if (lastSearchedUsername) loadUserStats(lastSearchedUsername);
});

backBtn.addEventListener('click', () => {
  showSection('search');
  clearPageUrl();
  usernameInput.focus();
});

quickBtns.forEach((button) => {
  button.addEventListener('click', () => {
    usernameInput.value = button.dataset.user;
    loadUserStats(button.dataset.user);
  });
});

usernameInput.addEventListener('focus', renderHistoryDropdown);
usernameInput.addEventListener('input', () => {
  if (!usernameInput.value.trim()) {
    renderHistoryDropdown();
  } else {
    document.getElementById('history-dropdown')?.classList.add('hidden');
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-input-wrapper') && !event.target.closest('#history-dropdown')) {
    document.getElementById('history-dropdown')?.classList.add('hidden');
  }
});

document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);
document.getElementById('btn-share')?.addEventListener('click', shareProfile);
document.getElementById('btn-export')?.addEventListener('click', exportJSON);

applyTheme(loadTheme());
checkUrlParams();
usernameInput.focus();
