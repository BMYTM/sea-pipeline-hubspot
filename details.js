(() => {
  const ORDER = ['Thailand', 'Philippines', 'Indonesia', 'Malaysia', 'Singapore'];
  const CC = ['--c1', '--c2', '--c3', '--c4', '--c5'];
  const STAGES = ['Demo/Developing', 'Proposal Sent', 'Commercial/Contracting', 'On-Hold'];
  const FY0 = '2026-04-01', FY1 = '2027-04-01';
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const col = (c) => css(CC[ORDER.indexOf(c) % CC.length] || '--hold');
  const money = (v) => v == null || isNaN(v) ? '—' : '$' + new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 1}).format(v);
  const num = (v) => v == null || isNaN(v) ? '—' : d3.format(',')(v);
  const pct = (v) => v == null || isNaN(v) ? '—' : d3.format('.0%')(v);
  const fdate = (s) => s ? d3.utcFormat('%-d %b %Y')(new Date(s.slice(0, 10) + 'T00:00:00Z')) : '—';
  const fmonth = (s) => s ? d3.utcFormat('%b %Y')(new Date(s.slice(0, 7) + '-01T00:00:00Z')) : '—';
  const sum = (a, f) => a.reduce((t, r) => t + (f(r) || 0), 0);
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

  let D = null, tab = 'overview', country = '';
  const drawn = {};

  // ---------- tabs ----------
  const tabs = [...document.querySelectorAll('.tabs [data-tab]')];
  function show(name, push) {
    if (!tabs.some((b) => b.dataset.tab === name)) name = 'overview';
    tab = name;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    $('#chips').hidden = name === 'overview';
    if (push) history.replaceState(null, '', '#' + name);
    render();
  }
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab, true)));
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));

  fetch('data/details.json', {cache: 'no-cache'}).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { D = d; setup(); show(location.hash.slice(1) || 'overview'); })
    .catch((e) => { ['closures', 'active', 'leads'].forEach((t) => { const p = $('#tab-' + t); p.replaceChildren(el('div', 'err', 'Could not load data/details.json (' + e.message + ').')); }); show(location.hash.slice(1) || 'overview'); });

  // ---------- shared ----------
  const rowsFor = (t) => t === 'closures' ? D.closures : t === 'active' ? D.active : D.leads;
  const byCountry = (a) => country ? a.filter((r) => r.country === country) : a;
  function drawChips() {
    const all = rowsFor(tab);
    const box = $('#chips');
    box.replaceChildren(...[''].concat(ORDER).map((c) => {
      const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(country === c));
      b.append(c || 'All SEA', el('span', 'n', num(c ? all.filter((r) => r.country === c).length : all.length)));
      b.addEventListener('click', () => { country = c; render(); });
      return b;
    }));
  }
  function kpis(sel, tiles) {
    $(sel).replaceChildren(...tiles.map(([l, v, s]) => { const c = el('div', 'card'); c.append(el('div', 'k-lab', l), el('div', 'k-val', v), el('div', 'k-sub', s || '')); return c; }));
  }
  function fill(sel, data, cols) {
    $(sel + ' tbody').replaceChildren(...data.map((r) => {
      const tr = el('tr');
      cols.forEach(([k, f, cls]) => { const td = el('td', cls); const v = f ? f(r[k], r, td) : r[k]; if (v instanceof Node) td.appendChild(v); else td.textContent = v == null || v === '' ? '—' : v; tr.appendChild(td); });
      return tr;
    }));
    if (!data.length) { const tr = el('tr'), td = el('td', 'm', 'Nothing matches these filters.'); td.colSpan = cols.length; tr.appendChild(td); $(sel + ' tbody').appendChild(tr); }
  }
  const dealLink = (v, r) => { const a = el('a', null, v || '—'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; return a; };
  const people = (v) => {
    if (!v || !v.length) return '—';
    const f = document.createDocumentFragment();
    v.slice(0, 3).forEach((p) => { const s = el('span', 'ppl', p.name); if (p.title) { s.append(' '); s.appendChild(el('small', null, p.title)); } f.appendChild(s); });
    if (v.length > 3) f.appendChild(el('small', 'm', '+' + (v.length - 3) + ' more'));
    return f;
  };
  const fillSelect = (sel, values, first) => { const s = $(sel), cur = s.value; s.replaceChildren(new Option(first, ''), ...values.map((v) => new Option(v, v))); s.value = values.includes(cur) ? cur : ''; };
  const opts = (a, k) => [...new Set(a.map((r) => r[k]).filter(Boolean))].sort();
  const match = (q, ...parts) => !q || parts.join(' ').toLowerCase().includes(q);
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

  // stacked / grouped monthly bars
  function monthBars(sel, months, series, valueOf, fmt, grouped) {
    const box = $(sel); box.replaceChildren();
    const W = Math.max(280, box.clientWidth), H = 230, top = 18, bottom = 26;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('display', 'block').style('font-family', 'var(--sans)');
    const totals = months.map((m) => grouped ? d3.max(series, (s) => valueOf(m, s.key)) : d3.sum(series, (s) => valueOf(m, s.key)));
    const y = d3.scaleLinear([0, (d3.max(totals) || 1) * 1.1], [H - bottom, top]).nice();
    const yt = y.ticks(4).filter((v) => grouped ? Number.isInteger(v) : true), L = measure(svg, yt.map(fmt)) + 10;
    const x = d3.scaleBand(months, [L, W - 4]).padding(0.25);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', L).attr('x2', W - 4).attr('y1', y).attr('y2', y).attr('stroke', css('--grid'));
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', L - 8).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', css('--muted')).text(fmt);
    const every = Math.ceil(months.length / Math.max(1, Math.floor((W - L) / 54)));
    svg.append('g').selectAll('text').data(months.filter((m, i) => i % every === 0)).join('text').attr('x', (m) => x(m) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', css('--muted')).text((m) => d3.utcFormat('%b %y')(new Date(m + '-01T00:00:00Z')));
    const fy = months.find((m) => m >= FY0.slice(0, 7));
    if (fy && fy !== months[0]) { const fx = x(fy) - x.step() * x.paddingInner() / 2; svg.append('line').attr('x1', fx).attr('x2', fx).attr('y1', top - 6).attr('y2', H - bottom).attr('stroke', css('--axis')).attr('stroke-dasharray', '3 3'); svg.append('text').attr('x', fx + 4).attr('y', top - 6).attr('font-size', 11).attr('fill', css('--muted')).text('FY27 →'); }
    months.forEach((m, i) => {
      if (grouped) {
        const bw = Math.min(14, x.bandwidth() / series.length);
        series.forEach((s, j) => { const v = valueOf(m, s.key); if (!v) return; svg.append('rect').attr('x', x(m) + (x.bandwidth() - bw * series.length) / 2 + j * bw).attr('width', bw - 1).attr('y', y(v)).attr('height', y(0) - y(v)).attr('rx', 2).attr('fill', s.color); });
      } else {
        const bw = Math.min(28, x.bandwidth()); let y0 = 0;
        series.forEach((s) => { const v = valueOf(m, s.key); if (!v) return; svg.append('rect').attr('x', x(m) + (x.bandwidth() - bw) / 2).attr('width', bw).attr('y', y(y0 + v)).attr('height', Math.max(1, y(y0) - y(y0 + v))).attr('fill', s.color); y0 += v; });
      }
      svg.append('rect').attr('x', x(m)).attr('width', x.bandwidth()).attr('y', top).attr('height', H - top - bottom).attr('fill', 'transparent')
        .on('mousemove', (ev) => showTip(ev, fmonth(m), series.filter((s) => valueOf(m, s.key)).map((s) => [s.color, s.label + ': ' + fmt(valueOf(m, s.key)) + (s.extra ? s.extra(m) : '')]).concat(totals[i] ? [] : [[null, 'None']])))
        .on('mouseleave', hideTip);
    });
  }
  const lastMonths = (n) => { const out = []; const d = new Date(); let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n + 1, 1)); for (let i = 0; i < n; i++) { out.push(m.toISOString().slice(0, 7)); m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)); } return out; };

  // ---------- CSV ----------
  document.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.csv;
    const spec = {
      closures: [['country', 'Country'], ['year', 'Year'], ['month', 'Month'], ['deal', 'Deal'], ['amount', 'Value USD'], ['company', 'Account'], ['deal_owner', 'Deal owner'], ['account_owner', 'Account owner'], ['contacts', 'Contacts'], ['source', 'Source'], ['close_date', 'Close date'], ['url', 'HubSpot link']],
      active: [['country', 'Country'], ['deal', 'Deal'], ['stage', 'Status'], ['conv_prob', 'Conversion probability'], ['conv_reason', 'Probability reason'], ['close_date', 'Closure date'], ['amount', 'Value USD'], ['deal_owner', 'Deal owner'], ['account_owner', 'Account owner'], ['company', 'Account'], ['contacts', 'Contacts'], ['remarks', 'Remarks'], ['next_step', 'Next step'], ['cta', 'Call to action'], ['cta_reason', 'CTA reason'], ['last_activity', 'Last activity'], ['url', 'HubSpot link']],
      leads: [['country', 'Country'], ['name', 'Contact'], ['title', 'Job title'], ['company', 'Company'], ['stage', 'Stage now'], ['mql_date', 'MQL date'], ['sql_date', 'SQL date'], ['owner', 'Owner'], ['source', 'Source'], ['deals', 'Deals'], ['last_activity', 'Last activity'], ['url', 'HubSpot link']]
    }[t];
    const rows = t === 'closures' ? clRows() : t === 'active' ? acRows() : ldRows();
    const esc = (v) => { if (Array.isArray(v)) v = v.map((p) => p.name + (p.title ? ' (' + p.title + ')' : '')).join('; '); return v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); };
    const csv = [spec.map((s) => s[1]).join(',')].concat(rows.map((r) => spec.map((s) => esc(r[s[0]])).join(','))).join('\n');
    const a = el('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv'}));
    a.download = 'sea-' + t + (country ? '-' + country.toLowerCase() : '') + '-' + D.generated_at.slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  }));

  // ---------- setup ----------
  function setup() {
    ['#cl-year-f', '#cl-owner-f', '#cl-q', '#ac-stage-f', '#ac-prob-f', '#ac-owner-f', '#ac-close-f', '#ac-q', '#ld-type-f', '#ld-period-f', '#ld-owner-f', '#ld-q']
      .forEach((s) => $(s).addEventListener(s.endsWith('-q') ? 'input' : 'change', render));
    let w = window.innerWidth;
    window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - w) > 30) { w = window.innerWidth; render(); } });
  }

  function render() {
    if (!D || tab === 'overview') return;
    drawChips();
    if (tab === 'closures') drawClosures(); else if (tab === 'active') drawActive(); else drawLeads();
  }

  // ---------- Closures ----------
  function clRows() {
    const y = $('#cl-year-f').value, o = $('#cl-owner-f').value, q = $('#cl-q').value.trim().toLowerCase();
    return byCountry(D.closures).filter((r) => (!y || r.year === y) && (!o || r.deal_owner === o || r.account_owner === o) &&
      match(q, r.deal, r.company, r.deal_owner, r.account_owner, (r.contacts || []).map((p) => p.name + ' ' + (p.title || '')).join(' ')));
  }
  function drawClosures() {
    const base = byCountry(D.closures);
    fillSelect('#cl-year-f', opts(D.closures, 'year').reverse(), 'All years');
    fillSelect('#cl-owner-f', [...new Set(base.flatMap((r) => [r.deal_owner, r.account_owner]).filter(Boolean))].sort(), 'All owners');
    const fy = base.filter((r) => r.close_date >= FY0 && r.close_date < FY1), ly = base.filter((r) => r.close_date >= '2025-04-01' && r.close_date < FY0);
    const last = base[0];
    kpis('#cl-kpis', [
      ['Closures to date (all time)', num(base.length), money(sum(base, (r) => r.amount)) + ' total value'],
      ['FY27 to date (Apr 2026 –)', num(fy.length), money(sum(fy, (r) => r.amount))],
      ['FY26 (Apr 2025 – Mar 2026)', num(ly.length), money(sum(ly, (r) => r.amount))],
      ['Latest closure', last ? fmonth(last.close_date) : '—', last ? last.deal : '']
    ]);
    // country × year
    const years = opts(D.closures, 'year');
    const cs = country ? [country] : ORDER;
    const thead = $('#cl-year thead'); const htr = el('tr'); htr.append(el('th', null, 'Country'));
    years.forEach((y) => htr.append(el('th', 'num', y))); htr.append(el('th', 'num', 'Total')); thead.replaceChildren(htr);
    const cell = (a) => { const td = el('td', 'num'); if (a.length) { td.append(num(a.length) + ' · '); td.append(el('small', 'm', money(sum(a, (r) => r.amount)))); } else td.textContent = '—'; return td; };
    const body = cs.map((c) => { const tr = el('tr'); const a = D.closures.filter((r) => r.country === c); tr.append(el('td', null, c)); years.forEach((y) => tr.append(cell(a.filter((r) => r.year === y)))); tr.append(cell(a)); return tr; });
    if (!country) { const tr = el('tr', 'total'); tr.append(el('td', null, 'All SEA')); years.forEach((y) => tr.append(cell(D.closures.filter((r) => r.year === y)))); tr.append(cell(D.closures)); body.push(tr); }
    $('#cl-year tbody').replaceChildren(...body);
    // monthly chart
    const months = lastMonths(24);
    const series = cs.map((c) => ({key: c, label: c, color: col(c), extra: (m) => ' (' + base.filter((r) => r.country === c && r.month === m).length + ')'}));
    legend('#cl-legend', series.map((s) => [s.color, s.label]));
    monthBars('#cl-chart', months, series, (m, c) => sum(base.filter((r) => r.country === c && r.month === m), (r) => r.amount), money, false);
    // table
    const rows = clRows();
    $('#cl-note').textContent = num(rows.length) + ' closed-won deals' + (country ? ' in ' + country : ' across SEA') + ' (' + money(sum(rows, (r) => r.amount)) + '). Contacts are the people linked to the deal in HubSpot.';
    const odd = rows.filter((r) => r.amount != null && r.amount < 100).length;
    if (odd) $('#cl-note').textContent += ' ' + odd + ' deal' + (odd > 1 ? 's have' : ' has') + ' a value under $100 in HubSpot (marked "check"), likely entered in local currency without conversion.';
    fill('#cl-tbl', rows, [['country'], ['year'], ['month', (v) => v ? d3.utcFormat('%b')(new Date(v + '-01T00:00:00Z')) : '—'], ['deal', dealLink],
      ['amount', (v, r, td) => { if (v != null && v < 100) { td.classList.add('flag'); return money(v) + ' check'; } return money(v); }, 'num'],
      ['company'], ['deal_owner'], ['account_owner'], ['contacts', people], ['source']]);
  }

  // ---------- Active pipeline ----------
  function acRows() {
    const s = $('#ac-stage-f').value, p = $('#ac-prob-f').value, o = $('#ac-owner-f').value, c = $('#ac-close-f').value, q = $('#ac-q').value.trim().toLowerCase();
    const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
    return byCountry(D.active).filter((r) => (!s || r.stage === s) && (!p || (p === '-' ? !r.conv_prob : r.conv_prob === p)) &&
      (!o || r.deal_owner === o || r.account_owner === o) &&
      (!c || (c === 'past' ? r.close_date && r.close_date < today : c === 'q' ? r.close_date >= today && r.close_date <= in90 : r.close_date >= today && r.close_date < FY1)) &&
      match(q, r.deal, r.company, r.deal_owner, r.account_owner, r.remarks, r.next_step, r.conv_reason, (r.contacts || []).map((x) => x.name + ' ' + (x.title || '')).join(' ')));
  }
  function drawActive() {
    const base = byCountry(D.active);
    fillSelect('#ac-stage-f', STAGES.filter((s) => D.active.some((r) => r.stage === s)), 'All statuses');
    fillSelect('#ac-owner-f', [...new Set(base.flatMap((r) => [r.deal_owner, r.account_owner]).filter(Boolean))].sort(), 'All owners');
    const act = base.filter((r) => r.stage !== 'On-Hold'), hold = base.filter((r) => r.stage === 'On-Hold');
    const fyClose = act.filter((r) => r.close_date >= today && r.close_date < FY1);
    const high = base.filter((r) => r.conv_prob === 'High');
    kpis('#ac-kpis', [
      ['Active (Demo → Contracting)', money(sum(act, (r) => r.amount)), num(act.length) + ' deals'],
      ['On hold', money(sum(hold, (r) => r.amount)), num(hold.length) + ' deals'],
      ['Closing by 31 Mar 2027', money(sum(fyClose, (r) => r.amount)), num(fyClose.length) + ' active deals with a FY27 close date'],
      ['Rated high conversion', money(sum(high, (r) => r.amount)), num(high.length) + ' deals (team’s own rating)']
    ]);
    // country × stage
    const cs = country ? [country] : ORDER;
    const htr = el('tr'); htr.append(el('th', null, 'Country')); STAGES.forEach((s) => htr.append(el('th', 'num', s))); htr.append(el('th', 'num', 'Total open')); htr.append(el('th', 'num', 'Close date passed'));
    $('#ac-sum thead').replaceChildren(htr);
    const cell = (a) => { const td = el('td', 'num'); if (a.length) { td.append(num(a.length) + ' · '); td.append(el('small', 'm', money(sum(a, (r) => r.amount)))); } else td.textContent = '—'; return td; };
    const line = (label, a, cls) => { const tr = el('tr', cls); tr.append(el('td', null, label)); STAGES.forEach((s) => tr.append(cell(a.filter((r) => r.stage === s)))); tr.append(cell(a)); const p = a.filter((r) => r.close_date && r.close_date < today).length; const td = el('td', 'num' + (p ? ' flag' : ''), p ? num(p) : '—'); tr.append(td); return tr; };
    const rows = cs.map((c) => line(c, D.active.filter((r) => r.country === c)));
    if (!country) rows.push(line('All SEA', D.active, 'total'));
    $('#ac-sum tbody').replaceChildren(...rows);
    // deals
    const list = acRows();
    $('#ac-note').textContent = num(list.length) + ' open deals' + (country ? ' in ' + country : ' across SEA') + ' (' + money(sum(list, (r) => r.amount)) + '). Notes come from each deal’s Deal Status remarks and Next step in HubSpot; conversion probability is the owner’s own rating.';
    const cols = [['country'], ['deal', dealLink], ['stage'],
      ['conv_prob', (v) => v ? el('span', 'tag ' + v, v) : '—'],
      ['close_date', (v, r, td) => { if (v && v < today) td.classList.add('flag'); return fdate(v); }],
      ['amount', money, 'num'], ['deal_owner'], ['account_owner'], ['contacts', people],
      ['last_activity', (v, r, td) => { if (!v || v < daysAgo(90)) td.classList.add('flag'); return v ? fdate(v) : 'never'; }]];
    fill('#ac-tbl', list, cols);
    // notes go on a full-width line under each deal, so they stay readable without sideways scrolling
    const trs = [...document.querySelectorAll('#ac-tbl tbody > tr')];
    list.forEach((r, i) => {
      const parts = [['', r.remarks], ['Next step:', r.next_step], ['Why this rating:', r.conv_reason], ['Action:', [r.cta, r.cta_reason].filter(Boolean).join(' — ')]].filter((p) => p[1]);
      const tr = el('tr', 'note-row'), td = el('td', 'notes'); td.colSpan = cols.length;
      if (parts.length) parts.forEach(([l, t]) => { const s = el('span', 'np'); if (l) s.appendChild(el('span', 'lbl', l + ' ')); s.append(t); td.appendChild(s); });
      else td.appendChild(el('span', 'lbl', 'No notes in HubSpot'));
      tr.appendChild(td); trs[i].classList.add('has-note'); trs[i].after(tr);
    });
  }

  // ---------- MQL & SQL ----------
  function ldRows() {
    const t = $('#ld-type-f').value, p = $('#ld-period-f').value, o = $('#ld-owner-f').value, q = $('#ld-q').value.trim().toLowerCase();
    const from = p === '90' ? daysAgo(90) : p === 'fy' ? FY0 : '';
    const inP = (d) => d && (!from || d >= from);
    return byCountry(D.leads).filter((r) => {
      const okType = !t || (t === 'mql' ? inP(r.mql_date) : t === 'sql' ? inP(r.sql_date) : t === 'nowmql' ? r.stage === 'Marketing Qualified Lead' : r.stage === 'Sales Qualified Lead');
      const okPeriod = (t === 'mql' || t === 'sql') ? true : (!from || inP(r.mql_date) || inP(r.sql_date));
      return okType && okPeriod && (!o || r.owner === o) && match(q, r.name, r.title, r.company);
    });
  }
  function drawLeads() {
    const base = byCountry(D.leads);
    fillSelect('#ld-owner-f', opts(base, 'owner'), 'All owners');
    const mql = base.filter((r) => r.mql_date), sql = base.filter((r) => r.sql_date);
    const mqlFy = mql.filter((r) => r.mql_date >= FY0), sqlFy = sql.filter((r) => r.sql_date >= FY0);
    const m90 = mql.filter((r) => r.mql_date >= daysAgo(90)), s90 = sql.filter((r) => r.sql_date >= daysAgo(90));
    kpis('#ld-kpis', [
      ['MQLs, FY27 to date', num(mqlFy.length), num(m90.length) + ' in the last 90 days'],
      ['SQLs, FY27 to date', num(sqlFy.length), num(s90.length) + ' in the last 90 days'],
      ['Currently at MQL', num(base.filter((r) => r.stage === 'Marketing Qualified Lead').length), 'Waiting to be worked to SQL'],
      ['Currently at SQL', num(base.filter((r) => r.stage === 'Sales Qualified Lead').length), 'Sales-accepted, not yet opportunity']
    ]);
    const cs = country ? [country] : ORDER;
    const line = (label, a, cls) => {
      const m = a.filter((r) => r.mql_date), s = a.filter((r) => r.sql_date), both = m.filter((r) => r.sql_date);
      const tr = el('tr', cls);
      [label, num(m.length), num(s.length), num(m.filter((r) => r.mql_date >= FY0).length), num(s.filter((r) => r.sql_date >= FY0).length),
        num(a.filter((r) => r.stage === 'Marketing Qualified Lead').length), num(a.filter((r) => r.stage === 'Sales Qualified Lead').length),
        m.length ? pct(both.length / m.length) : '—'].forEach((v, i) => tr.append(el('td', i ? 'num' : null, v)));
      return tr;
    };
    const rows = cs.map((c) => line(c, D.leads.filter((r) => r.country === c)));
    if (!country) rows.push(line('All SEA', D.leads, 'total'));
    $('#ld-sum tbody').replaceChildren(...rows);
    const months = lastMonths(18);
    const series = [{key: 'mql', label: 'MQL', color: css('--c1')}, {key: 'sql', label: 'SQL', color: css('--c2')}];
    legend('#ld-legend', series.map((s) => [s.color, s.label]));
    monthBars('#ld-chart', months, series, (m, k) => base.filter((r) => (r[k + '_date'] || '').slice(0, 7) === m).length, (v) => d3.format(',')(v), true);
    const list = ldRows();
    $('#ld-note').textContent = num(list.length) + ' contacts' + (country ? ' in ' + country : ' across SEA') + '. Names open the contact in HubSpot. Only names and job titles are shown here; email and phone stay in HubSpot.';
    fill('#ld-tbl', list, [['country'], ['name', dealLink], ['title'], ['company'], ['stage'], ['mql_date', fdate], ['sql_date', fdate],
      ['owner'], ['source'], ['deals', num, 'num'], ['last_activity', (v) => v ? fdate(v) : '—']]);
  }
})();
