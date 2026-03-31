// Check if dark mode is currently active
const isDarkMode = document.body.classList.contains('dark-mode');
  
// ================== CONFIG ==================  
const BASE_API = "https://king.totalsportslive.co.zw/api/livescore?date=";  
const LOGOS_URL = "https://raw.githubusercontent.com/Vicecap/Team-logos/main/my-loogo.json";  
const LOGOS2_URL = "https://raw.githubusercontent.com/Vicecap/Myfixture/main/all_logos.json"; 
// IMPORTANT: Update this token if needed
const WS_URL = 'wss://vicecaptain.totalsportslive.co.zw/ws/?token=your-secret-token';

const container = document.getElementById("scores-container");

let logos = {};
let allMatches = [];
let allTeams = [];
let allCompetitions = [];

let selectedDate = new Date();
let currentView = 'matches';
let currentFilter = 'all';
let currentSearch = '';
let expandedMatches = new Set();
let ws = null;
  
// Collapsed leagues (persist in memory)
const collapsedLeagues = new Set();  
  

// Favorites (persisted)
const FAVORITES_KEY = 'favMatchesV1';
let favorites = new Set();
function loadFavorites(){
    try{
        const raw = localStorage.getItem(FAVORITES_KEY);
        if(raw) JSON.parse(raw).forEach(id => favorites.add(id));
    }catch(e){ favorites = new Set(); }
}
function saveFavorites(){
    try{ localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites))); }catch(e){}
}
loadFavorites();

// Convert "upcoming" filter to "favorites" if present
(function convertUpcomingFilterToFavorites(){
    const btn = document.querySelector('.filter-btn[data-filter="upcoming"]');
    if(btn){
        btn.dataset.filter = 'favorites';
        btn.textContent = 'Favorites';
    }
})();

// ================== UI ELEMENTS ==================
const searchBtne = document.getElementById('search-btne');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');

searchBtne.onclick = () => {
    searchContainer.style.display =
      searchContainer.style.display === 'block' ? 'none' : 'block';
    searchInput.focus();
};

searchInput.oninput = async () => {
  currentSearch = searchInput.value.toLowerCase().trim();

  // Reset if empty
  if(!currentSearch){
    currentView = 'matches';
    renderMatchesViewFromCache();
    return;
  }

  // 1) Teams
  const matchedTeam = allTeams.find(t =>
    t.toLowerCase().includes(currentSearch)
  );
  if(matchedTeam){
    return renderTeamMatches(matchedTeam);
  }

  // 2) Competitions
  const matchedComp = allCompetitions.find(c =>
    c.name.toLowerCase().includes(currentSearch)
  );
  if(matchedComp){
    return renderCompetitionMatches(matchedComp.stage);
  }

  // 3) News fallback
  try{
    const res = await fetch(`/api/search?q=${encodeURIComponent(currentSearch)}`);
    const posts = await res.json();

    if(!posts.length){
      container.innerHTML = `<div>No results found</div>`;
      return;
    }

    container.innerHTML = `
      <div class="news-search-results">
        ${posts.slice(0,10).map(p=>`
          <a href="/post/${p.slug}" class="news-result-item">
            <img src="${p.image}">
            <div>
              <h4>${p.title}</h4>
              <small>${p.category}</small>
            </div>
          </a>
        `).join("")}
      </div>
    `;
  }catch(err){
    console.error(err);
    container.innerHTML = `<div>Search error</div>`;
  }
};

// ================== FILTER BUTTONS ==================
document.querySelectorAll(".filter-btn").forEach(btn=>{
    btn.onclick = ()=>{
        document.querySelectorAll(".filter-btn")
            .forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");

        const type = btn.dataset.filter;

        if(type === 'teams'){
            renderTeamsList();
            return;
        }

        if(type === 'competitions'){
            renderCompetitionsList();
            return;
        }

        currentView = 'matches';
        currentFilter = type || 'all';
        renderMatchesViewFromCache();
    };
});

