const BOT_REGEX = /(bot|crawler|spider|facebook|whatsapp|telegram|preview|curl|wget|python)/i;
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const compression = require('compression');
const UAParser = require("ua-parser-js");
const geoip = require("geoip-lite");

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(compression());
app.use((req,res,next)=>{
  if(req.path === "/admin.html"){
    const token = req.cookies.admin_token;
    if(!token || !SESSIONS_AUTH[token]){
      return res.redirect("/login.html");
    }
  }
  next();
});

app.use(express.static('public'));
app.use("/uploads", express.static(path.join(__dirname,"public/uploads")));

// ===============================
// ADMIN AUTH
// ===============================

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "king9494";

const SESSIONS_AUTH = {};

const DATA_FILE = path.join(__dirname, 'data/posts.json');

function loadAnalytics(){
  let db = fs.readJsonSync(ANALYTICS_FILE,{throws:false});
  if(!db || !db.views) {
    db = { views:[], conversions:[], heatmap:[] };
    fs.writeJsonSync(ANALYTICS_FILE, db);
  }
  return db;
}

// Ensure data file exists
fs.ensureFileSync(DATA_FILE);
if (!fs.readJsonSync(DATA_FILE, { throws: false })) {
  fs.writeJsonSync(DATA_FILE, []);
}
const COMMENTS_FILE = path.join(__dirname,'data/comments.json');

fs.ensureFileSync(COMMENTS_FILE);
if(!fs.readJsonSync(COMMENTS_FILE,{throws:false})){
  fs.writeJsonSync(COMMENTS_FILE,{});
}


// -------------------------------
// IN-MEMORY CACHE (FAST 🚀)
// -------------------------------
let SESSIONS = {};
let LIVE_VISITORS = {};
let REALTIME_STREAM = [];

let POSTS_CACHE = fs.readJsonSync(DATA_FILE);

// 🔧 Normalize old posts
POSTS_CACHE = POSTS_CACHE.map(p => ({
  ...p,
  slug: String(p.slug)
    .trim()
    .toLowerCase()
    .replace(/\s+/g,"-")
    .replace(/[^a-z0-9-]/g,""),
  status: p.status || "published",
  deleted: p.deleted || false,
  publishAt: p.publishAt || p.createdAt || new Date()
}));
fs.writeJsonSync(DATA_FILE, POSTS_CACHE);
function autoInternalLinks(content, allPosts, currentSlug) {
  if (!content) return content;

  let updated = content;

allPosts.forEach(post => {

  if (!post.title || !post.slug) return;   // ✅ safety guard

  if (post.slug === currentSlug) return;

  const title = String(post.title).trim();
  if (!title) return;

  const regex = new RegExp(`\\b(${title})\\b`, 'i');

    if (regex.test(updated)) {
      updated = updated.replace(
        regex,
        `<a href="/post/${post.slug}" class="auto-link">$1</a>`
      );
    }
  });

  return updated;
}

function requireAuth(req,res,next){

  const token = req.cookies.admin_token;

  if(!token || !SESSIONS_AUTH[token]){
    return res.status(401).json({error:"Unauthorized"});
  }

  next();
}

// ===============================
// ANALYTICS ENGINE
// ===============================
const ANALYTICS_FILE = path.join(__dirname,"data/analytics.json");

fs.ensureFileSync(ANALYTICS_FILE);
if(!fs.readJsonSync(ANALYTICS_FILE,{throws:false})){
  fs.writeJsonSync(ANALYTICS_FILE,{
    views:[],
    conversions:[],
    heatmap:[]
  });
}

// In-memory active visitors
let ACTIVE_VISITORS = {};

app.post("/api/login", express.json(), (req,res)=>{

  const { username, password, remember } = req.body;

  if(username === ADMIN_USERNAME && password === ADMIN_PASSWORD){

    const token = crypto.randomBytes(32).toString("hex");

    SESSIONS_AUTH[token] = {
      createdAt: Date.now(),
      remember: !!remember
    };

    const cookieOptions = {
      httpOnly: true,
      sameSite: "strict"
    };

    // If remember me → 30 days
    if(remember){
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    res.cookie("admin_token", token, cookieOptions);

    return res.json({success:true});
  }

  res.status(401).json({error:"Invalid credentials"});
});

app.post("/api/logout",(req,res)=>{
  const token = req.cookies.admin_token;
  delete SESSIONS_AUTH[token];
  res.clearCookie("admin_token");
  res.json({success:true});
});

// -------------------------------
// UPLOAD SETUP
// -------------------------------
const storage = multer.diskStorage({
  destination: './public/uploads',

  filename: (req, file, cb) => {
    const clean = file.originalname
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9.-]/g, '');

    cb(null, Date.now() + '-' + clean);
  }
});

