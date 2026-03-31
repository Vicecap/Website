// /public/js/news-feed.js

const TRACKED_TEAMS = [
  "Real Madrid","Barcelona","Arsenal","Chelsea","Liverpool",
  "Manchester City","Manchester United","Tottenham Hotspur",
  "Inter Miami CF","Al Nassr","Bayern Munich"
];

const MATCH_API = 'http://145.223.69.146:3084/api/matches';
const NEWS_API = 'http://63.142.251.202:3086/raw?q=';
const IMAGE_API = 'http://145.223.69.146:3065/api/fixture-image?team=';

async function fetchMatches() {
  try {
    const res = await fetch(MATCH_API);
    const data = await res.json();
    // Filter only tracked teams
    return data.filter(match =>
      TRACKED_TEAMS.includes(match.team1) || TRACKED_TEAMS.includes(match.team2)
    );
  } catch (err) {
    console.error('Failed to fetch matches', err);
    return [];
  }
}

async function fetchNews(team) {
  try {
    const res = await fetch(`${NEWS_API}${encodeURIComponent(team)}`);
    const htmlText = await res.text();

    // Parse HTML safely
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    doc.querySelectorAll('script, style').forEach(el => el.remove());

    return {
      team,
      content: doc.body.innerHTML
    };
  } catch (err) {
    console.error('Failed to fetch news for', team, err);
    return null;
  }
}

async function buildNewsFeed() {
  const newsContainer = document.getElementById('news-container');
  newsContainer.innerHTML = '<p style="text-align:center;color:#94a3b8;">Loading news...</p>';

  const matches = await fetchMatches();
  if (!matches.length) {
    newsContainer.innerHTML = '<p style="text-align:center;color:#94a3b8;">No upcoming matches for tracked teams.</p>';
    return;
  }

  let posts = [];

  for (let match of matches) {
    const teams = [match.team1, match.team2];
    for (let team of teams) {
      if (!TRACKED_TEAMS.includes(team)) continue;

      const news = await fetchNews(team);
      if (!news) continue;

      const logoUrl = `${IMAGE_API}${encodeURIComponent(team)}`;

      posts.push({
        team,
        newsContent: news.content,
        logo: logoUrl,
        matchInfo: match
      });
    }
  }

  if (!posts.length) {
    newsContainer.innerHTML = '<p style="text-align:center;color:#94a3b8;">No news available.</p>';
    return;
  }

  // Render posts
  newsContainer.innerHTML = posts.map(p => `
    <div class="news-card" style="background:#10002e;color:#b9fa3c;padding:10px;margin:10px 0;border-radius:10px;border:1px solid #b9fa3c;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;">
        <img src="${p.logo}" alt="${p.team}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">
        <strong>${p.team}</strong>
      </div>
      <div class="news-content">${p.newsContent}</div>
      <div style="margin-top:5px;font-size:0.8rem;color:#94a3b8;">
        Match: ${p.matchInfo.team1} vs ${p.matchInfo.team2} | ${new Date(p.matchInfo.start).toLocaleString()}
      </div>
    </div>
  `).join('');
}

// Auto-run on page load
document.addEventListener('DOMContentLoaded', buildNewsFeed);
