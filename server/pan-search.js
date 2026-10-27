/**
 * 网盘资源聚合搜索服务
 *
 * 把 pansou / panhub 的搜索结果转换成 TVBox/Fongmi 原生支持的标准 CMS
 * 采集协议（api.php/provide/vod/），Fongmi 用 type:1 直接加载，
 * 不依赖任何第三方 jar 爬虫包。
 *
 * 零外部依赖，Node 18+（使用内置 fetch）。
 *
 * 环境变量：
 *   PORT               监听端口，默认 8080
 *   PANSOU_URL         自建 pansou 地址，如 http://127.0.0.1:8888
 *   PANSOU_TOKEN       pansou 鉴权 token（开启鉴权时必填）
 *   USE_PUBLIC_PANSOU  未配置 PANSOU_URL 时是否借用公共 pansou 实例，默认 1
 *   PANHUB_URL         自建 panhub 地址，如 http://127.0.0.1:3021
 *   USE_PUBLIC_PANHUB  是否使用 panhub 公共精选库，默认 1
 *   SEARCH_TIMEOUT     单个上游超时毫秒，默认 15000
 *   CACHE_TTL          缓存秒数，默认 300
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// 单仓配置文件：本服务会把它里面的网盘地址自动替换成自己的访问地址，
// 这样 Fongmi 直接订阅 http://<本机IP>:PORT/config.json 即可，无需手改 IP
let CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');

let PORT = Number(process.env.PORT || 8080);
let PANSOU_URL = (process.env.PANSOU_URL || '').replace(/\/+$/, '');
let PANSOU_TOKEN = process.env.PANSOU_TOKEN || '';
let USE_PUBLIC_PANSOU = process.env.USE_PUBLIC_PANSOU !== '0';
let PANHUB_URL = (process.env.PANHUB_URL || '').replace(/\/+$/, '');
let USE_PUBLIC_PANHUB = process.env.USE_PUBLIC_PANHUB !== '0';
let SEARCH_TIMEOUT = Number(process.env.SEARCH_TIMEOUT || 25000);
let CACHE_TTL = Number(process.env.CACHE_TTL || 300) * 1000;

// pansou 官方文档列出的公共演示实例（实测 2026-10 可用，返回 merged_by_type）
const PUBLIC_PANSOU = ['https://so.252035.xyz'];
const PUBLIC_PANHUB_CURATED = 'https://panhub.shenzjd.com/api/curated-resources';

// 网盘类型 -> Fongmi 内置网盘播放器的 flag
const PAN_KINDS = [
  { flag: 'ali', label: '阿里云盘', re: /(alipan|aliyundrive|aliyundisk)\.com/i },
  { flag: 'quark', label: '夸克网盘', re: /pan\.quark\.cn/i },
  { flag: 'baidu', label: '百度网盘', re: /pan\.baidu\.com/i },
  { flag: 'tianyi', label: '天翼云盘', re: /cloud\.189\.cn/i },
  { flag: 'mobile', label: '移动云盘', re: /yun\.139\.com/i },
  { flag: 'uc', label: 'UC网盘', re: /drive\.uc\.cn|pan\.uc\.cn/i },
  { flag: '115', label: '115网盘', re: /115\.com|115cdn/i },
  { flag: 'pikpak', label: 'PikPak', re: /pikpak/i },
  { flag: 'thunder', label: '迅雷云盘', re: /pan\.xunlei|thunder:?/i },
  { flag: '123', label: '123网盘', re: /123pan|123684|123865|123912|123pan\.com/i },
  { flag: 'magnet', label: '磁力链接', re: /^magnet:|\.torrent/i },
];

const CLASS_LIST = [
  { type_id: 'all', type_name: '全部网盘' },
  ...PAN_KINDS.map((k) => ({ type_id: k.flag, type_name: k.label })),
];

// pansou 的 cloud_types 命名与本项目 flag 的映射
const PANSOU_TYPE_TO_FLAG = {
  aliyun: 'ali',
  xunlei: 'thunder',
  quark: 'quark',
  baidu: 'baidu',
  tianyi: 'tianyi',
  uc: 'uc',
  mobile: 'mobile',
  '115': '115',
  pikpak: 'pikpak',
  '123': '123',
  magnet: 'magnet',
  ed2k: 'magnet',
};

function kindOf(url, pansouType) {
  let k = PAN_KINDS.find((x) => x.re.test(url || ''));
  if (!k && pansouType) {
    const flag = PANSOU_TYPE_TO_FLAG[String(pansouType).toLowerCase()];
    if (flag) k = PAN_KINDS.find((x) => x.flag === flag);
  }
  return k || null;
}

function extractPwd(url) {
  const m = /[?&](?:pwd|password)=([A-Za-z0-9]+)/.exec(url || '');
  return m ? m[1] : '';
}

function cleanTitle(t) {
  return String(t || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\s，,。|]*(公众号|资源站|采集站|获取更多|订阅我们|最新地址|备用地址)[^\s，,。|]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-|，,、·]+|[\s\-|，,、·]+$/g, '')
    .trim();
}

// TG 频道标题里夹带的推广噪声，尽量还原成干净的片名
function niceTitle(t) {
  let s = cleanTitle(t)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/(介绍|简介|剧情|一句话)\s*[:：][\s\S]*$/u, ' ')
    .replace(/^\d{1,2}月\d{1,2}日\s*/, '')
    .replace(/[，,、]?\s*(类型|分享|网盘|频道|标签|备注|格式|清晰度|大小|集数|地区|语言)\s*[:：][^，,、|]*\s*/g, ' ')
    .replace(/\s*[|]\s*[^|]{0,24}(专搜|搜索|频道|发布|资源|电报)\s*$/u, '')
    .replace(/@[^\s]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-|，,、·>#]+|[\s\-|，,、·]+$/g, '')
    .trim();
  if (s.length > 50) s = s.slice(0, 50).replace(/[\s\-|，,、·]+$/, '') + '…';
  return s;
}

