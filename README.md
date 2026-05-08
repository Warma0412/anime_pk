# 番剧 PK 大乱斗

输入任意 B 站用户的 UID，从他/她的追番列表中两两 PK，投出心目中的 No.1。

## 项目结构

```
bangumi-pk/
├── package.json
├── server.js             # ★ 启动文件
├── README.md
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## 启动方式

```bash
npm install

# ★ 强烈建议：配置你的 B 站 SESSDATA Cookie
# B 站接口对未登录请求几乎都会返回 53013（用户隐私设置未公开）
# 即使目标用户已开启"公开追番"，未登录态也大概率被拒
export BILI_SESSDATA="你的SESSDATA值"     # macOS/Linux
# set BILI_SESSDATA=你的SESSDATA值         # Windows CMD
# $env:BILI_SESSDATA="你的SESSDATA值"      # Windows PowerShell

node server.js
# 浏览器访问 http://localhost:3000
```

## 如何获取 SESSDATA

1. 浏览器登录 B 站（任意账号）
2. F12 打开开发者工具 → Application（应用）→ Cookies → `https://www.bilibili.com`
3. 找到 `SESSDATA` 这一行，复制它的 Value
4. 设置到环境变量后启动 `node server.js`

> SESSDATA 仅用于服务端伪装登录态，不会发送给前端。

## v1.5 更新（重要）

**问题**：之前换不同 UID 时，看到的封面与番剧名对不上 — 因为 B 站对未登录请求大多返回 53013，导致后端 fallback 到了内置的 picsum 假数据。

**修复**：

1. **彻底移除 mock fallback**：失败就明确报错，不再用假数据糊弄
2. **支持 SESSDATA Cookie**：从环境变量 `BILI_SESSDATA` 读取，绕过 53013
3. **明确错误提示**：未公开追番 / 未配置 Cookie / 接口异常都给出针对性提示
4. **封面缓存（按 media_id）**：服务端用 `Map` 缓存 `media_id → cover`，下次同一部番剧直接复用真实封面 — 既避免重复请求 B 站，也保证名字对应的永远是真实封面，不是凭名字猜的

## 接口

```
POST /api/bangumi   { uid }    →  { ok, list, total, uid, cacheSize }
GET  /api/cache-stats          →  缓存统计（调试用）
```
