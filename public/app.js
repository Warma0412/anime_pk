// ============================================================
// public/app.js  ——  前端交互逻辑
// 状态机：input(UID) → mode → pk → result
// ============================================================

const state = {
  allList: [],
  pkList: [],
  currentPair: [],
  winners: [],
  currentRound: 0,
};

function showStage(id) {
  document.querySelectorAll('.stage').forEach((el) => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ------------------------------------------------------------
// 阶段 1：输入 UID → 调后端抓取追番
// ------------------------------------------------------------
const btnFetch = document.getElementById('btn-fetch');
const uidInput = document.getElementById('uid-input');
const hintInput = document.getElementById('hint-input');

uidInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnFetch.click();
});

btnFetch.addEventListener('click', async () => {
  const uid = uidInput.value.trim();
  if (!uid) {
    hintInput.textContent = '请输入 B 站 UID';
    return;
  }
  btnFetch.disabled = true;
  hintInput.textContent = '⏳ 正在加载…';
  try {
    const resp = await fetch('/api/bangumi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });
    const data = await resp.json();
    if (!data.ok || !data.list || data.list.length === 0) {
      // 失败时直接抛错信息，不再用假数据兜底
      hintInput.textContent = '✗ ' + (data.msg || '未获取到番剧数据');
      btnFetch.disabled = false;
      return;
    }
    state.allList = data.list;
    hintInput.textContent = `✓ 抓取成功，共 ${data.total} 部番剧`;
    enterModeStage();
  } catch (e) {
    hintInput.textContent = '✗ 网络或服务器错误：' + e.message;
  } finally {
    btnFetch.disabled = false;
  }
});

// ------------------------------------------------------------
// 阶段 2：模式选择
// ------------------------------------------------------------
function enterModeStage() {
  const total = state.allList.length;
  document.getElementById('total-count').textContent = total;

  const candidates = [10, 20, 30, 40, 50];
  const container = document.getElementById('mode-buttons');
  container.innerHTML = '';

  candidates.forEach((n) => {
    if (n <= total) {
      const btn = document.createElement('button');
      btn.className = 'mode-btn';
      btn.innerHTML = `<span>${n} 部</span>`;
      btn.onclick = () => startPK(n);
      container.appendChild(btn);
    }
  });

  const allBtn = document.createElement('button');
  allBtn.className = 'mode-btn';
  allBtn.innerHTML = `<span>全部 (${total})</span>`;
  allBtn.onclick = () => startPK(total);
  container.appendChild(allBtn);

  showStage('stage-mode');
}

// ------------------------------------------------------------
// 阶段 3：PK 对战（单淘汰锦标赛）
// ------------------------------------------------------------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startPK(count) {
  state.pkList = shuffle(state.allList).slice(0, count);
  state.winners = [];
  state.currentRound = 0;
  showStage('stage-pk');
  nextPair();
}

/**
 * 单淘汰：两两 PK，奇数轮空晋级，直到剩 1 部冠军
 */
function nextPair() {
  if (state.pkList.length >= 2) {
    state.currentRound += 1;
    const a = state.pkList.shift();
    const b = state.pkList.shift();
    state.currentPair = [a, b];
    renderPair(a, b);
    document.getElementById('pk-progress').textContent =
      `第 ${state.currentRound} 场 · 剩余 ${Math.floor(state.pkList.length / 2)} 场`;
    return;
  }
  if (state.pkList.length === 1) state.winners.push(state.pkList.shift());
  if (state.winners.length === 1) return showResult(state.winners[0]);
  state.pkList = shuffle(state.winners);
  state.winners = [];
  state.currentRound = 0;
  nextPair();
}

function renderPair(a, b) {
  const left = document.getElementById('card-left');
  const right = document.getElementById('card-right');

  left.querySelector('img').src = a.cover;
  left.querySelector('img').alt = a.name;
  left.querySelector('.card-name').textContent = a.name;
  right.querySelector('img').src = b.cover;
  right.querySelector('img').alt = b.name;
  right.querySelector('.card-name').textContent = b.name;
}

document.getElementById('card-left').addEventListener('click', () => pick('left'));
document.getElementById('card-right').addEventListener('click', () => pick('right'));

function pick(side) {
  const winner = side === 'left' ? state.currentPair[0] : state.currentPair[1];
  state.winners.push(winner);
  nextPair();
}

// ------------------------------------------------------------
// 阶段 4：结果展示 + 撒花特效
// ------------------------------------------------------------
function showResult(winner) {
  const card = document.getElementById('winner-card');
  card.querySelector('img').src = winner.cover;
  card.querySelector('img').alt = winner.name;
  card.querySelector('.winner-name').textContent = winner.name;
  showStage('stage-result');
  startConfetti();
}

document.getElementById('btn-restart').addEventListener('click', () => {
  stopConfetti();
  showStage('stage-mode');
});

// ------------------------------------------------------------
// 撒花特效（纯 Canvas，含矩形 + 圆形 + 长条三种碎片）
// ------------------------------------------------------------
let confettiTimer = null;
let confettiPieces = [];
const canvas = document.getElementById('confetti');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const COLORS = ['#ff8fb3', '#ffd6e7', '#8fb8e8', '#d9ecff', '#ffe5b4', '#ffffff', '#c8b6ff'];
const SHAPES = ['rect', 'circle', 'strip'];

function createPiece() {
  return {
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height,
    w: 6 + Math.random() * 10,
    h: 8 + Math.random() * 14,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    shape: SHAPES[(Math.random() * SHAPES.length) | 0],
    vy: 2 + Math.random() * 4,
    vx: -2 + Math.random() * 4,
    rot: Math.random() * Math.PI * 2,
    vr: -0.25 + Math.random() * 0.5,
    alpha: .7 + Math.random() * .3,
  };
}

function startConfetti() {
  confettiPieces = Array.from({ length: 220 }, createPiece);
  cancelAnimationFrame(confettiTimer);
  loopConfetti();
}

function stopConfetti() {
  cancelAnimationFrame(confettiTimer);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiPieces = [];
}

function drawPiece(p) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.fillStyle = p.color;
  if (p.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.shape === 'strip') {
    ctx.fillRect(-p.w / 2, -p.h, p.w / 2, p.h * 2);
  } else {
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  }
  ctx.restore();
}

function loopConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiPieces.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    if (p.y > canvas.height + 30) {
      Object.assign(p, createPiece(), { y: -20 });
    }
    drawPiece(p);
  });
  confettiTimer = requestAnimationFrame(loopConfetti);
}