function httpJson(url, opt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT);
  return fetch(url, {
    ...opt,
    signal: ctrl.signal,
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (super-tv-box pan-search)', ...(opt && opt.headers) },
  })
    .then((resp) => {
      clearTimeout(timer);
      if (!resp.ok) return null;
      return resp.text().then((txt) => {
        try {
          return JSON.parse(txt);
        } catch {
          return null;
        }
      });
    })
    .catch(() => {
      clearTimeout(timer);
      return null;
    });
}

function pickArray(obj, keys) {
  if (Array.isArray(obj)) return obj;
  if (!obj || typeof obj !== 'object') return [];
  for (const k of keys) if (Array.isArray(obj[k])) return obj[k];
  if (obj.data) return pickArray(obj.data, keys);
  return [];
}

// ------------------------------------------------------------------
// 上游 1：pansou
// 契约来自 fish2018/pansou：POST /api/search { kw, res, cloud_types }
//   -> { code, message, data: { total, merged_by_type: { baidu: [{url,password,note,datetime,source,images}] },
//                               results: [{title,links:[{type,url,password}]} ] } }
// ------------------------------------------------------------------
async function fromPansou(kw, wantFlag) {
  const bases = PANSOU_URL ? [PANSOU_URL] : USE_PUBLIC_PANSOU ? PUBLIC_PANSOU : [];
  if (!bases.length) return [];

  const headers = { 'Content-Type': 'application/json' };
  if (PANSOU_TOKEN) headers.Authorization = `Bearer ${PANSOU_TOKEN}`;

  for (const base of bases) {
    // pansou 默认 res=merge（只返回 merged_by_type，负载最小、实测最稳）
    let payload = null;
    const data = await httpJson(`${base}/api/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kw, res: 'merge' }),
    });
    if (data) payload = data.data || data;
    if (!payload || !(payload.merged_by_type || payload.results)) {
      // GET 兜底：部分实例只放行查询串形式
      const g = await httpJson(`${base}/api/search?kw=${encodeURIComponent(kw)}&res=merge`, {});
      if (g) payload = g.data || g;
    }
    if (!payload) continue;
    const out = [];

    const push = (title, url, password, pansouType, meta) => {
      const kind = kindOf(url, pansouType);
      if (!kind) return;
      if (wantFlag && wantFlag !== 'all' && kind.flag !== wantFlag) return;
      out.push({
        title: niceTitle(title) || `${kw}`,
        url,
        password: password || extractPwd(url) || '',
        kind,
        pic: (meta && meta.images && meta.images[0]) || '',
        source: (meta && meta.source) || 'pansou',
        datetime: (meta && meta.datetime) || '',
      });
    };

    const merged = payload.merged_by_type || {};
    for (const [panName, links] of Object.entries(merged)) {
      for (const it of links || []) {
        push(it.note || it.title || kw, it.url, it.password, panName, it);
      }
    }
    for (const r of payload.results || []) {
      for (const l of r.links || []) {
        push(r.title || kw, l.url, l.password, l.type, r);
      }
    }
    if (out.length) return out;
  }
  return [];
}

// ------------------------------------------------------------------
// 上游 2：panhub 自建实例（Nitro 路由 /api/search）
// ------------------------------------------------------------------
async function fromPanhub(kw, wantFlag) {
  if (!PANHUB_URL) return [];
  const tries = [
    `${PANHUB_URL}/api/search?q=${encodeURIComponent(kw)}`,
    `${PANHUB_URL}/api/search?t=${encodeURIComponent(kw)}`,
  ];
  for (const url of tries) {
    const data = await httpJson(url, {});
    if (!data) continue;
    const out = [];
    for (const it of pickArray(data, ['results', 'items', 'list', 'data'])) {
      const url2 = it.url || it.link || it.share_url || '';
      const kind = kindOf(url2, it.type || it.platform);
      if (!kind) continue;
      if (wantFlag && wantFlag !== 'all' && kind.flag !== wantFlag) continue;
      out.push({
        title: niceTitle(it.title || it.name || kw),
        url: url2,
        password: it.password || extractPwd(url2) || '',
        kind,
        pic: it.cover || it.image || '',
        source: `panhub:${it.source || it.plugin || 'panhub'}`,
        datetime: it.datetime || it.time || it.created_at || '',
      });
    }
    if (out.length) return out;
  }
  // POST 兜底
  const data = await httpJson(`${PANHUB_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: kw }),
  });
  if (!data) return [];
  const out = [];
  for (const it of pickArray(data, ['results', 'items', 'list', 'data'])) {
    const url2 = it.url || it.link || it.share_url || '';
    const kind = kindOf(url2, it.type || it.platform);
    if (!kind || (wantFlag && wantFlag !== 'all' && kind.flag !== wantFlag)) continue;
    out.push({
      title: niceTitle(it.title || it.name || kw),
      url: url2,
      password: it.password || extractPwd(url2) || '',
      kind,
      pic: it.cover || it.image || '',
      source: `panhub:${it.source || it.plugin || 'panhub'}`,
      datetime: it.datetime || it.time || '',
    });
  }
  return out;
}