const upload = multer({ storage });

app.post("/api/track-view",(req,res)=>{
  const { url, postSlug, device, browser, country } = req.body;

const db = loadAnalytics();

  db.views.push({
    url,
    postSlug,
    device,
    browser,
    country,
createdAt: Date.now()
  });

  fs.writeJsonSync(ANALYTICS_FILE, db);

  // active visitor heartbeat
  ACTIVE_VISITORS[req.ip] = Date.now();

  res.json({ok:true});
});

app.get('/news.html', (req,res) => {

  const ua = req.headers["user-agent"] || "";

  // bots → SSR
  if (/facebookexternalhit|Twitterbot|WhatsApp|Telegram|Googlebot|bingbot|slurp/i.test(ua)) {
    return res.redirect("/ssr/news");
  }

  // humans → static file
  res.sendFile(path.join(__dirname,"public/news.html"));
});

// -------------------------------
// GET ALL POSTS (with pagination)
// -------------------------------
app.get('/api/posts', (req, res) => {
  const limit = parseInt(req.query.limit) || POSTS_CACHE.length;

const now = new Date();

const publishedPosts = POSTS_CACHE.filter(p => {

  if (p.deleted) return false;

  // If no status field (old posts) treat as published
  const status = p.status || "published";

  if (status === "draft") return false;

  if (p.publishAt) {
    return new Date(p.publishAt) <= now;
  }

  return status === "published";
});

  res.json(publishedPosts.slice(0, limit));
});
app.get('/api/admin/posts', requireAuth, (req,res)=>{
  res.json(POSTS_CACHE);
});

// -------------------------------
// HEADLINES (latest 5)
// -------------------------------
app.get('/api/headlines', (req, res) => {
  res.json(POSTS_CACHE.slice(0, 5));
});

// -------------------------------
// SEARCH POSTS
// Example: /api/search?q=arsenal
// -------------------------------
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();

  if (!query) {
    return res.json([]);
  }

  const results = POSTS_CACHE.filter(post =>
    post.title.toLowerCase().includes(query) ||
    post.content.toLowerCase().includes(query) ||
    post.category.toLowerCase().includes(query) ||
    post.author.toLowerCase().includes(query)
  );

  res.json(results);
});

app.get("/api/daily", async (req,res)=>{
const db = loadAnalytics();
  const days = {};

  db.views.forEach(v=>{
    const day = new Date(v.createdAt)
      .toISOString()
      .slice(0,10);
    days[day] = (days[day] || 0) + 1;
  });

  res.json(days);
});

app.get("/api/countries", async (req,res)=>{
const db = loadAnalytics();
  const map = {};
  db.views.forEach(v=>{
    map[v.country] = (map[v.country] || 0) + 1;
  });
  res.json(map);
});

// -------------------------------
// RELATED POSTS
// -------------------------------
app.get('/api/related/:category', (req, res) => {

  const category = req.params.category;
  const now = new Date();

  const related = POSTS_CACHE
    .filter(p => {

      if (p.deleted) return false;

      const status = p.status || "published";
      if (status === "draft") return false;

      if (p.publishAt) {
        return new Date(p.publishAt) <= now;
      }

      return p.category === category;
    })
    .slice(0,6);   // limit number of related posts

  res.json(related);
});

// -------------------------------
// GET POST BY SLUG (increments views)
// -------------------------------
app.get('/api/post/:slug', async (req, res) => {

  const requestedSlug = req.params.slug.trim().toLowerCase();

  const postIndex = POSTS_CACHE.findIndex(
    p => p.slug === requestedSlug
  );

  // ✅ FIRST CHECK
  if (postIndex === -1) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const post = POSTS_CACHE[postIndex];
  const now = new Date();

  if (post.deleted) {
    return res.status(404).json({ error: "Post not found" });
  }

  const status = post.status || "published";
  const publishAt = post.publishAt ? new Date(post.publishAt) : null;

  if (status === "draft") {
    return res.status(403).json({ error: "Post not published" });
  }

  if (publishAt && publishAt > now) {
    return res.status(403).json({ error: "Post not published" });
  }

  // Increase views
  POSTS_CACHE[postIndex].views += 1;
  await fs.writeJson(DATA_FILE, POSTS_CACHE);

  // Inject internal links
  const processedPost = {
    ...post,
    displayViews: post.views * 3,
    content: autoInternalLinks(
      post.content,
      POSTS_CACHE,
      post.slug
    )
  };

  res.json(processedPost);
});

