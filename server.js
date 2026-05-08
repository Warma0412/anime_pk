// ============================================================
// server.js  ——  根目录启动文件
// 启动方式：
//   1) npm install
//   2) [可选] export BILI_SESSDATA="你的SESSDATA" （强烈建议配置，否则 B 站接口大概率返回 53013）
//   3) node server.js
//   4) 浏览器访问 http://localhost:3000
//
// 如何获取 SESSDATA：
//   登录 B 站 → F12 → Application/存储 → Cookies → www.bilibili.com → 复制 SESSDATA 值
// ============================================================

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 从环境变量读取 SESSDATA，可选但强烈推荐
const SESSDATA = process.env.BILI_SESSDATA || '';

// ------------------------------------------------------------
// 工具：标准化 UID
// ------------------------------------------------------------
function normalizeUid(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/space\.bilibili\.com\/(\d+)/);
  return m ? m[1] : null;
}

// ------------------------------------------------------------
// 修正封面 URL：http:// → https://
// ------------------------------------------------------------
function fixCover(url) {
  if (!url) return '';
  return url.replace(/^http:\/\//i, 'https://');
}

// ------------------------------------------------------------
// 番剧封面缓存：以 media_id 为 key
// 只要某部番剧爬过一次，下次（无论哪个用户的列表里）直接复用
// 不再"用名字猜封面"，每个真实存在的番剧都对应自己的真实封面
// ------------------------------------------------------------
const coverCache = new Map(); // media_id -> { name, cover }

function cacheBangumi(item) {
  const id = item.media_id || item.season_id;
  if (!id) return;
  const cover = fixCover(item.cover || item.square_cover);
  if (!cover) return;
  // 即使已有，也不覆盖（B 站有时返回不同 cover，第一次的通常是官方海报）
  if (!coverCache.has(id)) {
    coverCache.set(id, { name: item.title, cover });
  }
}

// ------------------------------------------------------------
// 爬虫：调用 B 站官方接口获取追番列表
// ------------------------------------------------------------
async function fetchBangumiList(mid) {
  const list = [];
  let pn = 1;
  const ps = 30;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Referer': `https://space.bilibili.com/${mid}/bangumi`,
  };
  if (SESSDATA) {
    headers['Cookie'] = `SESSDATA=${SESSDATA}`;
  }

  while (true) {
    const apiUrl = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&pn=${pn}&ps=${ps}&vmid=${mid}`;
    const resp = await axios.get(apiUrl, { timeout: 8000, headers });

    // 业务错误码处理
    if (resp.data.code !== 0) {
      const msg = resp.data.message || `code=${resp.data.code}`;
      // 53013 = 用户隐私设置未公开（最常见）
      // -101 / -400 = 未登录或参数错误
      const err = new Error(msg);
      err.code = resp.data.code;
      throw err;
    }

    const dataList = resp.data.data?.list || [];
    dataList.forEach((item) => {
      cacheBangumi(item); // 顺便存入封面缓存
      list.push({
        id: item.media_id || item.season_id,
        name: item.title,
        cover: fixCover(item.cover || item.square_cover),
      });
    });

    const total = resp.data.data?.total || 0;
    if (list.length >= total || dataList.length < ps) break;
    pn += 1;
    if (pn > 50) break;
  }
  return list;
}

// ------------------------------------------------------------
// API：POST /api/bangumi
// 真实数据，不再 fallback 假数据
// ------------------------------------------------------------
app.post('/api/bangumi', async (req, res) => {
  const { uid, url } = req.body || {};
  const mid = normalizeUid(uid || url);
  if (!mid) {
    return res.status(400).json({ ok: false, msg: '请输入合法的 B 站 UID（纯数字）' });
  }

  try {
    const list = await fetchBangumiList(mid);
    if (list.length === 0) {
      return res.status(404).json({
        ok: false,
        msg: '该用户的追番列表为空',
      });
    }
    return res.json({
      ok: true,
      list,
      total: list.length,
      uid: mid,
      cacheSize: coverCache.size, // 调试用：当前内存里缓存了多少部番剧
    });
  } catch (err) {
    console.error(`[error] uid=${mid} 爬取失败: code=${err.code} msg=${err.message}`);

    // 对 53013 给出明确的引导
    if (err.code === 53013) {
      return res.status(403).json({
        ok: false,
        msg: SESSDATA
          ? '该用户的追番列表未公开（即使配置了 SESSDATA 也无法访问私密追番）'
          : '该用户的追番列表未公开。\n请在 B 站「设置 → 隐私设置 → 我的追番」开启公开；\n或在启动服务时设置环境变量 BILI_SESSDATA 提供登录态。',
        code: 53013,
      });
    }
    return res.status(500).json({
      ok: false,
      msg: '爬取失败：' + err.message,
      code: err.code,
    });
  }
});

// ------------------------------------------------------------
// 调试接口：查看封面缓存统计
// ------------------------------------------------------------
app.get('/api/cache-stats', (_req, res) => {
  res.json({
    ok: true,
    size: coverCache.size,
    sample: [...coverCache.entries()].slice(0, 5).map(([id, v]) => ({ id, ...v })),
  });
});

app.listen(PORT, () => {
  console.log(`✅ 番剧 PK 站点已启动: http://localhost:${PORT}`);
  if (SESSDATA) {
    console.log(`✅ 已加载 SESSDATA（前 8 位: ${SESSDATA.slice(0, 8)}…）`);
  } else {
    console.log(`⚠ 未配置 BILI_SESSDATA，B 站可能拒绝访问大多数用户的追番列表`);
    console.log(`  启动前可执行：export BILI_SESSDATA="你的SESSDATA值"`);
  }
});
