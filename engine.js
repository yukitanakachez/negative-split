/* Training engine: Daniels & Gilbert VDOT paces, periodised mileage, tapering. Exposes window.Engine. */
/* ============================== ENGINE START ============================== */
const Engine = (() => {
  const MAR = 42195, MI = 1.609344, DAY = 864e5;
  // Daniels & Gilbert (1979) oxygen-cost and drop-dead curves
  const vo2 = v => -4.60 + 0.182258 * v + 0.000104 * v * v;               // v in m/min
  const pct = t => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t in min
  const vdot = (d, s) => { const t = s / 60; return vo2(d / t) / pct(t); };
  function raceTime(d, V) { let lo = d * 0.1, hi = d * 1.5; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (vdot(d, m) > V) lo = m; else hi = m; } return (lo + hi) / 2; }
  const vAt = (V, f) => { const a = 0.000104, b = 0.182258, c = -4.60 - V * f; return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); };
  const spk = v => 60000 / v;
  const riegel = (d1, t1, d2) => t1 * Math.pow(d2 / d1, 1.06);
  function paces(V) {
    const I = spk(vAt(V, 0.975));
    return { V, E: [spk(vAt(V, 0.74)), spk(vAt(V, 0.63))], M: raceTime(MAR, V) / 42.195, T: spk(vAt(V, 0.88)), I, R: (I * 0.4 - 6) / 0.4 };
  }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const r05 = x => Math.max(0, Math.round(x / MI * 2) / 2 * MI); // half-mile steps
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const iso = d => d.toISOString().slice(0, 10);
  const addD = (d, n) => new Date(d.getTime() + n * DAY);
  const dowOf = d => (d.getUTCDay() + 6) % 7; // Mon = 0

  function hr(p) {
    const max = p.maxHr || Math.round(208 - 0.7 * p.age); // Tanaka 2001
    const rest = p.restHr || 0;
    const fr = rest ? { E: [.59, .74], M: [.75, .84], T: [.83, .88], I: [.95, 1] } : { E: [.65, .79], M: [.80, .89], T: [.88, .92], I: [.97, 1] };
    const z = {};
    for (const k in fr) z[k] = fr[k].map(f => Math.round(rest ? rest + f * (max - rest) : f * max));
    return { max, rest, karvonen: !!rest, measured: !!p.maxHr, z };
  }

  // ---- workout builders (distances in km, seg.z = zone) ----
  const W = km => ({ z: 'W', km: r05(km) });
  const wu = V => W(clamp(V * 0.06, 1.5, 3)), cd = V => W(clamp(V * 0.04, 1, 2));
  function mk(type, title, segs, extra = {}) { return Object.assign({ type, title, segs, tags: [] }, extra); }
  function finish(w, P, kg) {
    let km = 0, sec = 0;
    for (const s of w.segs) {
      if (s.reps) {
        const work = s.reps * s.repKm;
        const jogKm = s.jogSec ? (s.reps - 1) * s.jogSec / P.E[1] : 0;
        s.km = work + jogKm;
        sec += work * paceFor(s.z, P) + (s.reps - 1) * (s.jogSec || s.restSec || 0);
      } else sec += s.km * paceFor(s.z, P);
      km += s.km;
    }
    w.km = km; w.sec = sec; w.kcal = Math.round(kg * km);
    return w;
  }
  function paceFor(z, P) { return z === 'E' || z === 'W' ? (P.E[0] + P.E[1]) / 2 : z === 'RACE' ? P.M : z === 'TT' ? P.I * 1.02 : P[z]; }

  const Q = {
    tempo(V, P, f = 1) { const Tb = clamp(0.10 * V * f, 3, 10); const k = r05(clamp(Math.min(Tb, 1200 / P.T), 3, 8)); return mk('tempo', 'Tempo run', [wu(V), { z: 'T', km: k, label: 'steady at T' }, cd(V)]); },
    cruise(V, P, f = 1) { const Tb = clamp(0.10 * V * f, 3, 10); const n = clamp(Math.floor(Tb / MI), 2, 6); return mk('cruise', 'Cruise intervals', [wu(V), { z: 'T', reps: n, repKm: MI, restSec: 60 }, cd(V)]); },
    i1000(V, P, f = 1) { const Ib = clamp(0.08 * V * f, 3, 10); const n = clamp(Math.floor(Ib), 3, 8); return mk('intervals', 'Intervals', [wu(V), { z: 'I', reps: n, repKm: 1, jogSec: 180 }, cd(V)]); },
    i1200(V, P, f = 1) { const Ib = clamp(0.08 * V * f, 3.6, 10); const n = clamp(Math.floor(Ib / 1.2), 3, 6); return mk('intervals', 'Intervals', [wu(V), { z: 'I', reps: n, repKm: 1.2, jogSec: 180 }, cd(V)]); },
    reps(V, P) { const Rb = clamp(0.05 * V, 2.4, 8); const n = clamp(Math.floor(Rb / 0.4), 6, 12); return mk('reps', 'Speed reps', [W(3), { z: 'R', reps: n, repKm: 0.4, jogSec: Math.round(0.4 * P.E[1]) }, W(2)]); },
    fartlek(V, P) { const n = clamp(Math.round(V / 6), 6, 10); const repKm = 60 / P.I; return mk('fartlek', 'Fartlek', [wu(V), { z: 'I', reps: n, repKm, jogSec: 60, timed: 60 }, cd(V)]); },
    hills(V, P) { const n = clamp(Math.round(V / 7), 6, 10); const repKm = 90 / (P.I * 1.12); return mk('hills', 'Hill repeats', [wu(V), { z: 'I', reps: n, repKm, jogSec: 120, timed: 90, hill: true }, cd(V)]); },
    mrun(V, P, kmM) { const k = r05(kmM ?? clamp(0.2 * V, 6, 12)); return mk('mrun', 'Marathon-pace run', [wu(V), { z: 'M', km: k }, cd(V)]); },
    test(V, P) { return mk('test', '5K time trial', [wu(V), { z: 'TT', km: 5 }, cd(V)]); },
  };
  function easy(km, kind) {
    const titles = { easy: 'Easy run', recovery: 'Recovery run', strides: 'Easy + strides', hillsprints: 'Easy + hill sprints', shakeout: 'Shake-out' };
    return mk(kind === 'recovery' ? 'recovery' : kind === 'shakeout' ? 'shakeout' : kind === 'strides' || kind === 'hillsprints' ? kind : 'easy', titles[kind] || 'Easy run', [{ z: 'E', km: r05(km) }]);
  }
  function longRun(km, mKm) {
    km = r05(km); mKm = r05(Math.min(mKm || 0, km * 0.5));
    if (mKm >= 3) return mk('longm', 'Long run, fast finish', [{ z: 'E', km: km - mKm }, { z: 'M', km: mKm, label: 'finish at M' }]);
    return mk('long', 'Long run', [{ z: 'E', km }]);
  }

  const TPL_SAT = { 3: { 1: 'Q1', 3: 'Q2', 5: 'L' }, 4: { 1: 'Q1', 2: 'E', 3: 'Q2', 5: 'L' }, 5: { 1: 'Q1', 2: 'E', 3: 'Q2', 5: 'L', 6: 'E' }, 6: { 0: 'E', 1: 'Q1', 2: 'E', 3: 'Q2', 5: 'L', 6: 'E' }, 7: { 0: 'E', 1: 'Q1', 2: 'E', 3: 'Q2', 4: 'E', 5: 'L', 6: 'E' } };
  const TPL = { 3: { 1: 'Q1', 3: 'Q2', 6: 'L' }, 4: { 1: 'Q1', 2: 'E', 4: 'Q2', 6: 'L' }, 5: { 1: 'Q1', 2: 'E', 3: 'Q2', 5: 'E', 6: 'L' }, 6: { 0: 'E', 1: 'Q1', 2: 'E', 3: 'Q2', 5: 'E', 6: 'L' }, 7: { 0: 'E', 1: 'Q1', 2: 'E', 3: 'Q2', 4: 'E', 5: 'E', 6: 'L' } };

  function build(p, todayISO) {
    const warnings = [], notes = [];
    const today = parseD(todayISO), race = parseD(p.raceDate);
    if (!(race > today)) return { error: 'Choose a race date after today.' };
    const raceDow = dowOf(race), raceMon = addD(race, -raceDow);
    const tDow = dowOf(today);
    let startMon = addD(today, -tDow);
    if (tDow >= 3) startMon = addD(startMon, 7);
    if (startMon > raceMon) startMon = raceMon;
    let weeks = Math.round((raceMon - startMon) / (7 * DAY)) + 1;
    let preStart = null;
    if (weeks > 24) { startMon = addD(raceMon, -23 * 7); weeks = 24; preStart = iso(startMon); }
    if (weeks < 10) warnings.push(`Only ${weeks} week${weeks > 1 ? 's' : ''} until race day. Marathon plans usually run 12–20 weeks, so this one is compressed.`);

    // --- body & physiology
    const bmi = p.weightKg / Math.pow(p.heightCm / 100, 2);
    const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'f' ? -161 : 5); // Mifflin–St Jeor 1990
    const H = hr(p);
    if (p.age < 18) warnings.push('Under 18: most marathons require runners to be 18 or older. Check the race rules, get a doctor’s OK, and consider a half marathon first.');
    if ((p.weeklyKm || 0) < 20) warnings.push('You’re running under 12 miles a week. Most marathon plans assume a base of 12–20 miles, so the early weeks build that base slowly.');

    // --- fitness
    const goalV = vdot(MAR, p.goalSec);
    const hasRecent = p.recentDist > 0 && p.recentSec > 0;
    const curV = hasRecent ? vdot(p.recentDist, p.recentSec) : null;
    const gpw = { new: 0.30, mid: 0.20, adv: 0.12 }[p.exp] ?? 0.2;
    const gain = gpw * Math.max(0, weeks - 2);
    let startV, targetV, feas;
    if (curV) {
      startV = curV;
      targetV = curV >= goalV ? curV : Math.min(goalV, curV + gain);
      const gap = goalV - curV;
      const level = gap <= 0 ? 'ready' : gap <= gain ? 'achievable' : gap <= gain * 1.5 ? 'stretch' : 'aggressive';
      feas = { level, gap, gain, gpw, curPred: raceTime(MAR, curV), suggest: raceTime(MAR, curV + gain), riegel: riegel(p.recentDist, p.recentSec, MAR) };
    } else {
      startV = goalV - 1.5; targetV = goalV;
      feas = { level: 'unknown', gain, gpw };
    }

    // --- volume
    let g = p.exp === 'new' ? 0.08 : 0.10; const gWhy = [];
    if (bmi >= 27) { g = Math.min(g, 0.07); gWhy.push('BMI ≥ 27'); }
    if (p.age >= 50) { g = Math.min(g, 0.07); gWhy.push('age 50+'); }
    if (p.age < 18) { g = Math.min(g, 0.07); gWhy.push('under 18'); }
    if (p.exp === 'new') gWhy.push('first marathon');
    const h = p.goalSec / 3600;
    let pkT = h <= 2.75 ? 110 : h <= 3 ? 95 : h <= 3.25 ? 85 : h <= 3.5 ? 75 : h <= 3.75 ? 66 : h <= 4 ? 58 : h <= 4.5 ? 50 : h <= 5 ? 44 : 40;
    if (p.exp === 'new') pkT *= 0.9; if (p.exp === 'adv') pkT *= 1.05;
    const dayCap = { 3: 45, 4: 60, 5: 80, 6: 100, 7: 130 }[p.days];
    const v0 = Math.max(p.weeklyKm || 0, 8);
    const peakGoal = Math.max(Math.min(pkT, dayCap), Math.min(v0, dayCap));

    const taperN = weeks >= 14 ? 3 : weeks >= 8 ? 2 : 1;
    const B = Math.max(0, weeks - taperN);
    const phase = [];
    if (B >= 4) {
      let nb = Math.max(1, Math.round(B * .25)), nu = Math.max(1, Math.round(B * .25)), np = Math.max(1, Math.round(B * .28)), ns = B - nb - nu - np;
      while (ns < 1) { if (np > 1) np--; else if (nu > 1) nu--; else nb--; ns = B - nb - nu - np; }
      for (let i = 0; i < nb; i++) phase.push('base'); for (let i = 0; i < nu; i++) phase.push('build');
      for (let i = 0; i < np; i++) phase.push('peak'); for (let i = 0; i < ns; i++) phase.push('specific');
    } else for (let i = 0; i < B; i++) phase.push('specific');
    for (let i = 0; i < taperN; i++) phase.push(i === taperN - 1 ? 'race' : 'taper');

    const vols = [], rec = [];
    let last = v0;
    for (let i = 0; i < B; i++) {
      const isRec = B >= 7 && i % 4 === 3 && i < B - 1;
      if (isRec) { vols.push(last * 0.8); rec.push(true); }
      else { const v = i === 0 ? Math.min(v0, peakGoal) : Math.min(peakGoal, last * (1 + g)); vols.push(v); rec.push(false); last = v; }
    }
    const peakKm = Math.max(v0, ...vols, 0);
    const limitedByRamp = B > 0 && last < peakGoal * 0.97;
    const taperF = { 3: [0.8, 0.6, 0.4], 2: [0.65, 0.4], 1: [0.45] }[taperN];
    taperF.forEach(f => { vols.push(peakKm * f); rec.push(false); });

    // fitness progression across the block (stepwise every 4 weeks, Daniels-style re-test cadence)
    const Vw = i => i >= B ? targetV : startV + (targetV - startV) * Math.min(1, Math.floor(i / 4) * 4 / Math.max(1, B - 4));
    const mVw = i => (curV && curV >= goalV) ? goalV : Vw(i);

    const share = { 3: .45, 4: .40, 5: .35, 6: .32, 7: .30 }[p.days] + (p.exp === 'new' ? .03 : 0);
    const longMaxKm = { new: 30, mid: 32, adv: 34 }[p.exp] ?? 32;
    const longFloor = { new: 24, mid: 28, adv: 30 }[p.exp] ?? 28;
    let prevLong = Math.max(p.longestKm || 0, 6), peakLong = 0;
    const tpl = (p.longDay === 5 ? TPL_SAT : TPL)[p.days];
    const slots = Array(7).fill(null);
    for (const k in tpl) slots[+k] = tpl[k];
    const noRecent = !hasRecent;
    const out = [];
    const phaseIdx = {}; // index within phase

    for (let i = 0; i < weeks; i++) {
      const ph = phase[i]; phaseIdx[ph] = (phaseIdx[ph] ?? -1) + 1; const pi = phaseIdx[ph];
      const V = vols[i], P = paces(Vw(i)), PM = paces(mVw(i));
      const Pw = Object.assign({}, P, { M: PM.M });
      const wkStart = addD(startMon, i * 7);
      const days = [];
      const easyCap = 180 * 60 / ((P.E[0] + P.E[1]) / 2);
      // long run
      let longKm = 0, longM = 0;
      if (ph === 'taper') { longKm = peakLong * (taperN === 3 ? [0.78, 0.6][pi] : 0.62); }
      else if (ph !== 'race') {
        let t = V * share;
        if (ph === 'peak' || ph === 'specific') t = Math.max(t, longFloor);
        t = Math.min(t, V * 0.5, longMaxKm, easyCap);
        if (rec[i]) t = Math.min(t, prevLong * 0.72);
        else { t = Math.min(t, prevLong + 3); prevLong = Math.max(prevLong, t); }
        longKm = t; peakLong = Math.max(peakLong, t);
      }
      // quality picks
      let q1 = 'strides', q2 = 'easy';
      const sparse = p.days <= 4;
      if (ph === 'base') { q1 = (noRecent && i === 1) ? 'test' : 'strides'; q2 = sparse ? 'easy' : 'hillsprints'; }
      else if (ph === 'build') { if (rec[i]) { q1 = 'cruiseLite'; q2 = 'strides'; } else if (p.exp === 'new') { q1 = pi % 2 ? 'tempo' : 'fartlek'; q2 = 'strides'; } else { q1 = 'reps'; q2 = pi % 2 ? 'tempo' : 'cruise'; } }
      else if (ph === 'peak') { if (rec[i]) { q1 = 'cruiseLite'; q2 = 'strides'; } else { if (p.exp === 'new') { q1 = 'hills'; q2 = pi % 2 ? 'cruise' : 'strides'; } else { q1 = pi % 2 ? 'i1200' : 'i1000'; q2 = pi % 2 ? 'tempo' : 'cruise'; } longM = pi % 2 ? Math.min(0.15 * V, 10) : 0; } }
      else if (ph === 'specific') { if (rec[i]) { q1 = 'cruiseLite'; q2 = 'strides'; } else { q1 = 'cruise'; if (pi % 2 === 0) { q2 = 'mrun'; } else { q2 = 'strides'; longM = Math.min(0.2 * V, 16); } } }
      else if (ph === 'taper') { q1 = (pi === 0 && p.exp !== 'new') ? 'i1000Taper' : 'cruiseTaper'; q2 = 'mrunTaper'; }

      const buildQ = (code) => {
        switch (code) {
          case 'test': return Q.test(V, P);
          case 'reps': return Q.reps(V, P);
          case 'fartlek': return Q.fartlek(V, P);
          case 'hills': return Q.hills(V, P);
          case 'tempo': return Q.tempo(V, P);
          case 'cruise': return Q.cruise(V, P);
          case 'cruiseLite': return p.exp === 'new' && ph === 'build' ? null : Q.cruise(V, P, 0.6);
          case 'cruiseTaper': return Q.cruise(peakKm, P, 0.7);
          case 'i1000': return Q.i1000(V, P);
          case 'i1200': return Q.i1200(V, P);
          case 'i1000Taper': return Q.i1000(peakKm, P, 0.65);
          case 'mrun': return Q.mrun(V, Pw);
          case 'mrunTaper': return Q.mrun(V, Pw, clamp(0.12 * peakKm, 5, 10));
          default: return null;
        }
      };

      if (ph === 'race') {
        // race week: keep a little intensity, cut volume (Bosquet 2007)
        for (let d = 0; d < 7; d++) {
          const date = iso(addD(wkStart, d));
          let w;
          if (d === raceDow) w = mk('race', 'Race day', [{ z: 'RACE', km: 42.195 }]);
          else if (d > raceDow) w = mk('rest', 'Recovery', []);
          else if (d === raceDow - 1 && p.days >= 5) w = easy(clamp(0.05 * peakKm, 3, 5), 'shakeout');
          else if (d === 1 && d < raceDow - 1) w = Q.mrun(0, Pw, clamp(0.05 * peakKm, 3, 5));
          else if (d === 3 && d < raceDow - 1 && p.days >= 4) w = easy(clamp(0.09 * peakKm, 5, 9), 'strides');
          else w = mk('rest', 'Rest', []);
          if (w.type === 'mrun') w.title = 'Race-pace tune-up';
          days.push(finish(Object.assign(w, { date, dow: d }), Pw, p.weightKg));
        }
      } else {
        const wk = Array(7).fill(null);
        let structured = 0;
        const easySlots = [];
        for (let d = 0; d < 7; d++) {
          const s = slots[d];
          if (!s) continue;
          if (s === 'L') { wk[d] = longRun(longKm, longM); continue; }
          const code = s === 'Q1' ? q1 : s === 'Q2' ? q2 : 'easy';
          const qw = buildQ(code);
          if (qw) { wk[d] = qw; finish(qw, Pw, p.weightKg); structured += qw.km; }
          else {
            const prev = slots[(d + 6) % 7];
            const kind = code === 'strides' || code === 'hillsprints' ? code : (prev === 'L' || prev === 'Q1' || prev === 'Q2') ? 'recovery' : 'easy';
            easySlots.push({ d, kind, w: kind === 'recovery' ? 0.85 : 1 });
          }
        }
        const longActual = r05(longKm);
        let rem = V - longActual - structured;
        const sw = easySlots.reduce((a, s) => a + s.w, 0);
        const minE = p.exp === 'new' ? 3 : 4;
        for (const s of easySlots) {
          const km = clamp(sw ? rem * s.w / sw : 0, minE, Math.max(minE, longActual * 0.7));
          wk[s.d] = easy(km, s.kind);
        }
        // strength on two non-quality days (Balsalobre-Fernández 2016)
        let st = 0;
        for (let d = 0; d < 7 && st < 2; d++) {
          const w = wk[d];
          if (!w && slots[d] == null && p.days <= 4) { wk[d] = mk('rest', 'Rest or strength', [], { tags: ['strength'] }); st++; }
          else if (w && (w.type === 'easy' || w.type === 'recovery')) { w.tags.push('strength'); st++; }
        }
        for (let d = 0; d < 7; d++) {
          const w = wk[d] || mk('rest', 'Rest', []);
          days.push(finish(Object.assign(w, { date: iso(addD(wkStart, d)), dow: d }), Pw, p.weightKg));
        }
      }
      const km = days.reduce((a, w) => a + w.km, 0);
      const sec = days.reduce((a, w) => a + w.sec, 0);
      out.push({ i, phase: ph, rec: !!rec[i], start: iso(wkStart), targetKm: V, km, sec, V: Vw(i), paces: Pw, days });
    }

    if (weeks >= 8 && peakLong < 24) warnings.push(`The longest run in this plan only reaches ${Math.round(peakLong / MI)} miles, because mileage can only rise safely from where you are now. Most marathon plans peak at 18–20 miles. Consider a later race, or a half marathon first.`);
    // intensity distribution of the planned block (race itself excluded)
    const dist = { E: 0, M: 0, Q: 0 };
    for (const w of out) for (const d of w.days) { if (d.type === 'race') continue; for (const s of d.segs) { const k = (s.z === 'E' || s.z === 'W') ? 'E' : s.z === 'M' ? 'M' : 'Q'; if (s.reps) { const work = s.reps * s.repKm; dist[k] += work; dist.E += s.km - work; } else dist[k] += s.km; } }

    return {
      ok: true, start: iso(startMon), preStart, race: p.raceDate, raceDow, weeks: out, nWeeks: weeks, taperN, B,
      goalV, curV, startV, targetV, feas, bmi, bmr, hr: H, g, gWhy, peakGoal, peakKm: Math.max(...out.filter(w => w.phase !== 'race').map(w => w.km), 1), peakLong, limitedByRamp, pkT, dayCap,
      warnings, notes, dist, raceWeekIdx: weeks - 1, final: paces(targetV), goal: paces(goalV)
    };
  }
  return { build, paces, vdot, raceTime, riegel, MAR, MI };
})();
/* =============================== ENGINE END =============================== */