app.get('/post/:slug', (req, res, next) => {

  const ua = req.headers["user-agent"] || "";

  // If crawler → redirect to SSR
  if (/facebookexternalhit|Twitterbot|WhatsApp|WhatsAppBot|Telegram|Googlebot|bingbot|slurp/i.test(ua)) {
    return res.redirect("/ssr/post/" + req.params.slug);
  }

  // Normal users → load frontend page
  res.sendFile(path.join(__dirname, 'public/post.html'));

});

// Serve post page

app.get('/post/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/post.html'));
});

app.get('/ssr/post/:slug', async (req, res) => {

  const slug = req.params.slug.toLowerCase();
  const post = POSTS_CACHE.find(p => p.slug === slug);

  if (!post) return res.status(404).send("Post not found");

  const description = post.content
    .replace(/<[^>]+>/g,'')
    .substring(0,160);

const DEFAULT_IMAGE =
  "https://scores.totalsportslive.co.zw/uploads/1771837867363-EVE-vs-MUN.png";

let image = DEFAULT_IMAGE;

if (post.image && post.image.startsWith("/uploads/")) {
  const filePath = path.join(__dirname, "public", post.image);

  if (fs.existsSync(filePath)) {
    image = "https://scores.totalsportslive.co.zw" + post.image;
  }
}

  res.setHeader("Cache-Control","public, max-age=60");

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>${post.title}</title>

<meta property="og:title" content="${post.title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="https://scores.totalsportslive.co.zw/post/${post.slug}">
<meta name="twitter:card" content="summary_large_image">

<meta http-equiv="refresh" content="0;url=/post/${post.slug}">
</head>
<body></body>
</html>
  `);
});

app.get('/ssr/news', (req, res) => {

  // get latest published post
  const latest = POSTS_CACHE
    .filter(p => !p.deleted && (p.status || "published") === "published")
    .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))[0];

  const DEFAULT_IMAGE =
    "https://scores.totalsportslive.co.zw/assets/goal.jpg";

  const image = latest?.image
    ? "https://scores.totalsportslive.co.zw" + latest.image
    : DEFAULT_IMAGE;

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Latest Football News Today - TotalSportsLive</title>

<meta property="og:type" content="website">
<meta property="og:title" content="Latest Football News Today - TotalSportsLive">
<meta property="og:description" content="Breaking football news, transfers and match updates worldwide.">
<meta property="og:image" content="${image}">
<meta property="og:url" content="https://scores.totalsportslive.co.zw/news.html">
<meta name="twitter:card" content="summary_large_image">

<meta http-equiv="refresh" content="0;url=/news.html">
</head>
<body></body>
</html>
  `);
});

app.get("/api/generate-post", async (req,res)=>{
  const q = req.query.q;
  const r = await fetch(`http://63.142.251.202:3086/raw?q=${encodeURIComponent(q)}`);
  const text = await r.text();
  res.send(text);
});

app.get("/api/fixture-image", async (req,res)=>{
  const q = req.query.team;
  const r = await fetch(`http://145.223.69.146:3065/api/fixture-image?team=${encodeURIComponent(q)}`);
  r.body.pipe(res);
});

// -------------------------------
// CREATE POST
// -------------------------------
app.post('/api/posts', requireAuth, upload.single('image'), async (req, res) => {

  const rawSlug = req.body.slug || req.body.title;
  if (!rawSlug) {
    return res.status(400).json({ error: "Title or slug required" });
  }

  const slug = rawSlug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  if (POSTS_CACHE.find(p => p.slug === slug)) {
    return res.status(400).json({ error: "Slug already exists" });
  }

const newPost = {
  id: uuidv4(),
  title: req.body.title,
  slug,
  content: req.body.content,
  author: req.body.author,
  category: req.body.category,
  tags: req.body.tags
    ? req.body.tags.split(",").map(t=>t.trim().toLowerCase())
    : [],
  image: req.file ? '/uploads/' + req.file.filename : null,

  status: req.body.status || "published",   // published | draft
  publishAt: req.body.publishAt
    ? new Date(req.body.publishAt)
    : new Date(),

  createdAt: new Date(),
  views: 0,
  verified: true
};
  POSTS_CACHE.unshift(newPost);
  await fs.writeJson(DATA_FILE, POSTS_CACHE);

  res.json(newPost);
});

