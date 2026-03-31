/** Utility: safe access to nested fields */
function safe(obj, path, fallback = undefined) {
  try {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj) ?? fallback;
  } catch {
    return fallback;
  }
}
function getPathParams() {
  const parts = window.location.pathname.split('/').filter(Boolean);

  // If URL starts with football, skip it
  const hasFootball = parts[0] === "football";

  return {
    sport: "football",
    country: hasFootball ? parts[1] : parts[0],
    league: hasFootball ? parts[2] : parts[1],
    matchSlug: hasFootball ? parts[3] : parts[2],
    eventId: hasFootball ? parts[4] : parts[3]
  };
}  
async function loadMatchData(updateOnly = false) {
const { matchSlug, eventId, country, league } = getPathParams();

  const widget = document.getElementById("match-widget");
  if (!widget) return;

  if (!updateOnly && widget.innerHTML.trim() === "") {
    widget.innerHTML = `<div class="project"><div style="padding:20px;text-align:center;color:#94a3b8">Loading match...</div></div>`;
  }

  try {
    const apiUrl = `https://api.totalsportslive.co.zw/api/livescore/unified?matchSlug=${matchSlug}&eventId=${eventId}&country=${country}&league=${league}`;
    const res = await axios.get(apiUrl, { timeout: 10000 });

const TEAM_LOGO_BASE = "https://storage.livescore.com/images/team/high/";

function buildTeamLogo(path) {
  if (!path) return "/images/placeholder-team.png"; // optional fallback
  if (path.startsWith("http")) return path; // already absolute
  return TEAM_LOGO_BASE + path;
}
    
// Parse Data
const matchData = safe(res, 'data.data.match.pageProps.initialEventData.event') 
               || safe(res, 'data.data.stats.pageProps.initialEventData.event') 
               || {};
const statsData = safe(res, 'data.data.match.pageProps.initialEventData.event.statistics') 
               || safe(res, 'data.data.stats.pageProps.initialEventData.event.statistics') 
               || {};

const homeLogo = buildTeamLogo(
  matchData.homeTeamImgSlug || matchData.homeTeamBadge
);

const awayLogo = buildTeamLogo(
  matchData.awayTeamImgSlug || matchData.awayTeamBadge
);
const homeName = matchData.homeTeamName || "Home";
const awayName = matchData.awayTeamName || "Away";
const homeScore = matchData.homeTeamScore ?? "-";
const awayScore = matchData.awayTeamScore ?? "-";
const stage = matchData.stageName || "";
const category = matchData.categoryName || "";
let status = matchData.status || "Unknown"; // will replace with countdown
const rawDate = matchData.startDateTimeString || "";
const channels = matchData.broadcast?.tvChannels?.join(", ") || "";
const isLive = typeof status === 'string' && status.toLowerCase().includes("live");

const scoreClass = isLive 
    ? "live" 
    : (typeof status === 'string' && status.toLowerCase().includes("ended") 
        ? "finished" 
        : "");
const homeForm = safe(res, "data.data.h2h.pageProps.initialEventData.event.homeScoreForm") || [];
const awayForm = safe(res, "data.data.h2h.pageProps.initialEventData.event.awayScoreForm") || [];

// Convert rawDate to readable format
let readableDate = "Date unavailable";
if (typeof rawDate === 'string' && rawDate.length >= 12) {
  const utcDate = new Date(`${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T${rawDate.slice(8, 10)}:${rawDate.slice(10, 12)}:00Z`);
  readableDate = utcDate.toLocaleString(undefined, { 
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', 
    hour: 'numeric', minute: '2-digit', hour12: true 
  });
}

// --- Countdown logic ---
function startMatchCountdown(rawDate) {
  if (!rawDate) return;

  const statusEl = document.getElementById("match-status");
  if (!statusEl) return;

  const matchTime = new Date(
    `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T${rawDate.slice(8, 10)}:${rawDate.slice(10, 12)}:00Z`
  ).getTime();

  function updateCountdown() {
    const now = Date.now();
    let diff = matchTime - now;

    if (diff <= 0) {
      statusEl.textContent = "Starting soon";
      clearInterval(intervalId);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    statusEl.textContent =
      (days > 0 ? days + "d " : "") +
      hours.toString().padStart(2, "0") + "h " +
      minutes.toString().padStart(2, "0") + "m " +
      seconds.toString().padStart(2, "0") + "s";
  }

  updateCountdown();
  const intervalId = setInterval(updateCountdown, 1000);
}

// Only start countdown if status is unknown and we have a start date
if (status === "Unknown" && rawDate) {
  status = ""; // clear initial status
  setTimeout(() => startMatchCountdown(rawDate), 100); // start countdown after DOM ready
}

    // Build widget HTML
    if (!updateOnly && (!document.getElementById('live-score'))) {
      const matchHtml = `
        <div class="project">
          <div class="header">${category} • ${stage}</div>
          <div class="match-box">
            <div class="match">
              <div class="team">
                <div class="logo-wrapper"><img src="${homeLogo}" alt="${homeName}"></div>
                <div class="name">${homeName}</div>
                <div class="form-row" id="home-form">
                   ${homeForm.map(x => `<div class="form-dot form-${x.toLowerCase()}">${x.toUpperCase()}</div>`).join("")}
                </div>
              </div>
              <div class="scoreboard">
                <div class="score ${scoreClass}" id="live-score">${homeScore} - ${awayScore}</div>
                ${channels ? `<div class="channels">${channels}</div>` : ""}
                <span id="match-status" class="pill">${status || "Unknown"}</span>
              </div>
              <div class="team">
                <div class="logo-wrapper"><img src="${awayLogo}" alt="${awayName}"></div>
                <div class="name">${awayName}</div>
                <div class="form-row" id="away-form">
                   ${awayForm.map(x => `<div class="form-dot form-${x.toLowerCase()}">${x.toUpperCase()}</div>`).join("")}
                </div>
              </div>
            </div>
            <div class="detail">${readableDate}</div>
          </div>
          
           <!-- TABS NAVIGATION -->
          <div class="tabs-nav">
  <button class="tab-btn" data-tab="stats" onclick="switchTab(this, 'stats')">Stats</button>
  <button class="tab-btn" data-tab="events" onclick="switchTab(this, 'events')">Events</button>
  <button class="tab-btn" data-tab="lineups" onclick="switchTab(this, 'lineups')">Lineups</button>
  <button class="tab-btn" data-tab="table" onclick="switchTab(this, 'table')">Table</button>
  <button class="tab-btn" data-tab="h2h" onclick="switchTab(this, 'h2h')">H2H</button>
</div>

<div id="tab-stats" class="tab-content"></div>
<div id="tab-events" class="tab-content"></div>
<div id="tab-lineups" class="tab-content"></div>
<div id="tab-table" class="tab-content"></div>
<div id="tab-h2h" class="tab-content"></div>
        </div>
      `;
      widget.innerHTML = matchHtml;
      
    } else {
      const scoreEl = document.getElementById("live-score");
      if (scoreEl) {
        scoreEl.className = `score ${scoreClass}`;
        scoreEl.textContent = `${homeScore} - ${awayScore}`;
      }
    }
const statusEl = document.getElementById("match-status");

if (statusEl) {
  statusEl.textContent = status;

  const st = status.toLowerCase();

  if (st.includes("live")) {
    statusEl.classList.add("live");
  } else if (st.includes("ended") || st.includes("ft")) {
    statusEl.classList.add("finished");
  } else {
    statusEl.classList.add("soon");
  }
}
    
    // Functions to render tab content
    function buildStatsHtml(stats) {
      const statEntries = Object.entries(stats || {});
      if (statEntries.length === 0) return `<div class="stats-container"><h3 style="text-align:center; color:#64748b; font-size:13px; padding:20px;">No stats available</h3></div>`;
      let out = `<div class="stats-container">`;
      statEntries.forEach(([statName, values]) => {
        if (Array.isArray(values) && values.length === 2) {
          const [homeVal, awayVal] = values;
          if (homeVal !== null && awayVal !== null) {
            const total = (parseFloat(homeVal) + parseFloat(awayVal)) || 1;
            const homePercent = Math.round((parseFloat(homeVal) / total) * 100);
            const awayPercent = Math.round((parseFloat(awayVal) / total) * 100);
            const formattedName = statName.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
            out += `<div class="widget-stat" data-stat="${statName}"><div class="stat-title">${formattedName}</div><div class="bar-row"><div class="edge-value left">${homeVal}</div><div class="team-bar team1-bar"><span class="bar-fill" style="width:${homePercent}%"></span></div><div class="team-bar team2-bar"><span class="bar-fill" style="width:${awayPercent}%"></span></div><div class="edge-value right">${awayVal}</div></div></div>`;
          }
        }
      });
      return out + `</div>`;
    }
    
    function buildEventsHtml(matchData) {
      let eventsHtml = `<div class="content">`;
      const incidentsRoot = safe(matchData, 'matchFacts.incidents.incs') || safe(matchData, 'incidents.incs') || safe(matchData, 'incidents') || {};
      const eventsList = [];
      for (const [period, times] of Object.entries(incidentsRoot)) {
          for (const [minute, eventSets] of Object.entries(times)) {
            if (!Array.isArray(eventSets)) continue;
            eventSets.forEach((evSet) => {
              ["HOME", "AWAY"].forEach(side => {
                const teamEvents = evSet[side] || [];
                if (!Array.isArray(teamEvents)) return;
                teamEvents.forEach((ev) => eventsList.push({ ...ev, minute, side, period }));
              });
            });
          }
      }
      if (eventsList.length === 0) return `<div style="text-align:center; color:#64748b; font-size:13px; padding:20px;">No events available</div>`;
      eventsList.forEach(ev => {
            const playerName = ev.name || "";
            const type = ev.type || "";
            const icon = (type.includes("Goal")) ? "⚽" : (type.includes("Yellow")) ? "🟨" : (type.includes("Red")) ? "🟥" : "•";
            eventsHtml += `<div class="event-row"><div class="event-home">${ev.side === "HOME" ? playerName : ""}</div><div class="event-center"><span class="event-icon">${icon}</span>${ev.minute}'</div><div class="event-away">${ev.side === "AWAY" ? playerName : ""}</div></div>`;
      });
      return eventsHtml + `</div>`;
    }

    // --- LINEUPS WIDGET ---
function buildLineupsHtml(res) {
    // Helper function to safely access nested properties
    function safe(obj, path) {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    // Extract fieldData and lineups safely
    const field = safe(res, "data.data.fieldData") || {};
    const lineups =
        safe(res, "data.data.lineups.pageProps.initialEventData.event.lineups") ||
        safe(res, "data.data.match.pageProps.initialEventData.event.lineups") ||
        safe(res, "data.data.stats.pageProps.initialEventData.event") ||
        {};
      
    // Starters & subs
    const homeStarters = lineups.homeStarters || [];
    const awayStarters = lineups.awayStarters || [];
    const homeSubs = lineups.homeSubs || lineups.home || [];
    const awaySubs = lineups.awaySubs || lineups.away || [];

    // Team names
    const homeName = field.homeTeamName || safe(res, "data.data.homeTeamName") || "Home Team";
    const awayName = field.awayTeamName || safe(res, "data.data.awayTeamName") || "Away Team";

    // Formations
    const homeFormation = field.homeFormation || "N/A";
    const awayFormation = field.awayFormation || "N/A";

    // Coaches (try multiple sources)
    const homeCoach =
        lineups.homeCoach?.[0]?.name ||
        safe(res, "data.data.lineups.pageProps.initialEventData.event.homeManager.name") ||
        "Manager";

    const awayCoach =
        lineups.awayCoach?.[0]?.name ||
        safe(res, "data.data.lineups.pageProps.initialEventData.event.awayManager.name") ||
        "Manager";

    // Fallback if no data
    if (homeStarters.length === 0) return `<div style="text-align:center; color:#64748b; font-size:13px; padding:20px;">Lineups not available</div>`;

    // --- Helper to Position Players (Full Pitch, Bottom to Top) ---
    function getPlayerHtml(player, index, totalInRow, rowNumber) {
        // Position Rows on the pitch (0-100% from bottom)
        // GK is row 1 (bottom), Strikers are row 5/6 (top)
        
        // Map logical rows to % from bottom
        const rowMap = { 
            1: 8,   // Goalkeeper (near bottom goal)
            2: 28,  // Defenders
            3: 50,  // Midfielders
            4: 72,  // Attacking Mid / Forwards
            5: 88   // Strikers (near top)
        };
        
        // Fallback for unexpected rows
        const bottomPct = rowMap[rowNumber] || (rowNumber * 18);
        
        // Horizontal Position (Spread evenly)
        // 1 player = 50%
        // 2 players = 33%, 66%
        // 4 players = 20%, 40%, 60%, 80%
        const leftPct = (index + 1) * (100 / (totalInRow + 1));

        return `
            <div class="lp-player" style="left: ${leftPct}%; bottom: ${bottomPct}%;">
                <div class="lp-jersey">
                    <span class="lp-num">${player.number}</span>
                </div>
                <div class="lp-name">${player.name.split(' ').pop()}</div>
            </div>
        `;
    }

    // --- Group Players by Row ---
    function renderTeamOnPitch(players) {
        const rows = {};
        players.forEach(p => {
            const r = p.fieldPosition ? parseInt(p.fieldPosition.split(':')[0]) : 1;
            if (!rows[r]) rows[r] = [];
            rows[r].push(p);
        });

        let html = '';
        Object.keys(rows).forEach(r => {
            // Sort players left-to-right based on second digit of position "4:1" vs "4:2"
            rows[r].sort((a, b) => {
                const cA = a.fieldPosition ? parseInt(a.fieldPosition.split(':')[1]) : 0;
                const cB = b.fieldPosition ? parseInt(b.fieldPosition.split(':')[1]) : 0;
                return cA - cB;
            });
            rows[r].forEach((p, i) => {
                html += getPlayerHtml(p, i, rows[r].length, parseInt(r));
            });
        });
        return html;
    }

    function renderSubs(subs) {
        if(!subs || subs.length === 0) return '<div style="padding:10px; color:#94a3b8; font-size:12px;">No substitutes listed</div>';
        return subs.map(s => `
            <div class="lp-sub-row">
                <div class="lp-sub-num">${s.number}</div>
                <div class="lp-sub-name">${s.name}</div>
            </div>
        `).join('');
    }

    // --- CSS Styles ---
    const styles = `
    `;

    // --- Build HTML ---
    return `
    ${styles}
    <div class="lp-widget" data-active="home">
        <div class="lp-tabs">
            <div class="lp-tab" data-tab="home" onclick="this.closest('.lp-widget').setAttribute('data-active', 'home')">${homeName}</div>
            <div class="lp-tab" data-tab="away" onclick="this.closest('.lp-widget').setAttribute('data-active', 'away')">${awayName}</div>
        </div>

        <div class="lp-content" data-team="home">
        <div class="lp-lineup-status" style="margin-bottom:5px; display:flex; align-items:center; justify-content:center; gap:5px;">
  <img 
    src="${homeSubs.length === 0 && awaySubs.length === 0 
      ? 'https://www.svgrepo.com/show/433972/writing-hand-skin-1.svg' 
      : 'https://uxwing.com/wp-content/themes/uxwing/download/checkmark-cross/success-green-check-mark-icon.png'}" 
    alt="${homeSubs.length === 0 && awaySubs.length === 0 ? 'Predicted' : 'Confirmed'}" 
    style="width:18px; height:18px;"
  >
  <span style="color: ${homeSubs.length === 0 && awaySubs.length === 0 ? '#fbbf24' : '#22c55e'}; font-weight:bold;">
    ${homeSubs.length === 0 && awaySubs.length === 0 ? 'Predicted Lineup' : 'Confirmed Lineup'}
  </span>
</div>
        
            <div class="lp-info-bar">Formation: ${homeFormation}</div>
            <div class="lp-pitch">
                <div class="lp-lines">
                    <div class="lp-half-line"></div>
                    <div class="lp-center-circle"></div>
                    <div class="lp-center-spot"></div>
                    
                    <!-- Bottom Penalty Area -->
                    <div class="lp-box-bottom"></div>
                    <div class="lp-goal-bottom"></div>
                    <div class="lp-arc-bottom"></div>
                    
                    <!-- Top Penalty Area -->
                    <div class="lp-box-top"></div>
                    <div class="lp-goal-top"></div>
                    <div class="lp-arc-top"></div>
                </div>
                ${renderTeamOnPitch(homeStarters)}
            </div>
            <div class="lp-details">
                <div class="lp-section-title">Manager</div>
                <div class="lp-coach"><div class="lp-coach-icon">M</div><div class="lp-coach-name">${homeCoach}</div></div>
                <div class="lp-section-title">Substitutes</div>
                <div class="lp-subs-list">${renderSubs(homeSubs)}</div>
            </div>
        </div>

        <div class="lp-content" data-team="away">
        
        <div class="lp-lineup-status" style="margin-bottom:5px; display:flex; align-items:center; justify-content:center; gap:5px;">
  <img 
    src="${homeSubs.length === 0 && awaySubs.length === 0 
      ? 'https://www.svgrepo.com/show/433972/writing-hand-skin-1.svg' 
      : 'https://uxwing.com/wp-content/themes/uxwing/download/checkmark-cross/success-green-check-mark-icon.png'}" 
    alt="${homeSubs.length === 0 && awaySubs.length === 0 ? 'Predicted' : 'Confirmed'}" 
    style="width:18px; height:18px;"
  >
  <span style="color: ${homeSubs.length === 0 && awaySubs.length === 0 ? '#fbbf24' : '#22c55e'}; font-weight:bold;">
    ${homeSubs.length === 0 && awaySubs.length === 0 ? 'Predicted Lineup' : 'Confirmed Lineup'}
  </span>
</div>
            <div class="lp-info-bar">Formation: ${awayFormation}</div>
            <div class="lp-pitch">
                <div class="lp-lines">
                    <div class="lp-half-line"></div>
                    <div class="lp-center-circle"></div>
                    <div class="lp-center-spot"></div>
                    
                    <!-- Bottom Penalty Area -->
                    <div class="lp-box-bottom"></div>
                    <div class="lp-goal-bottom"></div>
                    <div class="lp-arc-bottom"></div>
                    
                    <!-- Top Penalty Area -->
                    <div class="lp-box-top"></div>
                    <div class="lp-goal-top"></div>
                    <div class="lp-arc-top"></div>
                </div>
                ${renderTeamOnPitch(awayStarters)}
            </div>
            <div class="lp-details">
                <div class="lp-section-title">Manager</div>
                <div class="lp-coach"><div class="lp-coach-icon">M</div><div class="lp-coach-name">${awayCoach}</div></div>
                <div class="lp-section-title">Substitutes</div>
                <div class="lp-subs-list">${renderSubs(awaySubs)}</div>
            </div>
        </div>
    </div>
    `;
}

 function buildH2HHtml(res) {
        const h2h = safe(res, "data.data.h2h.pageProps.initialEventData.event.headToHead.h2h") || [];
        if (h2h.length === 0) return `<div style="text-align:center; color:#64748b; font-size:13px; padding:20px;">No H2H data</div>`;
        let html = `<div class="h2h-list">`;
        h2h.forEach((item) => {
          const ev = item.events?.[0];
          if (!ev) return;
          const date = ev.startDateTimeString ? ev.startDateTimeString.slice(0, 8) : "";
          const fmtDate = date ? `${date.slice(6,8)}/${date.slice(4,6)}/${date.slice(0,4)}` : "";
          const homeImg = ev.homeTeamBadge?.medium || (ev.homeSlug ? `https://lsm-static-prod.livescore.com/medium/${ev.homeSlug}` : "https://www.livescore.com/resources/images/crest/default.png");
          const awayImg = ev.awayTeamBadge?.medium || (ev.awaySlug ? `https://lsm-static-prod.livescore.com/medium/${ev.awaySlug}` : "https://www.livescore.com/resources/images/crest/default.png");

          html += `<div class="event-row" style="font-size:11px; padding: 10px 0;"><div style="width:70px; color:#64748b;">${fmtDate}</div><div style="flex:1; display:flex; align-items:center; justify-content:flex-end; gap:8px; ${ev.homeScore > ev.awayScore ? 'font-weight:bold; color:red;' : ''}"><span>${ev.homeName}</span><img src="${homeImg}" style="width:16px; height:16px; object-fit:contain;" onerror="this.style.display='none'"></div><div style="width:40px; text-align:center; background:#334155; border-radius:4px; margin:0 8px;">${ev.homeScore}-${ev.awayScore}</div><div style="flex:1; display:flex; align-items:center; justify-content:flex-start; gap:8px; ${ev.awayScore > ev.homeScore ? 'font-weight:bold; color:red;' : ''}"><img src="${awayImg}" style="width:16px; height:16px; object-fit:contain;" onerror="this.style.display='none'"><span>${ev.awayName}</span></div></div>`;
        });
        return html + `</div>`;
    }    
    
function buildTableHtml(res) {
    function safe(obj, path) {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    const TEAM_LOGO_BASE = "https://storage.livescore.com/images/team/high/";

    function buildTeamLogo(path) {
        if (!path) return "https://via.placeholder.com/50"; // fallback
        if (path.startsWith("http")) return path;
        return TEAM_LOGO_BASE + path;
    }

    // Step 1: Get league tables
    const leagueObj = safe(res, 'data.data.table.pageProps.initialEventData.event.tables.league')
                      || safe(res, "data.data.standings");

    if (!leagueObj) return "";

    // Step 2: Extract array inside empty key ""
    const leagueArr = leagueObj[""] || [];

    // Step 3: Select "all" table or fallback
    const allTable = leagueArr.find(t => t.kind === "all") || leagueArr[0];

    // Step 4: Extract team rows
    const rows = allTable?.teams || [];

    if (!rows || rows.length === 0) {
        return `<div style="padding:20px; text-align:center; color:#64748b; font-family: sans-serif;">Standings not available</div>`;
    }

    let html = `
    <div class="lt-wrapper">
        <div class="lt-header">
            <div>
                <h2 class="lt-title">League Table</h2>
                <div class="lt-season">Season 2025-26</div>
            </div>
        </div>
        <div class="lt-table-container">
            <table class="league-table">
                <thead>
                    <tr>
                        <th class="col-rank">#</th>
                        <th class="col-team">Team</th>
                        <th class="col-live" title="Played">L</th>
                        <th class="col-stat" title="Played">P</th>
                        <th class="col-stat" title="Won">W</th>
                        <th class="col-stat" title="Drawn">D</th>
                        <th class="col-stat" title="Lost">L</th>
                        <th class="col-gd" title="Goal Difference">GD</th>
                        <th class="col-pts" title="Points">Pts</th>
                    </tr>
                </thead>
                <tbody>
    `;

    rows.forEach(row => {
        let rankClass = "";
        const rank = parseInt(row.rank);
        if (rank <= 4) rankClass = "rank-ucl";
        else if (rank === 5 || rank === 6) rankClass = "rank-uel";
        else if (rank >= 18) rankClass = "rank-rel";

        const gd = row.goalsDiff;
        let gdClass = "text-neutral";
        if (gd > 0) gdClass = "text-green";
        if (gd < 0) gdClass = "text-red";
        const gdDisplay = gd > 0 ? `+${gd}` : gd;

        html += `
        <tr>
            <td class="col-rank ${rankClass}">${row.rank}</td>
            <td class="col-team">
                <div class="team-flex">
                    <img src="${buildTeamLogo(row.teamBadge)}" class="team-icon" onerror="this.style.display='none'">
                    <span class="team-name">${row.name}</span>
                    <td class="col-live">
                        ${row.hasMatchInProgress ? `<span class="live-score">${row.status || 'Live'}</span>` : ''}
                    </td>
                </div>
            </td>
            <td class="col-stat">${row.played}</td>
            <td class="col-stat">${row.wins}</td>
            <td class="col-stat">${row.draws}</td>
            <td class="col-stat">${row.losses}</td>
            <td class="col-gd ${gdClass}">${gdDisplay}</td>
            <td class="col-pts">${row.points}</td>
        </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    </div>
    `;

    return html;
}        

    
    // Map of tab IDs to their content builders
const tabContentMap = {
  "tab-stats": () => buildStatsHtml(statsData),
  "tab-events": () => buildEventsHtml(matchData),
  "tab-lineups": () => buildLineupsHtml(res),
  "tab-h2h": () => buildH2HHtml(res),
  "tab-table": () => buildTableHtml(res),

};

// Render contents directly by ID
Object.entries(tabContentMap).forEach(([id, buildHtml]) => {
  const container = document.getElementById(id);
  if (!container) return;

  const html = buildHtml();
  container.innerHTML = html;

  updateTabVisibility(id); // LIVE check: show/hide dynamically
});

  } catch (err) {
    console.error("Match load error:", err);
  }
}

function switchTab(btn, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}
  
function updateTabVisibility(tabId) {
  const content = document.getElementById(tabId);
  const tabName = tabId.replace("tab-", "");
  const button = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (!content || !button) return;

  // Placeholder messages to ignore
  const placeholderTexts = [
    "no stats available",
    "no events available",
    "lineups not available",
    "standings not available",
    "no h2h data"
  ];

  const textContent = content.textContent.trim().toLowerCase();

  const hasContent = textContent && !placeholderTexts.some(pt => textContent.includes(pt));

  if (hasContent) {
    button.style.display = "inline-flex";

    // If no tab is active, or currently active tab was hidden, activate this one
    const activeBtn = document.querySelector(".tab-btn.active");
    if (!activeBtn || activeBtn.style.display === "none") {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      button.classList.add('active');
      content.classList.add('active');
    }
  } else {
    // Hide tab if empty or placeholder
    button.style.display = "none";

    // If this tab was active, switch to the first visible tab
    if (button.classList.contains("active")) {
      button.classList.remove("active");
      content.classList.remove("active");

      const firstVisible = document.querySelector(".tab-btn[style*='inline-flex']");
      if (firstVisible) {
        firstVisible.classList.add("active");
        const firstContent = document.getElementById(`tab-${firstVisible.dataset.tab}`);
        if (firstContent) firstContent.classList.add("active");
      }
    }
  }
}
  
document.addEventListener("DOMContentLoaded", () => {
  loadMatchData(false);

setInterval(() => loadMatchData(false), 500000);
});


const socket = new WebSocket("ws://145.223.69.146:8180");

function getPathParams(){
  const parts = window.location.pathname.split('/').filter(Boolean);

  return {
    sport: parts[0],
    country: parts[1],
    league: parts[2],
    matchSlug: parts[3],
    eventId: parts[4]
  };
}

socket.onopen = () => {

  const { matchSlug, eventId, country, league } = getPathParams();

  socket.send(JSON.stringify({
    type: "subscribe",
    matchSlug,
    eventId,
    country,
    league
  }));

  console.log("Subscribed:", matchSlug, eventId);
};

socket.onmessage = (event) => {

  const data = JSON.parse(event.data);

  if(data.type === "match_update"){

    const scoreEl = document.getElementById("live-score");
    const statusEl = document.getElementById("match-status");

    if(scoreEl){
      scoreEl.textContent =
        data.payload.homeScore + " - " + data.payload.awayScore;
    }

    if(statusEl){
      statusEl.textContent = data.payload.status;
    }

  }

};

socket.onerror = err => {
  console.log("WS error", err);
};
