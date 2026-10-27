/* SEA pipeline: tabs, shared filters (kept in the link), click-to-drill, detail drawer.
   On-hold deals are left out of the dashboard. */
(() => {
  const ORDER = ['Thailand', 'Philippines', 'Indonesia', 'Malaysia', 'Singapore'];
  const CC = ['--c1', '--c2', '--c3', '--c4', '--c5'];
  const STAGES = ['Demo/Developing', 'Proposal Sent', 'Commercial/Contracting'];
  const FY = {fy27: ['2026-04-01', '2027-04-01', 'FY27 (Apr 2026 – Mar 2027)'], fy26: ['2025-04-01', '2026-04-01', 'FY26 (Apr 2025 – Mar 2026)'], fy25: ['2024-04-01', '2025-04-01', 'FY25 (Apr 2024 – Mar 2025)'], fy24: ['2023-04-01', '2024-04-01', 'FY24 (Apr 2023 – Mar 2024)']};
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const col = (c) => css(CC[ORDER.indexOf(c)] || '--hold');
  const money = (v) => v == null || isNaN(v) ? '—' : '$' + new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 1}).format(v);
  const num = (v) => v == null || isNaN(v) ? '—' : d3.format(',')(v);
  const pct = (v) => v == null || isNaN(v) ? '—' : d3.format('.0%')(v);
  const fdate = (s) => s ? d3.utcFormat('%-d %b %Y')(new Date(s.slice(0, 10) + 'T00:00:00Z')) : '—';
  const fmonth = (s) => s ? d3.utcFormat('%b %Y')(new Date(s.slice(0, 7) + '-01T00:00:00Z')) : '—';
  const qLabel = (q) => { const d = new Date(q + 'T00:00:00Z'), m = d.getUTCMonth(), y = d.getUTCFullYear(); return 'Q' + (m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 ? 3 : 4) + ' FY' + String((m >= 3 ? y + 1 : y) % 100).padStart(2, '0'); };
  const qRange = (q) => { const d = new Date(q + 'T00:00:00Z'); return [q, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1)).toISOString().slice(0, 10)]; };
  const sum = (a, f) => a.reduce((t, r) => t + (f(r) || 0), 0);
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const today = new Date().toISOString().slice(0, 10);
  const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const inFY = (d, k) => d && FY[k] && d >= FY[k][0] && d < FY[k][1];

  let D = null, FX = null;
  const drawer = document.querySelector('#drawer');
  const ccyOf = (country) => (FX && FX.country_currency[country]) || null;
  const fmtCcy = (v, ccy) => v == null || isNaN(v) || !ccy ? '—' : new Intl.NumberFormat('en', {style: 'currency', currency: ccy, currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1}).format(v);
  const toLocal = (usd, country) => { const c = ccyOf(country); return usd == null || !c || !FX.rates[c] ? null : usd * FX.rates[c]; };
  const localTxt = (usd, country) => { const v = toLocal(usd, country); return v == null ? '' : fmtCcy(v, ccyOf(country)); };
  // USD on top, local currency underneath
  const dual = (usd, r, td) => { if (usd == null) return el('span', 'm', '—'); const f = document.createDocumentFragment(); f.append(el('span', 'usd', money(usd))); const l = localTxt(usd, r.country); if (l) f.append(el('small', 'loc', l)); return f; };
  const withLocal = (usd) => S.f.country && ccyOf(S.f.country) ? ' · ' + localTxt(usd, S.f.country) : '';
  const S = {tab: 'closures', f: {}};
  const sort = {closures: {k: 'close_date', dir: -1}, active: {k: 'amount', dir: -1}};

  // ---------- filter definitions ----------
  const ownersOf = (rows) => [...new Set(rows.flatMap((r) => [r.deal_owner, r.account_owner, r.owner]).filter(Boolean))].sort();
  const yearsOf = () => [...new Set(D.closures.map((r) => r.year).filter(Boolean))].sort().reverse();
  const sourcesOf = (rows) => [...new Set(rows.map((r) => r.source).filter(Boolean))].sort();
  const FILTERS = {
    closures: [
      {k: 'period', label: 'Financial year', opts: () => Object.entries(FY).map(([k, v]) => [k, v[2]])},
      {k: 'year', label: 'Calendar year', dyn: true, opts: () => yearsOf().map((y) => [y, y])},
      {k: 'owner', label: 'Deal owner', dyn: true, opts: () => [...new Set(D.closures.map((r) => r.deal_owner).filter(Boolean))].sort().map((o) => [o, o])},
      {k: 'acct', label: 'Account owner', dyn: true, opts: () => [...new Set(D.closures.map((r) => r.account_owner).filter(Boolean))].sort().map((o) => [o, o])},
      {k: 'source', label: 'Deal source', dyn: true, opts: () => [['partner', 'Partner'], ['direct', 'Direct (non-partner)']].concat(sourcesOf(D.closures).filter((o) => o !== 'Partner').map((o) => [o, o]))},
      {k: 'partner', label: 'Partner', dyn: true, opts: () => [...new Set(D.closures.map((r) => r.partner).filter(Boolean))].sort().map((o) => [o, o])}],
    active: [
      {k: 'source', label: 'Deal source', dyn: true, opts: () => [['partner', 'Partner'], ['direct', 'Direct (non-partner)']].concat(sourcesOf(D.active).filter((o) => o !== 'Partner').map((o) => [o, o]))},
      {k: 'partner', label: 'Partner', dyn: true, opts: () => [...new Set(D.active.map((r) => r.partner).filter(Boolean))].sort().map((o) => [o, o])},
      {k: 'close', label: 'Closure date', opts: () => [['past', 'Close date passed'], ['30', 'Next 30 days'], ['90', 'Next 90 days'], ['fy27', 'By 31 Mar 2027'], ['later', 'After Mar 2027'], ['none', 'No close date']]},
      {k: 'owner', label: 'Deal owner', dyn: true, opts: () => [...new Set(D.active.map((r) => r.deal_owner).filter(Boolean))].sort().map((o) => [o, o])},
      {k: 'acct', label: 'Account owner', dyn: true, opts: () => [...new Set(D.active.map((r) => r.account_owner).filter(Boolean))].sort().map((o) => [o, o])},
      {k: 'proposal', label: 'Proposal sent', opts: () => [['30', 'In the last 30 days'], ['90', 'In the last 90 days'], ['fy27', 'In FY27'], ['any', 'Any date'], ['none', 'No proposal date']]},
      {k: 'health', label: 'Follow-up', opts: () => [['stale', 'Last activity 90+ days ago'], ['never', 'No activity logged'], ['cta', 'Call to action: Yes'], ['nocontact', 'No contact linked'], ['noamount', 'No amount']]}]
  };
  const PILL = {status: (v) => 'Status: ' + statusList(v).join(' + '), month: (v) => 'Month: ' + fmonth(v), quarter: (v) => 'Quarter: ' + qLabel(v), q: (v) => 'Search: “' + v + '”', country: (v) => v};

  // ---------- URL state ----------
  function readHash() {
    const [t, qs] = location.hash.slice(1).split('?');
    S.tab = ['closures', 'active'].includes(t) ? t : 'closures';
    S.f = Object.fromEntries(new URLSearchParams(qs || ''));
  }
  function writeHash() {
    const qs = new URLSearchParams(Object.entries(S.f).filter(([, v]) => v)).toString();
    history.replaceState(null, '', '#' + S.tab + (qs ? '?' + qs : ''));
  }
  function set(patch) { Object.assign(S.f, patch); Object.keys(S.f).forEach((k) => { if (!S.f[k]) delete S.f[k]; }); writeHash(); render(); }
  function go(tab, filters) { if (drawer.classList.contains('open')) closeDrawer(); S.tab = tab; S.f = Object.assign({}, filters || {}); writeHash(); render(); window.scrollTo({top: $('.tabs').offsetTop - 8, behavior: 'smooth'}); }
  window.SEA_UI = {go, openDeal: (id) => D && openDeal(id)};

  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    const keep = S.f.country ? {country: S.f.country} : {}; // country carries across tabs
    S.tab = b.dataset.tab; S.f = keep; writeHash(); render();
  }));
  window.addEventListener('hashchange', () => { if (drawer.classList.contains('open')) closeDrawer(); readHash(); render(); });

  // ---------- filtering ----------
  const match = (q, ...parts) => !q || parts.join(' ').toLowerCase().includes(q.toLowerCase());
  const ppl = (r) => (r.contacts || []).map((p) => p.name + ' ' + (p.title || '')).join(' ');
  function rowsClosures(f = S.f) {
    return D.closures.filter((r) => (!f.country || r.country === f.country) && (!f.year || r.year === f.year) && (!f.period || inFY(r.close_date, f.period)) &&
      (!f.month || r.month === f.month) && (!f.quarter || (r.close_date >= qRange(f.quarter)[0] && r.close_date < qRange(f.quarter)[1])) &&
      (!f.owner || r.deal_owner === f.owner) && (!f.acct || r.account_owner === f.acct) && (!f.source || (f.source === 'partner' ? r.source === 'Partner' : f.source === 'direct' ? r.source !== 'Partner' : r.source === f.source)) && (!f.partner || r.partner === f.partner) &&
      match(f.q, r.deal, r.company, r.deal_owner, r.account_owner, r.sub_source, ppl(r)));
  }
  function rowsActive(f = S.f) {
    return D.active.filter((r) => (!f.country || r.country === f.country) &&
      (!f.status || statusList(f.status).includes(r.stage)) &&
      (!f.proposal || (f.proposal === 'none' ? !r.proposal_sent : f.proposal === 'any' ? !!r.proposal_sent :
        f.proposal === 'fy27' ? inFY(r.proposal_sent, 'fy27') : r.proposal_sent && r.proposal_sent >= plusDays(-Number(f.proposal)))) &&
      (!f.source || (f.source === 'partner' ? r.source === 'Partner' : f.source === 'direct' ? r.source !== 'Partner' : r.source === f.source)) && (!f.partner || r.partner === f.partner) &&
      (!f.close || (f.close === 'past' ? r.close_date && r.close_date < today : f.close === 'none' ? !r.close_date :
        f.close === 'fy27' ? r.close_date >= today && r.close_date < '2027-04-01' : f.close === 'later' ? r.close_date >= '2027-04-01' :
        r.close_date >= today && r.close_date <= plusDays(Number(f.close)))) &&
      (!f.owner || r.deal_owner === f.owner) && (!f.acct || r.account_owner === f.acct) &&
      (!f.health || (f.health === 'stale' ? (r.last_activity && r.last_activity < plusDays(-90)) : f.health === 'never' ? !r.last_activity :
        f.health === 'cta' ? r.cta === 'Yes' : f.health === 'nocontact' ? !(r.contacts || []).length : !r.amount)) &&
      match(f.q, r.deal, r.company, r.deal_owner, r.account_owner, r.sub_source, r.remarks, r.next_step, r.conv_reason, ppl(r)));
  }
  const ROWS = {closures: rowsClosures, active: rowsActive};
  function statusList(v) { return (v || '').split(',').filter(Boolean).flatMap((x) => x === 'active' ? STAGES : [x]); }

  // ---------- filter bar ----------
  let searchTimer;
  function drawFilterBar() {
    $('#filterbar').hidden = false;
    const noCountry = Object.assign({}, S.f, {country: ''});
    const base = ROWS[S.tab](noCountry);
    $('#fb-chips').replaceChildren(...[''].concat(ORDER).map((c) => {
      const b = el('button', 'chip'); b.type = 'button'; b.setAttribute('aria-pressed', String((S.f.country || '') === c));
      if (c) { const i = el('i', 'dot'); i.style.background = col(c); b.appendChild(i); }
      b.append(c || 'All SEA', el('span', 'n', num(c ? base.filter((r) => r.country === c).length : base.length)));
      b.addEventListener('click', () => set({country: c}));
      return b;
    }));
    const ctr = $('#fb-controls'); const focused = document.activeElement && document.activeElement.id === 'fb-q';
    ctr.replaceChildren();
    if (S.tab === 'active') {
      const grp = el('div', 'multi'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'Status (pick one or more)');
      grp.appendChild(el('span', 'multi-lbl', 'Status'));
      const cur = statusList(S.f.status);
      STAGES.forEach((st) => {
        const n = ROWS.active(Object.assign({}, S.f, {status: st})).length;
        const b = el('button', 'tog'); b.type = 'button'; b.setAttribute('aria-pressed', String(cur.includes(st))); b.disabled = !n && !cur.includes(st);
        b.append(st, el('span', 'n', num(n)));
        b.addEventListener('click', () => { const next = cur.includes(st) ? cur.filter((x) => x !== st) : cur.concat(st); set({status: STAGES.filter((x) => next.includes(x)).join(',')}); });
        grp.appendChild(b);
      });
      ctr.appendChild(grp);
    }
    FILTERS[S.tab].forEach((def) => {
      const s = el('select'); s.setAttribute('aria-label', def.label); if (S.f[def.k]) s.classList.add('on');
      const allN = ROWS[S.tab](Object.assign({}, S.f, {[def.k]: ''})).length;
      s.append(new Option(def.label + ': all (' + num(allN) + ')', ''));
      def.opts().forEach(([v, l]) => {
        const n = ROWS[S.tab](Object.assign({}, S.f, {[def.k]: v})).length;
        if (!n && def.dyn && S.f[def.k] !== v) return;
        const o = new Option(def.label + ': ' + l + ' (' + num(n) + ')', v); if (!n && S.f[def.k] !== v) o.disabled = true; s.append(o);
      });
      s.value = S.f[def.k] || '';
      s.addEventListener('change', () => set({[def.k]: s.value}));
      ctr.appendChild(s);
    });
    const q = el('input'); q.type = 'search'; q.id = 'fb-q'; q.placeholder = 'Search deal, account, contact or notes';
    q.value = S.f.q || ''; q.setAttribute('aria-label', 'Search');
    q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => set({q: q.value.trim()}), 200); });
    ctr.appendChild(q);
    const csv = el('button', 'btn', 'Download CSV'); csv.type = 'button'; csv.addEventListener('click', downloadCsv); ctr.appendChild(csv);
    if (focused) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    // pills
    const pills = $('#fb-pills'); pills.replaceChildren();
    const keys = Object.keys(S.f).filter((k) => S.f[k]);
    keys.forEach((k) => {
      const def = FILTERS[S.tab].find((d) => d.k === k);
      const label = def ? def.label + ': ' + ((def.opts().find(([v]) => v === S.f[k]) || [, S.f[k]])[1]) : (PILL[k] ? PILL[k](S.f[k]) : k + ': ' + S.f[k]);
      const b = el('button', 'pill'); b.type = 'button'; b.title = 'Remove filter'; b.append(label, el('span', 'x', '×'));
      b.addEventListener('click', () => set({[k]: ''})); pills.appendChild(b);
    });
    if (keys.length) { const c = el('button', 'pill clear', 'Clear all'); c.type = 'button'; c.addEventListener('click', () => { S.f = {}; writeHash(); render(); }); pills.appendChild(c); }
    else pills.appendChild(el('span', 'hint', 'Click any number, bar or tile below to filter. Click a row for full details.'));
  }

  // ---------- shared drawing ----------
  function kpis(sel, tiles) {
    $(sel).replaceChildren(...tiles.map(([l, v, s, filt, active]) => {
      const c = el(filt ? 'button' : 'div', 'card kpi' + (filt ? ' click' : '') + (active ? ' on' : ''));
      if (filt) { c.type = 'button'; c.addEventListener('click', () => set(filt)); c.title = 'Show these'; }
      c.append(el('div', 'k-lab', l), el('div', 'k-val', v), el('div', 'k-sub', s || ''));
      return c;
    }));
  }
  const isOn = (patch) => Object.entries(patch).every(([k, v]) => (S.f[k] || '') === (v || ''));
  function matrix(sel, header, rows) {
    const t = $(sel);
    const htr = el('tr'); header.forEach(([l, cls]) => htr.appendChild(el('th', cls, l))); t.tHead.replaceChildren(htr);
    t.tBodies[0].replaceChildren(...rows.map((r) => {
      const tr = el('tr', r.cls);
      r.cells.forEach((c) => {
        const td = el('td', c.cls);
        if (c.patch && c.v) {
          const b = el('button', 'cell' + (isOn(c.patch) ? ' on' : '')); b.type = 'button'; b.title = 'Filter to these';
          if (c.n != null) { b.append(el('b', null, c.n)); if (c.sub) b.append(el('small', null, ' ' + c.sub)); } else b.append(c.v);
          b.addEventListener('click', () => set(isOn(c.patch) ? Object.fromEntries(Object.keys(c.patch).map((k) => [k, ''])) : c.patch));
          td.appendChild(b);
        } else if (c.n != null && c.v) { td.append(el('b', null, c.n)); if (c.sub) td.append(el('small', null, ' ' + c.sub)); }
        else td.textContent = c.v || '—';
        tr.appendChild(td);
      });
      return tr;
    }));
  }
  const tip = $('#tip');
  function showTip(ev, head, lines) {
    tip.replaceChildren(el('div', 't', head));
    lines.forEach(([c, t]) => { const l = el('div'); if (c) { const i = el('i'); i.style.background = c; l.appendChild(i); } l.append(t); tip.appendChild(l); });
    tip.style.display = 'block';
    const tw = tip.offsetWidth, th = tip.offsetHeight; let x = ev.pageX + 14, y = ev.pageY - th - 10;
    if (x + tw > window.scrollX + document.documentElement.clientWidth - 8) x = ev.pageX - tw - 14;
    if (y < window.scrollY) y = ev.pageY + 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.style.display = 'none'; };
  const legend = (sel, items) => $(sel).replaceChildren(...items.map(([c, t]) => { const s = el('span'), i = el('i'); i.style.background = c; s.append(i, t); return s; }));
  const measure = (svg, texts) => { const p = svg.append('text').attr('font-size', 11); let m = 0; texts.forEach((t) => { p.text(t); m = Math.max(m, p.node().getComputedTextLength()); }); p.remove(); return m; };
  const lastMonths = (n) => { const out = []; const d = new Date(); let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n + 1, 1)); for (let i = 0; i < n; i++) { out.push(m.toISOString().slice(0, 7)); m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)); } return out; };

  function monthBars(sel, months, series, valueOf, fmt, grouped, onClick, inSel) {
    const box = $(sel); box.replaceChildren();
    const W = Math.max(280, box.clientWidth), H = 230, top = 18, bottom = 26;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('display', 'block').style('font-family', 'var(--sans)');
    const totals = months.map((m) => grouped ? d3.max(series, (s) => valueOf(m, s.key)) : d3.sum(series, (s) => valueOf(m, s.key)));
    const y = d3.scaleLinear([0, (d3.max(totals) || 1) * 1.1], [H - bottom, top]).nice();
    const yt = y.ticks(4).filter((v) => !grouped || Number.isInteger(v)), L = measure(svg, yt.map(fmt)) + 10;
    const x = d3.scaleBand(months, [L, W - 4]).padding(0.25);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', L).attr('x2', W - 4).attr('y1', y).attr('y2', y).attr('stroke', css('--grid'));
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', L - 8).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', css('--muted')).text(fmt);
    const every = Math.ceil(months.length / Math.max(1, Math.floor((W - L) / 54)));
    svg.append('g').selectAll('text').data(months.filter((m, i) => i % every === 0)).join('text').attr('x', (m) => x(m) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', css('--muted')).text((m) => d3.utcFormat('%b %y')(new Date(m + '-01T00:00:00Z')));
    const fy = months.find((m) => m >= '2026-04');
    if (fy && fy !== months[0]) { const fx = x(fy) - x.step() * x.paddingInner() / 2; svg.append('line').attr('x1', fx).attr('x2', fx).attr('y1', top - 6).attr('y2', H - bottom).attr('stroke', css('--axis')).attr('stroke-dasharray', '3 3'); svg.append('text').attr('x', fx + 4).attr('y', top - 6).attr('font-size', 11).attr('fill', css('--muted')).text('FY27 →'); }
    months.forEach((m, i) => {
      const dim = inSel && !inSel(m) ? 0.25 : 1;
      if (grouped) {
        const bw = Math.min(14, x.bandwidth() / series.length);
        series.forEach((s, j) => { const v = valueOf(m, s.key); if (!v) return; svg.append('rect').attr('x', x(m) + (x.bandwidth() - bw * series.length) / 2 + j * bw).attr('width', bw - 1).attr('y', y(v)).attr('height', y(0) - y(v)).attr('rx', 2).attr('fill', s.color).attr('opacity', dim); });
      } else {
        const bw = Math.min(28, x.bandwidth()); let y0 = 0;
        series.forEach((s) => { const v = valueOf(m, s.key); if (!v) return; svg.append('rect').attr('x', x(m) + (x.bandwidth() - bw) / 2).attr('width', bw).attr('y', y(y0 + v)).attr('height', Math.max(1, y(y0) - y(y0 + v))).attr('fill', s.color).attr('opacity', dim); y0 += v; });
      }
      const hit = svg.append('rect').attr('x', x(m)).attr('width', x.bandwidth()).attr('y', top).attr('height', H - top - bottom).attr('fill', 'transparent')
        .on('mousemove', (ev) => showTip(ev, fmonth(m) + (totals[i] ? ' · click to filter' : ''), series.filter((s) => valueOf(m, s.key)).map((s) => [s.color, s.label + ': ' + fmt(valueOf(m, s.key)) + (s.extra ? s.extra(m) : '')]).concat(totals[i] ? [] : [[null, 'None']])))
        .on('mouseleave', hideTip);
      if (totals[i]) hit.style('cursor', 'pointer').on('click', () => { hideTip(); onClick(m); });
    });
  }

  // ---------- list tables (sortable, clickable rows) ----------
  function list(sel, tab, cols, rows, opts = {}) {
    const t = $(sel), st = sort[tab];
    if (!t.querySelector('colgroup') && opts.widths) { const cg = el('colgroup'); opts.widths.forEach((w) => { const c = el('col'); c.style.width = w; cg.appendChild(c); }); t.prepend(cg); }
    const htr = el('tr');
    cols.forEach((c) => {
      const th = el('th', c.cls);
      if (c.sort !== false) {
        const b = el('button', null, c.label); b.type = 'button';
        th.setAttribute('aria-sort', st.k === (c.sort || c.k) ? (st.dir > 0 ? 'ascending' : 'descending') : 'none');
        b.addEventListener('click', () => { const k = c.sort || c.k; st.dir = st.k === k ? -st.dir : (c.num ? -1 : 1); st.k = k; render(); });
        th.appendChild(b);
      } else th.textContent = c.label;
      htr.appendChild(th);
    });
    t.tHead.replaceChildren(htr);
    const key = (r) => { const v = r[st.k]; return v == null || v === '' ? null : v; };
    rows = rows.slice().sort((a, b) => { const x = key(a), y = key(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * st.dir; });
    const body = [];
    rows.forEach((r) => {
      const tr = el('tr', 'row'); tr.tabIndex = 0; tr.title = 'Open details';
      cols.forEach((c) => { const td = el('td', c.cls); const v = c.f ? c.f(r[c.k], r, td) : r[c.k]; if (v instanceof Node) td.appendChild(v); else td.textContent = v == null || v === '' ? '—' : v; tr.appendChild(td); });
      const open = () => opts.open(r);
      tr.addEventListener('click', (e) => { if (!e.target.closest('a')) open(); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      body.push(tr);
      if (opts.after) { const x = opts.after(r, cols.length); if (x) { tr.classList.add('has-note'); x.addEventListener('click', open); body.push(x); } }
    });
    if (!rows.length) { const tr = el('tr'), td = el('td', 'empty', 'Nothing matches these filters. '); const c = el('button', 'link', 'Clear filters'); c.type = 'button'; c.addEventListener('click', () => { S.f = {}; writeHash(); render(); }); td.appendChild(c); td.colSpan = cols.length; tr.appendChild(td); body.push(tr); }
    t.tBodies[0].replaceChildren(...body);
  }
  const hsLink = (url) => { const a = el('a', 'hs', '↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Open in HubSpot'; a.setAttribute('aria-label', 'Open in HubSpot'); return a; };
  const nameCell = (v, r) => { const f = document.createDocumentFragment(); f.append(el('span', 'nm', v || '—'), '\u00a0', hsLink(r.url)); return f; };
  const people = (v) => {
    if (!v || !v.length) return el('span', 'm', '—');
    const f = document.createDocumentFragment();
    v.slice(0, 2).forEach((p) => { const s = el('span', 'ppl', p.name); if (p.title) { s.append(' '); s.appendChild(el('small', null, p.title)); } f.appendChild(s); });
    if (v.length > 2) f.appendChild(el('small', 'm', '+' + (v.length - 2) + ' more'));
    return f;
  };
  const sourceCell = (v, r) => { if (!v) return el('span', 'm', '—'); const f = document.createDocumentFragment(); f.append(el('span', v === 'Partner' ? 'src partner' : 'src', v)); if (r.sub_source) f.append(el('small', 'loc', r.sub_source)); return f; };
  const countryCell = (v) => { const s = el('span', 'ctry'); const i = el('i', 'dot'); i.style.background = col(v); s.append(i, v || '—'); return s; };

  // ---------- drawer ----------
  const scrim = $('#scrim');
  let lastFocus = null;
  function openDrawer(kicker, title, build) {
    lastFocus = document.activeElement;
    $('#dr-kicker').textContent = kicker; $('#dr-title').textContent = title;
    const body = $('#dr-body'); body.replaceChildren(); build(body);
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.hidden = false;
    $('#dr-close').focus();
  }
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.hidden = true; if (lastFocus) lastFocus.focus(); }
  $('#dr-close').addEventListener('click', closeDrawer); scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
  const facts = (body, pairs) => { const dl = el('dl', 'facts'); pairs.filter((p) => p[1] != null && p[1] !== '').forEach(([k, v]) => { dl.append(el('dt', null, k)); const dd = el('dd'); if (v instanceof Node) dd.appendChild(v); else dd.textContent = v; dl.append(dd); }); body.appendChild(dl); };
  const section = (body, title) => { body.appendChild(el('h3', null, title)); };
  const filterLink = (label, tab, f) => { const b = el('button', 'link', label); b.type = 'button'; b.addEventListener('click', () => { closeDrawer(); go(tab, f); }); return b; };
  function openDeal(id) {
    const r = D.active.find((x) => x.id === id) || D.closures.find((x) => x.id === id);
    if (!r) return;
    const won = !r.stage_id;
    openDrawer(r.country + ' · ' + (won ? 'Closed won' : r.stage), r.deal, (b) => {
      const top = el('div', 'dr-top');
      top.append(el('div', 'dr-val', money(r.amount)));
      const lt = localTxt(r.amount, r.country); if (lt) top.append(el('span', 'dr-loc', lt));
      if (!won && r.close_date && r.close_date < today) top.append(el('span', 'tag Low', 'Close date passed'));
      b.appendChild(top);
      if (FX && ccyOf(r.country)) b.appendChild(el('p', 'm fxnote', ccyOf(r.country) + ' converted from USD at ' + FX.as_of + ' rates (1 USD = ' + d3.format(',.2f')(FX.rates[ccyOf(r.country)]) + ' ' + ccyOf(r.country) + ').'));
      facts(b, [[won ? 'Closed' : 'Closure date', fdate(r.close_date)], ['Created', fdate(r.created)], ['Deal owner', r.deal_owner && filterLink(r.deal_owner, won ? 'closures' : 'active', {owner: r.deal_owner})],
        ['Year-1 total', r.year1_total != null ? money(r.year1_total) + (localTxt(r.year1_total, r.country) ? ' · ' + localTxt(r.year1_total, r.country) : '') : null],
        ['Subscription (annual)', r.subscription != null ? money(r.subscription) + (localTxt(r.subscription, r.country) ? ' · ' + localTxt(r.subscription, r.country) : '') : null],
        ['Implementation', r.implementation != null ? money(r.implementation) + (localTxt(r.implementation, r.country) ? ' · ' + localTxt(r.implementation, r.country) : '') : null],
        ['Split check', r.split_note], ['Booked in HubSpot as', r.booked_amount != null ? new Intl.NumberFormat('en', {style: 'currency', currency: r.booked_currency, maximumFractionDigits: 0}).format(r.booked_amount) : null],
        ['Proposal sent', r.proposal_sent ? fdate(r.proposal_sent) + (r.proposal_sent_source && r.proposal_sent_source !== 'Proposal sent Date field' ? ' (date it entered Proposal Sent)' : '') : null],
        ['Account', r.company], ['Account owner', r.account_owner && filterLink(r.account_owner, won ? 'closures' : 'active', {acct: r.account_owner})], ['Deal source', r.source ? r.source + (r.sub_source ? ' · ' + r.sub_source : '') : null], ['Employee headcount', r.headcount != null ? num(r.headcount) : null], ['Industry', r.industry],
        ['HubSpot probability', r.probability != null ? pct(r.probability) : null], ['Last meeting', won ? null : (r.last_meeting ? fdate(r.last_meeting) : 'None logged')], ['Region check', r.region_note ? r.region_note + ' — counted as ' + r.country + ' here. Fix the Region in HubSpot.' : null], ['Last activity', r.last_activity ? fdate(r.last_activity) : (won ? null : 'None logged')]]);
      section(b, 'Contacts');
      if ((r.contacts || []).length) { const ul = el('ul', 'people'); r.contacts.forEach((p) => { const li = el('li', null, p.name); if (p.title) li.append(el('small', null, ' · ' + p.title)); ul.appendChild(li); }); b.appendChild(ul); }
      else b.appendChild(el('p', 'm', 'No contact linked to this deal in HubSpot.'));
      section(b, 'Notes');
      const notes = [['Remarks', r.remarks], ['Next step', r.next_step], ['Assessment', r.conv_reason], ['Call to action', [r.cta, r.cta_reason].filter(Boolean).join(' — ')]].filter((x) => x[1]);
      if (notes.length) facts(b, notes); else b.appendChild(el('p', 'm', 'No notes in HubSpot.'));
      const a = el('a', 'btn primary', 'Open in HubSpot ↗'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; b.appendChild(a);
    });
  }
  // ---------- CSV ----------
  function downloadCsv() {
    const spec = {
      closures: [['country', 'Country'], ['year', 'Year'], ['month', 'Month'], ['deal', 'Deal'], ['headcount', 'Employee headcount'], ['subscription', 'Subscription USD'], ['implementation', 'Implementation USD'], ['year1_total', 'Year-1 total USD'], ['_ccy', 'Local currency'], ['_loc', 'Year-1 total local'], ['company', 'Account'], ['deal_owner', 'Deal owner'], ['account_owner', 'Account owner'], ['contacts', 'Contacts'], ['source', 'Deal source'], ['sub_source', 'Sub-source / partner'], ['close_date', 'Close date'], ['url', 'HubSpot link']],
      active: [['country', 'Country'], ['deal', 'Deal'], ['stage', 'Status'], ['source', 'Deal source'], ['sub_source', 'Sub-source / partner'], ['conv_reason', 'Assessment'], ['proposal_sent', 'Proposal sent'], ['close_date', 'Closure date'], ['headcount', 'Employee headcount'], ['subscription', 'Subscription USD'], ['implementation', 'Implementation USD'], ['year1_total', 'Year-1 total USD'], ['_ccy', 'Local currency'], ['_loc', 'Year-1 total local'], ['deal_owner', 'Deal owner'], ['account_owner', 'Account owner'], ['company', 'Account'], ['contacts', 'Contacts'], ['remarks', 'Remarks'], ['next_step', 'Next step'], ['cta', 'Call to action'], ['cta_reason', 'CTA reason'], ['last_meeting', 'Last meeting'], ['last_activity', 'Last activity'], ['url', 'HubSpot link']]
    }[S.tab];
    const esc = (v) => { if (Array.isArray(v)) v = v.map((p) => p.name + (p.title ? ' (' + p.title + ')' : '')).join('; '); return v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); };
    const csv = [spec.map((s) => s[1]).join(',')].concat(ROWS[S.tab]().map((r) => Object.assign({}, r, {_ccy: ccyOf(r.country), _loc: toLocal(r.year1_total, r.country) != null ? Math.round(toLocal(r.year1_total, r.country)) : null})).map((r) => spec.map((s) => esc(r[s[0]])).join(','))).join('\n');
    const a = el('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv'}));
    a.download = 'sea-' + S.tab + (S.f.country ? '-' + S.f.country.toLowerCase() : '') + '-' + D.generated_at.slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- render ----------
  function render() {
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
    document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.id !== 'tab-' + S.tab; });
    if (!D) { $('#filterbar').hidden = true; return; }
    drawFilterBar();
    if (S.tab === 'closures') drawClosures(); else if (S.tab === 'active') drawActive();
  }

  // ---------- Closures ----------
  function drawClosures() {
    const f = S.f, rows = rowsClosures();
    const scope = rowsClosures(Object.assign({}, f, {period: '', year: '', month: '', quarter: ''}));
    const fy27 = scope.filter((r) => inFY(r.close_date, 'fy27')), fy26 = scope.filter((r) => inFY(r.close_date, 'fy26'));
    kpis('#cl-kpis', [
      ['Closures to date', num(scope.length), money(sum(scope, (r) => r.amount)) + ' total value' + withLocal(sum(scope, (r) => r.amount)), {period: '', year: '', month: '', quarter: ''}, !f.period && !f.year && !f.month && !f.quarter],
      ['FY27 to date (Apr 2026 –)', num(fy27.length), money(sum(fy27, (r) => r.amount)) + withLocal(sum(fy27, (r) => r.amount)), {period: 'fy27', year: '', month: '', quarter: ''}, f.period === 'fy27'],
      ['FY26 (Apr 2025 – Mar 2026)', num(fy26.length), money(sum(fy26, (r) => r.amount)) + withLocal(sum(fy26, (r) => r.amount)), {period: 'fy26', year: '', month: '', quarter: ''}, f.period === 'fy26'],
      ['Latest closure', scope[0] ? fmonth(scope[0].close_date) : '—', scope[0] ? scope[0].deal : '']]);
    const noCY = Object.assign({}, f, {country: '', year: ''});
    const all = rowsClosures(noCY), years = yearsOf().slice().reverse();
    const cs = ORDER;
    const cell = (a, patch) => ({n: a.length ? num(a.length) : null, v: a.length ? 1 : '', sub: money(sum(a, (r) => r.amount)), cls: 'num', patch});
    const rowsM = cs.map((c) => { const a = all.filter((r) => r.country === c); return {cells: [{v: c, patch: {country: c}}].concat(years.map((y) => cell(a.filter((r) => r.year === y), {country: c, year: y}))).concat([cell(a, {country: c, year: ''})])}; });
    rowsM.push({cls: 'total', cells: [{v: 'All SEA'}].concat(years.map((y) => cell(all.filter((r) => r.year === y), {country: '', year: y}))).concat([cell(all, {country: '', year: ''})])});
    matrix('#cl-year', [['Country']].concat(years.map((y) => [y, 'num'])).concat([['Total', 'num']]), rowsM);
    const chartRows = rowsClosures(Object.assign({}, f, {month: '', year: '', period: '', quarter: ''}));
    const timeSel = f.month || f.year || f.period || f.quarter ? (m) => (!f.month || m === f.month) && (!f.year || m.startsWith(f.year)) &&
      (!f.period || inFY(m + '-01', f.period)) && (!f.quarter || (m + '-01' >= qRange(f.quarter)[0] && m + '-01' < qRange(f.quarter)[1])) : null;
    const series = (f.country ? [f.country] : ORDER).map((c) => ({key: c, label: c, color: col(c), extra: (m) => ' (' + chartRows.filter((r) => r.country === c && r.month === m).length + ')'}));
    legend('#cl-legend', series.map((s) => [s.color, s.label]));
    monthBars('#cl-chart', (() => { const first = d3.min(D.closures, (r) => r.month) || '2022-01'; const out = []; let m = new Date(first + '-01T00:00:00Z'); const end = new Date(); while (m <= end) { out.push(m.toISOString().slice(0, 7)); m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)); } return out; })(), series, (m, c) => sum(chartRows.filter((r) => r.country === c && r.month === m), (r) => r.amount), money, false,
      (m) => set({month: f.month === m ? '' : m, year: '', period: '', quarter: ''}), timeSel);
    const odd = rows.filter((r) => r.amount != null && r.amount < 100).length;
    const mis = rows.filter((r) => r.region_note).length;
    $('#cl-note').textContent = num(rows.length) + ' deals · ' + money(sum(rows, (r) => r.amount)) + withLocal(sum(rows, (r) => r.amount)) + (mis ? ' · ' + mis + ' filed under a non-SEA region in HubSpot (tagged)' : '') + (odd ? ' · ' + odd + ' with a value under $100 in HubSpot (marked “check”, likely local currency)' : '');
    list('#cl-tbl', 'closures', [
      {k: 'country', label: 'Country', f: countryCell},
      {k: 'close_date', label: 'Closed', f: (v) => v ? d3.utcFormat('%b %Y')(new Date(v + 'T00:00:00Z')) : '—'},
      {k: 'deal', label: 'Deal', f: (v, r) => { const f = nameCell(v, r); if (r.region_note) { const t = el('span', 'tag warn', 'region not SEA'); t.title = r.region_note + ' — counted as ' + r.country + ' here'; f.append(' ', t); } return f; }},
      {k: 'headcount', label: 'Headcount', cls: 'num', num: true, f: (v) => v != null ? num(v) : el('span', 'm', '—')},
      {k: 'subscription', label: 'Subscrip\u00adtion', cls: 'num', num: true, f: dual},
      {k: 'implementation', label: 'Implemen\u00adtation', cls: 'num', num: true, f: dual},
      {k: 'year1_total', label: 'Year-1 total', cls: 'num', num: true, f: (v, r, td) => { if (v != null && v < 100) { td.classList.add('flag'); const x = el('span', null, money(v) + ' check'); return x; } return dual(v, r, td); }},
      {k: 'company', label: 'Account'}, {k: 'deal_owner', label: 'Deal owner'},
      {k: 'contacts', label: 'Contacts', sort: false, f: people}, {k: 'source', label: 'Deal source', f: sourceCell}], rows,
      {open: (r) => openDeal(r.id), widths: ['8%', '7%', '14%', '7%', '8%', '8%', '8%', '11%', '9%', '13%', '7%']});
  }

  // ---------- Active pipeline ----------
  function drawActive() {
    const f = S.f, rows = rowsActive();
    const scope = rowsActive(Object.assign({}, f, {status: '', close: '', health: ''}));
    const act = scope;
    const fyc = scope.filter((r) => r.close_date >= today && r.close_date < '2027-04-01'), past = scope.filter((r) => r.close_date && r.close_date < today);
    const reset = {status: '', close: '', health: ''};
    kpis('#ac-kpis', [
      ['Active (Demo → Contracting)', money(sum(act, (r) => r.amount)), num(act.length) + ' deals' + withLocal(sum(act, (r) => r.amount)), Object.assign({}, reset, {status: 'active'}), statusList(f.status).join() === statusList('active').join() && !f.close],
      ['Closing by 31 Mar 2027', money(sum(fyc, (r) => r.amount)), num(fyc.length) + ' deals with a FY27 close date' + withLocal(sum(fyc, (r) => r.amount)), Object.assign({}, reset, {close: 'fy27'}), f.close === 'fy27' && !f.status],
      ['Close date passed', num(past.length), money(sum(past, (r) => r.amount)) + ' · dates need updating', Object.assign({}, reset, {close: 'past'}), f.close === 'past' && !f.status]]);
    const all = rowsActive(Object.assign({}, f, {country: '', status: ''}));
    const cs = ORDER;
    const cell = (a, patch, cls) => ({n: a.length ? num(a.length) : null, v: a.length ? 1 : '', sub: cls ? '' : money(sum(a, (r) => r.amount)), cls: 'num' + (cls ? ' ' + cls : ''), patch});
    const line = (c, a, cls) => ({cls, cells: [{v: c || 'All SEA', patch: c ? {country: c, status: ''} : null}].concat(STAGES.map((s) => cell(a.filter((r) => r.stage === s), {country: c, status: s})))
      .concat([cell(a, {country: c, status: ''}), cell(a.filter((r) => r.close_date && r.close_date < today), {country: c, status: '', close: 'past'}, 'flag')])});
    const rowsM = cs.map((c) => line(c, all.filter((r) => r.country === c)));
    rowsM.push(line('', all, 'total'));
    matrix('#ac-sum', [['Country']].concat(STAGES.map((s) => [s, 'num'])).concat([['Total open', 'num'], ['Close date passed', 'num']]), rowsM);
    $('#ac-note').textContent = num(rows.length) + ' deals · ' + money(sum(rows, (r) => r.amount)) + withLocal(sum(rows, (r) => r.amount)) + ' · notes under each deal come from HubSpot Deal Status and Next step';
    list('#ac-tbl', 'active', [
      {k: 'country', label: 'Country', f: countryCell}, {k: 'deal', label: 'Deal', f: nameCell}, {k: 'stage', label: 'Status'},
      {k: 'source', label: 'Deal source', f: sourceCell},
      {k: 'proposal_sent', label: 'Proposal sent', f: (v) => v ? fdate(v) : el('span', 'm', '—')},
      {k: 'close_date', label: 'Closure date', f: (v, r, td) => { if (v && v < today) td.classList.add('flag'); return fdate(v); }},
      {k: 'last_meeting', label: 'Last meeting', f: (v, r, td) => { if (!v || v < plusDays(-90)) td.classList.add('flag'); return v ? fdate(v) : 'none'; }},
      {k: 'headcount', label: 'Headcount', cls: 'num', num: true, f: (v) => v != null ? num(v) : el('span', 'm', '—')},
      {k: 'subscription', label: 'Subscrip\u00adtion', cls: 'num', num: true, f: dual},
      {k: 'implementation', label: 'Implemen\u00adtation', cls: 'num', num: true, f: dual},
      {k: 'year1_total', label: 'Year-1 total', cls: 'num', num: true, f: dual},
      {k: 'deal_owner', label: 'Deal owner'},
      {k: 'contacts', label: 'Contacts', sort: false, f: people},
      {k: 'last_activity', label: 'Last activity', f: (v, r, td) => { if (!v || v < plusDays(-90)) td.classList.add('flag'); return v ? fdate(v) : 'never'; }}], rows,
    {open: (r) => openDeal(r.id), widths: ['7%', '10%', '8%', '6%', '6%', '7%', '6%', '6%', '7%', '7%', '7%', '7%', '10%', '6%'],
      after: (r, n) => {
        const parts = [['', r.remarks], ['Next:', r.next_step], ['Assessment:', r.conv_reason], ['Action:', [r.cta, r.cta_reason].filter(Boolean).join(' — ')]].filter((p) => p[1]);
        const tr = el('tr', 'note-row'), td = el('td', 'notes'); td.colSpan = n;
        if (parts.length) parts.forEach(([l, t]) => { const s = el('span', 'np'); if (l) s.appendChild(el('span', 'lbl', l + ' ')); s.append(t); td.appendChild(s); });
        else td.appendChild(el('span', 'lbl', 'No notes in HubSpot'));
        tr.appendChild(td); return tr;
      }});
  }

  function drawHead() {
    const at = new Date(D.generated_at), hrs = (Date.now() - at) / 36e5, a = $('#asof');
    a.textContent = 'HubSpot data as of ' + at.toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) + (hrs > 48 ? ' · not refreshed in ' + Math.round(hrs / 24) + ' days' : '');
    a.classList.toggle('stale', hrs > 48);
  }

  // ---------- boot ----------
  readHash(); render();
  fetch('data/fx.json', {cache: 'no-cache'}).then((r) => r.ok ? r.json() : null).then((x) => { FX = x; if (D) render(); }).catch(() => {});
  fetch('data/details.json', {cache: 'no-cache'}).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { d.active = d.active.filter((r) => r.stage !== 'On-Hold'); D = d; drawHead(); render(); })
    .catch((e) => ['closures', 'active'].forEach((t) => $('#tab-' + t).replaceChildren(el('div', 'err', 'Could not load data/details.json (' + e.message + ').'))));
  let w = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - w) > 30) { w = window.innerWidth; render(); } });
})();