// Get comments for post
app.get('/api/comments/:slug', async (req,res)=>{
  const db = await fs.readJson(COMMENTS_FILE);
  res.json(db[req.params.slug] || []);
});

// Add comment
app.post('/api/comments/:slug', async (req,res)=>{
  const { name, message } = req.body;
  if(!name || !message) return res.status(400).end();

  const db = await fs.readJson(COMMENTS_FILE);

  if(!db[req.params.slug]) db[req.params.slug] = [];

  db[req.params.slug].push({
    name,
    message,
    createdAt: new Date()
  });

  await fs.writeJson(COMMENTS_FILE, db);
  res.json({success:true});
});

app.get('/api/tag/:tag',(req,res)=>{
  const tag = req.params.tag.toLowerCase();
  const posts = POSTS_CACHE.filter(p =>
    p.tags && p.tags.includes(tag)
  );
  res.json(posts);
});

// -------------------------------
// POPULAR POSTS (top 5 by views)
// -------------------------------
app.get('/api/popular', (req, res) => {

  const now = new Date();

  const popular = POSTS_CACHE
    .filter(p => {
      if (p.deleted) return false;

      const status = p.status || "published";
      if (status === "draft") return false;

      if (p.publishAt) {
        return new Date(p.publishAt) <= now;
      }

      return true;
    })
    .sort((a,b) => b.views - a.views)
    .slice(0,5)
    .map(p => ({
      ...p,
      displayViews: p.views * 3
    }));

  res.json(popular);
});
// -------------------------------
// GET SINGLE POST BY ID
// -------------------------------
app.get('/api/posts/:id', (req, res) => {
  const post = POSTS_CACHE.find(p => p.id === req.params.id);

  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  res.json(post);
});

// -------------------------------
// EDIT POST
// -------------------------------
app.put('/api/posts/:id', requireAuth, upload.single('image'), async (req, res) => {

const postIndex = POSTS_CACHE.findIndex(
  p => p.id === req.params.id
);

if (postIndex === -1)
  return res.status(404).json({ error: "Post not found" });

if(req.body.toggle){
  const p = POSTS_CACHE[postIndex];
  p.status = p.status === "published" ? "draft" : "published";
  await fs.writeJson(DATA_FILE, POSTS_CACHE);
  return res.json({success:true});
}

  POSTS_CACHE[postIndex].title = req.body.title;
  POSTS_CACHE[postIndex].author = req.body.author;
  POSTS_CACHE[postIndex].category = req.body.category;
  POSTS_CACHE[postIndex].content = req.body.content;
  POSTS_CACHE[postIndex].slug = req.body.slug;
POSTS_CACHE[postIndex].tags = req.body.tags
  ? req.body.tags.split(",").map(t => t.trim().toLowerCase())
  : [];

  if (req.file) {
    POSTS_CACHE[postIndex].image =
      '/uploads/' + req.file.filename;
  }

  await fs.writeJson(DATA_FILE, POSTS_CACHE);

  res.json({ success: true, post: POSTS_CACHE[postIndex] });
});

app.get("/api/media", requireAuth, (req,res)=>{
  const dir = path.join(__dirname,"public/uploads");
  const files = fs.readdirSync(dir);
  res.json(files);
});

app.delete("/api/media/:file", requireAuth,(req,res)=>{
  const filePath = path.join(__dirname,"public/uploads",req.params.file);
  if(fs.existsSync(filePath)){
    fs.unlinkSync(filePath);
  }
  res.json({success:true});
});

app.post("/api/track", async (req,res)=>{
  const { url, referrer, sessionId } = req.body;

  const ua = req.headers["user-agent"] || "";
  if(BOT_REGEX.test(ua)){
    return res.json({ignored:true});
  }

  const parser = new UAParser(ua);
  const device = parser.getDevice().type || "desktop";
  const browser = parser.getBrowser().name || "Unknown";

  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";

  const geo = geoip.lookup(ip);

  const record = {
    url,
    referrer: referrer || "direct",
    sessionId,
    device,
    browser,
    country: geo ? geo.country : "Unknown",
    hour: new Date().getHours(),
    createdAt: Date.now()
  };

const db = loadAnalytics();
  db.views.push(record);     // ✅ push into views array
  await fs.writeJson(ANALYTICS_FILE, db);

  REALTIME_STREAM.push(record);
  if(REALTIME_STREAM.length > 100) REALTIME_STREAM.shift();

  res.json({success:true});
});

