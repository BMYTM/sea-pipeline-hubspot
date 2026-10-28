/* Weekly status report deck (same layout as WSR_Leaders.xlsx): builds a PowerPoint in the browser from data/details.json and data/sea.json.
   Fiscal year runs April to March; compares with the same months of the previous fiscal year.
   On-hold deals are left out, as on the rest of the portal. */
(() => {
  const BTN = document.querySelector('#wsr-btn');
  if (!BTN) return;
  const COL = {navy: '0B1F4D', blue: '0033CC', ink: '1A1F2E', mute: '7A8BB5', pale: 'C8D3F0', tint: 'EEF2FA', stripe: 'F7F9FD', line: 'D5DCEB', grey: '5A6478'};
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
    // One slide per sheet of WSR_Leaders.xlsx, in the same order, with the same headers and row layout.
    const pres = new window.PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.theme = {headFontFace: 'Calibri', bodyFontFace: 'Calibri'};
    pres.title = 'SEA Weekly Status Report ' + M.asof;
    const XL = {blue: '0033CC', line: 'A6A6A6', ink: '000000', mute: '595959'};
    const foot = 'Source: HubSpot (SEA Sales Pipeline), data as of ' + dt(M.asof) + ' · USD · On-Hold deals excluded';
    pres.defineSlideMaster({title: 'Sheet', background: {color: 'FFFFFF'},
      slideNumber: {x: 12.3, y: 7.05, w: 0.5, h: 0.3, fontSize: 9, color: XL.mute, align: 'right'},
      objects: [{text: {text: foot, options: {x: 0.5, y: 7.05, w: 10.5, h: 0.3, fontSize: 9, color: XL.mute, margin: 0}}}]});
    const sheet = (title, sub) => { const s = pres.addSlide({masterName: 'Sheet'});
      s.addText(title, {x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontSize: 26, bold: true, color: XL.blue, margin: 0, valign: 'middle'});
      if (sub) s.addText(sub, {x: 0.5, y: 0.88, w: 12.3, h: 0.3, fontSize: 12, color: XL.mute, margin: 0});
      return s; };
    const H = (t, o = {}) => ({text: t, options: Object.assign({bold: true, color: 'FFFFFF', fill: {color: XL.blue}, align: 'center', valign: 'middle'}, o)});
    const C = (t, align = 'left', o = {}) => ({text: t == null || t === '' ? '—' : String(t), options: Object.assign({align, valign: 'middle', color: XL.ink, fill: {color: 'FFFFFF'}}, o)});
    const T = (t, align = 'left', o = {}) => C(t === '' ? ' ' : t, align, Object.assign({bold: true, color: 'FFFFFF', fill: {color: XL.blue}}, o));
    const grid = (s, rows, o) => s.addTable(rows, {x: o.x || 0.5, y: o.y || 1.3, w: o.colW.reduce((a, b) => a + b, 0), colW: o.colW, fontSize: o.fs || 12, fontFace: 'Calibri',
      rowH: o.rowH || 0.3, border: {type: 'solid', pt: 0.75, color: XL.line}, margin: [0.03, 0.07, 0.03, 0.07], autoPage: false});
    const pages = (rows, per) => { const out = []; for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per)); return out.length ? out : [[]]; };
    const part = (pi, all) => all.length > 1 ? ' (' + (pi + 1) + ' of ' + all.length + ')' : '';
    const note = (s, text, y) => s.addText(text, {x: 0.5, y, w: 12.3, h: 0.35, fontSize: 11, italic: true, color: XL.mute, margin: 0});
    const sumOf = (a, f) => a.reduce((t, r) => t + (f(r) || 0), 0);
    const ytdLabel = 'Apr–' + MN[M.months[M.elapsed - 1].m - 1];

    // Cover
    let s = pres.addSlide(); s.background = {color: XL.blue};
    s.addText('SEA Weekly Status Report', {x: 0.8, y: 2.4, w: 11.7, h: 1.2, fontSize: 44, bold: true, color: 'FFFFFF', valign: 'bottom', margin: 0});
    s.addText('Thailand · Philippines · Indonesia · Malaysia · Singapore\n' + M.fy + ' (Apr ' + M.fy0 + ' – Mar ' + (M.fy0 + 1) + ') vs ' + M.pfy + ' · HubSpot data as of ' + dt(M.asof),
      {x: 0.8, y: 3.75, w: 11.7, h: 1.0, fontSize: 20, color: 'DCE4FF', valign: 'top', margin: 0});

    // 1. Overview- Annual
    s = sheet('Overview – Annual', M.fy + ' · YTD = ' + ytdLabel + ' (' + M.elapsed + ' of 12 months)');
    const ytdPct = M.ytdTarget ? M.ytd.cur / M.ytdTarget : null, annPct = M.target ? M.ytd.cur / M.target : null;
    grid(s, [[H('Description'), H('ACV (LC)'), H('ACV ($)')],
      [C('Annual Target'), C('—', 'right'), C(n0(M.target), 'right')],
      [C('YTD Target'), C('—', 'right'), C(n0(M.ytdTarget), 'right')],
      [C('No. of Contracts Signed'), C(String(M.won.length), 'center', {colspan: 2})],
      [C('YTD ACV'), C('—', 'right'), C(n0(M.ytd.cur), 'right')],
      [C('YTD Achievement'), C('—', 'right'), C(n0(M.ytd.cur), 'right')],
      [C('YTD %'), C('—', 'right'), C(pc(ytdPct), 'right')],
      [C('Annual %'), C('—', 'right'), C(pc(annPct), 'right')]], {y: 1.5, colW: [4.2, 2.6, 2.6], fs: 16, rowH: 0.55});
    note(s, 'ACV (LC) is blank: SEA deals are booked in USD in HubSpot. Same months of ' + M.pfy + ': ' + n0(M.ytd.prev) + ' (' + sg(M.ytd.yoy) + ').', 6.2);

    // 2. Sheet4: monthly ACV vs last year and target
    s = sheet('Monthly ACV – ' + M.fy + ' vs ' + M.pfy + ' and Target', 'Quarters are fiscal (Q1 = Apr–Jun) · YTD = ' + ytdLabel);
    const s4 = [[H('Month', {rowspan: 3}), H(M.pfy + ' Actual', {rowspan: 3}), H(M.fy, {colspan: 2, rowspan: 2}), H('Variance ACV', {colspan: 4})],
      [H('YOY', {colspan: 2}), H('Target ' + M.fy, {colspan: 2})],
      [H('Target'), H('Actual'), H('Value'), H('%'), H('Value'), H('%')]];
    const v4 = (r, tot) => { const f = tot ? T : C; return [f(r.label, 'left'), f(n0(r.prev), 'right'), f(n0(r.target), 'right'), f(n0(r.cur), 'right'),
      f(n0(r.cur - r.prev), 'right'), f(r.prev ? pc((r.cur - r.prev) / r.prev) : '—', 'right'), f(n0(r.cur - r.target), 'right'), f(pc(r.vt), 'right')]; };
    M.monthly.forEach((r, i) => s4.push(v4({label: MFULL[M.months[i].m - 1], prev: r.prev, cur: r.cur, target: r.target, vt: r.target ? (r.cur - r.target) / r.target : null})));
    M.quarters.forEach((q) => s4.push(v4(q)));
    s4.push(v4(M.ytd, true), v4(M.full, true));
    grid(s, s4, {y: 1.25, colW: [1.7, 1.75, 1.45, 1.45, 1.45, 1.0, 1.55, 1.0], fs: 10.5, rowH: 0.255});

    // 3. Sheet3: contracts and ACV by month
    s = sheet('Contracts and ACV by Month – ' + M.fy, 'TCV is shown once Total contract value is filled in on won deals in HubSpot');
    const s3 = [[H('Month', {rowspan: 2}), H('Number of Contracts', {rowspan: 2}), H('TCV', {colspan: 3}), H('ACV', {colspan: 3})],
      [H('Implementation'), H('Subscription'), H('Total'), H('Implementation'), H('Subscription '), H('Total')]];
    const byM = M.months.map((x) => { const rs = M.won.filter((r) => r.close_date.slice(0, 7) === x.key);
      return {label: MFULL[x.m - 1] + ' ' + x.y, n: rs.length, tcv: rs.some((r) => r.tcv != null) ? sumOf(rs, (r) => r.tcv) : null, impl: sumOf(rs, (r) => r.implementation), sub: sumOf(rs, (r) => r.subscription), acv: sumOf(rs, val)}; });
    const agg = (label, rs) => ({label, n: sumOf(rs, (r) => r.n), tcv: rs.some((r) => r.tcv != null) ? sumOf(rs, (r) => r.tcv) : null, impl: sumOf(rs, (r) => r.impl), sub: sumOf(rs, (r) => r.sub), acv: sumOf(rs, (r) => r.acv)});
    const v3 = (r, tot) => { const f = tot ? T : C; return [f(r.label), f(String(r.n), 'center'), f('—', 'right'), f('—', 'right'), f(r.tcv != null ? n0(r.tcv) : '—', 'right'), f(n0(r.impl), 'right'), f(n0(r.sub), 'right'), f(n0(r.acv), 'right')]; };
    byM.forEach((r) => s3.push(v3(r)));
    [0, 1, 2, 3].forEach((q) => s3.push(v3(agg('Q' + (q + 1), byM.slice(q * 3, q * 3 + 3)))));
    s3.push(v3(agg('Total', byM), true));
    grid(s, s3, {y: 1.3, colW: [2.0, 1.7, 1.5, 1.35, 1.2, 1.5, 1.35, 1.4], fs: 11, rowH: 0.28});

    // 4. Sheet2: contracts signed this year
    const wonRows = M.won.map((r, i) => [C(String(i + 1), 'center'), C(r.company || r.deal), C(mon(r.close_date)), C(r.tcv != null ? n0(r.tcv) : '—', 'right'),
      C(r.tcv != null && r.acv ? (r.tcv / r.acv).toFixed(1) + ' yrs' : '—', 'center'), C(n0(r.implementation), 'right'), C(n0(r.subscription), 'right'), C(n0(val(r)), 'right')]);
    pages(wonRows, 14).forEach((pg, pi, all) => {
      s = sheet('Contracts Signed – ' + M.fy + part(pi, all), 'Closed-won SEA deals with a close date in ' + M.fy);
      const rows = [[H('S.No.'), H('Client Name'), H('Signed Month'), H('TCV'), H('Term'), H('Implementation '), H('Subscription'), H('Total ACV')]].concat(pg.length ? pg : [[C('No contracts signed yet in ' + M.fy, 'left', {colspan: 8})]]);
      if (pi === all.length - 1) rows.push([T('Total', 'left', {colspan: 2}), T(''), T(M.won.some((r) => r.tcv != null) ? n0(sumOf(M.won, (r) => r.tcv)) : '—', 'right'), T(''),
        T(n0(sumOf(M.won, (r) => r.implementation)), 'right'), T(n0(sumOf(M.won, (r) => r.subscription)), 'right'), T(n0(M.wonTotal), 'right')]);
      grid(s, rows, {colW: [0.6, 2.7, 1.2, 0.9, 0.8, 1.35, 1.05, 1.0], fs: 12, rowH: 0.42});
      grid(s, [[H('Contracts Signed This Year')], [C(String(M.won.length), 'center', {bold: true, fontSize: 28})]], {x: 10.35, y: 1.3, colW: [2.45], fs: 12, rowH: 0.5});
    });

    // 5. Proposals Sent
    const pr = M.props.map((r, i) => [C(String(i + 1), 'center'), C(r.company || r.deal), C(r.country), C(n0(r.headcount), 'right'), C(dt(r.close_date)), C(pc(r.probability), 'right'),
      C(n0(r.implementation), 'right'), C(n0(r.subscription), 'right'), C(n0(val(r)), 'right')]);
    pages(pr, 15).forEach((pg, pi, all) => {
      s = sheet('Proposals Sent' + part(pi, all), M.props.length + ' open deals in Proposal Sent');
      const rows = [[H('S.No.'), H('Clients Name'), H('Location'), H('Headcount'), H('Expected Date of Closure'), H('Closure Probability %'), H('Implementation'), H('Subscription'), H('ACV')]]
        .concat(pg.length ? pg : [[C('No open deals in Proposal Sent', 'left', {colspan: 9})]]);
      if (pi === all.length - 1) rows.push([T('Total', 'left', {colspan: 6}), T(n0(sumOf(M.props, (r) => r.implementation)), 'right'), T(n0(sumOf(M.props, (r) => r.subscription)), 'right'), T(n0(sumOf(M.props, val)), 'right')]);
      grid(s, rows, {colW: [0.6, 3.6, 1.15, 1.05, 1.5, 1.25, 1.15, 1.1, 0.9], fs: 10.5, rowH: 0.3});
    });

    // 6. Pipeline
    const pl = M.pipe.map((r, i) => [C(String(i + 1), 'center'), C(r.company || r.deal), C(r.country), C(n0(r.headcount), 'right'), C(src(r)), C(stageLbl(r.stage)), C(dt(r.close_date)), C(pc(r.probability), 'right'),
      C(n0(r.implementation), 'right'), C(n0(r.subscription), 'right'), C(n0(val(r)), 'right')]);
    pages(pl, 15).forEach((pg, pi, all) => {
      s = sheet('Pipeline' + part(pi, all), M.pipe.length + ' open deals (Demo → Contracting), ' + k(sumOf(M.pipe, val)) + ' ACV');
      const rows = [[H('S.No.'), H('Clients Name'), H('Location'), H('Headcount'), H('Source'), H('Current Stage'), H('Expected Date of Closure'), H('Closure Probability'), H('Implementation'), H('Subscription'), H('Total ACV')]].concat(pg);
      if (pi === all.length - 1) rows.push([T('Total', 'left', {colspan: 8}), T(n0(sumOf(M.pipe, (r) => r.implementation)), 'right'), T(n0(sumOf(M.pipe, (r) => r.subscription)), 'right'), T(n0(sumOf(M.pipe, val)), 'right')]);
      grid(s, rows, {colW: [0.5, 2.4, 0.95, 0.85, 1.75, 1.1, 1.1, 0.85, 1.05, 0.95, 0.85], fs: 9.5, rowH: 0.3});
    });

    // 7. Meetings Completed
    const showRecent = M.recent.length > 0, ml = (showRecent ? M.recent : M.done).slice(0, 20);
    const person = (m) => (m.deal.contacts || [])[0] || {};
    const mc = ml.map((m, i) => { const r = m.deal, p = person(m); return [C(String(i + 1), 'center'), C(dt(m.date)), C(r.company || r.deal), C(r.country), C(n0(r.headcount), 'right'), C(src(r)), C(p.name), C(p.title),
      C(r.next_step || (m.title ? 'Meeting: ' + m.title : '—'))]; });
    pages(mc, 10).forEach((pg, pi, all) => {
      s = sheet('Meetings Completed' + part(pi, all), showRecent ? M.recent.length + ' meetings in the last 30 days' : 'None in the last 30 days · latest ' + ml.length + ' logged shown (last: ' + (ml[0] ? dt(ml[0].date) : '—') + ')');
      const rows = [[H('S.No.'), H('Meeting Date'), H('Clients Name'), H('Location'), H('Headcount'), H('Source'), H('Point of Contact'), H('Title'), H('Next Steps')]]
        .concat(pg.length ? pg : [[C('No meetings logged on open or won SEA deals', 'left', {colspan: 9})]]);
      if (pi === all.length - 1) rows.push([T('Total', 'left', {colspan: 8}), T(String(ml.length), 'center')]);
      grid(s, rows, {colW: [0.55, 1.15, 2.2, 1.0, 0.9, 1.6, 1.5, 1.3, 2.1], fs: 9.5, rowH: 0.42});
    });

    // 8. Meetings Scheduled
    const up = M.upcoming.slice(0, 20);
    const ms = up.map((m, i) => { const r = m.deal, p = person(m); return [C(String(i + 1), 'center'), C(dt(m.date)), C('—', 'center'), C(r.company || r.deal), C(r.country), C(n0(r.headcount), 'right'), C(src(r)), C(p.name), C(p.title),
      C(m.title ? 'Meeting: ' + m.title : r.next_step)]; });
    pages(ms, 10).forEach((pg, pi, all) => {
      s = sheet('Meetings Scheduled' + part(pi, all), up.length + ' upcoming meeting' + (up.length === 1 ? '' : 's') + ' on open SEA deals · Meeting Type is not recorded in HubSpot');
      const rows = [[H('S.No.'), H('Meeting Date'), H('Meeting Type'), H('Clients Name'), H('Location'), H('Headcount'), H('Source'), H('Point of Contact'), H('Title'), H('Next Steps')]]
        .concat(pg.length ? pg : [[C('No upcoming meetings linked to open SEA deals in HubSpot', 'left', {colspan: 10})]]);
      if (pi === all.length - 1) rows.push([T('Total', 'left', {colspan: 9}), T(String(up.length), 'center')]);
      grid(s, rows, {colW: [0.55, 1.15, 1.0, 2.0, 1.0, 0.9, 1.5, 1.45, 1.2, 1.55], fs: 9.5, rowH: 0.42});
    });

    // 9. AR
    s = sheet('AR', 'From Invoice Raised Date, Payment Status and Amount Received Date on ' + M.fy + ' won deals');
    const ar = M.won.filter((r) => r.invoice_date || r.payment_status || r.paid_date);
    const arRows = [[H('S.No.'), H('Clients Name'), H('Amount Due'), H('Date of Invoice'), H('Expected Date of Payment')]]
      .concat(ar.length ? ar.map((r, i) => [C(String(i + 1), 'center'), C(r.company || r.deal), C(r.payment_status && /paid/i.test(r.payment_status) ? '0' : '—', 'right'), C(dt(r.invoice_date)), C(r.paid_date ? 'Paid ' + dt(r.paid_date) : '—')])
        : [[C('No invoice or payment details are filled in on won deals in HubSpot yet', 'left', {colspan: 5})]]);
    arRows.push([T('Total', 'left', {colspan: 2}), T('—', 'right'), T(''), T('')]);
    grid(s, arRows, {colW: [0.8, 4.2, 2.0, 2.2, 3.1], fs: 13, rowH: 0.45});

    // Appendix: data gaps
    s = sheet('Appendix – HubSpot data to update', 'Fields behind the blank cells in this report');
    grid(s, [[H('What is missing', {align: 'left'}), H('Deals'), H('Out of')]].concat(M.gaps.map(([a, b, c]) => [C(a), C(String(b), 'right'), C(String(c), 'right')])),
      {y: 1.4, colW: [8.6, 1.6, 1.6], fs: 14, rowH: 0.45});
    return pres;
  }

  BTN.addEventListener('click', async () => {
    const label = BTN.textContent; BTN.disabled = true; BTN.textContent = 'Building…';
    try {
      const [D, SEA] = await Promise.all([getJSON('data/details.json'), getJSON('data/sea.json'), loadLib()]);
      const M = model(D, SEA);
      window.SEA_REPORT_MODEL = M; // for tests
      await build(M).writeFile({fileName: 'SEA_Weekly_Status_Report_' + M.asof + '.pptx'});
    } catch (e) { alert('Could not build the weekly review: ' + e.message); }
    finally { BTN.disabled = false; BTN.textContent = label; }
  });
})();
