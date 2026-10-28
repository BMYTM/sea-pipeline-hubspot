/* Weekly review deck: builds a PowerPoint in the browser from data/details.json and data/sea.json.
   Fiscal year runs April to March; compares with the same months of the previous fiscal year.
   On-hold deals are left out, as on the rest of the portal. */
(() => {
  const BTN = document.querySelector('#wsr-btn');
  if (!BTN) return;
  const COL = {navy: '0B1F4D', blue: '0033CC', ink: '1A1F2E', mute: '7A8BB5', pale: 'C8D3F0', tint: 'EEF2FA', stripe: 'F7F9FD', line: 'D5DCEB', grey: '5A6478'};
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const loadLib = () => window.PptxGenJS ? Promise.resolve() : new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'vendor/pptxgen.bundle.js'; s.onload = ok; s.onerror = () => no(new Error('could not load the PowerPoint library')); document.head.appendChild(s);
  });
  const getJSON = (u) => fetch(u, {cache: 'no-cache'}).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });

  // ---------- formatting ----------
  const k = (v) => v == null || isNaN(v) ? '—' : Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + Math.round(v / 1000) + 'K';
  const n0 = (v) => v == null || v === '' || isNaN(v) ? '—' : Math.round(v).toLocaleString('en-US');
  const pc = (v) => v == null || !isFinite(v) ? '—' : Math.round(v * 100) + '%';
  const sg = (v) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
  const dt = (s) => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return d + ' ' + MN[m - 1] + ' ' + y; };
  const mon = (s) => { const [y, m] = s.slice(0, 7).split('-').map(Number); return MN[m - 1] + ' ' + y; };
  const val = (r) => r.year1_total != null ? r.year1_total : (r.amount || 0);
  const src = (r) => [r.source, r.sub_source && r.sub_source !== r.source ? r.sub_source : null].filter(Boolean).join(' · ') || '—';
  const stageLbl = (s) => s === 'Demo/Developing' ? 'Demo' : s;
  const pad = (n) => String(n).padStart(2, '0');

  function model(D, SEA) {
    const asof = new Date(Date.parse(D.generated_at) + 7 * 36e5).toISOString().slice(0, 10); // Bangkok date
    const [ay, am] = asof.split('-').map(Number);
    const fy0 = am >= 4 ? ay : ay - 1;
    const fy = 'FY' + String(fy0 + 1).slice(2), pfy = 'FY' + String(fy0).slice(2);
    const months = Array.from({length: 12}, (_, i) => { const m = (i + 3) % 12 + 1, y = m >= 4 ? fy0 : fy0 + 1; return {y, m, key: y + '-' + pad(m)}; });
    const range = (y0) => [y0 + '-04-01', (y0 + 1) + '-04-01'];
    const [c0, c1] = range(fy0), [p0, p1] = range(fy0 - 1);
    const elapsed = months.filter((x) => x.key <= asof.slice(0, 7)).length;
    const target = SEA.target_usd || 0;
    const won = D.closures.filter((r) => r.close_date >= c0 && r.close_date < c1).sort((a, b) => a.close_date.localeCompare(b.close_date));
    const prevWon = D.closures.filter((r) => r.close_date >= p0 && r.close_date < p1);
    const byMonth = (rows, shiftYears) => { const o = {}; rows.forEach((r) => { const y = Number(r.close_date.slice(0, 4)) + shiftYears; const key = y + '-' + r.close_date.slice(5, 7); o[key] = (o[key] || 0) + val(r); }); return o; };
    const cur = byMonth(won, 0), prev = byMonth(prevWon, 1);
    const monthly = months.map((x) => ({label: MN[x.m - 1], prev: prev[x.key] || 0, cur: cur[x.key] || 0, target: target / 12}));
    const sum = (a, f) => a.reduce((t, r) => t + f(r), 0);
    const block = (label, a, b) => { const s = monthly.slice(a, b); const p = sum(s, (r) => r.prev), c = sum(s, (r) => r.cur), t = sum(s, (r) => r.target);
      return {label, prev: p, cur: c, target: t, yoy: p ? (c - p) / p : null, vt: t ? (c - t) / t : null}; };
    const quarters = [0, 1, 2, 3].map((q) => block('Q' + (q + 1), q * 3, q * 3 + 3));
    const ytd = block('YTD', 0, elapsed), full = block('Total', 0, 12);
    const active = D.active.filter((r) => r.stage !== 'On-Hold');
    const order = {'Commercial/Contracting': 0, 'Proposal Sent': 1, 'Demo/Developing': 2};
    const pipe = active.slice().sort((a, b) => (order[a.stage] ?? 9) - (order[b.stage] ?? 9) || (b.amount || 0) - (a.amount || 0));
    const props = pipe.filter((r) => r.stage === 'Proposal Sent');
    const deals = new Map(active.concat(D.closures).map((r) => [r.id, r]));
    const seen = new Set(), meets = [];
    (D.meetings || []).forEach((m) => { if (seen.has(m.id) || !deals.has(m.deal_id)) return; seen.add(m.id); meets.push(Object.assign({deal: deals.get(m.deal_id)}, m)); });
    const done = meets.filter((m) => m.date <= asof), upcoming = meets.filter((m) => m.date > asof).reverse();
    const since = new Date(Date.parse(asof) - 30 * 864e5).toISOString().slice(0, 10);
    const recent = done.filter((m) => m.date >= since);
    const ninety = new Date(Date.parse(asof) - 90 * 864e5).toISOString().slice(0, 10);
    const gaps = [
      ['Open deals with no Next step', active.filter((r) => !r.next_step).length, active.length],
      ['Open deals with no implementation / subscription split', active.filter((r) => r.subscription == null).length, active.length],
      ['Open deals with no amount', active.filter((r) => !r.amount).length, active.length],
      ['Open deals with no headcount', active.filter((r) => r.headcount == null).length, active.length],
      ['Open deals with no meeting logged in 90 days', active.filter((r) => !r.last_meeting || r.last_meeting < ninety).length, active.length],
      [fy + ' wins with no Total contract value', won.filter((r) => r.tcv == null).length, won.length],
      [fy + ' wins with no invoice or payment details', won.filter((r) => !r.invoice_date && !r.payment_status && !r.paid_date).length, won.length]];
    return {asof, fy, pfy, fy0, months, elapsed, target, won, monthly, quarters, ytd, full, pipe, props, done, recent, upcoming, gaps,
      wonTotal: sum(won, val), ytdTarget: target / 12 * elapsed};
  }

  function build(M) {
    const pres = new window.PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.theme = {headFontFace: 'Calibri', bodyFontFace: 'Calibri'};
    pres.title = 'SEA Weekly Review ' + M.asof;
    const foot = 'Source: HubSpot (SEA Sales Pipeline), data as of ' + dt(M.asof) + ' · USD · On-Hold deals excluded';
    pres.defineSlideMaster({title: 'Title', background: {color: COL.navy}, objects: []});
    pres.defineSlideMaster({title: 'Content', background: {color: 'FFFFFF'},
      slideNumber: {x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: COL.mute, align: 'right'},
      objects: [{text: {text: foot, options: {x: 0.6, y: 7.0, w: 10.5, h: 0.3, fontSize: 10, color: COL.mute, margin: 0}}}]});
    const slide = (title) => { const s = pres.addSlide({masterName: 'Content'}); s.addText(title, {x: 0.6, y: 0.35, w: 12.1, h: 0.75, fontSize: 30, bold: true, color: COL.navy, margin: 0, valign: 'middle'}); return s; };
    const table = (s, head, rows, o) => {
      const hdr = head.map((h, i) => ({text: h, options: {bold: true, color: 'FFFFFF', fill: {color: COL.blue}, align: o.align[i], valign: 'middle'}}));
      const body = rows.map((r, ri) => r.map((c, i) => ({text: c == null ? '—' : String(c), options: {align: o.align[i], valign: 'middle', bold: !!r.total, color: COL.ink,
        fill: {color: r.total ? COL.tint : ri % 2 ? COL.stripe : 'FFFFFF'}}})));
      s.addTable([hdr].concat(body), {x: o.x || 0.6, y: o.y || 1.25, w: o.colW.reduce((a, b) => a + b, 0), colW: o.colW, fontSize: o.fs || 11, fontFace: 'Calibri',
        rowH: o.rowH || 0.3, border: {type: 'solid', pt: 0.5, color: COL.line}, margin: [0.03, 0.06, 0.03, 0.06], autoPage: false});
    };
    const tot = (cells) => Object.assign(cells, {total: true});
    const pages = (rows, per) => { const out = []; for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per)); return out.length ? out : [[]]; };
    const note = (s, text, y) => s.addText(text, {x: 0.6, y, w: 12.1, h: 0.4, fontSize: 12, color: COL.mute, margin: 0});
    const empty = (s, text) => { s.addShape(pres.shapes.ROUNDED_RECTANGLE, {x: 0.6, y: 1.5, w: 12.1, h: 1.6, fill: {color: COL.tint}, line: {type: 'none'}, rectRadius: 0.12});
      s.addText(text, {x: 1.0, y: 1.5, w: 11.3, h: 1.6, fontSize: 18, color: COL.navy, valign: 'middle', margin: 0}); };

    // 1. Cover
    let s = pres.addSlide({masterName: 'Title'});
    s.addText('SEA Weekly Review', {x: 0.8, y: 2.3, w: 11.7, h: 1.3, fontSize: 44, bold: true, color: 'FFFFFF', valign: 'bottom', margin: 0});
    s.addText('Thailand · Philippines · Indonesia · Malaysia · Singapore\n' + M.fy + ' (Apr ' + M.fy0 + ' – Mar ' + (M.fy0 + 1) + ') vs ' + M.pfy + ' · HubSpot data as of ' + dt(M.asof),
      {x: 0.8, y: 3.75, w: 11.7, h: 1.0, fontSize: 20, color: COL.pale, valign: 'top', margin: 0});

    // 2. Overview
    const ytdPct = M.ytdTarget ? M.ytd.cur / M.ytdTarget : null;
    s = slide(M.fy + ' is at ' + pc(ytdPct) + ' of the year-to-date target');
    const cards = [[M.fy + ' target', k(M.target), 'Apr – Mar, ' + k(M.target / 12) + ' a month'],
      ['YTD target (Apr–' + MN[M.months[M.elapsed - 1].m - 1] + ')', k(M.ytdTarget), M.elapsed + '/12 of the annual target'],
      ['Contracts signed', String(M.won.length), 'Closed-won in ' + M.fy + ' so far'],
      [M.fy + ' YTD ACV', k(M.ytd.cur), 'vs ' + k(M.ytd.prev) + ' same months ' + M.pfy + ' (' + sg(M.ytd.yoy) + ')'],
      ['YTD achievement', pc(ytdPct), 'YTD ACV ÷ YTD target'],
      ['Annual achievement', pc(M.target ? M.ytd.cur / M.target : null), 'YTD ACV ÷ ' + M.fy + ' target']];
    cards.forEach(([lab, v, sub], i) => {
      const x = 0.6 + (i % 3) * 4.1, y = 1.5 + Math.floor(i / 3) * 2.65, dark = i === 4;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {x, y, w: 3.8, h: 2.35, fill: {color: dark ? COL.navy : COL.tint}, line: {type: 'none'}, rectRadius: 0.12});
      s.addText(lab, {x: x + 0.3, y: y + 0.25, w: 3.2, h: 0.4, fontSize: 16, color: dark ? COL.pale : COL.mute, margin: 0});
      s.addText(v, {x: x + 0.3, y: y + 0.7, w: 3.2, h: 0.95, fontSize: 48, bold: true, color: dark ? 'FFFFFF' : COL.navy, margin: 0});
      s.addText(sub, {x: x + 0.3, y: y + 1.7, w: 3.3, h: 0.45, fontSize: 12, color: dark ? COL.pale : COL.mute, margin: 0});
    });

    // 3. Monthly vs last year and target
    s = slide('Monthly ACV: ' + M.fy + ' vs ' + M.pfy + ' and target');
    const labels = M.monthly.map((r) => r.label);
    s.addChart(pres.charts.BAR, [{name: M.pfy + ' actual', labels, values: M.monthly.map((r) => r.prev)},
      {name: M.fy + ' target', labels, values: M.monthly.map((r) => r.target)}, {name: M.fy + ' actual', labels, values: M.monthly.map((r) => r.cur)}],
      {x: 0.6, y: 1.3, w: 8.2, h: 5.5, barDir: 'col', barGrouping: 'clustered', chartColors: [COL.pale, COL.mute, COL.blue], showLegend: true, legendPos: 'b', legendFontSize: 12,
        catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, catAxisLabelColor: COL.grey, valAxisLabelColor: COL.grey, valAxisLabelFormatCode: '$#,##0,"K"',
        valGridLine: {color: 'E3E8F2', size: 0.5}, catGridLine: {style: 'none'}});
    const qrow = (r) => { const row = [r.label, k(r.prev), k(r.cur), sg(r.yoy), k(r.target), sg(r.vt)]; return r.label === 'YTD' || r.label === 'Total' ? tot(row) : row; };
    table(s, ['Period', M.pfy, M.fy, 'vs ' + M.pfy, 'Target', 'vs target'], M.quarters.concat([M.ytd, M.full]).map(qrow),
      {x: 9.0, y: 1.5, colW: [0.6, 0.62, 0.62, 0.68, 0.62, 0.68], align: ['left', 'right', 'right', 'right', 'right', 'right'], fs: 11, rowH: 0.36});
    s.addText('Apr–' + MN[M.months[M.elapsed - 1].m - 1] + ' ACV is ' + k(M.ytd.cur) + ' against ' + k(M.ytd.prev) + ' in the same months of ' + M.pfy + ' (' + sg(M.ytd.yoy) + '). Quarters are fiscal (Q1 = Apr–Jun).',
      {x: 9.0, y: 4.3, w: 3.82, h: 1.4, fontSize: 14, color: COL.ink, margin: 0, valign: 'top'});

    // 4. Contracts signed
    const wonRows = M.won.map((r, i) => [i + 1, r.company || r.deal, r.country, mon(r.close_date), r.tcv != null ? n0(r.tcv) : '—', n0(r.implementation), n0(r.subscription), n0(val(r))]);
    pages(wonRows, 12).forEach((pg, pi, all) => {
      s = slide(M.won.length + ' contracts signed in ' + M.fy + ', ' + k(M.wonTotal) + ' ACV' + (all.length > 1 ? ' (' + (pi + 1) + ' of ' + all.length + ')' : ''));
      if (!M.won.length) { empty(s, 'No contracts signed yet in ' + M.fy + '.'); return; }
      const rows = pg.slice();
      if (pi === all.length - 1) rows.push(tot(['', 'Total', '', '', '', n0(M.won.reduce((t, r) => t + (r.implementation || 0), 0)), n0(M.won.reduce((t, r) => t + (r.subscription || 0), 0)), n0(M.wonTotal)]));
      table(s, ['#', 'Client', 'Location', 'Signed', 'TCV', 'Implementation', 'Subscription', 'Total ACV'], rows,
        {colW: [0.5, 3.9, 1.3, 1.3, 1.1, 1.6, 1.3, 1.2], align: ['center', 'left', 'left', 'left', 'right', 'right', 'right', 'right'], fs: 13, rowH: 0.42});
    });

    // 5. Proposals sent
    const propTotal = M.props.reduce((t, r) => t + val(r), 0);
    const pr = M.props.map((r, i) => [i + 1, r.company || r.deal, r.country, n0(r.headcount), dt(r.close_date), pc(r.probability), n0(r.implementation), n0(r.subscription), n0(val(r))]);
    pages(pr, 15).forEach((pg, pi, all) => {
      s = slide(M.props.length + ' proposals out, worth ' + k(propTotal) + ' ACV' + (all.length > 1 ? ' (' + (pi + 1) + ' of ' + all.length + ')' : ''));
      if (!M.props.length) { empty(s, 'No open deals in Proposal Sent.'); return; }
      const rows = pg.slice();
      if (pi === all.length - 1) rows.push(tot(['', 'Total', '', '', '', '', n0(M.props.reduce((t, r) => t + (r.implementation || 0), 0)), n0(M.props.reduce((t, r) => t + (r.subscription || 0), 0)), n0(propTotal)]));
      table(s, ['#', 'Client', 'Location', 'Headcount', 'Exp. closure', 'Prob.', 'Implementation', 'Subscription', 'ACV'], rows,
        {colW: [0.4, 3.9, 1.1, 1.0, 1.25, 0.65, 1.3, 1.25, 1.25], align: ['center', 'left', 'left', 'right', 'left', 'right', 'right', 'right', 'right'], fs: 11, rowH: 0.33});
    });

    // 6. Pipeline
    const pipeTotal = M.pipe.reduce((t, r) => t + val(r), 0);
    const pl = M.pipe.map((r, i) => [i + 1, r.company || r.deal, r.country, n0(r.headcount), src(r), stageLbl(r.stage), dt(r.close_date), pc(r.probability), n0(r.implementation), n0(r.subscription), n0(val(r))]);
    pages(pl, 15).forEach((pg, pi, all) => {
      s = slide('Open pipeline: ' + M.pipe.length + ' deals, ' + k(pipeTotal) + ' ACV' + (all.length > 1 ? ' (' + (pi + 1) + ' of ' + all.length + ')' : ''));
      const rows = pg.slice();
      if (pi === all.length - 1) rows.push(tot(['', 'Total', '', '', '', '', '', '', n0(M.pipe.reduce((t, r) => t + (r.implementation || 0), 0)), n0(M.pipe.reduce((t, r) => t + (r.subscription || 0), 0)), n0(pipeTotal)]));
      table(s, ['#', 'Client', 'Location', 'Headcount', 'Source', 'Stage', 'Exp. closure', 'Prob.', 'Impl.', 'Subscr.', 'Total ACV'], rows,
        {colW: [0.4, 2.75, 0.95, 0.85, 2.3, 1.05, 1.1, 0.5, 0.7, 0.75, 0.75], align: ['center', 'left', 'left', 'right', 'left', 'left', 'left', 'right', 'right', 'right', 'right'], fs: 10, rowH: 0.3});
    });

    // 7. Meetings completed
    const showRecent = M.recent.length > 0, ml = (showRecent ? M.recent : M.done).slice(0, 20);
    const mrow = (m, i) => { const r = m.deal, p = (r.contacts || [])[0] || {};
      return [i + 1, dt(m.date), r.company || r.deal, r.country, n0(r.headcount), src(r), p.name || '—', p.title || '—', r.next_step || (m.title ? 'Meeting: ' + m.title : '—')]; };
    const mOpt = {colW: [0.4, 1.1, 2.2, 0.95, 0.85, 1.5, 1.45, 1.25, 2.4], align: ['center', 'left', 'left', 'left', 'right', 'left', 'left', 'left', 'left'], fs: 10, rowH: 0.42};
    pages(ml.map(mrow), 10).forEach((pg, pi, all) => {
      const part = all.length > 1 ? ' (' + (pi + 1) + ' of ' + all.length + ')' : '';
      s = slide(showRecent ? 'Meetings completed in the last 30 days: ' + M.recent.length + part : 'Meetings completed: none in the last 30 days' + part);
      if (!ml.length) { empty(s, 'No meetings are logged on open or won SEA deals.'); return; }
      if (!showRecent && pi === 0) note(s, 'Showing the latest ' + ml.length + ' logged instead. Last meeting: ' + dt(ml[0].date) + '.', 1.15);
      table(s, ['#', 'Date', 'Client', 'Location', 'Headcount', 'Source', 'Point of contact', 'Title', 'Next steps'], pg, Object.assign({y: !showRecent && pi === 0 ? 1.6 : 1.25}, mOpt));
    });

    // 8. Meetings scheduled
    s = slide('Meetings scheduled: ' + M.upcoming.length);
    if (!M.upcoming.length) empty(s, 'No upcoming meetings are logged on open SEA deals (On-Hold excluded).');
    else table(s, ['#', 'Date', 'Client', 'Location', 'Headcount', 'Source', 'Point of contact', 'Title', 'Meeting'], M.upcoming.slice(0, 10).map((m, i) => { const row = mrow(m, i); row[8] = m.title || '—'; return row; }), mOpt);

    // 9. Data gaps
    s = slide('HubSpot data to update before the next review');
    table(s, ['What is missing', 'Deals', 'Out of'], M.gaps.map(([a, b, c]) => [a, b, c]), {y: 1.4, colW: [8.6, 1.6, 1.6], align: ['left', 'right', 'right'], fs: 14, rowH: 0.45});
    note(s, 'Accounts receivable needs the Invoice Raised Date, Payment Status and Amount Received Date fields on won deals. Contract term = Total contract value ÷ Annual contract value.', 5.0);
    return pres;
  }

  BTN.addEventListener('click', async () => {
    const label = BTN.textContent; BTN.disabled = true; BTN.textContent = 'Building…';
    try {
      const [D, SEA] = await Promise.all([getJSON('data/details.json'), getJSON('data/sea.json'), loadLib()]);
      const M = model(D, SEA);
      window.SEA_REPORT_MODEL = M; // for tests
      await build(M).writeFile({fileName: 'SEA_Weekly_Review_' + M.asof + '.pptx'});
    } catch (e) { alert('Could not build the weekly review: ' + e.message); }
    finally { BTN.disabled = false; BTN.textContent = label; }
  });
})();