// ------------------------------------------------------------------
// 上游 3：panhub 公共精选库（实测可用，零部署）
// ------------------------------------------------------------------
let curatedCache = { at: 0, items: null };
async function curatedItems() {
  if (curatedCache.items && Date.now() - curatedCache.at < 6 * 3600 * 1000) return curatedCache.items;
  const data = await httpJson(PUBLIC_PANHUB_CURATED, {});
  const items = (data && data.data && data.data.items) || [];
  curatedCache = { at: Date.now(), items };
  return items;
}

async function fromPanhubCurated(kw, wantFlag) {
  if (!USE_PUBLIC_PANHUB) return [];
  const items = await curatedItems();
  const needle = niceTitle(kw).toLowerCase();
  const out = [];
  for (const it of items) {
    const name = niceTitle(it.name || '');
    if (needle && !name.toLowerCase().includes(needle)) continue;
    const url = it.url || '';
    const kind = kindOf(url, it.platform || it.type);
    if (!kind) continue;
    if (wantFlag && wantFlag !== 'all' && kind.flag !== wantFlag) continue;
    out.push({
      title: name || kw,
      url,
      password: it.password || extractPwd(url) || '',
      kind,
      pic: it.cover || it.image || '',
      source: 'panhub:精选',
      datetime: it.created_at || '',
    });
  }
  return out;
}

// ------------------------------------------------------------------
// 聚合 -> CMS vod 记录
// ------------------------------------------------------------------
const MAX_VOD = 40; // 一次搜索最多返回多少张卡片
const MAX_LINKS = 30; // 单条线路最多链接数