// -------------------------------
// GET ANALYTICS SUMMARY
// -------------------------------
app.get("/api/analytics", async (req,res)=>{
const db = loadAnalytics();
  const pages = {};
  const countries = {};
  const days = {};

  db.views.forEach(v=>{
    pages[v.url] = (pages[v.url]||0)+1;
    countries[v.country] = (countries[v.country]||0)+1;

    const day = new Date(v.createdAt)
      .toISOString()
      .slice(0,10);

    days[day] = (days[day]||0)+1;
  });

  res.json({
    totalViews: db.views.length,
    topPages: Object.entries(pages).sort((a,b)=>b[1]-a[1]).slice(0,20),
    topCountries: Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,15),
    dailyViews: Object.entries(days).sort()
  });
});

app.get("/api/post-analytics/:slug", async (req,res)=>{
const db = loadAnalytics();
  const slug = "/post/" + req.params.slug;

const views = db.views.filter(v=>v.url===slug).length;

  res.json({views});
});

app.post("/api/heartbeat",(req,res)=>{
  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress;

  LIVE_VISITORS[ip] = Date.now();
  res.json({ok:true});
});

app.get("/api/live-visitors",(req,res)=>{
  const now = Date.now();

  Object.keys(ACTIVE_VISITORS).forEach(ip=>{
    if(now - ACTIVE_VISITORS[ip] > 30000){
      delete ACTIVE_VISITORS[ip];
    }
  });

  res.json({count:Object.keys(ACTIVE_VISITORS).length});
});

app.get("/api/post-analytics",(req,res)=>{
const db = loadAnalytics();
  const stats = {};

  db.views.forEach(v=>{
    if(!v.postSlug) return;
    stats[v.postSlug] = (stats[v.postSlug]||0)+1;
  });

  res.json(stats);
});

app.post("/api/heatmap",(req,res)=>{
  const { x,y,url } = req.body;

  const db = fs.readJsonSync(ANALYTICS_FILE);

  db.heatmap.push({x,y,url,time:Date.now()});

  fs.writeJsonSync(ANALYTICS_FILE, db);

  res.json({ok:true});
});

// ======================
// XML SITEMAP
// ======================

app.get("/sitemap.xml", async (req, res) => {

const posts = POSTS_CACHE;

let urls = posts.map(p => {

  const lastModDate =
    p.updatedAt ||
    p.createdAt ||
    p.publishAt ||
    new Date();

  return `
    <url>
      <loc>https://scores.totalsportslive.co.zw/post/${p.slug}</loc>
      <lastmod>${new Date(lastModDate).toISOString()}</lastmod>
    </url>
  `;
}).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://scores.totalsportslive.co.zw/</loc>
  </url>

  <url>
    <loc>https://scores.totalsportslive.co.zw/news.html</loc>
  </url>

  ${urls}
</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);

});

// -------------------------------
// DELETE POST
// -------------------------------
app.delete('/api/posts/:id', requireAuth, async (req, res) => {

  const post = POSTS_CACHE.find(p => p.id === req.params.id);

  if(!post){
    return res.status(404).json({error:"Post not found"});
  }

  post.deleted = true;

  await fs.writeJson(DATA_FILE, POSTS_CACHE);

  res.json({ success: true });
});

// -------------------------------
// MATCH ROUTE
// -------------------------------
// FOOTBALL version
app.get('/football/:country/:league/:matchSlug/:eventId', (req,res)=>{
  res.sendFile(path.join(__dirname,'public/match.html'));
});

// NON-football version
app.get('/:country/:league/:matchSlug/:eventId', (req,res)=>{
  res.sendFile(path.join(__dirname,'public/match.html'));
});


app.get("/api/live-visitors",(req,res)=>{
  res.json({count:Object.keys(LIVE_VISITORS).length});
});


app.get("/api/hourly-heatmap", async (req,res)=>{
const db = loadAnalytics();

  const hours = Array(24).fill(0);

  db.views.forEach(v=>{
    hours[v.hour] = (hours[v.hour] || 0) + 1;
  });

  res.json(hours);
});

app.get("/api/realtime-stream",(req,res)=>{
  res.json(REALTIME_STREAM);
});
app.get("/api/devices", async (req,res)=>{
const db = loadAnalytics();
  const map = {};
  db.views.forEach(v=>{
    map[v.device] = (map[v.device]||0)+1;
  });
  res.json(map);
});