// ================== HELPERS ==================
function formatDate(date){ return date.toISOString().split('T')[0].replace(/-/g,''); }

function formatLocalTime(esd){
    const s = esd.toString();
    const localDate = new Date(
        s.slice(0,4),
        parseInt(s.slice(4,6),10)-1,
        s.slice(6,8),
        s.slice(8,10),
        s.slice(10,12)
    );
    return localDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Halftime => HT
function getStatus(ev){
    if(!ev.Eps || ev.Eps === 'NS') return { text: formatLocalTime(ev.Esd), cls: 'upcoming' };
    if(ev.Eps === 'HT' || (typeof ev.Eps === 'string' && ev.Eps.includes('HT') && !ev.Eps.includes("'"))){
        return { text: 'HT', cls: 'live' };
    }
    if(ev.Eps === 'FT') return { text: 'FT', cls: 'ft' };
    if(typeof ev.Eps === 'string' && ev.Eps.includes("'")) return { text: ev.Eps, cls: 'live' };
    return { text: formatLocalTime(ev.Esd), cls: 'upcoming' };
}

function getDateRange(centerDate){
    const arr=[];
    for(let i=-3;i<=3;i++){
        const d=new Date(centerDate);
        d.setDate(d.getDate()+i);
        arr.push(d);
    }
    return arr;
}

function getMatchId(ev){
    return ev.Eid ?? ev.Id ?? `${ev.Esd}_${(ev.T1?.[0]?.Nm||'t1')}_${(ev.T2?.[0]?.Nm||'t2')}`;
}

function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, m=>({'&':'&','<':'<','>':'>','"':'"',"'":'\''}[m])); }

function slugify(text) {
    return (text || '')
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w\-]+/g, "")
        .replace(/\-\-+/g, "-");
}

// ================== LOGOS ==================
async function fetchLogos(){
    try{
        const [a,b] = await Promise.all([ fetch(LOGOS_URL), fetch(LOGOS2_URL) ]);
        logos = { ...(await b.json()), ...(await a.json()) };
    }catch(e){ logos = {}; }
}

// ================== MERGE DATA ==================
function mergeMatchData(data){
    allMatches = data.Stages.flatMap(stage => stage.Events.map(ev => ({ ...ev, stage })));
    allTeams = [...new Set(allMatches.flatMap(ev => [ev.T1?.[0]?.Nm, ev.T2?.[0]?.Nm]).filter(Boolean))].sort();
    allCompetitions = data.Stages.map(stage => ({ name: `${stage.Cnm} - ${stage.Snm}`, stage }));
}
  
 function updateFilterCounters() {
    const now = new Date();

    let live = 0;
    let finished = 0;

    allMatches.forEach(ev => {
        const s = getStatus(ev);
        if (s.cls === 'live') live++;
        if (s.cls === 'ft') finished++;
    });

    const all = allMatches.length;
    const favoritesCount = Array.from(favorites).length;
    const teamsCount = allTeams.length;
    const competitionsCount = allCompetitions.length;

    const set = (type, value) => {
        const el = document.querySelector(`[data-count="${type}"]`);
        if (!el) return;

        el.textContent = value;

        // Add color per type
        switch(type) {
            case 'all': el.style.color = '#2ecc71'; break;         // green
            case 'live': el.style.color = '#e74c3c'; break;        // red
            case 'finished': el.style.color = '#3498db'; break;    // blue
            case 'favorites': el.style.color = '#f1c40f'; break;   // yellow
            case 'teams': el.style.color = '#9b59b6'; break;       // purple
            case 'competitions': el.style.color = '#e67e22'; break; // orange
        }
    };

    set('all', all);
    set('live', live);
    set('finished', finished);
    set('favorites', favoritesCount);
    set('teams', teamsCount);
    set('competitions', competitionsCount);
}
  