function buildVods(keyword, hits) {
  // 按片名分组：同一个片名下的多条网盘链接合成一条 vod 的多条线路
  const groups = new Map();
  for (const h of hits) {
    const key = h.title || keyword;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }

  const vods = [];
  for (const [title, list] of groups) {
    if (!title) continue;
    const byKind = new Map();
    const seen = new Set();
    for (const h of list) {
      const dedup = h.kind.flag + '|' + h.url;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      if (!byKind.has(h.kind.flag)) byKind.set(h.kind.flag, []);
      if (byKind.get(h.kind.flag).length < MAX_LINKS) byKind.get(h.kind.flag).push(h);
    }
    if (!byKind.size) continue;

    const froms = [];
    const urls = [];
    let pic = '';
    const kindsLabel = [];
    for (const [flag, hs] of byKind) {
      const kind = PAN_KINDS.find((k) => k.flag === flag);
      froms.push(flag);
      kindsLabel.push(kind ? kind.label : flag);
      urls.push(
        hs
          .map((h, i) => {
            const label = h.title && h.title !== title ? h.title : kind ? kind.label : flag;
            const name = `${label} ${i + 1}${h.password ? `[码:${h.password}]` : ''}`;
            return `${name}$${h.url}`;
          })
          .join('#')
      );
      if (!pic) {
        const withPic = hs.find((h) => h.pic && /^https?:/.test(h.pic));
        if (withPic) pic = withPic.pic;
      }
    }

    const total = [...byKind.values()].reduce((n, a) => n + a.length, 0);
    vods.push({
      vod_id: Buffer.from(`${keyword}::${title}`.slice(0, 120), 'utf8').toString('base64url'),
      vod_name: title === keyword ? `${title} [网盘]` : title,
      type_id: 1,
      type_name: '网盘资源',
      vod_pic: pic,
      vod_remarks: `${total}条/${kindsLabel.slice(0, 3).join(' ')}`,
      vod_year: (/(19|20)\d{2}/.exec(title) || ['', ''])[0],
      vod_content: [
        `关键词：${keyword}`,
        `收录：${total} 个分享链接（${kindsLabel.join('、')}）`,
        '',
        '播放方式：选择对应网盘线路，Fongmi 会调用内置网盘播放器；',
        '首次播放需要在「设置 - 点播 - 网盘」里填入对应网盘的 Cookie。',
      ].join('\n'),
      vod_play_from: froms.join('$$$'),
      vod_play_url: urls.join('$$$'),
    });
    if (vods.length >= MAX_VOD) break;
  }
  return vods;
}

