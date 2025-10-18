// api/wolf.js — fetch-only, streams image/* bytes
// Env: SERPAPI_KEY (optional; we fallback to Wikimedia if missing)

export const config = { api: { bodyParser: false } };

const BLOCK_SITES = [
  "pinterest.", "etsy.", "redbubble.", "aliexpress.", "temu.",
  "vectorstock.", "shutterstock.", "adobe.", "istockphoto.", "123rf.",
  "dreamstime.", "depositphotos.", "freepik.", "pngtree."
];

const BLOCK_WORDS = [
  "sticker","clipart","svg","logo","vector","icon",
  "plush","plushie","toy","merch","tattoo","drawing",
  "ai","midjourney","dalle","generated","meme","cartoon","howling at moon"
];

const QUERIES = [
  "wolf",
  "wolves",
  "wild grey wolf photo",
  "wolf in forest photography",
  "arctic wolf portrait",
  "wolf pack running in snow",
  "wolf close up wildlife photo",
  "timber wolf face close up",
  "wolf photography outdoors",
  "lone wolf in nature photo"
];

const FALLBACKS = [
  "https://upload.wikimedia.org/wikipedia/commons/1/19/Canis_lupus_laying.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/0/07/Canis_lupus_265b.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/6/6a/Canis_lupus_lupus_qtl1.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/4/49/Wolf_in_forest.jpg"
];

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function setCORS(res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
function setCache(res){
  res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=43200");
}
function blockedSite(url){
  try{ const h=new URL(url).hostname.toLowerCase();
       return BLOCK_SITES.some(d=>h.includes(d));
  }catch{ return true; }
}
function blockedWords(text=""){
  const s=String(text).toLowerCase();
  return BLOCK_WORDS.some(w=>s.includes(w));
}
async function fetchJSON(url){
  const r = await fetch(url, { redirect:"follow" });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function fetchAsImage(url){
  const r = await fetch(url, {
    redirect:"follow",
    headers: { "user-agent":"Mozilla/5.0", "accept":"image/*,*/*;q=0.8" }
  });
  if(!r.ok) return null;
  const ct = (r.headers.get("content-type")||"").toLowerCase();
  if(!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  let ext = "jpg";
  if(ct.includes("png")) ext = "png";
  else if(ct.includes("jpeg")) ext = "jpg";
  else if(ct.includes("gif")) ext = "gif";
  else if(ct.includes("webp")) ext = "webp";
  return { buf, ct, ext };
}

export default async function handler(req,res){
  setCORS(res);
  if(req.method==="OPTIONS") return res.status(204).end();

  const serpKey = process.env.SERPAPI_KEY;
  const userQ = (req.query.q||"").toString().trim();
  const baseQuery = userQ || pick(QUERIES);

  // If no key, serve Wikimedia fallback as bytes
  if(!serpKey){
    setCache(res);
    const url = pick(FALLBACKS);
    const data = await fetchAsImage(url);
    if(!data) return res.status(500).json({ ok:false, error:"no_key_and_fallback_failed" });

    if((req.query.format||"").toString().toLowerCase()==="json"){
      return res.status(200).json({ ok:true, source:"static_fallback", image:url, content_type:data.ct });
    }

    res.setHeader("Content-Type", data.ct);
    res.setHeader("Content-Disposition", `inline; filename=\"wolf.${data.ext}\"`);
    return res.status(200).send(data.buf);
  }

  // random page 0..5
  const ijn = Math.floor(Math.random()*6);
  const params = new URLSearchParams({
    engine:"google_images",
    q: `${baseQuery} -plush -toy -merch -clipart -sticker -logo -vector -cartoon -fantasy -drawing`,
    tbm:"isch",
    tbs:"itp:photo,isz:l",
    safe:"active",
    ijn:String(ijn),
    api_key:serpKey
  });

  let candidates=[];
  try{
    const data = await fetchJSON(`https://serpapi.com/search.json?${params.toString()}`);
    candidates = Array.isArray(data.images_results) ? data.images_results : [];
  }catch(e){
    // fall through to static
  }

  // filter bad links
  candidates = candidates.filter(r=>{
    const url = r?.original || r?.thumbnail || "";
    const title = r?.title || "";
    if(!url) return false;
    if(blockedSite(url)) return false;
    if(blockedWords(title)) return false;
    if(url.toLowerCase().endsWith(".svg")) return false;
    return true;
  });

  // shuffle
  for(let i=candidates.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }

  setCache(res);

  // try up to 10 images
  const MAX_TRIES = Math.min(10, candidates.length);
  for(let i=0;i<MAX_TRIES;i++){
    const url = candidates[i]?.original;
    try{
      const data = await fetchAsImage(url);
      if(!data) continue;

      if((req.query.format||"").toString().toLowerCase()==="json"){
        return res.status(200).json({ ok:true, source:"serpapi", image:url, content_type:data.ct });
      }

      res.setHeader("Content-Type", data.ct);
      res.setHeader("Content-Disposition", `inline; filename=\"wolf.${data.ext}\"`);
      return res.status(200).send(data.buf);
    }catch{/* next */}
  }

  // fallback
  try{
    const url = pick(FALLBACKS);
    const data = await fetchAsImage(url);
    if(!data) throw new Error("fallback failed");

    if((req.query.format||"").toString().toLowerCase()==="json"){
      return res.status(200).json({ ok:true, source:"static_fallback", image:url, content_type:data.ct });
    }

    res.setHeader("Content-Type", data.ct);
    res.setHeader("Content-Disposition", `inline; filename=\"wolf.${data.ext}\"`);
    return res.status(200).send(data.buf);
  }catch{
    return res.status(404).json({ ok:false, error:"no_usable_wolf_found" });
  }
}