function updateLeagueCounters() {
    document.querySelectorAll('.cwc-group').forEach(group => {
        const eventsContainer = group.querySelector('.events-container');
        const counterEl = group.querySelector('.league-counter');
        if (!eventsContainer || !counterEl) return;

        const total = eventsContainer.children.length;
        counterEl.textContent = total;

        // You can color based on filter
        if (currentFilter === 'live') counterEl.style.color = '#e74c3c';
        else if (currentFilter === 'finished') counterEl.style.color = '#3498db';
        else if (currentFilter === 'favorites') counterEl.style.color = '#f1c40f';
        else counterEl.style.color = '#2ecc71'; // default/upcoming
    });
}
  
// ================== DATE STRIP ==================
function createDateStrip(){
    const strip = document.createElement('div');
    strip.className = 'cwc-date-strip';
    strip.style.display = 'flex';
    strip.style.overflowX = 'auto';
    strip.style.paddingBottom = '8px';
    getDateRange(selectedDate).forEach(d=>{
        const btn = document.createElement('div');
        btn.className = 'cwc-date-button';
        btn.textContent = d.toDateString().slice(0,10);
        if (d.toDateString() === selectedDate.toDateString()) btn.classList.add('active');
        btn.onclick = ()=>{
            selectedDate = d;
            document.querySelectorAll('.cwc-date-button').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            fetchMatchesForDate(selectedDate);
        };
        strip.appendChild(btn);
    });
    return strip;
}