async function searchVod(wd, typeFlag) {
  const groups = await Promise.all([
    fromPansou(wd, typeFlag).catch(() => []),
    fromPanhub(wd, typeFlag).catch(() => []),
    fromPanhubCurated(wd, typeFlag).catch(() => []),
  ]);
  const hits = groups.flat();
  const needle = wd.toLowerCase();

  hits.sort((a, b) => {
    const sa = (a.title.toLowerCase().includes(needle) ? 0 : 10) + (a.source.startsWith('pansou') ? 0 : 1);
    const sb = (b.title.toLowerCase().includes(needle) ? 0 : 10) + (b.source.startsWith('pansou') ? 0 : 1);
    if (sa !== sb) return sa - sb;
    return String(b.datetime).localeCompare(String(a.datetime));
  });

  // 完全同链接去重（跨上游）
  const seen = new Set();
  const deduped = hits.filter((h) => {
    const k = h.kind.flag + '|' + h.url;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return buildVods(wd, deduped);
}

// ------------------------------------------------------------------
// HTTP / CMS 协议层
// ------------------------------------------------------------------
function cms(res, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${Math.floor(CACHE_TTL / 1000)}`,
    'X-Pan-Search': 'super-tv-box',
  });
  res.end(body);
}

const cache = new Map();
async function cached(key, producer) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.val;
  const val = await producer();
  cache.set(key, { at: Date.now(), val });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return val;
}

function envelope(list, total) {
  return {
    code: 1,
    msg: 'data',
    page: 1,
    pagecount: 1,
    limit: MAX_VOD,
    total: total === undefined ? list.length : total,
    class: CLASS_LIST,
    list,
  };
}

async function browse(typeFlag) {
  // 无关键词浏览：用 panhub 公共精选库铺满首页
  const hits = await fromPanhubCurated('', typeFlag).catch(() => []);
  return buildVods('精选', hits);
}

const CMS_PATHS = ['/api.php/provide/vod/', '/api.php/provide/vod', '/provide/vod', '/api.php/provide/vod_atml'];

async function handler(req, res) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = u.pathname.replace(/\/index\.php.*$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  if (p === '/' || p === '/health' || p === '/api/health') {
    return cms(res, {
      status: 'ok',
      service: 'super-tv-box pan-search',
      time: new Date().toISOString(),
      upstreams: {
        pansou: PANSOU_URL || (USE_PUBLIC_PANSOU ? PUBLIC_PANSOU.join(',') : '(未配置)'),
        panhub: PANHUB_URL || '(未配置)',
        panhub_public_curated: USE_PUBLIC_PANHUB,
      },
      endpoint: '/api.php/provide/vod/?ac=videolist&wd=' + encodeURIComponent('示例'),
    });
  }

  if (p === '/config.json') {
    let raw;
    try {
      raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('config.json 不存在，请检查 CONFIG_PATH');
    }
    const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${u.host}`;
    raw = raw.replace(/http:\/\/(?:127\.0\.0\.1|localhost):8889/g, origin);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    return res.end(raw);
  }

  if (!CMS_PATHS.includes(p) && !p.endsWith('/provide/vod')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('not found');
  }

  const ac = (u.searchParams.get('ac') || 'list').toLowerCase();
  const wd = (u.searchParams.get('wd') || u.searchParams.get('q') || u.searchParams.get('keyword') || '').trim();
  const t = u.searchParams.get('t') || 'all';
  const ids = (u.searchParams.get('ids') || '').trim();

  // 只有分类、没有内容请求 -> 返回 class
  if (ac === 'list' && !wd && !ids) {
    return cms(res, envelope([], CLASS_LIST.length));
  }

  // 详情页：vod_id 是 base64url(keyword::title)，还原后重新搜索
  if (ids && !wd) {
    let keyword = '';
    try {
      const dec = Buffer.from(ids, 'base64url').toString('utf8');
      keyword = dec.split('::')[0] || dec;
    } catch {
      keyword = '';
    }
    if (keyword) {
      const list = (await cached(`s:${t}:${keyword}`, () => searchVod(keyword, t))).filter(
        (v) => v.vod_id === ids
      );
      return cms(res, envelope(list.length ? list : []));
    }
  }

  if (!wd) {
    const list = await cached(`b:${t}`, () => browse(t));
    return cms(res, envelope(list));
  }

  const list = await cached(`s:${t}:${wd}`, () => searchVod(wd, t));
  return cms(res, envelope(list));
}

if (require.main === module) {
  http.createServer((req, res) => {
    handler(req, res).catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 0, msg: String(e && e.message) }));
    });
  }).listen(PORT, () => {
    const line = (s) => console.log(s);
    line('='.repeat(60));
    line('  超级影视 · 网盘资源聚合搜索（CMS 兼容，免 jar）');
    line('='.repeat(60));
    line(`  端口       : ${PORT}`);
    line(`  pansou     : ${PANSOU_URL || (USE_PUBLIC_PANSOU ? PUBLIC_PANSOU.join(',') + '（公共实例）' : '(禁用)')}`);
    line(`  panhub     : ${PANHUB_URL || '(未配置)'}`);
    line(`  panhub精选 : ${USE_PUBLIC_PANHUB ? '启用' : '禁用'}`);
    line('');
    line(`  Fongmi 地址 : http://<本机IP>:${PORT}/api.php/provide/vod/`);
    line(`  自测搜索    : curl "http://127.0.0.1:${PORT}/api.php/provide/vod/?ac=videolist&wd=流浪地球"`);
    line('='.repeat(60));
  });
}

module.exports = { handler, searchVod, fromPansou, fromPanhubCurated, buildVods, kindOf, cleanTitle, niceTitle };
