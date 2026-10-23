(() => {
  const REG = {'Thailand & Others': 'Thailand', 'Indonesia': 'Indonesia', 'Philippines': 'Philippines', 'Malaysia': 'Malaysia', 'Singapore': 'Singapore'};
  const ORDER = ['Thailand', 'Philippines', 'Indonesia', 'Malaysia', 'Singapore'];
  const ACTIVE = ['280510157', '280510158', '280510159'], HOLD = '280510160', WON = '280510161', LOST = '280510162';
  const STAGES = [
    {id: '280510157', label: 'Demo/Developing', v: '--c1'},
    {id: '280510158', label: 'Proposal Sent', v: '--c2'},
    {id: '280510159', label: 'Commercial/Contracting', v: '--c3'},
    {id: '280510160', label: 'On-Hold', v: '--hold'}
  ];
  const CC = ['--c1', '--c2', '--c3', '--c4', '--c5'];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const money = (v) => v == null || isNaN(v) ? '—' : '$' + new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 1}).format(v);
  const num = (v) => v == null || isNaN(v) ? '—' : d3.format(',')(v);
  const pct = (v) => v == null || isNaN(v) ? '—' : d3.format('.1%')(v);
  const fdate = (s) => s ? d3.utcFormat('%-d %b %Y')(new Date(s + 'T00:00:00Z')) : '—';
  const sum = (a, f) => a.reduce((t, r) => t + (f(r) || 0), 0);
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let D, rows, kpi, byCountry, owners, quality;

  fetch('data/sea.json', {cache: 'no-cache'}).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { D = d; compute(); drawAll(); })
    .catch((e) => { $('#asof').textContent = ''; $('#kpis').replaceChildren(el('div', 'err', 'Could not load data/sea.json (' + e.message + ').')); });

  function compute() {
    const now = new Date(), today = now.toISOString().slice(0, 10);
    const fy0 = D.fy_start || '2026-04-01', fy1 = (Number(fy0.slice(0, 4)) + 1) + fy0.slice(4);
    const P = D.pipeline_stage, W = D.won_quarterly;
    rows = D.open_deals.map((d) => {
      const days = d.last_contacted ? Math.floor((now - new Date(d.last_contacted + 'T00:00:00Z')) / 864e5) : null;
      const flags = [];
      if (d.close_date && d.close_date < today) flags.push('Close date passed');
      if (!d.amount) flags.push('No amount');
      if (days == null) flags.push('Never contacted'); else if (days > 90) flags.push('No contact 90d+');
      return Object.assign({}, d, {country: REG[d.region] || d.region, weighted: d.amount == null ? null : d.amount * (d.probability || 0), days, flags: flags.join(' · ')});
    });
    const fy = W.filter((r) => r.quarter >= fy0 && r.quarter < fy1);
    const act = P.filter((r) => ACTIVE.includes(r.stage_id)), hold = P.filter((r) => r.stage_id === HOLD);
    const target = D.target_usd || 3000000, won = sum(fy, (r) => r.amount);
    kpi = {won, wonN: sum(fy, (r) => r.count), target, pct: won / target, gap: target - won,
      active: sum(act, (r) => r.amount), activeN: sum(act, (r) => r.count),
      weighted: sum(rows.filter((r) => ACTIVE.includes(r.stage_id)), (r) => r.weighted),
      hold: sum(hold, (r) => r.amount), holdN: sum(hold, (r) => r.count)};
    byCountry = ORDER.map((c) => {
      const p = P.filter((r) => REG[r.region] === c), g = (id) => p.filter((r) => r.stage_id === id);
      const a = p.filter((r) => ACTIVE.includes(r.stage_id)), wN = sum(g(WON), (r) => r.count), lN = sum(g(LOST), (r) => r.count);
      return {country: c, active: sum(a, (r) => r.amount), activeN: sum(a, (r) => r.count), hold: sum(g(HOLD), (r) => r.amount), holdN: sum(g(HOLD), (r) => r.count),
        wonFy: sum(fy.filter((r) => REG[r.region] === c), (r) => r.amount), wonN: wN, lostN: lN, rate: wN + lN ? wN / (wN + lN) : null};
    });
    const m = new Map();
    rows.forEach((d) => {
      const o = m.get(d.owner) || {owner: d.owner, n: 0, active: 0, weighted: 0, hold: 0, stale: 0};
      o.n++;
      if (d.stage_id === HOLD) o.hold += d.amount || 0; else { o.active += d.amount || 0; o.weighted += d.weighted || 0; }
      if (d.days == null || d.days > 90) o.stale++;
      m.set(d.owner, o);
    });
    owners = [...m.values()].sort((a, b) => b.active - a.active || b.n - a.n);
    const has = (t) => rows.filter((d) => d.flags.includes(t)).length;
    const share = (n) => rows.length ? Math.round(n / rows.length * 100) + '% of open deals' : '';
    quality = [['Close date already passed', 'Close date passed'], ['No contact logged in 90+ days', 'No contact 90d+'], ['Never contacted', 'Never contacted'], ['No amount entered', 'No amount']]
      .map(([issue, t]) => ({issue, n: has(t), detail: share(has(t))}));
    P.filter((r) => r.stage_id === LOST).forEach((r) => {
      const avg = r.count ? r.amount / r.count : 0;
      if (avg > 500000) quality.push({issue: 'Lost value out of scale, ' + (REG[r.region] || r.region), n: r.count, detail: 'lost deals average $' + Math.round(avg / 1000) + 'K each; likely local currency', bad: true});
    });
  }

  function drawAll() {
    drawHead(); drawKpis(); drawPipe(); drawWon(); drawCountry(); drawOwners(); setupDeals(); drawFunnel(); drawQuality();
    let w = window.innerWidth;
    window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - w) > 30) { w = window.innerWidth; drawPipe(); drawWon(); } });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawPipe(); drawWon(); drawFunnel(); });
  }

  function drawHead() {
    const at = new Date(D.generated_at), hrs = (Date.now() - at) / 36e5;
    const a = $('#asof');
    a.textContent = 'HubSpot data as of ' + at.toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) + (hrs > 48 ? ' · not refreshed in ' + Math.round(hrs / 24) + ' days' : '');
    a.classList.toggle('stale', hrs > 48);
    const t = $('#takeaway'), b = (s) => el('b', null, s);
    t.replaceChildren('FY27 closed-won is ', b(money(kpi.won)), ' (' + pct(kpi.pct) + ' of the ' + money(kpi.target) + ' target, ' + num(kpi.wonN) + ' deals). ',
      b(money(kpi.active)), ' sits in active stages across ' + num(kpi.activeN) + ' deals (' + money(kpi.weighted) + ' weighted), while ',
      b(money(kpi.hold)), ' is parked on hold. Unparking on-hold deals and converting weighted pipeline are the routes to close the ' + money(kpi.gap) + ' gap.');
  }

  function drawKpis() {
    const tiles = [
      ['Closed-won, FY27 to date', money(kpi.won), pct(kpi.pct) + ' of ' + money(kpi.target) + ' target', true],
      ['Active pipeline (Demo → Contracting)', money(kpi.active), num(kpi.activeN) + ' deals'],
      ['Weighted active pipeline', money(kpi.weighted), 'Value × HubSpot stage probability'],
      ['Parked on hold', money(kpi.hold), num(kpi.holdN) + ' deals'],
      ['Gap to target', money(kpi.gap), 'FY27 ends 31 Mar 2027']
    ];
    $('#kpis').replaceChildren(...tiles.map(([l, v, s, bar]) => {
      const c = el('div', 'card'); c.append(el('div', 'k-lab', l), el('div', 'k-val', v), el('div', 'k-sub', s));
      if (bar) { const k = el('div', 'k-bar'), i = el('i'); i.style.width = Math.min(100, Math.max(0, kpi.pct * 100)) + '%'; k.appendChild(i); c.appendChild(k); }
      return c;
    }));
  }

  const tip = $('#tip');
  function showTip(ev, head, lines) {
    tip.replaceChildren(el('div', 't', head));
    lines.forEach(([color, text]) => { const l = el('div'); if (color) { const i = el('i'); i.style.background = color; l.appendChild(i); } l.append(text); tip.appendChild(l); });
    tip.style.display = 'block';
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.pageX + 14, y = ev.pageY - th - 10;
    if (x + tw > window.scrollX + document.documentElement.clientWidth - 8) x = ev.pageX - tw - 14;
    if (y < window.scrollY) y = ev.pageY + 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.style.display = 'none'; };
  const legend = (box, items) => box.replaceChildren(...items.map(([c, t]) => { const s = el('span'), i = el('i'); i.style.background = c; s.append(i, t); return s; }));
  const measure = (svg, texts, size) => { const p = svg.append('text').attr('font-size', size); let m = 0; texts.forEach((t) => { p.text(t); m = Math.max(m, p.node().getComputedTextLength()); }); p.remove(); return m; };

  function drawPipe() {
    const box = $('#pipe-chart'); box.replaceChildren();
    legend($('#pipe-legend'), STAGES.map((s) => [css(s.v), s.label]));
    const data = ORDER.map((c) => {
      const o = {country: c, total: 0, n: 0};
      STAGES.forEach((s) => { const m = D.pipeline_stage.filter((r) => REG[r.region] === c && r.stage_id === s.id); o[s.id] = sum(m, (r) => r.amount); o['n' + s.id] = sum(m, (r) => r.count); o.total += o[s.id]; o.n += o['n' + s.id]; });
      return o;
    });
    const W = Math.max(280, box.clientWidth), rowH = 36, top = 6, H = top + data.length * rowH + 22;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('display', 'block').style('font-family', 'var(--sans)');
    const L = measure(svg, data.map((d) => d.country), 12) + 12, R = measure(svg, data.map((d) => money(d.total)), 12) + 10;
    const x = d3.scaleLinear([0, d3.max(data, (d) => d.total) || 1], [L, W - R]);
    const ticks = x.ticks(Math.max(2, Math.floor((W - L - R) / 80)));
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', x).attr('x2', x).attr('y1', top).attr('y2', H - 20).attr('stroke', css('--grid'));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', css('--muted')).text(money);
    data.forEach((d, i) => {
      const y = top + i * rowH + 8, h = rowH - 16; let x0 = 0;
      svg.append('text').attr('x', 0).attr('y', y + h / 2).attr('dy', '0.35em').attr('font-size', 12).attr('fill', css('--fg')).text(d.country);
      STAGES.forEach((s) => { const v = d[s.id]; if (!v) return; svg.append('rect').attr('x', x(x0)).attr('y', y).attr('width', Math.max(1, x(x0 + v) - x(x0))).attr('height', h).attr('fill', css(s.v)); x0 += v; });
      svg.append('text').attr('x', x(d.total) + 6).attr('y', y + h / 2).attr('dy', '0.35em').attr('font-size', 12).attr('fill', css('--fg')).text(money(d.total));
      svg.append('rect').attr('x', 0).attr('y', y - 6).attr('width', W).attr('height', h + 12).attr('fill', 'transparent')
        .on('mousemove', (ev) => showTip(ev, d.country + ' · ' + num(d.n) + ' open deals', STAGES.map((s) => [css(s.v), s.label + ': ' + money(d[s.id]) + ' (' + num(d['n' + s.id]) + ')'])))
        .on('mouseleave', hideTip);
    });
  }

  function qLab(q) { const dt = new Date(q + 'T00:00:00Z'), m = dt.getUTCMonth(), y = dt.getUTCFullYear(); const fq = m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 ? 3 : 4; return 'Q' + fq + ' FY' + String((m >= 3 ? y + 1 : y) % 100).padStart(2, '0'); }

  function drawWon() {
    const box = $('#won-chart'); box.replaceChildren();
    const col = (c) => css(CC[ORDER.indexOf(c) % CC.length]);
    legend($('#won-legend'), ORDER.map((c) => [col(c), c]));
    // every quarter from Apr 2025 to the current quarter, so empty quarters show as gaps
    const qs = []; const end = new Date(); let d0 = new Date(Date.UTC(2025, 3, 1));
    while (d0 <= end) { qs.push(d0.toISOString().slice(0, 10)); d0 = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 3, 1)); }
    D.won_quarterly.forEach((r) => { if (!qs.includes(r.quarter)) qs.push(r.quarter); }); qs.sort();
    const data = qs.map((q) => { const o = {q, total: 0, n: 0}; ORDER.forEach((c) => { const m = D.won_quarterly.filter((r) => r.quarter === q && REG[r.region] === c); o[c] = sum(m, (r) => r.amount); o['n' + c] = sum(m, (r) => r.count); o.total += o[c]; o.n += o['n' + c]; }); return o; });
    const W = Math.max(280, box.clientWidth), H = 230, top = 20, bottom = 24;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('display', 'block').style('font-family', 'var(--sans)');
    const y = d3.scaleLinear([0, (d3.max(data, (d) => d.total) || 1) * 1.12], [H - bottom, top]).nice();
    const yt = y.ticks(4), L = measure(svg, yt.map(money), 11) + 10;
    const x = d3.scaleBand(data.map((d) => d.q), [L, W - 4]).padding(0.3);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', L).attr('x2', W - 4).attr('y1', y).attr('y2', y).attr('stroke', css('--grid'));
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', L - 8).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', css('--muted')).text(money);
    const every = Math.ceil(data.length / Math.max(1, Math.floor((W - L) / 64)));
    svg.append('g').selectAll('text').data(data.filter((d, i) => i % every === 0)).join('text').attr('x', (d) => x(d.q) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', css('--muted')).text((d) => qLab(d.q));
    const f = data.find((d) => d.q >= (D.fy_start || '2026-04-01'));
    if (f) { const fx = x(f.q) - x.step() * x.paddingInner() / 2; svg.append('line').attr('x1', fx).attr('x2', fx).attr('y1', top - 8).attr('y2', H - bottom).attr('stroke', css('--axis')).attr('stroke-dasharray', '3 3'); svg.append('text').attr('x', fx + 4).attr('y', top - 8).attr('font-size', 11).attr('fill', css('--muted')).text('FY27 →'); }
    const bw = Math.min(32, x.bandwidth());
    data.forEach((d) => {
      let y0 = 0; const bx = x(d.q) + (x.bandwidth() - bw) / 2;
      ORDER.forEach((c) => { const v = d[c]; if (!v) return; svg.append('rect').attr('x', bx).attr('width', bw).attr('y', y(y0 + v)).attr('height', Math.max(1, y(y0) - y(y0 + v))).attr('fill', col(c)); y0 += v; });
      if (d.total) svg.append('text').attr('x', bx + bw / 2).attr('y', y(d.total) - 4).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', css('--fg')).text(money(d.total));
      svg.append('rect').attr('x', x(d.q)).attr('width', x.bandwidth()).attr('y', top).attr('height', H - bottom - top).attr('fill', 'transparent')
        .on('mousemove', (ev) => showTip(ev, qLab(d.q) + ' · ' + num(d.n) + ' won', d.n ? ORDER.filter((c) => d['n' + c]).map((c) => [col(c), c + ': ' + money(d[c]) + ' (' + num(d['n' + c]) + ')']) : [[null, 'No wins']]))
        .on('mouseleave', hideTip);
    });
  }

  function fill(sel, data, cols) {
    const tb = $(sel + ' tbody');
    tb.replaceChildren(...data.map((r) => {
      const tr = el('tr');
      cols.forEach(([k, f, cls]) => { const td = el('td', cls); const v = f ? f(r[k], r, td) : r[k]; if (v instanceof Node) td.appendChild(v); else td.textContent = v == null || v === '' ? '—' : v; tr.appendChild(td); });
      return tr;
    }));
  }
  function drawCountry() {
    fill('#country-tbl', byCountry, [['country'], ['active', money, 'num'], ['activeN', num, 'num'], ['hold', money, 'num'], ['holdN', num, 'num'], ['wonFy', money, 'num'], ['wonN', num, 'num'], ['lostN', num, 'num'], ['rate', pct, 'num']]);
  }
  function drawOwners() {
    fill('#owner-tbl', owners, [['owner'], ['n', num, 'num'], ['active', money, 'num'], ['weighted', money, 'num'], ['hold', money, 'num'],
      ['stale', (v, r, td) => { if (r.n && v / r.n > 0.5) td.classList.add('flag'); return num(v); }, 'num']]);
  }

  const st = {k: 'amount', dir: -1};
  function filtered() {
    const c = $('#f-country').value, s = $('#f-stage').value, o = $('#f-owner').value, f = $('#f-flag').value, q = $('#f-q').value.trim().toLowerCase();
    const r = rows.filter((d) => (!c || d.country === c) && (!s || d.stage === s) && (!o || d.owner === o) && (!f || (f === 'flag' ? !!d.flags : !d.flags)) && (!q || (d.deal + ' ' + d.owner).toLowerCase().includes(q)));
    r.sort((a, b) => { const x = a[st.k], y = b[st.k]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * st.dir; });
    return r;
  }
  function setupDeals() {
    ORDER.forEach((c) => $('#f-country').appendChild(new Option(c, c)));
    STAGES.forEach((s) => $('#f-stage').appendChild(new Option(s.label, s.label)));
    [...new Set(rows.map((r) => r.owner))].sort().forEach((o) => $('#f-owner').appendChild(new Option(o, o)));
    ['#f-country', '#f-stage', '#f-owner', '#f-flag'].forEach((s) => $(s).addEventListener('change', drawDeals));
    $('#f-q').addEventListener('input', drawDeals);
    document.querySelectorAll('#deal-tbl th button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k; st.dir = st.k === k ? -st.dir : (['deal', 'country', 'stage', 'owner', 'close_date'].includes(k) ? 1 : -1); st.k = k; drawDeals();
    }));
    $('#csv').addEventListener('click', () => {
      const cols = ['deal', 'country', 'stage', 'amount', 'weighted', 'close_date', 'owner', 'days', 'flags', 'url'];
      const esc = (v) => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
      const csv = [cols.join(',')].concat(filtered().map((r) => cols.map((c) => esc(c === 'weighted' && r[c] != null ? Math.round(r[c]) : r[c])).join(','))).join('\n');
      const a = el('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = 'sea-open-deals-' + D.generated_at.slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href);
    });
    drawDeals();
  }
  function drawDeals() {
    const r = filtered(), today = new Date().toISOString().slice(0, 10);
    document.querySelectorAll('#deal-tbl th').forEach((th) => { const b = th.querySelector('button'); if (b) th.setAttribute('aria-sort', b.dataset.k === st.k ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'); });
    fill('#deal-tbl', r, [
      ['deal', (v, d) => { if (!d.url) return v; const a = el('a', null, v); a.href = d.url; a.target = '_blank'; a.rel = 'noopener'; return a; }],
      ['country'], ['stage'], ['amount', money, 'num'], ['weighted', money, 'num'],
      ['close_date', (v, d, td) => { if (v && v < today) td.classList.add('flag'); return fdate(v); }], ['owner'],
      ['days', (v, d, td) => { if (v == null || v > 90) td.classList.add('flag'); return v == null ? 'never' : num(v); }, 'num'],
      ['flags', (v, d, td) => { if (v) td.classList.add('flag'); return v; }]
    ]);
    $('#deals-note').textContent = 'Showing ' + num(r.length) + ' of ' + num(rows.length) + ' open SEA deals (' + money(sum(r, (d) => d.amount)) + '). Click a header to sort; deal names open in HubSpot (HubSpot login needed).';
  }

  function drawFunnel() {
    const order = ['New Lead', 'Engaged', 'In Progress', 'MQL- Qualified', 'Marketing Nurture', 'No Response', 'MQL Lost', 'Disqualified'], dead = ['No Response', 'MQL Lost', 'Disqualified'];
    const by = new Map(); D.qual_stage.forEach((r) => by.set(r.stage, (by.get(r.stage) || 0) + r.count));
    const st = order.filter((s) => by.get(s)).concat([...by.keys()].filter((s) => !order.includes(s) && by.get(s)));
    const max = d3.max(st, (s) => by.get(s)) || 1;
    $('#funnel').replaceChildren(...st.map((s) => {
      const row = el('div', 'fun-row'), bar = el('div', 'bar'), i = el('i');
      i.style.width = (by.get(s) / max * 100) + '%'; i.style.background = css(dead.includes(s) ? '--hold' : '--c1'); bar.appendChild(i);
      row.append(el('div', null, s), bar, el('div', 'n', num(by.get(s)))); return row;
    }));
  }
  function drawQuality() {
    fill('#q-tbl', quality, [['issue'], ['n', (v, r, td) => { if (v > 0) td.classList.add(r.bad ? 'bad' : 'flag'); return num(v); }, 'num'], ['detail']]);
  }
})();
