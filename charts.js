const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Ruby: '#701516',
  Go: '#00ADD8',
  Rust: '#dea584',
  PHP: '#4F5D95',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Swift: '#FA7343',
  Kotlin: '#A97BFF',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  R: '#198CE7',
  Vue: '#41b883',
  Jupyter: '#DA5B0B',
  default: '#8b949e',
};

let languageChartInstance = null;
let activityChartInstance = null;

function getLangColor(lang) {
  return LANGUAGE_COLORS[lang] ?? LANGUAGE_COLORS.default;
}

function getChartBgColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0d1117';
}

function getChartTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#8b949e';
}

function getChartGridColor() {
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
  return border || 'rgba(48, 54, 61, 0.5)';
}

function renderLanguageChart(languages) {
  const canvas = document.getElementById('language-chart');
  const legend = document.getElementById('lang-legend');
  if (!canvas || !legend) return;

  if (languageChartInstance) {
    languageChartInstance.destroy();
    languageChartInstance = null;
  }
  legend.innerHTML = '';

  const sorted = Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  if (!sorted.length) {
    legend.innerHTML = '<p style="color:var(--text-muted);text-align:center;width:100%;">言語データがありません</p>';
    return;
  }

  const total = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);
  const labels = sorted.map(([lang]) => lang);
  const data = sorted.map(([, bytes]) => bytes);
  const colors = labels.map(getLangColor);

  languageChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: getChartBgColor(),
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${((ctx.parsed / total) * 100).toFixed(1)}%`,
          },
          backgroundColor: '#161b22',
          borderColor: getChartGridColor(),
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
        },
      },
    },
  });

  sorted.forEach(([lang, bytes]) => {
    const pct = ((bytes / total) * 100).toFixed(1);
    const item = document.createElement('div');
    item.className = 'lang-item';
    item.innerHTML = `
      <span class="lang-dot" style="background:${getLangColor(lang)}"></span>
      <span class="lang-name">${lang}</span>
      <span class="lang-percent">${pct}%</span>
    `;
    legend.appendChild(item);
  });
}

function renderActivityChart(repos) {
  const canvas = document.getElementById('activity-chart');
  if (!canvas) return;

  if (activityChartInstance) {
    activityChartInstance.destroy();
    activityChartInstance = null;
  }

  const now = new Date();
  const months = [];
  const labels = [];
  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    labels.push(`${date.getMonth() + 1}月`);
  }

  const counts = Object.fromEntries(months.map((month) => [month, 0]));
  repos.forEach((repo) => {
    if (!repo.pushed_at) return;
    const pushedAt = new Date(repo.pushed_at);
    const key = `${pushedAt.getFullYear()}-${String(pushedAt.getMonth() + 1).padStart(2, '0')}`;
    if (key in counts) counts[key] += 1;
  });

  const data = months.map((month) => counts[month]);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(57, 211, 83, 0.8)');
  gradient.addColorStop(1, 'rgba(57, 211, 83, 0.15)');

  activityChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        label: '更新されたリポジトリ数',
        backgroundColor: gradient,
        borderColor: 'rgba(57, 211, 83, 0.9)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} repositories`,
          },
          backgroundColor: '#161b22',
          borderColor: getChartGridColor(),
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
        },
      },
      scales: {
        x: {
          grid: { color: getChartGridColor(), drawBorder: false },
          ticks: { color: getChartTextColor(), font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: getChartGridColor(), drawBorder: false },
          ticks: {
            color: getChartTextColor(),
            font: { size: 11 },
            stepSize: 1,
            precision: 0,
          },
        },
      },
    },
  });
}
