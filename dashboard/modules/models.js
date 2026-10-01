/* Offline statistical models. No network, packages, eval or uploaded data.
 * Every result is calculated from the current rows; failed fits return DROP.
 * Algorithms intentionally use bounded fits/samples for a responsive browser.
 */
(function (root) {
  'use strict';
  const DAY = 86400000, EPS = 1e-10;
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sum = a => a.reduce((s, x) => s + x, 0);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const variance = a => { const m = mean(a); return sum(a.map(x => (x - m) ** 2)) / Math.max(1, a.length - 1); };
  const quantile = (a, q) => { const b = a.slice().sort((x, y) => x - y), t = (b.length - 1) * q, k = Math.floor(t); return b[k] + (b[Math.min(k + 1, b.length - 1)] - b[k]) * (t - k); };
  const uniq = a => [...new Set(a)].sort();
  const rng = seed => { let v = seed >>> 0; return () => { v += 0x6D2B79F5; let t = v; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const sample = (a, n, rand) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b.slice(0, n); };
  const normal = rand => Math.sqrt(-2 * Math.log(Math.max(EPS, rand()))) * Math.cos(2 * Math.PI * rand());
  function gammaDraw(shape, rand) {
    if (shape < 1) return gammaDraw(shape + 1, rand) * Math.pow(Math.max(EPS, rand()), 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (let i = 0; i < 10000; i++) { const z = normal(rand), v = (1 + c * z) ** 3, u = rand(); if (v > 0 && (u < 1 - .0331 * z ** 4 || Math.log(u) < .5 * z * z + d * (1 - v + Math.log(v)))) return d * v; }
    throw Error('Gamma 난수 추출 반복 한도 초과');
  }
  function solve(A, b) {
    const n = b.length, m = A.map((r, i) => [...r, b[i]]);
    for (let j = 0; j < n; j++) {
      let k = j; for (let i = j + 1; i < n; i++) if (Math.abs(m[i][j]) > Math.abs(m[k][j])) k = i;
      if (Math.abs(m[k][j]) < EPS || !Number.isFinite(m[k][j])) throw Error('설계행렬이 특이하거나 정보가 부족함');
      [m[j], m[k]] = [m[k], m[j]];
      const div = m[j][j]; for (let c = j; c <= n; c++) m[j][c] /= div;
      for (let i = 0; i < n; i++) if (i !== j) { const w = m[i][j]; if (w) for (let c = j; c <= n; c++) m[i][c] -= w * m[j][c]; }
    }
    return m.map(r => r[n]);
  }
  function cross(X, y, weights) {
    const p = X[0].length, A = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
    for (let i = 0; i < X.length; i++) { const x = X[i], w = weights ? weights[i] : 1; for (let j = 0; j < p; j++) if (x[j]) { b[j] += w * x[j] * y[i]; for (let k = 0; k <= j; k++) if (x[k]) A[j][k] += w * x[j] * x[k]; } }
    for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) A[k][j] = A[j][k];
    return { A, b };
  }
  const least = (X, y, w) => { const { A, b } = cross(X, y, w); return solve(A, b); };
  const predict = (X, b) => X.map(x => dot(x, b));
  function schema(rows, fields = ['department', 'payment', 'type'], calendar = true, interaction = false) {
    const levels = Object.fromEntries(fields.map(k => [k, uniq(rows.map(r => r[k]))]));
    const names = ['절편']; fields.forEach(k => levels[k].slice(1).forEach(v => names.push(k + ':' + v)));
    const first = Math.min(...rows.map(r => Date.parse(r.date))), last = Math.max(...rows.map(r => Date.parse(r.date))), span = Math.max(DAY, last - first);
    if (calendar) { names.push('기간 진행'); for (let d = 1; d < 7; d++) names.push('요일:' + d); }
    const combos = [];
    if (interaction) for (const d of levels.department.slice(1)) for (const p of levels.payment.slice(1)) { if (rows.some(r => r.department === d && r.payment === p)) { combos.push([d, p]); names.push(d + ' × ' + p); } }
    const encode = r => { const x = [1]; fields.forEach(k => levels[k].slice(1).forEach(v => x.push(r[k] === v ? 1 : 0))); if (calendar) { x.push((Date.parse(r.date) - first) / span); const w = new Date(r.date + 'T00:00:00Z').getUTCDay(); for (let d = 1; d < 7; d++) x.push(w === d ? 1 : 0); } combos.forEach(([d, p]) => x.push(r.department === d && r.payment === p ? 1 : 0)); return x; };
    return { names, encode, levels };
  }
  function splitTime(rows, ratio = .8) { const dates = uniq(rows.map(r => r.date)); if (dates.length < 10) throw Error('시간 분리 검증에 필요한 최소 10일 자료가 없음'); const cut = dates[Math.max(1, Math.floor(dates.length * ratio))]; return { train: rows.filter(r => r.date < cut), test: rows.filter(r => r.date >= cut), cut }; }
  function quality(actual, fitted) { if (!actual.length || fitted.some(v => !Number.isFinite(v))) throw Error('유효한 예측값이 없음'); const m = mean(actual), sst = sum(actual.map(v => (v - m) ** 2)), se = sum(actual.map((v, i) => (v - fitted[i]) ** 2)); return { mae: mean(actual.map((v, i) => Math.abs(v - fitted[i]))), rmse: Math.sqrt(se / actual.length), r2: sst > 0 ? 1 - se / sst : 0 }; }
  function card(id, summary, explanation, metrics = [], extra = {}) { return { id: String(id), status: 'ok', summary, explanation, metrics, notes: [], ...extra }; }
  const metric = (label, value, format = 'number') => ({ label, value, format });
  const noteTime = cut => `날짜 단위로 앞 80% 학습, ${cut} 이후 20% 검증. 검증값은 학습에 사용하지 않았습니다. 인과효과·유의성 검정은 제공하지 않습니다.`;
  function predictionCard(id, title, explanation, actual, fitted, baseline, cut, extra = {}) {
    const q = quality(actual, fitted), b = quality(actual, actual.map(() => baseline));
    const stride = Math.max(1, Math.ceil(actual.length / 180));
    return card(id, title, explanation, [metric('검증 MAE', q.mae, 'money'), metric('검증 R²', q.r2), metric('평균 기준 MAE', b.mae, 'money')], { chart: { type: 'scatter', labels: [], series: [], points: actual.map((x, i) => ({ x, y: fitted[i], label: '실제 / 예측' })).filter((_, i) => i % stride === 0) }, notes: [noteTime(cut), '산점도 X=실제 금액, Y=예측 금액(원). 표시만 최대 180점으로 줄였으며 오차 계산에는 검증 전체를 사용합니다.'], ...extra });
  }
  function iterativeGLM(X, y, family, alpha = 0, initial) {
    let b = initial || Array(X[0].length).fill(0); if (!initial) b[0] = Math.log(Math.max(.01, mean(y)));
    const objective = beta => sum(X.map((x, i) => { const eta = clamp(dot(x, beta), -25, 25), mu = Math.exp(eta); if (family === 'gamma') return y[i] / mu + eta; if (family === 'nb') return (y[i] + 1 / alpha) * Math.log(1 + alpha * mu) - y[i] * eta; return mu - y[i] * eta; }));
    let old = objective(b);
    for (let iter = 0; iter < 60; iter++) {
      const mu = predict(X, b).map(v => Math.exp(clamp(v, -25, 25))), z = mu.map((m, i) => dot(X[i], b) + (y[i] - m) / m), weights = mu.map((m, i) => family === 'gamma' ? Math.max(EPS, y[i] / m) : family === 'nb' ? m / (1 + alpha * m) : m);
      // Gamma uses exact Newton curvature; its Newton working response differs from Fisher scoring.
      if (family === 'gamma') for (let i = 0; i < z.length; i++) z[i] = dot(X[i], b) + (y[i] / mu[i] - 1) / weights[i];
      const next = least(X, z, weights), delta = next.map((v, j) => v - b[j]);
      let step = 1, value, candidate;
      do { candidate = b.map((v, j) => v + step * delta[j]); value = objective(candidate); if (value <= old + 1e-8) break; step /= 2; } while (step > 1 / 1024);
      if (!Number.isFinite(value) || value > old + 1e-6) throw Error('GLM 최적화가 수렴하지 않음');
      const change = Math.max(...delta.map(v => Math.abs(v * step))); b = candidate; old = value;
      if (change < 1e-6) return b;
    }
    throw Error('GLM 60회 반복 안에 수렴하지 않음');
  }
  function quantileADMM(X, y, tau) {
    const { A } = cross(X, y), p = X[0].length, inv = Array.from({ length: p }, (_, j) => solve(A, Array.from({ length: p }, (_, k) => j === k ? 1 : 0)));
    let b = least(X, y), z = y.map((v, i) => v - dot(X[i], b)), u = y.map(() => 0); const rho = 1;
    for (let iter = 0; iter < 500; iter++) {
      const rhs = Array(p).fill(0); for (let i = 0; i < X.length; i++) { const v = y[i] - z[i] + u[i]; for (let j = 0; j < p; j++) rhs[j] += X[i][j] * v; }
      b = inv.map(row => dot(row, rhs)); let primal = 0, dual = 0;
      for (let i = 0; i < y.length; i++) { const r = y[i] - dot(X[i], b), v = r + u[i], next = v > tau / rho ? v - tau / rho : v < (tau - 1) / rho ? v - (tau - 1) / rho : 0; primal += (r - next) ** 2; dual += (next - z[i]) ** 2; u[i] += r - next; z[i] = next; }
      if (Math.sqrt(primal / y.length) < .002 && Math.sqrt(dual / y.length) < .002) return b;
    }
    throw Error('분위수 ADMM 500회 안에 허용오차 0.002를 충족하지 못함');
  }
  function daily(rows) {
    const map = new Map(); rows.forEach(r => { if (!map.has(r.date)) map.set(r.date, []); map.get(r.date).push(r.amount); });
    const dates = uniq(rows.map(r => r.date)), result = [];
    for (let d = Date.parse(dates[0]); d <= Date.parse(dates.at(-1)); d += DAY) { const date = new Date(d).toISOString().slice(0, 10), a = map.get(date) || []; result.push({ date, count: a.length, meanlog: a.length ? mean(a.map(Math.log)) : null }); }
    return result;
  }
  function countDesign(days, first, span) { return days.map(r => { const w = new Date(r.date + 'T00:00:00Z').getUTCDay(); return [1, (Date.parse(r.date) - first) / span, ...Array.from({ length: 6 }, (_, j) => w === j + 1 ? 1 : 0)]; }); }
  function groups(rows, key = r => r.type + ' · ' + r.department) { const map = new Map(); rows.forEach(r => { const k = key(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }); return [...map.entries()]; }
  function anomalyCard(id, summary, explanation, scored, notes, threshold) {
    const sorted = scored.slice().sort((a, b) => b.score - a.score), flagged = threshold === undefined ? Math.max(1, Math.ceil(scored.length * .02)) : scored.filter(r => r.score > threshold).length;
    return card(id, summary, explanation, [metric('평가 거래', scored.length), metric(threshold === undefined ? '상위 2% 검토 후보' : '기준 초과 후보', flagged), metric('후보 비중', flagged / scored.length, 'percent')], { chart: { type: 'bar', labels: sorted.slice(0, 12).map(r => '#' + r.row.id), series: [{ name: '이상도 점수', values: sorted.slice(0, 12).map(r => r.score) }] }, table: { headers: ['원본 행', '날짜', '거래 구분', '부서', '금액(원)', '점수'], rows: sorted.slice(0, 20).map(r => [r.row.id, r.row.date, r.row.type, r.row.department, r.row.amount, Number(r.score.toFixed(4))]) }, notes: [...notes, '후보는 수동 검토 대상이며 오류·부정거래의 판정이 아닙니다.'] });
  }
  function treeFit(X, y, indices, options, rand, depth = 0) {
    const m = mean(indices.map(i => y[i])); if (depth >= options.depth || indices.length < 2 * options.minLeaf) return { value: m };
    let features = Array.from({ length: X[0].length }, (_, i) => i); if (options.mtry && options.mtry < features.length) features = sample(features, options.mtry, rand);
    const total = sum(indices.map(i => y[i])), total2 = sum(indices.map(i => y[i] ** 2)); let best = null, gainBest = 1e-8;
    for (const f of features) {
      const sorted = indices.slice().sort((a, b) => X[a][f] - X[b][f]); let left = 0, left2 = 0;
      for (let k = 1; k < sorted.length; k++) {
        const v = y[sorted[k - 1]]; left += v; left2 += v * v;
        if (k < options.minLeaf || sorted.length - k < options.minLeaf || X[sorted[k - 1]][f] === X[sorted[k]][f]) continue;
        const loss = left2 - left * left / k + (total2 - left2) - (total - left) ** 2 / (sorted.length - k), gain = total2 - total * total / sorted.length - loss;
        if (gain > gainBest) { gainBest = gain; best = { f, cut: (X[sorted[k - 1]][f] + X[sorted[k]][f]) / 2, sorted, k }; }
      }
    }
    if (!best) return { value: m };
    return { value: m, feature: best.f, cut: best.cut, left: treeFit(X, y, best.sorted.slice(0, best.k), options, rand, depth + 1), right: treeFit(X, y, best.sorted.slice(best.k), options, rand, depth + 1) };
  }
  const treePredict = (tree, x) => tree.left ? treePredict(x[tree.feature] <= tree.cut ? tree.left : tree.right, x) : tree.value;
  function isolationTree(X, ids, depth, maxDepth, rand) {
    if (ids.length <= 1 || depth >= maxDepth) return { size: ids.length };
    const fs = sample(Array.from({ length: X[0].length }, (_, i) => i), X[0].length, rand);
    for (const f of fs) { const vals = ids.map(i => X[i][f]), lo = Math.min(...vals), hi = Math.max(...vals); if (hi <= lo) continue; const cut = lo + rand() * (hi - lo), left = ids.filter(i => X[i][f] <= cut), right = ids.filter(i => X[i][f] > cut); if (!left.length || !right.length) continue; return { f, cut, left: isolationTree(X, left, depth + 1, maxDepth, rand), right: isolationTree(X, right, depth + 1, maxDepth, rand) }; }
    return { size: ids.length };
  }
  const pathAdjustment = n => n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + .5772156649) - 2 * (n - 1) / n;
  const isolationPath = (t, x, d = 0) => t.left ? isolationPath(x[t.f] <= t.cut ? t.left : t.right, x, d + 1) : d + pathAdjustment(t.size);

  root.DashboardModules = root.DashboardModules || {};
  root.DashboardModules.models = async function (rows, ctx = {}) {
    const cards = [], seed = ctx.seed || 20261001, cache = {};
    const disabled = {
      48: '초기 실행에서 Huber IRLS의 잔차 척도 반복 계산이 브라우저 성능 한도에 맞지 않아 제외함. 요청에 따라 최적화·재구현하지 않음',
      49: '원장 최초 검증에서 이항 로지스틱 Newton법이 60회 안에 수렴하지 않음/완전분리 가능성. 요청에 따라 기법을 제외함',
      50: '원장 최초 검증에서 다항 softmax가 1200회 안에 손실 수렴 기준을 충족하지 못함. 요청에 따라 기법을 제외함'
    };
    const attempt = async (id, fn) => { try { if (disabled[id]) throw Error(disabled[id]); if (rows.length < 30) throw Error('최소 30개 거래가 필요함'); const c = fn(); if (c.metrics.some(m => typeof m.value === 'number' && !Number.isFinite(m.value))) throw Error('유효하지 않은 계산 결과'); cards.push(c); } catch (e) { cards.push(card(id, '이 기법은 적용에서 제외했습니다.', '계산·자료·수렴 조건을 충족하지 못해 결과를 표시하지 않습니다.', [], { status: 'dropped', notes: [String(e.message || e), '요청에 따라 오류가 난 기법을 추가 디버깅하거나 다른 기법으로 대체하지 않았습니다.'] })); } await new Promise(resolve => setTimeout(resolve, 0)); };
    function base() {
      if (cache.base) return cache.base;
      const part = splitTime(rows), s = schema(part.train), X = part.train.map(s.encode), XT = part.test.map(s.encode), y = part.train.map(r => r.amount / 1e6), actual = part.test.map(r => r.amount), yl = part.train.map(r => Math.log(r.amount)), logb = least(X, yl);
      return cache.base = { ...part, s, X, XT, y, yl, actual, logb };
    }
    function fittedCard(id, summary, explanation, fields, calendar, interaction) {
      const p = splitTime(rows), s = schema(p.train, fields, calendar, interaction), X = p.train.map(s.encode), XT = p.test.map(s.encode), b = least(X, p.train.map(r => r.amount / 1e6));
      const result = predictionCard(id, summary, explanation, p.test.map(r => r.amount), predict(XT, b).map(v => v * 1e6), mean(p.train.map(r => r.amount)), p.cut);
      result.table = { headers: ['변수(기준범주 대비)', '추정 계수(원)'], rows: s.names.map((n, i) => [n, Math.round(b[i] * 1e6)]).slice(0, 25) };
      result.notes.push('연속형 종속변수: 원금액. 최소제곱법의 점 추정과 보류 구간 예측 오차입니다. 음수 예측을 임의로 0으로 자르지 않습니다.', '범주별 첫 정렬값이 기준범주입니다. 검증의 새로운 범주는 기준값으로 인코딩합니다.'); return result;
    }
    await attempt(42, () => fittedCard(42, '여러 조건을 함께 고려한 원금액 회귀', '부서·결제수단·거래 구분·요일·기간 진행을 동시에 넣어 금액의 선형 차이를 추정합니다.', ['department', 'payment', 'type'], true, false));
    await attempt(43, () => fittedCard(43, '범주형 요인별 금액 차이', '부서·결제수단·거래 구분의 주효과를 더미변수 요인모형으로 추정합니다. 다중선형회귀와 같은 최소제곱 틀입니다.', ['department', 'payment', 'type'], false, false));
    await attempt(44, () => {
      const c = fittedCard(44, '부서에 따라 달라지는 결제수단 효과', '부서 × 결제수단 상호작용을 포함한 최소제곱 모형입니다. 빈 조합은 계수를 만들지 않습니다.', ['department', 'payment', 'type'], false, true);
      c.notes.push('희소한 조합의 계수는 불안정할 수 있습니다. 상호작용의 유의확률은 산출하지 않았습니다.'); return c;
    });
    await attempt(45, () => {
      const d = base(), smear = mean(d.yl.map((v, i) => Math.exp(v - dot(d.X[i], d.logb)))), fitted = predict(d.XT, d.logb).map(v => Math.exp(v) * smear);
      const c = predictionCard(45, '로그 변환으로 큰 금액의 영향을 완화', '로그금액의 선형 관계를 추정한 뒤 학습 잔차의 Duan smearing 계수로 원 단위 조건부 평균을 근사합니다.', d.actual, fitted, mean(d.train.map(r => r.amount)), d.cut);
      c.metrics.push(metric('Smearing 계수', smear)); c.notes.push('공통 smearing은 잔차 분포가 설명변수에 따라 크게 달라지면 편향될 수 있습니다.'); return c;
    });
    await attempt(46, () => {
      const d = base(), b = iterativeGLM(d.X, d.y, 'gamma', 0, d.logb.map((v, i) => i ? v : v - Math.log(1e6)));
      const c = predictionCard(46, '양수 금액의 조건부 평균을 Gamma GLM으로 추정', 'Gamma 분포·로그 연결함수의 우도 목적함수를 Newton법과 단계 축소로 최소화합니다. 양수이고 큰 금액 쪽으로 치우친 금액에 맞춘 평균 모형입니다.', d.actual, predict(d.XT, b).map(v => Math.exp(v) * 1e6), mean(d.train.map(r => r.amount)), d.cut);
      c.notes.push('조건부 분산이 평균 제곱에 비례한다는 가정입니다. 회귀계수의 유의확률·인과 해석은 제공하지 않습니다.'); return c;
    });
    await attempt(47, () => {
      const d = base(), b50 = quantileADMM(d.X, d.yl, .5), b90 = quantileADMM(d.X, d.yl, .9), q50 = predict(d.XT, b50).map(Math.exp), q90 = predict(d.XT, b90).map(Math.exp), crossing = mean(q50.map((v, i) => v > q90[i] ? 1 : 0));
      const loss = (pred, tau) => mean(d.actual.map((v, i) => { const e = v - pred[i]; return Math.max(tau * e, (tau - 1) * e); }));
      return card(47, '중앙값과 상위 90% 거래금액을 별도로 추정', '로그금액의 0.5·0.9 분위수 선형회귀를 pinball loss ADMM 최적화로 적합합니다. 지수변환은 분위수를 보존하므로 평균용 smearing은 쓰지 않습니다.', [metric('중앙값 검증 손실', loss(q50, .5), 'money'), metric('90% 검증 손실', loss(q90, .9), 'money'), metric('90% 이하 실제 비중', mean(d.actual.map((v, i) => v <= q90[i] ? 1 : 0)), 'percent')], { status: 'limited', chart: { type: 'line', labels: d.test.slice(0, 80).map(r => '#' + r.id), series: [{ name: '조건부 중앙값', values: q50.slice(0, 80) }, { name: '조건부 90% 분위수', values: q90.slice(0, 80) }] }, notes: [noteTime(d.cut), 'ADMM 최대 500회, primal·dual RMS 허용오차 0.002(로그 단위). 계수 신뢰구간은 미산출.', `분위수 교차 비중 ${(crossing * 100).toFixed(2)}%. 표시 곡선은 검증 첫 80건입니다.`] });
    });
    await attempt(48, () => {
      throw Error('초기 실행에서 Huber IRLS의 잔차 척도 반복 계산이 브라우저 성능 한도에 맞지 않아 제외함. 요청에 따라 최적화·재구현하지 않음');
    });
    await attempt(49, () => {
      const d = base(), threshold = quantile(d.train.map(r => r.amount), .9), y = d.train.map(r => r.amount > threshold ? 1 : 0); let b = Array(d.X[0].length).fill(0), converged = false;
      const sigmoid = v => 1 / (1 + Math.exp(-clamp(v, -30, 30)));
      const loss = beta => mean(y.map((v, i) => { const p = clamp(sigmoid(dot(d.X[i], beta)), EPS, 1 - EPS); return -v * Math.log(p) - (1 - v) * Math.log(1 - p); }));
      for (let it = 0; it < 60; it++) { const p = predict(d.X, b).map(sigmoid), w = p.map(v => Math.max(1e-7, v * (1 - v))), z = y.map((v, i) => dot(d.X[i], b) + (v - p[i]) / w[i]), next = least(d.X, z, w), delta = next.map((v, j) => v - b[j]); let step = 1, candidate; while (step > 1 / 1024) { candidate = b.map((v, j) => v + step * delta[j]); if (loss(candidate) <= loss(b) + 1e-9) break; step /= 2; } const change = Math.max(...candidate.map((v, j) => Math.abs(v - b[j]))); b = candidate; if (change < 1e-5) { converged = true; break; } }
      if (!converged) throw Error('이항 로지스틱 Newton법이 수렴하지 않음/완전분리 가능성');
      const p = predict(d.XT, b).map(sigmoid), yt = d.actual.map(v => v > threshold ? 1 : 0), rate = mean(y);
      return card(49, '학습자료 상위 10% 기준을 넘는 확률', '금액은 정답 생성에만 쓰고 설명변수에서는 제외합니다. 부서·결제수단·거래 구분·요일·날짜로 고액 사건을 이항 로지스틱 회귀합니다.', [metric('고액 기준', threshold, 'money'), metric('검증 Brier 점수', mean(yt.map((v, i) => (v - p[i]) ** 2))), metric('빈도 기준 Brier', mean(yt.map(v => (v - rate) ** 2)))], { chart: { type: 'bar', labels: ['실제 고액 비율', '평균 예측 확률'], series: [{ name: '비율', values: [mean(yt), mean(p)] }] }, notes: [noteTime(d.cut), '기준은 학습 구간에서만 결정했습니다. Brier 점수는 작을수록 좋습니다. 사후 분류 정확도만으로 불균형 자료를 평가하지 않습니다.'] });
    });
    await attempt(50, () => {
      const d = splitTime(rows), levels = uniq(d.train.map(r => r.payment)); if (levels.length < 2) throw Error('결제수단이 한 종류뿐임'); const s = schema(d.train, ['department', 'type']), X = d.train.map(s.encode), XT = d.test.map(s.encode), p = X[0].length, K = levels.length, y = d.train.map(r => levels.indexOf(r.payment)); let W = Array.from({ length: K }, () => Array(p).fill(0)), converged = false;
      function probabilities(x) { const z = W.map(w => dot(x, w)), top = Math.max(...z), e = z.map(v => Math.exp(v - top)), total = sum(e); return e.map(v => v / total); }
      let old = Infinity; const rate = .75 / Math.max(...X.map(x => dot(x, x)));
      for (let it = 0; it < 1200; it++) { const grad = Array.from({ length: K }, () => Array(p).fill(0)); let loss = 0;
        for (let i = 0; i < X.length; i++) { const prob = probabilities(X[i]); loss -= Math.log(Math.max(EPS, prob[y[i]])); for (let k = 0; k < K; k++) { const e = prob[k] - (y[i] === k ? 1 : 0); for (let j = 0; j < p; j++) grad[k][j] += e * X[i][j]; } }
        loss /= X.length; for (let k = 0; k < K; k++) for (let j = 0; j < p; j++) W[k][j] -= rate * grad[k][j] / X.length;
        if (it > 50 && Math.abs(old - loss) < 1e-6) { converged = true; break; } old = loss;
      }
      if (!converged) throw Error('다항 softmax 1200회 안에 손실 수렴 기준을 충족하지 못함');
      const probs = XT.map(probabilities), freq = levels.map((_, k) => mean(y.map(v => v === k ? 1 : 0))); if (d.test.some(r => !levels.includes(r.payment))) throw Error('검증 구간에 학습되지 않은 결제수단이 존재');
      const ll = mean(d.test.map((r, i) => -Math.log(Math.max(EPS, probs[i][levels.indexOf(r.payment)])))), baseLL = mean(d.test.map(r => -Math.log(Math.max(EPS, freq[levels.indexOf(r.payment)]))));
      return card(50, '결제수단의 구성 확률을 다항 회귀로 분석', '부서·거래 구분·요일·기간으로 모든 결제수단의 softmax 확률을 함께 학습합니다. 정답인 결제수단과 금액은 설명변수에 포함하지 않습니다.', [metric('검증 로그손실', ll), metric('빈도 기준 로그손실', baseLL)], { chart: { type: 'bar', labels: levels, series: [{ name: '실제 비율', values: levels.map(k => mean(d.test.map(r => r.payment === k ? 1 : 0))) }, { name: '예측 비율', values: levels.map((_, k) => mean(probs.map(p => p[k]))) }] }, notes: [noteTime(d.cut), '비정규화 softmax 다항 로지스틱, 손실 변화 허용오차 1e-6. 범주들의 순서를 가정하지 않습니다.'] });
    });
    function countData() { if (cache.count) return cache.count; const days = daily(rows), n = Math.floor(days.length * .8); if (n < 20) throw Error('건수 회귀에 최소 25일 필요'); const train = days.slice(0, n), test = days.slice(n), first = Date.parse(days[0].date), span = Date.parse(train.at(-1).date) - first, X = countDesign(train, first, span), XT = countDesign(test, first, span), y = train.map(r => r.count); return cache.count = { days, train, test, X, XT, y }; }
    function countCard(id, b, d, explanation, alpha) { const actual = d.test.map(r => r.count), fitted = predict(d.XT, b).map(Math.exp), trainMu = predict(d.X, b).map(Math.exp), pearson = sum(d.y.map((v, i) => (v - trainMu[i]) ** 2 / (trainMu[i] + (alpha || 0) * trainMu[i] ** 2))) / (d.y.length - b.length); const c = card(id, id === 51 ? '요일과 추세를 고려한 일별 거래 건수' : '조건부 과산포를 허용한 거래 건수 모형', explanation, [metric('검증 건수 MAE', quality(actual, fitted).mae), metric('학습 Pearson 분산비', pearson)], { chart: { type: 'line', labels: d.test.map(r => r.date), series: [{ name: '실제 건수', values: actual }, { name: '예측 건수', values: fitted }] }, notes: [noteTime(d.test[0].date), '관측 범위의 누락 날짜는 거래 건수 0으로 포함합니다. 기간 진행과 요일을 설명변수로 사용합니다.'] }); if (alpha !== undefined) c.metrics.push(metric('NB2 alpha', alpha)); return c; }
    await attempt(51, () => { const d = countData(), b = iterativeGLM(d.X, d.y, 'poisson'); cache.poisson = b; return countCard(51, b, d, '일별 거래 건수에 Poisson GLM(로그 연결함수)을 적합합니다. 평균=조건부 분산 가정을 Pearson 분산비로 함께 확인합니다.'); });
    await attempt(52, () => {
      const d = countData(), pb = cache.poisson || iterativeGLM(d.X, d.y, 'poisson'), mu = predict(d.X, pb).map(Math.exp), alpha = Math.max(0, sum(d.y.map((v, i) => (v - mu[i]) ** 2 - mu[i])) / sum(mu.map(v => v * v)));
      if (alpha < 1e-6) throw Error('Poisson 잔차에서 양의 NB2 과산포를 추정할 수 없음');
      const b = iterativeGLM(d.X, d.y, 'nb', alpha, pb), c = countCard(52, b, d, 'Poisson 잔차의 적률 추정으로 NB2 과산포 alpha를 구한 뒤, 이 값을 고정한 음이항 GLM을 적합합니다. 분산=평균+alpha×평균²입니다.', alpha); c.status = 'limited'; c.notes.push('Alpha의 적률 대입 추정이며 모든 모수의 공동 최대우도 추정이 아닙니다. Alpha 불확실성·계수 검정은 제공하지 않습니다.'); return c;
    });
    await attempt(53, () => {
      const days = daily(rows).filter(r => r.meanlog !== null), n = Math.floor(days.length * .8), train = days.slice(0, n), test = days.slice(n); if (n < 30) throw Error('GAM에 최소 38개 관측 날짜 필요'); const first = Date.parse(train[0].date), span = Date.parse(train.at(-1).date) - first, knots = [0, 0, 0, 0, .2, .4, .6, .8, 1, 1, 1, 1], nb = 8;
      function bs(i, degree, x) { if (!degree) return x >= knots[i] && x < knots[i + 1] ? 1 : 0; const a = knots[i + degree] - knots[i], b = knots[i + degree + 1] - knots[i + 1]; return (a ? (x - knots[i]) / a * bs(i, degree - 1, x) : 0) + (b ? (knots[i + degree + 1] - x) / b * bs(i + 1, degree - 1, x) : 0); }
      const encode = r => { const t = clamp((Date.parse(r.date) - first) / span, 0, 1 - 1e-9), weekday = new Date(r.date + 'T00:00:00Z').getUTCDay(); return [...Array.from({ length: nb }, (_, i) => bs(i, 3, t)), ...Array.from({ length: 6 }, (_, i) => weekday === i + 1 ? 1 : 0)]; };
      const X = train.map(encode), y = train.map(r => r.meanlog), { A, b } = cross(X, y), P = Array.from({ length: b.length }, () => Array(b.length).fill(0));
      for (let k = 0; k < nb - 2; k++) for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) P[k + a][k + c] += [1, -2, 1][a] * [1, -2, 1][c];
      let best;
      for (const lambda of [.01, .1, 1, 10, 100]) { const M = A.map((row, i) => row.map((v, j) => v + lambda * P[i][j])), beta = solve(M, b); let df = 0; for (let j = 0; j < b.length; j++) df += solve(M, A.map(row => row[j]))[j]; const gcv = sum(y.map((v, i) => (v - dot(X[i], beta)) ** 2)) / n / (1 - df / n) ** 2; if (!best || gcv < best.gcv) best = { beta, lambda, df, gcv }; }
      const fitted = test.map(r => dot(encode(r), best.beta));
      return card(53, '완만한 날짜 곡선과 요일 효과를 함께 추정', '일별 평균 로그금액을 Gaussian GAM으로 분석합니다. 날짜는 8개 cubic B-spline 기저와 2차 차분 벌점, 요일은 범주형 효과입니다. 학습 GCV로 평활도를 선택합니다.', [metric('검증 로그금액 RMSE', quality(test.map(r => r.meanlog), fitted).rmse), metric('평활 벌점 λ', best.lambda), metric('유효 자유도', best.df)], { status: 'limited', chart: { type: 'line', labels: days.map(r => r.date), series: [{ name: '일별 평균 로그금액', values: days.map(r => r.meanlog) }, { name: 'GAM 적합/검증', values: days.map(r => dot(encode(r), best.beta)) }] }, notes: [noteTime(test[0].date), '학습범위 밖 날짜는 날짜 평활효과를 끝값으로 유지하며 요일효과만 변합니다. 장기 외삽용 곡선이 아닙니다.', '일별 평균 로그금액에 동일 날짜 가중치를 부여합니다. 원금액 산술평균을 직접 추정하지 않습니다.'] });
    });
    await attempt(54, () => {
      const gs = groups(rows, r => r.department).map(([name, rr]) => { const a = rr.map(r => Math.log(r.amount)), m = mean(a); return { name, n: a.length, m, ss: sum(a.map(v => (v - m) ** 2)) }; }); if (gs.length < 3) throw Error('임의절편 추정에 최소 3개 부서가 필요함');
      const N = rows.length, within = sum(gs.map(g => g.ss)), allVariance = variance(rows.map(r => Math.log(r.amount))), objective = (s2, t2) => { const weights = gs.map(g => 1 / (t2 + s2 / g.n)), mu = sum(gs.map((g, i) => weights[i] * g.m)) / sum(weights); const value = (N - gs.length) * Math.log(s2) + sum(gs.map(g => Math.log(s2 + g.n * t2))) + within / s2 + sum(gs.map(g => g.n * (g.m - mu) ** 2 / (s2 + g.n * t2))) + Math.log(sum(gs.map(g => g.n / (s2 + g.n * t2)))); return { value, mu }; };
      let best = null;
      for (let a = 0; a <= 45; a++) for (let b = 0; b <= 45; b++) { const s2 = allVariance * Math.exp(-4 + a * 6 / 45), t2 = b ? allVariance * Math.exp(-7 + b * 8 / 45) : 0, z = objective(s2, t2); if (!best || z.value < best.value) best = { ...z, s2, t2 }; }
      const estimated = gs.map(g => best.mu + (best.t2 / (best.t2 + best.s2 / g.n)) * (g.m - best.mu));
      return card(54, '부서별 로그금액을 임의절편으로 부분 풀링', '로그금액 = 공통 절편 + 부서 임의절편 + 잔차인 Gaussian 혼합효과모형입니다. 주변 공분산의 REML 목적함수를 46×46 분산 격자에서 평가하고 부서 BLUP를 산출합니다.', [metric('부서 간 분산', best.t2), metric('부서 내 분산', best.s2), metric('ICC', best.t2 / (best.t2 + best.s2))], { status: 'limited', chart: { type: 'bar', labels: gs.map(g => g.name), series: [{ name: '부서 평균 로그금액', values: gs.map(g => g.m) }, { name: '부분 풀링 추정', values: estimated }] }, notes: ['설명용 전체자료 적합이며 미래 예측 성능은 주장하지 않습니다. 거래 구분·결제수단을 보정하지 않은 부서 임의절편 모형입니다.', '제한된 분산 격자 탐색의 근사 REML입니다. 로그금액 척도의 정규성·조건부 독립을 가정하며 표준오차는 제공하지 않습니다.'] });
    });
    await attempt(55, () => {
      const gs = groups(rows, r => r.department).map(([name, rr]) => { const a = rr.map(r => Math.log(r.amount)); return { name, n: a.length, total: sum(a), total2: sum(a.map(v => v * v)), m: mean(a) }; }); if (gs.length < 3) throw Error('계층모형에 최소 3개 부서가 필요함');
      const chains = [], warm = 800, draws = 800;
      for (let ch = 0; ch < 4; ch++) {
        const rand = rng(seed + 1009 * ch); let mu = 10 + 3 * ch, s2 = 1 + ch, t2 = .5 + ch, theta = gs.map(g => g.m + normal(rand)); const samples = [];
        for (let iter = 0; iter < warm + draws; iter++) {
          for (let j = 0; j < gs.length; j++) { const g = gs[j], v = 1 / (g.n / s2 + 1 / t2), m = v * (g.total / s2 + mu / t2); theta[j] = m + Math.sqrt(v) * normal(rand); }
          const vm = 1 / (gs.length / t2 + .01); mu = vm * sum(theta) / t2 + Math.sqrt(vm) * normal(rand);
          const ss = sum(gs.map((g, j) => g.total2 - 2 * theta[j] * g.total + g.n * theta[j] ** 2)); s2 = (1 + .5 * ss) / gammaDraw(2 + rows.length / 2, rand); t2 = (1 + .5 * sum(theta.map(v => (v - mu) ** 2))) / gammaDraw(2 + gs.length / 2, rand);
          if (iter >= warm) samples.push([mu, s2, t2, ...theta]);
        }
        chains.push(samples);
      }
      // Split-chain R-hat plus an initial-positive-sequence autocorrelation ESS.
      const halves = chains.flatMap(c => [c.slice(0, draws / 2), c.slice(draws / 2)]), len = draws / 2, diagnostics = [];
      for (let j = 0; j < 3 + gs.length; j++) {
        const a = halves.map(c => c.map(r => r[j])), W = mean(a.map(variance)), B = len * variance(a.map(mean)), vplus = (len - 1) / len * W + B / len, rh = Math.sqrt(vplus / W); let autocorr = 0;
        for (let lag = 1; lag < 100; lag += 2) { let pair = 0; for (let l = lag; l <= lag + 1; l++) { const rho = mean(a.map(c => { const m = mean(c); return sum(c.slice(l).map((v, k) => (v - m) * (c[k] - m))) / ((len - l) * variance(c)); })); pair += rho; } if (pair < 0) break; autocorr += pair; }
        diagnostics.push({ rh, ess: halves.length * len / (1 + 2 * Math.max(0, autocorr)) });
      }
      const maxRhat = Math.max(...diagnostics.map(d => d.rh)), minESS = Math.min(...diagnostics.map(d => d.ess)); if (!Number.isFinite(maxRhat) || maxRhat > 1.05 || minESS < 100) throw Error(`계층 Gibbs 수렴 진단 미통과: 최대 split R-hat=${maxRhat.toFixed(3)}, 최소 ESS=${minESS.toFixed(0)}`);
      const all = chains.flat(), table = gs.map((g, j) => { const a = all.map(r => r[j + 3]); return [g.name, g.n, +mean(a).toFixed(3), +quantile(a, .025).toFixed(3), +quantile(a, .975).toFixed(3)]; });
      return card(55, '부서 평균의 베이지안 부분 풀링과 신용구간', '로그금액의 정규 계층모형을 conjugate Gibbs sampler 4개 체인으로 적합합니다. 부서 평균은 공통 평균·분산을 공유하고 부서 내 잔차분산을 추정합니다.', [metric('최대 split R-hat', maxRhat), metric('최소 근사 ESS', minESS), metric('체인별 보존 표본', draws)], { status: 'limited', table: { headers: ['부서', '건수', '평균 로그금액', '95% 하한', '95% 상한'], rows: table }, chart: { type: 'bar', labels: gs.map(g => g.name), series: [{ name: '사후 평균 로그금액', values: table.map(r => r[2]) }] }, notes: ['사전분포: μ~N(0,100), σ²·τ²~Inverse-Gamma(shape=2, scale=1). 체인별 warm-up 800 + 보존 800회, 고정 시드.', '허용기준: 모든 평균·분산 모수 split R-hat≤1.05, 초기 양의 자기상관합 근사 ESS≥100. Rank-normalized 진단·사전 민감도 분석은 미제공.', '전체자료 설명용 모형이며 거래 구분·결제수단을 보정하지 않았습니다. 구간은 부서 로그평균의 신용구간이며 개별 거래 예측구간이 아닙니다.'] });
    });
    await attempt(75, () => {
      const scored = []; let omitted = 0;
      for (const [, rr] of groups(rows)) { if (rr.length < 8) { omitted += rr.length; continue; } const a = rr.map(r => r.amount), q1 = quantile(a, .25), q3 = quantile(a, .75), spread = q3 - q1; if (!spread) { omitted += rr.length; continue; } rr.forEach(r => scored.push({ row: r, score: Math.max((q1 - r.amount) / spread, (r.amount - q3) / spread, 0) })); }
      if (!scored.length) throw Error('IQR을 구할 충분한 집단 자료가 없음');
      return anomalyCard(75, '같은 부서·거래 구분의 IQR 범위 밖 거래', '매출/매입 × 부서별 Q1·Q3을 구해 Q1−1.5×IQR 미만 또는 Q3+1.5×IQR 초과 거래를 찾습니다.', scored, [`점수는 가까운 사분위 경계로부터 IQR 배수이며 1.5 초과가 후보입니다. 8건 미만 또는 IQR=0인 ${omitted}건은 평가에서 제외했습니다.`], 1.5);
    });
    await attempt(76, () => {
      const scored = []; let omitted = 0;
      for (const [, rr] of groups(rows)) { if (rr.length < 8) { omitted += rr.length; continue; } const a = rr.map(r => Math.log(r.amount)), m = quantile(a, .5), mad = quantile(a.map(v => Math.abs(v - m)), .5); if (!mad) { omitted += rr.length; continue; } rr.forEach(r => scored.push({ row: r, score: Math.abs(Math.log(r.amount) - m) / (1.4826 * mad) })); }
      if (!scored.length) throw Error('MAD를 구할 충분한 집단 자료가 없음');
      return anomalyCard(76, '로그금액이 집단의 전형적 값에서 먼 거래', '매출/매입 × 부서별 로그금액 중앙값과 MAD를 계산합니다. 강한 원금액 왜도를 완화한 후 robust z 절댓값 3.5 초과를 표시합니다.', scored, [`척도=1.4826×MAD. 8건 미만 또는 MAD=0인 ${omitted}건은 제외했습니다. 정상분포 유의확률이나 오류 판정으로 해석하지 않습니다.`], 3.5);
    });
    await attempt(77, () => {
      const d = base(), residual = d.yl.map((v, i) => v - dot(d.X[i], d.logb)), m = quantile(residual, .5), scale = 1.4826 * quantile(residual.map(v => Math.abs(v - m)), .5); if (!(scale > EPS)) throw Error('회귀 잔차 MAD가 0'); const scored = d.test.map((r, i) => ({ row: r, score: Math.abs(Math.log(r.amount) - dot(d.XT[i], d.logb) - m) / scale }));
      return anomalyCard(77, '설명 조건 대비 로그금액 잔차가 큰 거래', '학습 구간의 로그금액 회귀로 검증 거래를 예측하고, 학습 잔차 MAD로 표준화한 오차를 비교합니다.', scored, [noteTime(d.cut), '학습 잔차의 공통 척도를 사용합니다. 집단별 이분산이 남으면 점수가 영향을 받습니다. robust z>3.5 기준.'], 3.5);
    });
    await attempt(78, () => {
      const dates = uniq(rows.map(r => r.date)), c1 = dates[Math.floor(dates.length * .6)], c2 = dates[Math.floor(dates.length * .8)], train = rows.filter(r => r.date < c1), cal = rows.filter(r => r.date >= c1 && r.date < c2), test = rows.filter(r => r.date >= c2); if (cal.length < 50) throw Error('예측구간 보정에 최소 50건 필요'); const s = schema(train), X = train.map(s.encode), beta = least(X, train.map(r => Math.log(r.amount))), residual = cal.map(r => Math.abs(Math.log(r.amount) - dot(s.encode(r), beta))).sort((a, b) => a - b), q = residual[Math.min(residual.length - 1, Math.ceil((residual.length + 1) * .95) - 1)], scored = test.map(r => ({ row: r, score: Math.abs(Math.log(r.amount) - dot(s.encode(r), beta)) / q }));
      const c = anomalyCard(78, '보정된 개별 거래 95% 예측구간 밖 후보', '날짜 앞 60%로 로그회귀를 학습하고 다음 20%의 절대 잔차로 split conformal 구간을 보정합니다. 마지막 20% 거래가 exp(예측 로그금액±보정 분위수) 안에 드는지 평가합니다.', scored, [`학습 <${c1}, 보정 ${c1}~${c2} 전일, 검증 ≥${c2}. 점수>1은 구간 밖입니다.`, '95%는 명목 수준입니다. 시간 분리 자료에서는 교환가능성이 보장되지 않아 미래 95% 포괄을 보장하지 않습니다.'], 1); c.metrics.push(metric('검증 실제 포괄률', mean(scored.map(r => r.score <= 1 ? 1 : 0)), 'percent')); return c;
    });
    function anomalyFeatures(a) { const s = schema(a), logs = a.map(r => Math.log(r.amount)), m = mean(logs), sd = Math.sqrt(variance(logs)) || 1; return a.map((r, i) => [(logs[i] - m) / sd, ...s.encode(r).slice(1)]); }
    await attempt(79, () => {
      const rand = rng(seed + 79), X = anomalyFeatures(rows), ids = rows.map((_, i) => i), n = Math.min(256, rows.length), forest = Array.from({ length: 48 }, () => isolationTree(X, sample(ids, n, rand), 0, Math.ceil(Math.log2(n)), rand)), c = pathAdjustment(n), scored = rows.map((r, i) => ({ row: r, score: Math.pow(2, -mean(forest.map(t => isolationPath(t, X[i]))) / c) }));
      return anomalyCard(79, '무작위 분할에서 빨리 고립되는 특성 조합', 'Isolation Forest의 무작위 특성·분할 나무에서 평균 경로 길이를 구하고 2^(−경로/c(n)) 이상도 점수로 변환합니다.', scored, ['48개 실제 isolation tree, 나무마다 최대 256건 비복원 표본, 최대 깊이 ceil(log2(표본수)), 고정 시드.', '특성: 표준화 로그금액·기간·요일·부서·결제수단·거래 구분 one-hot. 전체 거래를 평가하고 상위 2%를 검토 후보로 표시합니다.']);
    });
    await attempt(80, () => {
      const rr = sample(rows, Math.min(500, rows.length), rng(seed + 80)), X = anomalyFeatures(rr), N = rr.length, K = Math.min(20, N - 1), D = Array.from({ length: N }, () => new Float64Array(N));
      for (let i = 0; i < N; i++) for (let j = 0; j < i; j++) { D[i][j] = D[j][i] = Math.sqrt(sum(X[i].map((v, f) => (v - X[j][f]) ** 2))); }
      const sorted = X.map((_, i) => Array.from({ length: N }, (_, j) => j).filter(j => j !== i).sort((a, b) => D[i][a] - D[i][b])), kd = sorted.map((a, i) => D[i][a[K - 1]]), neighbors = sorted.map((a, i) => a.filter(j => D[i][j] <= kd[i] + EPS)), lrd = neighbors.map((a, i) => 1 / Math.max(EPS, mean(a.map(j => Math.max(kd[j], D[i][j]))))), scored = rr.map((r, i) => ({ row: r, score: mean(neighbors[i].map(j => lrd[j] / lrd[i])) }));
      const c = anomalyCard(80, '이웃 거래보다 국소 밀도가 낮은 거래', 'k-distance 이웃과 도달거리를 구한 뒤 이웃의 local reachability density를 자신의 밀도와 비교하는 LOF를 계산합니다. 경계의 같은 거리 이웃도 포함합니다.', scored, [`시간과 무관한 시드 고정 단순무작위 표본 ${N}건 안에서만 평가, k=${K}. 전체 8,000건 탐지 결과가 아닙니다.`, '표준화 로그금액과 날짜·범주 one-hot의 Euclidean 거리. LOF≈1은 비슷한 밀도, 큰 값은 희소한 주변 구조입니다.']); c.status = 'limited'; return c;
    });
    await attempt(81, () => {
      const rr = sample(rows, Math.min(320, rows.length), rng(seed + 81)), n = rr.length, logs = rr.map(r => Math.log(r.amount)), times = rr.map(r => Date.parse(r.date)), lr = Math.max(...logs) - Math.min(...logs) || 1, tr = Math.max(...times) - Math.min(...times) || 1, D = Array.from({ length: n }, () => new Float64Array(n));
      for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) D[i][j] = D[j][i] = (Math.abs(logs[i] - logs[j]) / lr + Math.abs(times[i] - times[j]) / tr + (rr[i].department === rr[j].department ? 0 : 1) + (rr[i].payment === rr[j].payment ? 0 : 1) + (rr[i].type === rr[j].type ? 0 : 1)) / 5;
      const K = 4, medoids = [0]; while (medoids.length < K) { let best = -1, distance = -1; for (let i = 0; i < n; i++) { if (medoids.includes(i)) continue; const d = Math.min(...medoids.map(j => D[i][j])); if (d > distance) { distance = d; best = i; } } medoids.push(best); }
      let labels;
      for (let it = 0; it < 20; it++) { labels = rr.map((_, i) => { let k = 0; for (let j = 1; j < K; j++) if (D[i][medoids[j]] < D[i][medoids[k]]) k = j; return k; }); let changed = false; for (let k = 0; k < K; k++) { const members = labels.map((v, i) => v === k ? i : -1).filter(i => i >= 0); if (!members.length) continue; let best = medoids[k], cost = Infinity; for (const i of members) { const d = sum(members.map(j => D[i][j])); if (d < cost) { cost = d; best = i; } } if (best !== medoids[k]) { medoids[k] = best; changed = true; } } if (!changed) break; }
      labels = rr.map((_, i) => { let k = 0; for (let j = 1; j < K; j++) if (D[i][medoids[j]] < D[i][medoids[k]]) k = j; return k; });
      const sil = mean(rr.map((_, i) => { const own = labels.map((v, j) => v === labels[i] && j !== i ? j : -1).filter(j => j >= 0); if (!own.length) return 0; const a = mean(own.map(j => D[i][j])), b = Math.min(...Array.from({ length: K }, (_, k) => k).filter(k => k !== labels[i]).map(k => { const members = labels.map((v, j) => v === k ? j : -1).filter(j => j >= 0); return members.length ? mean(members.map(j => D[i][j])) : Infinity; })); return (b - a) / Math.max(a, b); }));
      const counts = Array.from({ length: K }, (_, k) => labels.filter(v => v === k).length);
      return card(81, '혼합형 특성을 Gower 거리로 묶은 4개 유형', '로그금액·날짜는 범위로 정규화하고 범주 세 개는 일치/불일치로 계산한 Gower 거리입니다. 실제 관측값을 중심으로 삼는 교대 k-medoids 군집화를 수행합니다.', [metric('표본 거래', n), metric('평균 silhouette', sil)], { status: 'limited', chart: { type: 'bar', labels: counts.map((_, i) => '군집 ' + (i + 1)), series: [{ name: '표본 건수', values: counts }] }, table: { headers: ['군집', '건수', '대표 원본 행', '부서', '결제수단', '대표 금액(원)'], rows: medoids.map((i, k) => [k + 1, counts[k], rr[i].id, rr[i].department, rr[i].payment, rr[i].amount]) }, notes: [`시드 고정 단순무작위 표본 ${n}건에만 적용합니다. 5개 변수 동일 가중치, 고정 군집 수 4, 최대 20회 medoid 갱신.`, 'PAM 전체 swap 최적화가 아닌 교대 k-medoids입니다. 군집 수 최적화·표본 안정성 검증은 미제공.'] });
    });
    await attempt(82, () => {
      const profiles = groups(rows, r => r.date).map(([date, rr]) => ({ date, values: [Math.log(rr.length), mean(rr.map(r => Math.log(r.amount))), mean(rr.map(r => r.type === '매출' ? 1 : 0)), mean(rr.map(r => r.payment === '카드' ? 1 : 0))] })).sort((a, b) => a.date.localeCompare(b.date)); if (profiles.length > 200) throw Error('계층군집은 최대 200개 날짜 프로필만 지원'); if (profiles.length < 5) throw Error('날짜 프로필이 부족함');
      const averages = profiles[0].values.map((_, j) => mean(profiles.map(r => r.values[j]))), deviations = averages.map((_, j) => Math.sqrt(variance(profiles.map(r => r.values[j]))) || 1), X = profiles.map(r => r.values.map((v, j) => (v - averages[j]) / deviations[j])), distances = X.map(a => X.map(b => Math.sqrt(sum(a.map((v, j) => (v - b[j]) ** 2))))); let clusters = X.map((_, i) => [i]); const merges = [];
      while (clusters.length > 4) { let best = Infinity, pair; for (let a = 0; a < clusters.length; a++) for (let b = 0; b < a; b++) { const distance = sum(clusters[a].flatMap(i => clusters[b].map(j => distances[i][j]))) / (clusters[a].length * clusters[b].length); if (distance < best) { best = distance; pair = [a, b]; } } const [a, b] = pair, merged = [...clusters[a], ...clusters[b]]; merges.push(best); clusters[b] = merged; clusters.splice(a, 1); }
      return card(82, '비슷한 날짜 프로필의 평균연결 계층군집', '날짜별 로그 거래 건수·평균 로그금액·매출 비율·카드 비율을 표준화하고 Euclidean 거리의 average-linkage로 네 집단까지 합칩니다.', [metric('날짜 수', profiles.length), metric('마지막 병합 거리', merges.at(-1))], { chart: { type: 'bar', labels: clusters.map((_, k) => '군집 ' + (k + 1)), series: [{ name: '포함 날짜 수', values: clusters.map(c => c.length) }] }, table: { headers: ['군집', '날짜 수', '첫 날짜', '평균 거래 건수', '날짜 목록(앞 6개)'], rows: clusters.map((c, k) => [k + 1, c.length, profiles[Math.min(...c)].date, Math.round(mean(c.map(i => Math.exp(profiles[i].values[0])))), c.slice().sort((a, b) => a - b).slice(0, 6).map(i => profiles[i].date).join(', ')]) }, notes: ['거래 행 군집이 아니라 날짜 프로필 군집입니다. 군집 수는 4로 고정했으며 계절성·인과 유형으로 확정하지 않습니다.'] });
    });
    function treeData() { const d = base(); return { ...d, features: d.X.map(x => x.slice(1)), validation: d.XT.map(x => x.slice(1)), target: d.yl }; }
    function treeCard(id, title, explain, d, trainPred, testPred, extraNotes) {
      const smear = mean(d.target.map((v, i) => Math.exp(v - trainPred[i]))), c = predictionCard(id, title, explain, d.actual, testPred.map(v => Math.exp(v) * smear), mean(d.train.map(r => r.amount)), d.cut);
      c.notes.push(...extraNotes, `로그금액 예측에 학습 잔차 smearing=${smear.toFixed(3)}을 적용했습니다. 공통 보정이어서 조건별 편향이 남을 수 있습니다.`); return c;
    }
    await attempt(83, () => { const d = treeData(), rand = rng(seed + 83), tree = treeFit(d.features, d.target, d.features.map((_, i) => i), { depth: 4, minLeaf: 60 }, rand); return treeCard(83, '조건 분기로 로그 거래금액을 예측', '각 노드에서 실제 제곱오차 감소가 가장 큰 특성과 경계값을 고르는 CART 회귀나무입니다. 금액을 설명변수로 쓰지 않습니다.', d, d.features.map(x => treePredict(tree, x)), d.validation.map(x => treePredict(tree, x)), ['최대 깊이 4, 말단 최소 60건, 학습 거래 전체. 설명변수는 부서·결제수단·거래 구분·요일·기간입니다.']); });
    await attempt(84, () => {
      const d = treeData(), rand = rng(seed + 84), mtry = Math.max(1, Math.floor(Math.sqrt(d.features[0].length))), size = Math.min(d.features.length, 2000), forest = Array.from({ length: 24 }, () => { const ids = Array.from({ length: size }, () => Math.floor(rand() * d.features.length)); return treeFit(d.features, d.target, ids, { depth: 5, minLeaf: 25, mtry }, rand); });
      const pred = x => mean(forest.map(t => treePredict(t, x))); return treeCard(84, '부트스트랩과 무작위 특성의 24개 나무 평균', 'Random Forest의 각 나무는 복원 표본을 사용하고 매 분기에서 임의 특성 부분집합만 비교합니다. 나무별 로그금액 예측을 평균합니다.', d, d.features.map(pred), d.validation.map(pred), [`24개 나무, 각 최대 ${size}건 복원추출, 최대 깊이 5, 말단 최소 25건, 노드당 특성 ${mtry}개. 고정 시드.`, '검증 구간을 하이퍼파라미터 선택에 사용하지 않았습니다. 나무 24개는 브라우저 성능을 위한 제한입니다.']);
    });
    await attempt(85, () => {
      const d = treeData(), rand = rng(seed + 85), size = Math.min(d.features.length, 2200), ids = sample(d.features.map((_, i) => i), size, rand), initial = mean(ids.map(i => d.target[i])), trainPred = d.features.map(() => initial), testPred = d.validation.map(() => initial), rate = .08;
      for (let iter = 0; iter < 35; iter++) { const residual = d.target.map((v, i) => v - trainPred[i]), tree = treeFit(d.features, residual, ids, { depth: 2, minLeaf: 35 }, rand); d.features.forEach((x, i) => { trainPred[i] += rate * treePredict(tree, x); }); d.validation.forEach((x, i) => { testPred[i] += rate * treePredict(tree, x); }); }
      return treeCard(85, '이전 잔차를 순차 보정하는 Gradient Boosting', '로그금액 제곱손실의 음의 기울기(잔차)에 얕은 CART 나무를 순차 적합하고 학습률을 곱해 합산합니다.', d, trainPred, testPred, [`학습 구간 고정 무작위 표본 ${size}건, 35라운드, 깊이 2, 말단 최소 35건, 학습률 0.08.`, '고정 반복 수를 사용하며 검증 구간의 결과를 학습이나 조기종료에 사용하지 않았습니다.']);
    });
    return cards;
  };
})(globalThis);