app.get("/api/browsers", async (req,res)=>{
const db = loadAnalytics();
  const map = {};
  db.views.forEach(v=>{
    map[v.browser] = (map[v.browser]||0)+1;
  });
  res.json(map);
});

app.post("/api/session", (req,res)=>{
  const { sessionId } = req.body;

  if(!SESSIONS[sessionId]){
    SESSIONS[sessionId] = {
      start: Date.now(),
      last: Date.now(),
      pages:1
    };
  }else{
    SESSIONS[sessionId].last = Date.now();
    SESSIONS[sessionId].pages++;
  }

  res.json({ok:true});
});


app.get("/api/bounce-rate",(req,res)=>{

  const sessions = Object.values(SESSIONS);
  if(!sessions.length) return res.json({rate:0});

  const bounced = sessions.filter(s=>s.pages===1).length;

  const rate = Math.round((bounced / sessions.length)*100);

  res.json({rate});
});

// ===============================
// FILE MANAGER (SAFE HTML EDITOR)
// ===============================

const PUBLIC_DIR = path.join(__dirname, "public");

// List HTML files
app.get("/api/files", requireAuth, (req,res)=>{
  const files = fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.endsWith(".html"));

  res.json(files);
});

// Read file
app.get("/api/files/:name", requireAuth, (req,res)=>{
  const fileName = req.params.name;

  if(!fileName.endsWith(".html"))
    return res.status(400).json({error:"Invalid file type"});

  const filePath = path.join(PUBLIC_DIR,fileName);

  if(!filePath.startsWith(PUBLIC_DIR))
    return res.status(403).end();

  if(!fs.existsSync(filePath))
    return res.status(404).json({error:"File not found"});

  const content = fs.readFileSync(filePath,"utf8");
  res.json({content});
});

// Save file
app.put("/api/files/:name", requireAuth, express.json({limit:"10mb"}), (req,res)=>{

  const fileName = req.params.name;

  if(!fileName.endsWith(".html"))
    return res.status(400).json({error:"Invalid file type"});

  const filePath = path.join(PUBLIC_DIR,fileName);

  if(!filePath.startsWith(PUBLIC_DIR))
    return res.status(403).end();

  fs.writeFileSync(filePath, req.body.content);

  res.json({success:true});
});

// Create new HTML file
app.post("/api/files", requireAuth, express.json({limit:"10mb"}), (req,res)=>{

  const { name, content } = req.body;

  if(!name.endsWith(".html"))
    return res.status(400).json({error:"Only .html allowed"});

  const filePath = path.join(PUBLIC_DIR,name);

  if(fs.existsSync(filePath))
    return res.status(400).json({error:"File exists"});

  fs.writeFileSync(filePath, content || "<!DOCTYPE html>\n<html>\n<head>\n<title>New Page</title>\n</head>\n<body>\n</body>\n</html>");

  res.json({success:true});
});
// ===============================
// TIME RANGE ANALYTICS
// ===============================

app.get("/api/analytics/range", async (req,res)=>{

  const range = req.query.range || "all"; 
  // today,3d,7d,14d,1m,3m,6m,12m,all

const db = loadAnalytics();
  const now = Date.now();

  let from = 0;

  const map = {
    today: 86400000,
    "3d": 3*86400000,
    "7d": 7*86400000,
    "14d":14*86400000,
    "1m":30*86400000,
    "3m":90*86400000,
    "6m":180*86400000,
    "12m":365*86400000
  };

  if(range !== "all"){
    from = now - map[range];
  }

  const filtered = range==="all"
    ? db.views
    : db.views.filter(v=>v.createdAt >= from);

  // TOTAL VIEWS
  const total = filtered.length;

  // PAGE VIEWS
  const pages = {};
filtered.forEach(v=>{
if(v.url){
    pages[v.url] = (pages[v.url]||0)+1;
  }
});

  res.json({
    totalViews: total,
    pages: Object.entries(pages)
      .sort((a,b)=>b[1]-a[1])
  });
});

// -------------------------------
// CUSTOM 404 PAGE
// -------------------------------
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
});
setInterval(()=>{
  const now = Date.now();
  for(const ip in LIVE_VISITORS){
    if(now - LIVE_VISITORS[ip] > 30000){
      delete LIVE_VISITORS[ip];
    }
  }
},10000);
// -------------------------------
app.listen(5000, () =>
  console.log('🚀 Server running on port 5000')
);