// ================== SVG STAR MARKUP ==================
function svgStarOutline(size = 20){
    return `<svg class="fav-star-svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="none" stroke="black" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function svgStarFilled(size = 20){
    return `<svg class="fav-star-svg fav" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="gold" stroke="gold" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
  
function svgChevron(expanded = true) {
    return `
    <svg width="18" height="18" viewBox="0 0 24 24"
        style="transition:transform .2s; transform:rotate(${expanded ? 0 : -90}deg)"
        fill="none" stroke="black" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>`;
}  

// ================== RENDER / UPSERT ==================
function stageKey(stage){ return `${stage.Cnm}__${stage.Snm}`; }
function findStageContainer(key){ return container.querySelector(`.cwc-group[data-stage="${CSS.escape(key)}"]`); }

function createStageContainer(stage){
    const key = stageKey(stage);
    const isCollapsed = collapsedLeagues.has(key);

    const group = document.createElement('div');
    group.className = 'cwc-group';
    group.dataset.stage = key;

    group.innerHTML = `
        <div class="league-header" style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <span class="league-toggle">
                ${svgChevron(!isCollapsed)}
            </span>
            <div class="league-logo-wrapper">
                <img src="https://storage.livescore.com/images/competition/high/${escapeHtml(stage.badgeUrl || '')}"
                     onerror="this.src='https://images.fotmob.com/image_resources/logo/leaguelogo/306.png'"/>
            </div>

            <span class="league-name">
                ${escapeHtml(stage.Cnm)} - ${escapeHtml(stage.Snm)}
            </span>
            <span class="league-counter">0</span>
        </div>
       

        <div class="events-container" style="display:${isCollapsed ? 'none' : 'block'}"></div>
    `;

    // Toggle collapse
    const header = group.querySelector('.league-header');
    const events = group.querySelector('.events-container');
    const icon = group.querySelector('.league-toggle');

    header.onclick = () => {
        const collapsed = collapsedLeagues.has(key);

        if (collapsed) {
            collapsedLeagues.delete(key);
            events.style.display = 'block';
            icon.innerHTML = svgChevron(true);
        } else {
            collapsedLeagues.add(key);
            events.style.display = 'none';
            icon.innerHTML = svgChevron(false);
        }
    };

    return group;
}

function findMatchRow(matchId){ return container.querySelector(`.match-line[data-matchid="${CSS.escape(matchId)}"]`); }

function createMatchRow(ev){
    const id = getMatchId(ev);
    const t1 = ev.T1?.[0] || {};
    const t2 = ev.T2?.[0] || {};
    const s = getStatus(ev);

   const row = document.createElement('div');  
    row.className = 'match-line';  
    if(s.cls === 'live') row.classList.add('live');  
    row.setAttribute('data-matchid', id);  
    row.style.position = 'relative';
    row.style.cursor = 'pointer'; // Clickable cursor

    row.innerHTML = `  
        <div class="team-name home">${escapeHtml(t1.Nm)}</div>  
        <img class="team-logo" src="${escapeHtml(logos[t1.Nm] || 'https://cdn.jsdelivr.net/gh/rsmouk/teams@main/placeholder.png')}"/>  

        <div class="match-time-score">  
            <div class="live-score">  
                <span class="score-left">${escapeHtml(ev.Tr1 ?? '-')}</span>  
                <span class="score-dash">-</span>  
                <span class="score-right">${escapeHtml(ev.Tr2 ?? '-')}</span>  
            </div>  
            <div class="match-status ${s.cls}">${escapeHtml(s.text)}</div>  
        </div>  

        <img class="team-logo" src="${escapeHtml(logos[t2.Nm] || 'https://cdn.jsdelivr.net/gh/rsmouk/teams@main/placeholder.png')}"/>  
        <div class="team-name away">${escapeHtml(t2.Nm)}</div>  
    `;  

    // favorite star button (SVG)  
    const starBtn = document.createElement('button');  
    starBtn.className = 'fav-star';  
    starBtn.setAttribute('aria-label','Toggle favorite');  
    starBtn.setAttribute('aria-pressed', favorites.has(id) ? 'true' : 'false');  
    starBtn.style.border = 'none';  
    starBtn.style.background = 'transparent';  
    starBtn.style.cursor = 'pointer';  
    starBtn.style.padding = '4px';  
    starBtn.style.position = 'absolute';  
    starBtn.style.right = '8px';  
    starBtn.style.top = '50%';  
    starBtn.style.transform = 'translateY(-50%)';  
    starBtn.style.display = 'flex';  
    starBtn.style.alignItems = 'center';  
    starBtn.style.justifyContent = 'center';  
    starBtn.style.width = '30px';  
    starBtn.style.height = '30px';  
    starBtn.style.boxSizing = 'content-box';  
    starBtn.style.backgroundClip = 'content-box';  

    function renderStar(){  
        if(favorites.has(id)){  
            starBtn.innerHTML = svgStarFilled(20);  
            starBtn.classList.add('is-fav');  
            starBtn.setAttribute('aria-pressed','true');  
        } else {  
            starBtn.innerHTML = svgStarOutline(20);  
            starBtn.classList.remove('is-fav');  
            starBtn.setAttribute('aria-pressed','false');  
        }  
    }  
    renderStar();  

    starBtn.addEventListener('click', (e)=>{  
        e.stopPropagation();  
        if(favorites.has(id)) favorites.delete(id); else favorites.add(id);  
        saveFavorites();  
        renderStar();  
        // if filtering by favorites and unfavorited, remove row  
        if(currentFilter === 'favorites' && !favorites.has(id)){  
            const r = findMatchRow(id);  
            if(r) r.remove();  
        }  
    });  

    row.appendChild(starBtn);  

    // --- CLICK REDIRECT LOGIC ---
row.addEventListener('click', () => {
    const stage = ev.stage || {};
    const t1Name = ev.T1?.[0]?.Nm || 'team1';
    const t2Name = ev.T2?.[0]?.Nm || 'team2';

    // Build match slug
    const matchSlug = slugify(t1Name + '-vs-' + t2Name);

    // Country and league slugs
    const country = slugify(stage.Cnm || 'world');
    const league = stage.Scd || slugify(stage.Snm || 'league');

    // Event ID
    const eventId = ev.Eid;

    // Build clean URL
    const url = `/football/${country}/${league}/${matchSlug}/${eventId}`;

    // Open in new tab
    window.open(url, '_blank');
});
    return row;
}
  

function updateMatchRow(existingRow, ev){
    const id = getMatchId(ev);
    const t1 = ev.T1?.[0] || {};
    const t2 = ev.T2?.[0] || {};
    const s = getStatus(ev);

    const left = existingRow.querySelector('.score-left');  
    const right = existingRow.querySelector('.score-right');  
    if(left && left.textContent !== (ev.Tr1 ?? '-')) left.textContent = ev.Tr1 ?? '-';  
    if(right && right.textContent !== (ev.Tr2 ?? '-')) right.textContent = ev.Tr2 ?? '-';  

    const statusEl = existingRow.querySelector('.match-status');  
    if(statusEl){  
        if(statusEl.textContent !== s.text) statusEl.textContent = s.text;  
        ['live','ft','upcoming'].forEach(cls => statusEl.classList.toggle(cls, cls === s.cls));  
        existingRow.classList.toggle('live', s.cls === 'live');  
    }  

    const imgs = existingRow.querySelectorAll('img.team-logo');  
    if(imgs && imgs.length >= 2){  
        const newLeft = logos[t1.Nm] || 'https://cdn.jsdelivr.net/gh/rsmouk/teams@main/placeholder.png';  
        const newRight = logos[t2.Nm] || 'https://cdn.jsdelivr.net/gh/rsmouk/teams@main/placeholder.png';  
        if(imgs[0].src.indexOf(newLeft) === -1) imgs[0].src = newLeft;  
        if(imgs[1].src.indexOf(newRight) === -1) imgs[1].src = newRight;  
    }  

    const homeName = existingRow.querySelector('.team-name.home');  
    const awayName = existingRow.querySelector('.team-name.away');  
    if(homeName && homeName.textContent !== t1.Nm) homeName.textContent = t1.Nm;  
    if(awayName && awayName.textContent !== t2.Nm) awayName.textContent = t2.Nm;  

    // update SVG star  
    const starBtn = existingRow.querySelector('.fav-star');  
    if(starBtn){  
        if(favorites.has(id)){  
            starBtn.innerHTML = svgStarFilled(20);  
            starBtn.classList.add('is-fav');  
            starBtn.setAttribute('aria-pressed','true');  
        } else {  
            starBtn.innerHTML = svgStarOutline(20);  
            starBtn.classList.remove('is-fav');  
            starBtn.setAttribute('aria-pressed','false');  
        }  
    }
}

// Full render for explicit date change
function renderMatchesViewFromCache(){
    const grouped = {};
    allMatches.forEach(ev=>{
        const key = ev.stage.Cnm + '___' + ev.stage.Snm;
        if(!grouped[key]) grouped[key] = { ...ev.stage, Events: [] };
        grouped[key].Events.push(ev);
    });
    renderMatchesView({ Stages: Object.values(grouped) });
}

function renderMatchesView(data){
    currentView = 'matches';
    container.innerHTML = '';
    container.appendChild(createDateStrip());
    const frag = document.createDocumentFragment();

    data.Stages.forEach(stage=>{  
        const filteredEvents = stage.Events.filter(ev=>{  
            const s = getStatus(ev);  
            if(currentFilter === 'live' && s.cls !== 'live') return false;  
            if(currentFilter === 'finished' && s.cls !== 'ft') return false;  
            if(currentFilter === 'favorites'){  
                const id = getMatchId(ev);  
                return favorites.has(id);  
            }  
            return true;  
        });  
        if(!filteredEvents.length) return;  

        const group = createStageContainer(stage);  
        const eventsContainer = group.querySelector('.events-container');  

        filteredEvents.forEach(ev=>{  
            const row = createMatchRow({...ev, stage});  
            eventsContainer.appendChild(row);  
        });  

        frag.appendChild(group);  
    });  

    container.appendChild(frag);
}

// ================== TEAM & COMPETITION VIEWS ==================
function renderTeamMatches(teamName){
    currentView = 'teams';
    container.innerHTML = '';
    container.appendChild(createDateStrip());

    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'toggle-buttons';
    const pastBtn = document.createElement('button'); pastBtn.textContent = 'Past Results'; pastBtn.classList.add('active');
    const upcBtn = document.createElement('button'); upcBtn.textContent = 'Upcoming Matches';
    toggleDiv.appendChild(pastBtn); toggleDiv.appendChild(upcBtn); container.appendChild(toggleDiv);

    const matchesDiv = document.createElement('div'); container.appendChild(matchesDiv);

    const pastMatches = allMatches.filter(ev=> (ev.T1[0].Nm===teamName||ev.T2[0].Nm===teamName) && new Date(ev.Esd) < new Date()).slice(-8);
    const upcomingMatches = allMatches.filter(ev=> (ev.T1[0].Nm===teamName||ev.T2[0].Nm===teamName) && new Date(ev.Esd) >= new Date()).slice(0,8);

    function renderMatches(list){
        matchesDiv.innerHTML = '';
        list.forEach(ev=>{
            const row = createMatchRow(ev);
            matchesDiv.appendChild(row);
        });
    }

    pastBtn.onclick = ()=>{ pastBtn.classList.add('active'); upcBtn.classList.remove('active'); renderMatches(pastMatches); };
    upcBtn.onclick = ()=>{ upcBtn.classList.add('active'); pastBtn.classList.remove('active'); renderMatches(upcomingMatches); };

    renderMatches(pastMatches);
}

function renderCompetitionMatches(stage){
    currentView = 'competitions';
    container.innerHTML = '';
    container.appendChild(createDateStrip());

    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'toggle-buttons';
    const pastBtn = document.createElement('button'); pastBtn.textContent = 'Past Results'; pastBtn.classList.add('active');
    const upcBtn = document.createElement('button'); upcBtn.textContent = 'Upcoming Matches';
    toggleDiv.appendChild(pastBtn); toggleDiv.appendChild(upcBtn); container.appendChild(toggleDiv);

    const matchesDiv = document.createElement('div'); container.appendChild(matchesDiv);

    const pastMatches = stage.Events.filter(ev=> new Date(ev.Esd) < new Date()).slice(-8);
    const upcomingMatches = stage.Events.filter(ev=> new Date(ev.Esd) >= new Date()).slice(0,8);

    function renderMatches(list){
        matchesDiv.innerHTML = '';
        list.forEach(ev=>{
            const row = createMatchRow(ev);
            matchesDiv.appendChild(row);
        });
    }

    pastBtn.onclick = ()=>{ pastBtn.classList.add('active'); upcBtn.classList.remove('active'); renderMatches(pastMatches); };
    upcBtn.onclick = ()=>{ upcBtn.classList.add('active'); pastBtn.classList.remove('active'); renderMatches(upcomingMatches); };

    renderMatches(pastMatches);
}
  
  function renderTeamsList(){
    currentView = 'teams-list';
    container.innerHTML = '';
    container.appendChild(createDateStrip());

    const list = document.createElement('div');
    list.className = 'teams-list';

    allTeams.forEach(team=>{
        const item = document.createElement('div');
        item.className = 'team-item';
        item.textContent = team;

        item.onclick = ()=>renderTeamMatches(team);
        list.appendChild(item);
    });

    container.appendChild(list);
}

function renderCompetitionsList(){
    currentView = 'competitions-list';
    container.innerHTML = '';
    container.appendChild(createDateStrip());

    const list = document.createElement('div');
    list.className = 'competitions-list';

    allCompetitions.forEach(comp=>{
        const item = document.createElement('div');
        item.className = 'competition-item';
        item.textContent = comp.name;

        item.onclick = ()=>renderCompetitionMatches(comp.stage);
        list.appendChild(item);
    });

    container.appendChild(list);
}

// ================== EXTRA (TV) ==================
function renderMatchExtra(ev){
    if(ev.Media && ev.Media[112] && ev.Media[112].length){
        const list = ev.Media[112].map(m => escapeHtml(m.eventId || m.type || 'N/A')).join(', ');
        return `<div><strong>TV Channels:</strong> ${list}</div>`;
    }
    return `<div>No TV channels available</div>`;
}

// ================== FETCH FOR DATE ==================
async function fetchMatchesForDate(dateObj){
    const dateStr = formatDate(dateObj);
    container.querySelectorAll('.loading-state').forEach(n=>n.remove());
    const loader = document.createElement('div');
    loader.className = 'loading-state';
    loader.textContent = 'Loading matches...';
    container.prepend(loader);

    try{
        const res = await fetch(`${BASE_API}${dateStr}`);
        const data = await res.json();
        mergeMatchData(data);
        updateFilterCounters();
        renderMatchesView(data);
        updateLeagueCounters(); // ✅ update league counters
    }catch(e){
        console.error('Date fetch failed', e);
        container.innerHTML = `<div class="error">Failed to load matches for selected date</div>`;
    }finally{
        const l = container.querySelector('.loading-state');
        if(l) l.remove();
    }
}

// ---------------- SILENT UPDATE ----------------
function applyDataSilently(data) {

    // ✅ Only update live matches view
    if (currentView !== 'matches' || currentSearch) {
        return;
    }

    requestAnimationFrame(() => {
        const seenMatchIds = new Set();

        if (!container.querySelector('.cwc-date-strip')) {
            container.insertBefore(createDateStrip(), container.firstChild || null);
        }

        data.Stages.forEach(stage => {
    const key = stageKey(stage);

    // 🔒 HARD BLOCK collapsed leagues
    if (collapsedLeagues.has(key)) {
        return;
    }

    let stageContainer = findStageContainer(key);

    if (!stageContainer) {
        stageContainer = createStageContainer(stage);
        container.appendChild(stageContainer);
    }

    const eventsContainer = stageContainer.querySelector('.events-container');

    stage.Events.forEach(ev => {
        const id = getMatchId(ev);
        const s = getStatus(ev);

        if (currentFilter === 'live' && s.cls !== 'live') return;
        if (currentFilter === 'finished' && s.cls !== 'ft') return;
        if (currentFilter === 'favorites' && !favorites.has(id)) return;

        seenMatchIds.add(id);

        let row = findMatchRow(id);
        if (!row) {
            row = createMatchRow({ ...ev, stage });
            eventsContainer.appendChild(row);
        } else {
            updateMatchRow(row, ev);
        }
    });
});

        document.querySelectorAll('.match-line').forEach(row => {
    const group = row.closest('.cwc-group');
    if (!group) return;

    const key = group.dataset.stage;

    // 🔒 Don't touch collapsed leagues
    if (collapsedLeagues.has(key)) return;

    if (!seenMatchIds.has(row.dataset.matchid)) {
        row.remove();
    }
});

        document.querySelectorAll('.cwc-group').forEach(group => {
    const key = group.dataset.stage;

    // 🔒 Never remove collapsed leagues
    if (collapsedLeagues.has(key)) return;

    const evs = group.querySelector('.events-container');
    if (!evs || !evs.children.length) {
        group.remove();
    }
});
    });
}

// ---------------- WEBSOCKET ----------------
function connectWebSocket(){
    ws = new WebSocket(WS_URL);

    ws.onopen = ()=>console.log('WebSocket connected');  

    ws.onmessage = (evt)=>{  
        try{  
            const data = JSON.parse(evt.data);  
            mergeMatchData(data); 
           updateFilterCounters();

            // Only apply updates for the currently selected date  
            const todayStr = new Date().toDateString();  
            const selStr = selectedDate.toDateString();  
            if(todayStr === selStr){  
                applyDataSilently(data);
                updateLeagueCounters(); // ✅ update league counters
            }  
        } catch(e){ console.error('WebSocket parse error', e); }  
    };  

    ws.onclose = ()=>{   
        console.log('WebSocket disconnected, retrying in 5s...');  
        setTimeout(connectWebSocket, 5000);   
    };  

    ws.onerror = (err)=>console.error('WebSocket error:', err);
}

// ================== INIT ==================
(async ()=>{
    await fetchLogos();     
await fetchMatchesForDate(selectedDate);
connectWebSocket();
})();


