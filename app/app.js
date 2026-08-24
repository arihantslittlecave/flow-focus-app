/* =========================================================
   FLOW v2, application logic
   Everything persists to localStorage under `flow.v2`.
   ========================================================= */
(function () {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const pad2 = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const KEY = 'flow.v2';
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MOOD_WORD  = { 1:'Rough', 2:'Okay', 3:'Good', 4:'Great', 5:'Peak' };
const GENERAL = 'General';

/* Time-of-day buckets, by the hour a session started. */
const SLOTS = [
  { key:'morning',   label:'Morning',   from:5,  to:12 },
  { key:'afternoon', label:'Afternoon', from:12, to:17 },
  { key:'evening',   label:'Evening',   from:17, to:22 },
  { key:'night',     label:'Night',     from:22, to:5  }
];

const dkey  = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => dkey(new Date());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const parseKey = k => new Date(k + 'T12:00:00');
const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
const defaults = () => ({
  onboarded: false,
  profile: { name: 'Friend', workspace: 'Deep Work', goal: 120, photo: null },
  store: 'local',
  settings: { theme:'dark', accent:'#C74A00', alerts:true, notify:false, autoBreak:false, soundBreak:true },
  tasks: {},        // dateKey -> [{id, text, done, carried}]
  sessions: [],     // {id, date, start, end, minutes, mode, tag}
  reflections: {},  // dateKey -> {mood, energy:{}, note, savedAt}
  focus: { preset:25, breakLen:5, sound:'off', volume:45, tag:GENERAL },
  /* Things you time, each with the length it actually takes. Not all focus:
     two minutes of brushing and fifty of deep work both belong on a timer, and
     pretending everything is a pomodoro is why people stop using these. */
  activities: [
    { name:GENERAL,      mins:25 },
    { name:'Deep work',  mins:50 },
    { name:'Reading',    mins:30 },
    { name:'Study',      mins:45 },
    { name:'Writing',    mins:40 },
    { name:'Meditation', mins:10 },
    { name:'Workout',    mins:20 },
    { name:'Stretching', mins:5  },
    { name:'Brushing',   mins:2  }
  ],
  range: 'week',
  lastBackup: null
});

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    return migrate(Object.assign(defaults(), JSON.parse(raw)));
  } catch (e) {
    console.warn('Flow: could not read saved data, starting fresh.', e);
    return seed();
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { console.warn('Flow: could not save.', e); }
}

/* Older records had no id, timestamps or tag. Fill them in so every reader
   downstream can assume the current shape. */
function migrate(s) {
  s.sessions = (s.sessions || []).map((x, i) => ({
    id: x.id || 's' + i + '-' + x.date,
    date: x.date,
    start: x.start || null,
    end: x.end || null,
    minutes: x.minutes || 0,
    mode: x.mode || 'work',
    tag: x.tag || GENERAL
  }));
  if (!s.focus.tag) s.focus.tag = GENERAL;
  /* saves made before activities existed have none, and a stepper with nothing
     in it is worse than the single dead option it replaced */
  if (!Array.isArray(s.activities) || !s.activities.length) s.activities = defaults().activities;
  s.activities = s.activities
    .filter(a => a && a.name)
    .map(a => ({ name: String(a.name).slice(0, 32), mins: clamp(+a.mins || 25, 1, 180) }));
  if (typeof s.settings.notify !== 'boolean') s.settings.notify = false;
  /* the old palette put white text on fills at 2.9:1; move saved accents to
     the darker set rather than leaving existing users below AA */
  const AA = { '#FF6600':'#C74A00', '#0066FF':'#1156D9', '#12B981':'#0F7A57', '#A855F7':'#6D3BD4' };
  if (AA[s.settings.accent]) s.settings.accent = AA[s.settings.accent];
  return s;
}

/* A fresh start: today is deliberately empty so you can fill it in yourself.
   Behind it sits a believable fortnight.

   What makes it read as real rather than generated:
   - two days with nothing at all, because nobody focuses every single day;
   - block lengths that are not all 25 and 50, because people stop early;
   - start times on the odd minute, because nobody presses go at exactly 09:00;
   - tasks left unticked, because a day where you finish everything is the
     exception, not the pattern.

   Each session names the task it was spent on, so the Focus label, the day log
   and "Where it went" on Stats all tell the same story instead of three.
   `ses` is [minutes, task index or null for General, hour, minute]. */
function seed() {
  const s = defaults();
  s.onboarded = false;

  /* A handful of pieces of work recur across the fortnight, the way real work
     does, and the one-offs sit around them. Giving every day its own unique
     task names looked plausible in isolation and made "Where it went" useless:
     every label tied on minutes and the "Everything else" bucket outweighed all
     of them, which is the opposite of what that card is for. */
  const DAYS = {
    1: { mood:4, ses:[[50,0,9,4],[25,1,20,17]],
         tasks:[['Client brief',1],['Read a chapter',1]],
         note:'Good close to the week. Phone in the other room the whole afternoon and it showed.' },
    2: { mood:5, ses:[[50,0,8,12],[50,1,11,17],[25,null,16,34]],
         tasks:[['Case study layout',1],['Client brief',1],['Inbox to zero',1],['Sketch the landing page',0]],
         note:'Three blocks back to back. Best stretch in a while, no idea where the time went.' },
    3: { mood:2, ses:[[22,null,15,41]],
         tasks:[['Standup notes',1],['Send the invoice',0],['Client brief',0]],
         note:'Day sucked. Got pulled into two calls I did not need to be on and lost the morning.' },
    /* 4 is a gap on purpose */
    5: { mood:4, ses:[[50,0,9,21],[35,1,14,6]],
         tasks:[['Case study layout',1],['Read a chapter',1],['Chase the missing assets',0]],
         note:'Long block on the case study, then read for a bit. Steady rather than brilliant.' },
    6: { mood:4, ses:[[50,0,10,8],[47,1,13,42]],
         tasks:[['Client brief',1],['Case study layout',1]],
         note:'Two solid blocks. The ocean sound is genuinely doing something, not placebo.' },
    7: { mood:3, ses:[[25,0,19,11]],
         tasks:[['Tidy the file structure',1],['Book the dentist',0]],
         note:'Short evening session. Tired, but showed up, and that counts for something.' },
    8: { mood:5, ses:[[50,0,8,45],[25,1,15,2],[18,2,21,30]],
         tasks:[['Case study layout',1],['Client brief',1],['Read a chapter',1]],
         note:'Everything landed today. Deep work before anyone was awake, then a clean finish.' },
    9: { mood:3, ses:[[44,1,11,15]],
         tasks:[['Draft the invoice',0],['Read a chapter',1],['Reply to the studio',0]],
         note:'Read most of the block. Slow going but useful, finally understood that chapter.' },
    /* 10 is a gap on purpose */
    11:{ mood:4, ses:[[50,0,8,32],[50,1,10,25],[31,null,16,9]],
         tasks:[['Case study layout',1],['Portfolio rewrite',1],['Export the screens',0]],
         note:'Lost track of time in the best way. Looked up and two hours had gone.' },
    12:{ mood:2, ses:[[25,null,17,48]],
         tasks:[['Portfolio rewrite',0],['Fix the feedback notes',0]],
         note:'Got scolded over something that was not mine to fix. Ran out of steam by three.' },
    13:{ mood:3, ses:[[50,0,9,36],[25,1,18,20]],
         tasks:[['Client brief',1],['Read a chapter',1],['Set up the project folder',0]],
         note:'Rough start to the fortnight. Kept stopping to check my phone, need to fix that.' }
  };

  Object.entries(DAYS).forEach(([off, day]) => {
    const d = daysAgo(+off), k = dkey(d);

    s.tasks[k] = day.tasks.map(([text, done], i) => ({ id:`t${off}-${i}`, text, done:!!done }));

    day.ses.forEach(([mins, ti, hour, min], j) => {
      const start = new Date(d);
      start.setHours(hour, min, 0, 0);
      s.sessions.push({
        id: `s${k}-${j}`, date: k,
        start: start.getTime(), end: start.getTime() + mins * 60000,
        minutes: mins, mode: 'work',
        tag: ti === null ? GENERAL : day.tasks[ti][0]
      });
    });

    s.reflections[k] = { mood: day.mood, energy: {}, note: day.note, savedAt: d.getTime() };
  });

  s.tasks[today()] = [];            // yours to fill in
  s.lastBackup = null;
  return s;
}

/* Unfinished work rolls forward instead of disappearing with the date, but
   only from the last day you actually planned.

   Sweeping every past day, which is what this used to do, meant a task you
   abandoned three weeks ago reappeared on today's list forever, and it emptied
   your history so no past day could ever show something left undone. Taking
   the most recent planned day rather than literally yesterday means a weekend
   off does not lose the list either. Older days keep their loose ends as the
   record of what happened. */
function carryOver() {
  const k = today();
  const past = Object.keys(S.tasks).filter(d => d < k && S.tasks[d].length).sort();
  const from = past[past.length - 1];
  if (!from) return 0;

  const move = S.tasks[from].filter(t => !t.done);
  if (!move.length) return 0;

  if (!S.tasks[k]) S.tasks[k] = [];
  move.forEach(t => { t.carried = true; S.tasks[k].push(t); });
  S.tasks[from] = S.tasks[from].filter(t => t.done);
  if (!S.tasks[from].length) delete S.tasks[from];
  save();
  return move.length;
}

/* ---------------------------------------------------------
   DERIVED DATA
--------------------------------------------------------- */
const work = () => S.sessions.filter(s => s.mode === 'work');
const minutesOn  = k => work().filter(s => s.date === k).reduce((a, b) => a + b.minutes, 0);
const sessionsOn = k => work().filter(s => s.date === k).length;
const tasksOn    = k => S.tasks[k] || [];
const totalMinutes = () => work().reduce((a, b) => a + b.minutes, 0);
const totalTasksDone = () => Object.values(S.tasks).flat().filter(t => t.done).length;

function streak() {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const k = dkey(daysAgo(i));
    if (minutesOn(k) > 0) n++;
    else if (i > 0) break;              // today not yet logged doesn't break the run
  }
  return n;
}
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = daysAgo(i), k = dkey(d);
    out.push({ date:d, key:k, minutes:minutesOn(k), mood:(S.reflections[k] || {}).mood || 0 });
  }
  return out;
}
/* "2h 0m" is how a machine says two hours. */
function fmtHM(m) {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/* Buckets for the Stats range switcher. Daily buckets carry a `key` so the
   bar can open that day; monthly ones don't. */
function buckets(range) {
  if (range === 'year') {
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const y = d.getFullYear(), m = d.getMonth();
      const mins = work()
        .filter(s => { const p = parseKey(s.date); return p.getFullYear() === y && p.getMonth() === m; })
        .reduce((a, b) => a + b.minutes, 0);
      out.push({ label: MON[m].charAt(0), minutes: mins, mood: 0, key: null, isNow: i === 0,
                 title: `${MON[m]} ${y}` });
    }
    return out;
  }
  const days = range === 'month' ? 30 : 7;
  return lastNDays(days).map((d, i, arr) => ({
    label: days === 7 ? DOW[d.date.getDay()].charAt(0) : String(d.date.getDate()),
    minutes: d.minutes, mood: d.mood, key: d.key, isNow: i === arr.length - 1,
    title: `${DOW[d.date.getDay()]}, ${d.date.getDate()} ${MON[d.date.getMonth()].slice(0,3)}`
  }));
}
function rangeDays(range) { return range === 'year' ? 365 : range === 'month' ? 30 : 7; }
function sessionsInRange(range) {
  const cut = daysAgo(rangeDays(range) - 1); cut.setHours(0,0,0,0);
  return work().filter(s => parseKey(s.date) >= cut);
}

/* ---------------------------------------------------------
   ROUTER
--------------------------------------------------------- */
const TABS = ['plan', 'focus', 'reflect', 'stats'];
const NAV = [
  { cat:'Entry',    items:[['splash','Splash'], ['onboard','Onboarding']] },
  { cat:'The trio', items:[['plan','Plan'], ['focus','Focus'], ['reflect','Reflect'], ['stats','Stats']] },
  { cat:'Detail',   items:[['day','Day detail']] },
  { cat:'Account',  items:[['rant','Rant'], ['profile','Profile'], ['settings','Settings'], ['help','Help'], ['backup','Backup'], ['about','About']] }
];
let current = 'plan';
const stack = [];
let splashTimer = null;
let introFromTheTop = false;   // the URL asked for the whole intro, not just the logo

function go(name, push) {
  $$('#viewport > svg[style]').forEach(el => el.remove());
  const el = $(`[data-screen="${name}"]`);
  if (!el) return;
  /* the splash hands off to onboarding on a timer; any deliberate navigation
     before then must cancel it or the user gets yanked back */
  if (splashTimer && name !== 'splash') { clearTimeout(splashTimer); splashTimer = null; }
  if (push && current !== name) stack.push(current);
  $$('.screen').forEach(s => s.classList.remove('is-active'));
  el.classList.add('is-active');
  current = name;

  $('.tabbar').classList.toggle('is-hidden', name === 'splash' || name === 'onboard');
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.go === name));
  $$('#railNav button').forEach(b => b.classList.toggle('is-active', b.dataset.go === name));

  if (name !== 'rant' && typeof stopMic === 'function') stopMic();
  const sc = $('.scroll', el); if (sc) sc.scrollTop = 0;
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  refresh(name);
}
function back() { go(stack.pop() || 'plan', false); }

/* Entering a screen from a route, as opposed to moving around inside the app.
   Splash is the only screen that needs the difference: it has to schedule its
   own hand-off or the logo sits there forever, which the boot path used to do
   and every other route into it did not. go() deliberately stays dumb about
   this, because the screenshot exporter drives go() directly and needs the
   splash to hold still. */
function routeTo(name) {
  introFromTheTop = name === 'splash';
  go(name, false);
  if (name !== 'splash') return;
  clearTimeout(splashTimer);
  splashTimer = setTimeout(() => { splashTimer = null; morphSplashToOnboard(); }, 2000);
}

/* Splash hands off to onboarding by flying the same mark into its new place.

   Two traps here, both of which showed up as the logo jumping on arrival:
   - measure each mark RELATIVE TO ITS OWN .screen, so the screen's slide-in
     transform cancels out instead of baking a few pixels into the target;
   - scale from the top-left, because scaling about the centre shifts the box
     by half the size difference and the clone lands off by that much.
   offsetLeft/offsetWidth are unusable: they are HTMLElement-only and read
   undefined on an <svg>. */
function morphSplashToOnboard() {
  const from = $('.splash-mark'), vp = $('#viewport');
  /* Asking for #splash means asking to see this from the beginning, so the
     hand-off ignores whether this browser has been here before. Without it a
     returning visitor got the logo and then landed straight on Plan, which is
     the app being helpful at the exact moment someone wanted the tour. */
  const done = () => go(introFromTheTop || !S.onboarded ? 'onboard' : 'plan', false);
  if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();

  const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1;
  const local = el => {
    const r = el.getBoundingClientRect();
    const s = el.closest('.screen').getBoundingClientRect();
    return { x: (r.left - s.left) / fit, y: (r.top - s.top) / fit, w: r.width / fit };
  };
  const a = local(from);

  done();
  const to = $('.ob-step[data-step="0"] .ob-mark');
  if (!to || !a.w) return;
  const b = local(to);
  if (!b.w) return;

  const fly = to.cloneNode(true);
  fly.removeAttribute('class');
  fly.style.cssText = `position:absolute;left:${a.x}px;top:${a.y}px;` +
                      `width:${a.w}px;height:${a.w}px;z-index:60;pointer-events:none;` +
                      `transform-origin:top left`;
  vp.appendChild(fly);
  to.style.visibility = 'hidden';

  const anim = fly.animate(
    [{ transform: 'translate(0,0) scale(1)' },
     { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${b.w / a.w})` }],
    { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
  );
  const cleanup = () => { to.style.visibility = ''; fly.remove(); };
  anim.onfinish = cleanup;
  setTimeout(cleanup, 900);            // never strand the clone if the anim is dropped
}


/* Scale the phone frame to fit the window without ever distorting its 390x844
   aspect. Only applies to the desktop stage; the mobile layout is full-bleed. */
function fitDevice() {
  const wrap = $('.device-wrap');
  if (!wrap || window.innerWidth <= 520) {
    document.documentElement.style.setProperty('--fit', '1');
    return;
  }
  const cs = getComputedStyle(wrap);
  const availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = wrap.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const scale = Math.min(1, availH / 844, availW / 390);
  document.documentElement.style.setProperty('--fit', Math.max(0.4, scale).toFixed(4));
}


/* Rail visibility, kept out of S so an export never carries a stage preference.
   fitDevice() must re-run after the toggle: the phone gets 216px wider to grow
   into, and without it the frame stays at the old scale in a full-width window. */
const RAIL_KEY = 'flow.rail';
function setRail(hidden) {
  document.body.classList.toggle('no-rail', hidden);
  try { localStorage.setItem(RAIL_KEY, hidden ? 'off' : 'on'); } catch (e) {}
  fitDevice();
}
function toggleRail() { setRail(!document.body.classList.contains('no-rail')); }

/* The newest day with a session, a task or a reflection on it. Falls back to
   today so the caller always gets a valid key. */
function lastActiveDay() {
  const keys = new Set([
    ...S.sessions.map(s => s.date),
    ...Object.keys(S.tasks).filter(k => (S.tasks[k] || []).length),
    ...Object.keys(S.reflections)
  ]);
  return [...keys].sort().pop() || today();
}

function buildRail() {
  const nav = $('#railNav'); nav.innerHTML = '';
  NAV.forEach(g => {
    const c = document.createElement('div');
    c.className = 'rail-cat'; c.textContent = g.cat; nav.appendChild(c);
    g.items.forEach(([id, label]) => {
      const b = document.createElement('button');
      b.dataset.go = id; b.textContent = label;
      /* Day detail is normally reached by tapping a date on the calendar, a bar
         on the chart, or a past entry on Reflect. The rail is a demo shortcut,
         and pointing it at today landed on an empty screen every time, since
         today is meant to start blank. Open the most recent day that actually
         has something on it instead. */
      b.onclick = () => (id === 'day' ? openDay(lastActiveDay()) : routeTo(id));
      nav.appendChild(b);
    });
  });
}

function refresh(name) {
  switch (name) {
    case 'plan':     renderPlan(); renderCalendar(); break;
    case 'focus':    renderFocusStats(); renderLengths(); renderTagStepper(); renderSounds(); paintTimer(); break;
    case 'reflect':  renderReflect(); break;
    case 'rant':     renderRant(); break;
    case 'stats':    renderStats(); break;
    case 'profile':  renderProfile(); break;
    case 'backup':   renderBackup(); break;
    case 'settings': renderSettings(); break;
  }
  paintAvatars();
}

/* ---------------------------------------------------------
   TOAST
--------------------------------------------------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 2100);
}

/* ---------------------------------------------------------
   ONBOARDING
--------------------------------------------------------- */
let obStep = 0;
const OB_LAST = 1;

function renderOb() {
  /* re-trigger the stagger on each step by swapping the class off and on */
  $$('.ob-step').forEach(s => {
    const on = +s.dataset.step === obStep;
    if (on && !s.classList.contains('is-active')) {
      s.classList.remove('is-active');
      void s.offsetWidth;                       // force reflow so the animation replays
    }
    s.classList.toggle('is-active', on);
  });
  $$('#obDots i').forEach((d, i) => d.classList.toggle('is-on', i === obStep));
  /* display:none, not visibility:hidden - a hidden Back still reserves its
     width and pushed Continue 71px right of every other element */
  $('#obBack').hidden = obStep === 0;
  $('#obNext').firstChild.textContent = obStep === OB_LAST ? 'Start flowing ' : 'Continue ';
  syncObNext();
}
/* The name step asks a question, so its button should not be answerable while
   the answer is empty. It used to go through and quietly name you Friend,
   which reads as the field having been ignored rather than skipped. Skip is
   in the corner for anyone who would rather not say. */
function syncObNext() {
  $('#obNext').disabled = obStep === OB_LAST && !$('#obName').value.trim();
}
function initOb() {
  $('#obDots').innerHTML = '<i></i><i></i>';
  $('#obName').value = S.profile.name === 'Friend' ? '' : S.profile.name;

  const commitName = () => { S.profile.name = $('#obName').value.trim() || 'Friend'; };
  $('#obName').addEventListener('input', syncObNext);
  $('#obName').addEventListener('keydown', e => {
    /* enterkeyhint is "go", so the phone keyboard offers it. It has to refuse
       for the same reason the button does. */
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if ($('#obName').value.trim()) { commitName(); finishOb(); }
  });

  $('#obNext').onclick = () => {
    if (obStep === OB_LAST) { commitName(); return finishOb(); }
    obStep++; renderOb();
    if (obStep === 1) setTimeout(() => $('#obName').focus(), 320);
  };
  $('#obBack').onclick = () => { if (obStep > 0) { obStep--; renderOb(); } };
  $('[data-ob-skip]').onclick = finishOb;

  renderOb();
}
function finishOb() {
  S.onboarded = true; save();
  go('plan', false);
  toast(`Welcome, ${S.profile.name}`);
}

/* ---------------------------------------------------------
   PLAN
--------------------------------------------------------- */
let viewDate = new Date();                       // the day the Plan tab is showing
const viewKey = () => dkey(viewDate);
const isToday = () => viewKey() === today();

function renderPlan() {
  const k = viewKey(), list = tasksOn(k);
  const done = list.filter(t => t.done).length;

  $('#dayLabel').textContent = isToday() ? 'Today'
    : viewDate.toLocaleDateString(undefined, { weekday:'long' });
  $('#planDate').textContent = `${pad2(viewDate.getDate())}/${pad2(viewDate.getMonth()+1)}/${String(viewDate.getFullYear()).slice(2)}`;
  $('#planDone').textContent = `${done}/${list.length}`;

  const carried = list.filter(t => t.carried && !t.done).length;
  $('#planCarried').textContent = carried
    ? `${carried} carried over` : '';

  const ul = $('#taskList'); ul.innerHTML = '';
  list.forEach(t => ul.appendChild(taskRow(t, k)));
  $('#taskEmpty').style.display = list.length ? 'none' : 'block';
}

function taskRow(t, k) {
  const li = document.createElement('li');
  li.className = 'task' + (t.done ? ' is-done' : '');
  li.dataset.id = t.id;
  li.innerHTML =
    `<button class="task-box" aria-label="Toggle done"><svg><use href="#i-check"/></svg></button>
     <span class="task-txt" tabindex="0" role="button" aria-label="Rename task"></span>
     ${t.carried ? '<span class="task-carried">carried</span>' : ''}
     <button class="task-grip" aria-label="Reorder"><svg><use href="#i-grip"/></svg></button>
     <button class="task-del" aria-label="Delete"><svg><use href="#i-trash"/></svg></button>`;

  const txt = $('.task-txt', li);
  txt.textContent = t.text;
  $('.task-box', li).onclick = () => { t.done = !t.done; save(); renderPlan(); renderTagStepper(); };
  $('.task-del', li).onclick = () => {
    S.tasks[k] = tasksOn(k).filter(x => x.id !== t.id);
    save(); renderPlan(); renderTagStepper(); toast('Task removed');
  };
  txt.onclick = () => beginEdit(txt, t);
  txt.onkeydown = e => { if (e.key === 'Enter' && txt.contentEditable !== 'true') { e.preventDefault(); beginEdit(txt, t); } };
  $('.task-grip', li).onpointerdown = e => startDrag(e, li, k);
  return li;
}

function beginEdit(txt, t) {
  if (txt.contentEditable === 'true') return;
  txt.contentEditable = 'true';
  txt.focus();
  const r = document.createRange(); r.selectNodeContents(txt);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);

  const commit = () => {
    txt.contentEditable = 'false';
    const v = txt.textContent.trim();
    if (v && v !== t.text) { t.text = v; save(); renderTagStepper(); toast('Task renamed'); }
    else txt.textContent = t.text;
    txt.removeEventListener('blur', commit);
    txt.removeEventListener('keydown', keys);
  };
  const keys = e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { txt.textContent = t.text; commit(); }
  };
  txt.addEventListener('blur', commit);
  txt.addEventListener('keydown', keys);
}

/* Pointer-driven reorder, works with a mouse or a finger, which HTML5
   drag-and-drop does not. */
function startDrag(e, li, k) {
  e.preventDefault();
  const ul = $('#taskList');
  li.classList.add('is-dragging');
  const move = ev => {
    const y = ev.clientY;
    for (const other of Array.from(ul.children)) {
      if (other === li) continue;
      const r = other.getBoundingClientRect();
      if (y > r.top && y < r.bottom) {
        ul.insertBefore(li, y < r.top + r.height / 2 ? other : other.nextSibling);
        break;
      }
    }
  };
  const up = () => {
    li.classList.remove('is-dragging');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    const order = Array.from(ul.children).map(x => x.dataset.id);
    S.tasks[k] = tasksOn(k).slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    save(); renderPlan();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function addTask() {
  const input = $('#taskInput');
  const text = input.value.trim();
  if (!text) return;
  const k = viewKey();
  if (!S.tasks[k]) S.tasks[k] = [];
  S.tasks[k].push({ id:'x' + Date.now(), text, done:false });
  input.value = ''; save(); renderPlan(); renderTagStepper();
}

/* Calendar */
let calCursor = new Date();

function renderCalendar() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth(), tk = today();
  $('#calLabel').textContent = `${MON[m]} ${y}`;

  const offset = new Date(y, m, 1).getDay();                 // Sunday-first, as designed
  const inMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const grid = $('#calGrid'); grid.innerHTML = '';
  /* A day you planned but never started a timer on is still a day worth
     opening, so the dot marks focus and the tap follows any activity at all. */
  const cell = (num, cls, key) => {
    const d = document.createElement('div');
    d.className = 'cal-cell ' + cls;
    d.innerHTML = `<span>${num}</span>`;
    if (key) {
      const r = S.reflections[key];
      const focused = minutesOn(key) > 0;
      const used = focused || tasksOn(key).length > 0 || (r && (r.mood || r.note));
      if (focused) d.innerHTML += '<i></i>';
      if (used) { d.style.cursor = 'pointer'; d.onclick = () => openDay(key); }
    }
    grid.appendChild(d);
  };
  for (let i = offset - 1; i >= 0; i--) cell(prevDays - i, 'is-out');
  for (let d = 1; d <= inMonth; d++) {
    const key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
    cell(d, key === tk ? 'is-today' : '', key);
  }
  const filled = offset + inMonth;
  for (let d = 1; d <= (7 - filled % 7) % 7; d++) cell(d, 'is-out');
}

/* ---------------------------------------------------------
   FOCUS, timestamp-driven timer
   The countdown comes from wall-clock time rather than an interval count, so
   a throttled background tab never drifts.
--------------------------------------------------------- */
const T = {
  mode:'work', total:25*60, running:false,
  startedAt:0, banked:0, tick:null, sessionId:null
};
const elapsed = () => T.banked + (T.running ? (Date.now() - T.startedAt) / 1000 : 0);
const remaining = () => Math.max(0, Math.round(T.total - elapsed()));

function paintTimer() {
  const C = 2 * Math.PI * 130;
  const left = remaining();
  $('#dialFill').style.strokeDashoffset = C - (C * (T.total ? left / T.total : 0));
  $('#dialTime').textContent =
    `${pad2(Math.floor(left / 3600))}:${pad2(Math.floor(left / 60) % 60)}:${pad2(left % 60)}`;
  $('#dialBox').classList.toggle('is-break', T.mode === 'break');
  $('#btnStartIco').innerHTML = `<use href="#${T.running ? 'i-pause' : 'i-play'}"/>`;
  $('#btnStartTxt').textContent = T.running ? 'Pause'
    : (elapsed() > 0 ? 'Resume' : (T.mode === 'work' ? 'Start Flow' : 'Start Break'));
  paintTitle(left);
}
function paintTitle(left) {
  document.title = T.running
    ? `${pad2(Math.floor(left/60))}:${pad2(left%60)} · ${T.mode === 'work' ? 'Focus' : 'Break'} · Flow`
    : 'Flow';
}

function startPause() {
  if (T.running) return pause();
  T.running = true;
  T.startedAt = Date.now();
  if (T.mode === 'work' && !T.sessionId) openSession();
  if (S.focus.sound !== 'off') Audio.play(S.focus.sound);
  T.tick = setInterval(() => {
    if (remaining() <= 0) return complete();
    syncSession(); paintTimer();
  }, 250);
  paintTimer();
}
function pause() {
  if (!T.running) return;
  T.banked = elapsed(); T.running = false;
  clearInterval(T.tick); T.tick = null;
  syncSession(); Audio.stop(); paintTimer(); renderFocusStats();
}
function reset() { pause(); closeSession(); T.banked = 0; paintTimer(); renderFocusStats(); }

function complete() {
  clearInterval(T.tick); T.tick = null;
  T.banked = T.total; T.running = false;
  syncSession(); closeSession();

  if (S.settings.alerts) Audio.chime();
  notify(T.mode === 'work' ? 'Block done' : 'Break over',
         T.mode === 'work' ? `${S.focus.preset} minutes logged. Take the break.` : 'Back in when you are ready.');

  if (T.mode === 'work') {
    T.mode = 'break'; T.total = S.focus.breakLen * 60; T.banked = 0;
    toast('Block done. Take the break.');
    if (!S.settings.soundBreak) Audio.stop();
    if (S.settings.autoBreak) setTimeout(startPause, 700);
  } else {
    T.mode = 'work'; T.total = S.focus.preset * 60; T.banked = 0;
    toast('Break over. Back in.');
    Audio.stop();
  }
  paintTimer(); renderFocusStats();
}

/* One session record per work block, updated live as the minutes accrue. */
function openSession() {
  const now = Date.now();
  T.sessionId = 'live-' + now;
  S.sessions.push({ id:T.sessionId, date:today(), start:now, end:now,
                    minutes:0, mode:'work', tag:S.focus.tag || GENERAL });
  save();
}
function syncSession() {
  if (!T.sessionId) return;
  const s = S.sessions.find(x => x.id === T.sessionId);
  if (!s) return;
  const mins = Math.floor(elapsed() / 60);
  if (mins !== s.minutes) { s.minutes = mins; s.end = Date.now(); save(); renderFocusStats(); }
}
function closeSession() {
  if (!T.sessionId) return;
  const i = S.sessions.findIndex(x => x.id === T.sessionId);
  if (i > -1 && S.sessions[i].minutes < 1) S.sessions.splice(i, 1);
  else if (i > -1) S.sessions[i].end = Date.now();
  T.sessionId = null; save();
}

function setLengths(work, brk) {
  const wasRunning = T.running;
  pause(); closeSession();
  /* floor of 1, not 5: activities like brushing are two minutes, and a floor
     of five silently rewrote them to something they are not */
  S.focus.preset = clamp(work, 1, 180);
  S.focus.breakLen = clamp(brk, 1, 60);
  save();
  T.mode = 'work'; T.total = S.focus.preset * 60; T.banked = 0;
  $('#sesVal').textContent = S.focus.preset + 'min';
  $('#brkVal').textContent = S.focus.breakLen + 'min';
  paintTimer();
  if (wasRunning) toast('Timer reset to the new length');
}

/* The Session and Break labels used to be written only by setLengths(), so any
   other path that changed the lengths left them showing stale numbers. Restoring
   a backup does exactly that. */
function renderLengths() {
  $('#sesVal').textContent = S.focus.preset + 'min';
  $('#brkVal').textContent = S.focus.breakLen + 'min';
}

function renderFocusStats() {
  const k = today();
  const mins = minutesOn(k), goal = S.profile.goal || 0;
  $('#fTodayMin').textContent = fmtHM(mins);
  $('#fTodaySes').textContent = sessionsOn(k);
  $('#fStreak').textContent   = streak();

  const pct = goal ? Math.min(100, Math.round(mins / goal * 100)) : 0;
  $('#goalFill').style.width = pct + '%';
  $('#goalFill').classList.toggle('is-full', goal > 0 && mins >= goal);
  $('#goalTxt').textContent = !goal ? ''
    : mins >= goal ? `Daily goal of ${fmtHM(goal)} met`
    : `${fmtHM(mins)} of your ${fmtHM(goal)} goal`;
}

/* What this block is for.
   Two sources: the activities you keep coming back to, each carrying its own
   sensible length, and whatever is still open on today's plan. Picking an
   activity sets the timer to its length, because "meditation" and "deep work"
   are not the same twenty-five minutes and making you dial that in by hand
   every time is the friction this is meant to remove. */
function tagOptions() {
  const acts = (S.activities || []).map(a => ({ name:a.name, mins:a.mins, kind:'activity' }));
  const seen = new Set(acts.map(a => a.name));
  const tasks = tasksOn(today()).filter(t => !t.done).map(t => t.text)
    .filter(n => !seen.has(n) && (seen.add(n), true))
    .map(name => ({ name, mins:null, kind:'task' }));
  return acts.concat(tasks);
}
function currentOption() {
  return tagOptions().find(o => o.name === S.focus.tag) || null;
}
function renderTagStepper() {
  const opts = tagOptions();
  if (!opts.some(o => o.name === S.focus.tag)) S.focus.tag = opts.length ? opts[0].name : GENERAL;
  $('#tagLabel').textContent = S.focus.tag;

  const cur = currentOption();
  const note = $('#tagNote');
  if (note) {
    note.textContent = cur && cur.kind === 'task'
      ? 'From today’s plan. Uses your current session length.'
      : 'Tap the label to pick another or add your own.';
  }
  const single = opts.length < 2;
  $('#tagPrev').disabled = single;
  $('#tagNext').disabled = single;
  $('#tagPrev').title = $('#tagNext').title = 'Change what this block is for';
}

/* Changing the label mid-block must not reset a running timer, so the activity's
   length is only applied when nothing is under way. */
function applyTag(name) {
  S.focus.tag = name;
  const opt = currentOption();
  const idle = !T.running && elapsed() === 0 && T.mode === 'work';
  if (opt && opt.mins && idle && opt.mins !== S.focus.preset) {
    setLengths(opt.mins, S.focus.breakLen);
  }
  save(); renderTagStepper();
  const live = T.sessionId && S.sessions.find(x => x.id === T.sessionId);
  if (live) { live.tag = S.focus.tag; save(); }
}
function stepTag(dir) {
  const opts = tagOptions();
  const i = Math.max(0, opts.findIndex(o => o.name === S.focus.tag));
  applyTag(opts[(i + dir + opts.length) % opts.length].name);
}

/* The full list, because cycling eight things with an arrow is a chore. */
function openTagPicker() {
  const wrap = $('#pickList'); wrap.innerHTML = '';
  const add = (label, items) => {
    if (!items.length) return;
    const h = document.createElement('div');
    h.className = 'pick-cat'; h.textContent = label; wrap.appendChild(h);
    items.forEach(o => {
      const b = document.createElement('button');
      b.className = 'pick-row' + (o.name === S.focus.tag ? ' is-sel' : '');
      b.innerHTML = '<span></span><em></em>';
      $('span', b).textContent = o.name;
      $('em', b).textContent = o.mins ? o.mins + ' min' : 'current length';
      b.onclick = () => { applyTag(o.name); closeTagPicker(); };
      wrap.appendChild(b);
    });
  };
  const opts = tagOptions();
  add('Activities', opts.filter(o => o.kind === 'activity'));
  add('From today’s plan', opts.filter(o => o.kind === 'task'));
  $('#pickScrim').hidden = false;
}
function closeTagPicker() { $('#pickScrim').hidden = true; }

async function addActivity() {
  const made = await activityDialog();
  if (!made) return;
  S.activities.push({ name:made.name, mins:made.mins });
  save();
  applyTag(made.name);
  closeTagPicker();
  toast(`${made.name} added at ${made.mins} min`);
}

const SOUNDS = [['off','Off'],['rain','Rain'],['ocean','Ocean'],['forest','Forest'],['cafe','Café']];
function renderSounds() {
  const wrap = $('#soundList'); wrap.innerHTML = '';
  SOUNDS.filter(([k]) => k !== 'off').forEach(([key, label]) => {
    const on = S.focus.sound === key;
    const b = document.createElement('button');
    b.className = 'sound-item' + (on ? ' is-on' : '');
    b.innerHTML = `<span></span><svg><use href="#${on ? 'i-pause' : 'i-play-o'}"/></svg>`;
    $('span', b).textContent = label;
    b.onclick = () => {
      S.focus.sound = on ? 'off' : key; save(); renderSounds();
      if (S.focus.sound === 'off') Audio.stop(); else Audio.play(S.focus.sound);
    };
    wrap.appendChild(b);
  });
}

/* Ambient sound, synthesised, no audio files needed. */
const Audio = (() => {
  let ctx = null, node = null, gain = null, buf = null;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (!buf) {
      const len = ctx.sampleRate * 3;
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {                    // brown-ish noise
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.2;
      }
    }
    return ctx;
  }

  const RECIPE = {
    rain:   { type:'highpass', freq:900,  q:0.6, gain:0.55, lfo:0.13 },
    ocean:  { type:'lowpass',  freq:480,  q:1.1, gain:1.35, lfo:0.09 },
    forest: { type:'bandpass', freq:1400, q:0.8, gain:0.8,  lfo:0.2  },
    cafe:   { type:'lowpass',  freq:780,  q:0.7, gain:1.0,  lfo:0.06 }
  };

  function play(name) {
    if (name === 'off') return stop();
    const r = RECIPE[name]; if (!r) return;
    stop(); ensure();

    node = ctx.createBufferSource(); node.buffer = buf; node.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = r.type; filter.frequency.value = r.freq; filter.Q.value = r.q;

    gain = ctx.createGain();
    const target = (S.focus.volume / 100) * r.gain * 0.35;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(target, 0.0002), ctx.currentTime + 1.1);

    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = r.lfo; lfoGain.gain.value = target * 0.45;
    lfo.connect(lfoGain); lfoGain.connect(gain.gain); lfo.start();

    node.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    node.start();
    node._lfo = lfo;
  }

  function stop() {
    if (!node) return;
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value || 0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      const n = node, l = node._lfo;
      setTimeout(() => { try { n.stop(); l && l.stop(); } catch (e) {} }, 500);
    } catch (e) {}
    node = null; gain = null;
  }

  function setVolume(v) {
    if (!gain || !ctx) return;
    const r = RECIPE[S.focus.sound]; if (!r) return;
    gain.gain.setTargetAtTime((v / 100) * r.gain * 0.35, ctx.currentTime, 0.1);
  }

  function chime() {
    ensure();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + 1.2);
    });
  }

  return { play, stop, setVolume, chime };
})();

/* ---------------------------------------------------------
   NOTIFICATIONS
--------------------------------------------------------- */
function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted';
}
async function askNotify() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; }
  catch (e) { return false; }
}
function notify(title, body) {
  if (!S.settings.notify || !canNotify()) return;
  try { new Notification(title, { body, tag: 'flow-timer' }); } catch (e) {}
}

/* ---------------------------------------------------------
   REFLECT
--------------------------------------------------------- */
let entriesShown = 5;
const MOOD_LEVELS = [[1,'Drained'],[2,'Low'],[3,'Neutral'],[4,'Good'],[5,'Energized']];

function renderReflect() {
  const k = today(), r = S.reflections[k] || {};

  const wrap = $('#moodBars'); wrap.innerHTML = '';
  MOOD_LEVELS.forEach(([val, label]) => {
    const b = document.createElement('button');
    b.className = 'moodbar' + (r.mood === val ? ' is-sel' : '');
    b.dataset.mood = val;
    b.innerHTML = '<span></span><i></i>';
    $('span', b).textContent = label;
    b.onclick = () => { currentReflection().mood = val; save(); renderReflect(); };
    wrap.appendChild(b);
  });

  $('#journal').value = [r.note, r.extra].filter(Boolean).join('\n\n');
  showSaved(r.savedAt);

  /* The note is the entry, a bare mood word told you nothing you could scan.
     Five at a time, because the list is a diary, not a wall. */
  const list = $('#entries'); list.innerHTML = '';
  const keys = Object.keys(S.reflections).filter(x => x !== k).sort().reverse();
  keys.slice(0, entriesShown).forEach(key => {
    const e = S.reflections[key], d = parseKey(key);
    const b = document.createElement('button');
    b.className = 'row row--entry';
    b.dataset.mood = e.mood || 3;
    b.innerHTML = `<span class="entry-when"><i></i><em></em></span><span class="entry-note"></span>`;
    $('.entry-when em', b).textContent =
      `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()].slice(0,3)} · ${MOOD_WORD[e.mood] || 'unlogged'}`;
    $('.entry-note', b).textContent = e.note || 'No note for this day.';
    b.onclick = () => openDay(key);
    list.appendChild(b);
  });
  $('#entriesEmpty').style.display = keys.length ? 'none' : 'block';
  const more = $('#entriesMore');
  more.hidden = keys.length <= entriesShown;
  more.textContent = `Show ${Math.min(5, keys.length - entriesShown)} more`;
}

function currentReflection() {
  const k = today();
  if (!S.reflections[k]) S.reflections[k] = { mood:0, energy:{}, note:'', extra:'' };
  return S.reflections[k];
}
function showSaved(at) {
  $('#reflectSaved').textContent = at
    ? 'Saved ' + new Date(at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '';
}

/* Notes save themselves, a Save button on a journal is pure friction, and a
   Draft button asks the reader to understand a distinction that buys nothing. */
let noteTimer = null;
function autoSaveNote() {
  clearTimeout(noteTimer);
  $('#reflectSaved').textContent = 'Saving…';
  noteTimer = setTimeout(() => {
    const r = currentReflection();
    r.note = $('#journal').value.trim();
    r.extra = '';
    r.savedAt = Date.now();
    save(); showSaved(r.savedAt);
  }, 600);
}

/* ---------------------------------------------------------
   STATS
--------------------------------------------------------- */
/* Every number on this screen answers for the same window. It used to mix
   all-time totals with a weekly delta underneath them, and the range switch
   quietly moved some of them and not others. */
const RANGE_WORD = { week:'week', month:'month', year:'year' };
const RANGE_CAPTION = { week:'Last 7 days', month:'Last 30 days', year:'Last 12 months' };

function renderStats() {
  const range = S.range || 'week';
  const rows = buckets(range);
  const days = rangeDays(range);
  const rangeTotal = rows.reduce((a, b) => a + b.minutes, 0);
  const logged = rows.filter(r => r.minutes > 0);
  const word = RANGE_WORD[range];

  $$('#rangeSeg button').forEach(b => b.classList.toggle('is-active', b.dataset.range === range));
  $('#rangeCaption').textContent = RANGE_CAPTION[range];
  $('#focusRangeLabel').textContent = `Focus this ${word}`;

  const inRange = sessionsInRange(range);
  const count = inRange.length;
  $('#stTotal').textContent    = fmtHM(rangeTotal);
  $('#stAvg').textContent      = fmtHM(count ? Math.round(rangeTotal / count) : 0);
  $('#stTasks').textContent    = tasksDoneIn(days);
  $('#stSessions').textContent = count;
  $('#stAvgNote').textContent  = count ? 'per session' : 'no sessions yet';
  $('#stTasksNote').textContent = `this ${word}`;
  $('#stSesNote').textContent   = `this ${word}`;

  /* trend against the previous window of the same length */
  const prevCut = daysAgo(days * 2 - 1), thisCut = daysAgo(days - 1);
  prevCut.setHours(0,0,0,0); thisCut.setHours(0,0,0,0);
  const prevTotal = work()
    .filter(s => { const p = parseKey(s.date); return p >= prevCut && p < thisCut; })
    .reduce((a, b) => a + b.minutes, 0);
  const trend = $('#stTotalTrend');
  if (prevTotal > 0) {
    const diff = rangeTotal - prevTotal;
    trend.textContent = `${diff >= 0 ? 'up' : 'down'} ${fmtHM(Math.abs(diff))} on the last ${word}`;
  } else trend.textContent = `this ${word}`;

  const st = streak();
  const dots = $('#streakDots'); dots.innerHTML = '';
  lastNDays(7).forEach(d => {
    const i = document.createElement('i');
    if (d.minutes > 0) i.classList.add('is-on');
    i.title = `${DOW[d.date.getDay()]} ${d.date.getDate()}: ${fmtHM(d.minutes)}`;
    dots.appendChild(i);
  });
  $('#streakNote').textContent = st
    ? `${st} day streak. Keep going.` : 'Log a session to start a streak';

  /* The year view buckets by month, so "Best day" was labelling a month's total
     as a day's. And a best/average/quietest spread needs at least two buckets
     to mean anything: with one it printed the same number three times, which
     reads as a bug even though every figure was correct. */
  const unit = range === 'year' ? 'month' : 'day';
  $('#stHighLbl').textContent = `Best ${unit}`;
  $('#stMeanLbl').textContent = `Average ${unit}`;
  $('#stLowLbl').textContent  = `Quietest ${unit}`;

  const thin = logged.length < 2;
  $('#focusSpread').hidden = thin;
  $('#focusThin').hidden = !thin;
  if (thin) {
    $('#focusThin').textContent = logged.length
      ? `One ${unit} logged so far, ${fmtHM(rangeTotal)}. The spread shows once there are two.`
      : `Nothing logged in this window yet.`;
  } else {
    $('#stHigh').textContent = fmtHM(Math.max(...logged.map(r => r.minutes)));
    $('#stMean').textContent = fmtHM(Math.round(rangeTotal / logged.length));
    $('#stLow').textContent  = fmtHM(Math.min(...logged.map(r => r.minutes)));
  }

  renderMoodSplit(range);
  renderChart(rows, range);
  renderTimeOfDay(range);
}

const tasksDoneIn = days => Object.entries(S.tasks)
  .filter(([k]) => parseKey(k) >= daysAgo(days - 1))
  .reduce((a, [, v]) => a + v.filter(t => t.done).length, 0);
const sessionsIn = days => sessionsInRange(days >= 365 ? 'year' : days >= 30 ? 'month' : 'week').length;

function renderMoodSplit(range) {
  const cut = daysAgo(rangeDays(range) - 1); cut.setHours(0,0,0,0);
  const moods = Object.entries(S.reflections)
    .filter(([k, v]) => v.mood && parseKey(k) >= cut).map(([, v]) => v.mood);
  const counts = MOOD_LEVELS.map(([val]) => moods.filter(m => m === val).length);
  const max = Math.max(1, ...counts);
  const wrap = $('#moodSplit'); wrap.innerHTML = '';
  MOOD_LEVELS.forEach(([val, label], i) => {
    const pct = moods.length ? Math.round(counts[i] / moods.length * 100) : 0;
    const d = document.createElement('div');
    d.dataset.mood = val;
    if (counts[i] === max && counts[i] > 0) d.classList.add('is-top');
    d.innerHTML = `<u>${pct ? pct + '%' : ''}</u><i style="height:${counts[i] / max * 100}%"></i><em></em>`;
    $('em', d).textContent = label;
    d.title = `${label}: ${counts[i]} day${counts[i] === 1 ? '' : 's'}`;
    wrap.appendChild(d);
  });
  /* the bars alone do not say how much of the window they cover, and an
     unlogged day is not the same as a bad one */
  $('#moodNote').textContent = moods.length
    ? `${moods.length} of ${rangeDays(range)} days logged`
    : 'Log a mood on Reflect to see the pattern';
}

function renderChart(rows, range) {
  const max = Math.max(30, ...rows.map(d => d.minutes));
  const chart = $('#chart'), xs = $('#chartX');
  chart.innerHTML = ''; xs.innerHTML = '';
  const dense = rows.length > 12;
  rows.forEach((d, i) => {
    const col = document.createElement('div');
    col.className = 'bar-col' + (d.isNow ? ' is-today' : '');
    col.innerHTML = `<div class="bar" style="height:${clamp(d.minutes / max * 100, 3, 100)}%"></div>`;
    col.title = `${d.title}: ${fmtHM(d.minutes)}`;
    if (d.key) col.onclick = () => openDay(d.key);
    chart.appendChild(col);
    const s = document.createElement('span');
    s.textContent = dense ? (i % 5 === 0 || d.isNow ? d.label : '') : d.label;
    xs.appendChild(s);
  });
}

function renderTimeOfDay(range) {
  const list = sessionsInRange(range).filter(s => s.start);
  const totals = SLOTS.map(sl => ({
    ...sl,
    minutes: list.filter(s => {
      const h = new Date(s.start).getHours();
      return sl.from < sl.to ? (h >= sl.from && h < sl.to) : (h >= sl.from || h < sl.to);
    }).reduce((a, b) => a + b.minutes, 0)
  }));
  const max = Math.max(1, ...totals.map(t => t.minutes));
  const best = totals.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  $('#todBest').textContent = best.minutes ? best.label.toLowerCase() : '0m';

  const wrap = $('#tod'); wrap.innerHTML = '';
  totals.forEach(t => {
    const row = document.createElement('div');
    row.className = 'tod-row' + (t.minutes && t === best ? ' is-best' : '');
    row.innerHTML = `<label>${t.label}</label><div class="tod-bar"><i style="width:${t.minutes / max * 100}%"></i></div><b>${fmtHM(t.minutes)}</b>`;
    wrap.appendChild(row);
  });
}

function openDay(key) {
  const d = parseKey(key);
  const list = S.sessions.filter(s => s.date === key).sort((a, b) => (a.start || 0) - (b.start || 0));
  const r = S.reflections[key];

  $('#dayTitle').textContent = 'Go Back';
  $('#dayHeading').textContent = `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()].slice(0,3)}`;
  $('#dayTotal').textContent = fmtHM(minutesOn(key));
  $('#daySessions').textContent = list.filter(s => s.mode === 'work').length;
  $('#dayMood').textContent = r && r.mood ? MOOD_WORD[r.mood] : 'not logged';

  /* Read-only on purpose. Editing history from a summary screen invites the
     kind of tidying-up that makes your own record useless. */
  const tl = tasksOn(key), tCard = $('#dayTaskCard');
  if (tl.length) {
    tCard.style.display = 'flex';
    const tDone = tl.filter(t => t.done).length;
    $('#dayTaskCount').textContent = `${tDone} of ${tl.length} done`;
    const tul = $('#dayTasks'); tul.innerHTML = '';
    tl.forEach(t => {
      const li = document.createElement('li');
      li.className = 'task task--read' + (t.done ? ' is-done' : '');
      li.innerHTML = '<span class="task-box"><svg><use href="#i-check"/></svg></span><span class="task-txt"></span>';
      $('.task-txt', li).textContent = t.text;
      tul.appendChild(li);
    });
  } else tCard.style.display = 'none';

  const log = $('#dayLog'); log.innerHTML = '';
  list.forEach(s => {
    const row = document.createElement('div');
    row.className = 'log-row';
    const when = s.start ? `${hhmm(s.start)} to ${hhmm(s.end || s.start)}` : 'time not recorded';
    row.innerHTML = `<span class="log-dot"></span>
      <div class="log-main"><b></b><span>${when}</span></div>
      <span class="log-dur">${fmtHM(s.minutes)}</span>`;
    $('b', row).textContent = s.tag || GENERAL;
    log.appendChild(row);
  });
  $('#dayEmpty').style.display = list.length ? 'none' : 'block';

  const noteCard = $('#dayNoteCard');
  if (r && (r.note || r.extra)) {
    noteCard.style.display = 'flex';
    $('#dayNote').textContent = [r.note, r.extra].filter(Boolean).join('\n\n');
  } else noteCard.style.display = 'none';

  go('day', true);
}

/* ---------------------------------------------------------
   PROFILE / SETTINGS
--------------------------------------------------------- */
/* A generic person mark rather than an initial, there is no photo to show,
   and a letter on every screen reads like a placeholder that never got filled. */
const AVATAR_SVG = '<svg><use href="#i-avatar"/></svg>';
function paintAvatars() {
  const photo = S.profile.photo;
  const html = photo
    ? `<img src="${photo}" alt="" class="avatar-img">`
    : AVATAR_SVG;
  $$('.avatar').forEach(a => { if (a.innerHTML !== html) a.innerHTML = html; });
}

/* A picture, downscaled before it is stored.
   localStorage holds a few megabytes of TEXT, and a base64 data URL is about a
   third bigger than the file it came from, so a normal phone photo would blow
   the quota on its own and take every task and session down with it. Squaring
   it to 192px keeps the whole profile under ~30KB. */
const PHOTO_PX = 192;
function readPhoto(file) {
  if (!file || !/^image\//.test(file.type)) return toast('That is not an image');
  const fr = new FileReader();
  fr.onerror = () => toast('That file could not be read');
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => toast('That image could not be opened');
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = PHOTO_PX;
      const ctx = cv.getContext('2d');
      /* cover, not stretch: take the largest centred square and scale that, or
         a portrait photo arrives squashed */
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side,
                    0, 0, PHOTO_PX, PHOTO_PX);
      const url = cv.toDataURL('image/jpeg', 0.82);
      const before = S.profile.photo;
      S.profile.photo = url;
      try {
        save();
      } catch (e) {
        S.profile.photo = before;
        return toast('No room left to store that picture');
      }
      /* save() swallows its own errors, so confirm the write actually landed */
      if (!(localStorage.getItem(KEY) || '').includes(url.slice(0, 40))) {
        S.profile.photo = before; save();
        return toast('No room left to store that picture');
      }
      paintAvatars(); renderProfile(); toast('Picture updated');
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function clearPhoto() {
  S.profile.photo = null; save(); paintAvatars(); renderProfile(); toast('Picture removed');
}

function renderProfile() {
  const name = S.profile.name || 'Friend';
  const mark = $('#profMark'), photo = S.profile.photo;
  mark.classList.toggle('has-photo', !!photo);
  mark.style.backgroundImage = photo ? `url(${photo})` : '';
  $('#profClear').hidden = !photo;
  $('#profHello').textContent = name;

  /* "member since" from the earliest thing you actually did, not from an
     account creation date, because there is no account */
  const first = S.sessions.map(x => x.date).concat(Object.keys(S.reflections)).sort()[0];
  if (first) {
    const d = parseKey(first);
    const days = Math.max(1, Math.round((Date.now() - d.getTime()) / 86400000));
    $('#profSince').textContent =
      `Focusing with Flow since ${d.getDate()} ${MON[d.getMonth()].slice(0,3)}, ${days} days`;
  } else {
    $('#profSince').textContent = 'Your first session is still ahead of you';
  }

  $('#profFocus').textContent  = fmtHM(totalMinutes());
  $('#profStreak').textContent = streak();
  $('#profDone').textContent   = totalTasksDone();
  if (document.activeElement !== $('#pName')) $('#pName').value = S.profile.name;
  $('#pGoalVal').textContent = S.profile.goal + ' min';
  $('#profGoalNote').textContent =
    `About ${Math.max(1, Math.round(S.profile.goal / S.focus.preset))} blocks at your current ${S.focus.preset} minute length. Progress shows on Focus.`;
}

/* Same contract as the journal: type, and it is kept. */
let profTimer = null;
function autoSaveProfile() {
  clearTimeout(profTimer);
  $('#profSaved').textContent = 'Saving…';
  profTimer = setTimeout(() => {
    S.profile.name = $('#pName').value.trim() || 'Friend';
    save(); paintAvatars(); renderProfile();
    $('#profSaved').textContent = 'Saved';
  }, 500);
}
function applyTheme() {
  document.documentElement.dataset.theme = S.settings.theme;
  /* On a phone the browser paints its own bar with this. It was pinned to
     black in the markup, which left a black status bar sitting above a white
     app in light mode. Follow --background instead. */
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content',
    getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
  const hex = S.settings.accent;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const root = document.documentElement.style;
  /* the stylesheet drives everything off --primary/--ring; setting a stale
     --accent here is why the swatches used to do nothing */
  root.setProperty('--primary', hex);
  root.setProperty('--ring', hex);
  root.setProperty('--primary-soft', `rgba(${r},${g},${b},.14)`);
}
function renderSettings() {
  $$('#menuThemeSeg button').forEach(b => b.classList.toggle('is-active', b.dataset.theme === S.settings.theme));
  $$('#themeSeg button').forEach(b => b.classList.toggle('is-active', b.dataset.theme === S.settings.theme));
  $$('#accentRow button').forEach(b => b.classList.toggle('is-active', b.dataset.accent === S.settings.accent));
  $$('.toggle[data-setting]').forEach(t => t.classList.toggle('is-on', !!S.settings[t.dataset.setting]));
}

/* ---------------------------------------------------------
   HELP
--------------------------------------------------------- */
/* Written as the questions people actually arrive with, in the order they tend
   to arrive in, rather than as feature headings. */
const FAQS = [
  ['How does the timer work', 'Pick a session and break length, then press Start Flow. Minutes bank as they pass, so stopping halfway still counts the half you did. Tap the minutes to cycle 25, 50 and 90 in one go.'],
  ['What happens to unfinished tasks', 'They roll forward from your last planned day and arrive marked "carried". Anything older stays where it was, so a day you look back on still shows what you left undone.'],
  ['What are session labels for', 'The pill under the dial says what the block is for. Tap it to pick an activity, and the timer takes that activity’s length: two minutes for brushing, fifty for deep work. Your open tasks show up in the same list, and you can add your own.'],
  ['Does Flow need an account', 'No. There is no sign-up, no email, no server and nothing to log in to. The only thing it ever asks for is a name to greet you by, and you can skip that.'],
  ['Where is my data kept', 'In this browser, under a single key. Clearing your site data removes it, so if it matters to you, take a copy from Downloads and backup.'],
  ['How do I move Flow to another device', 'Export your data, then restore that file on the other device. Keep the file in a folder you already sync and it follows you around. That is the only cloud involved, and it is yours.'],
  ['Is the rant really gone', 'Yes. Nothing on that screen is ever written to storage. The words live in the box and nowhere else, so the fire really is the end of them.'],
  ['Why will the microphone not start', 'Dictation needs a real browser tab with microphone permission. It cannot work from a file opened off your disk, or inside an embedded preview that was never given mic access. Flow tells you which of those it is on the Rant screen. Typing works everywhere.'],
  ['Notifications are not appearing', 'Turn them on in Settings and accept the browser prompt. If you dismissed or blocked it earlier, the browser will not ask twice and you have to re-allow Flow in its site settings.'],
  ['Does a sleeping tab break the timer', 'No. The countdown is worked out from the clock rather than ticked down one second at a time, so a backgrounded or throttled tab never makes it drift.']
];
/* An accordion, so the answer arrives where you were already looking. One open
   at a time: this is a list to scan, not a page to read end to end. */
function buildFaq() {
  const wrap = $('#faqRows'); wrap.innerHTML = '';
  FAQS.forEach(([q, a]) => {
    const item = document.createElement('div');
    item.className = 'faq';

    const btn = document.createElement('button');
    btn.className = 'row faq-q';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><svg class="faq-chev"><use href="#i-chev-r"/></svg>';
    $('span', btn).textContent = q;

    const ans = document.createElement('p');
    ans.className = 'faq-answer';
    ans.hidden = true;
    ans.textContent = a;

    btn.onclick = () => {
      const wasOpen = !ans.hidden;
      $$('#faqRows .faq-answer').forEach(x => { x.hidden = true; });
      $$('#faqRows .faq-q').forEach(x => {
        x.classList.remove('is-sel'); x.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        ans.hidden = false;
        btn.classList.add('is-sel');
        btn.setAttribute('aria-expanded', 'true');
      }
    };

    item.appendChild(btn); item.appendChild(ans);
    wrap.appendChild(item);
  });
}

/* ---------------------------------------------------------
   BACKUP
--------------------------------------------------------- */
function renderBackup() {
  $('#bkTasks').textContent    = Object.values(S.tasks).flat().length;
  $('#bkSessions').textContent = S.sessions.length;
  $('#bkEntries').textContent  = Object.keys(S.reflections).length;
  const bytes = new Blob([JSON.stringify(S)]).size;
  $('#bkSize').textContent = bytes > 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B';
  if (S.lastBackup) {
    const mins = Math.round((Date.now() - S.lastBackup) / 60000);
    $('#bkWhen').textContent = mins < 1 ? 'Last backup: just now'
      : mins < 60 ? `Last backup: ${mins} min ago` : `Last backup: ${Math.round(mins/60)}h ago`;
  } else $('#bkWhen').textContent = 'You have not taken a copy yet';
}

function exportData() {
  const json = JSON.stringify(S, null, 2);
  const filename = `flow-backup-${today()}.json`;

  const url = URL.createObjectURL(new Blob([json], { type:'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  S.lastBackup = Date.now(); save(); renderBackup(); toast('Backup downloaded');
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      S = migrate(Object.assign(defaults(), JSON.parse(fr.result)));
      save(); applyTheme(); refresh(current); toast('Data restored');
    } catch (e) { toast('That file could not be read'); }
  };
  fr.readAsText(file);
}

/* ---------------------------------------------------------
   AVATAR MENU + DIALOG
--------------------------------------------------------- */
function openMenu()  { renderSettings(); $('#menuScrim').hidden = false; }
function closeMenu() { $('#menuScrim').hidden = true; }

/* An in-app dialog rather than window.confirm, a native prompt cannot be
   styled and breaks the illusion of an app. Resolves true/false. */
function confirmDialog(title, body, okLabel = 'Confirm') {
  return new Promise(resolve => {
    $('#dlgTitle').textContent = title;
    $('#dlgBody').textContent = body;
    $('#dlgOk').textContent = okLabel;
    $('#dlgScrim').hidden = false;
    $('#dlgOk').focus();

    const done = v => {
      $('#dlgScrim').hidden = true;
      $('#dlgOk').onclick = $('#dlgCancel').onclick = null;
      document.removeEventListener('keydown', keys);
      resolve(v);
    };
    const keys = e => { if (e.key === 'Escape') done(false); };
    $('#dlgOk').onclick = () => done(true);
    $('#dlgCancel').onclick = () => done(false);
    $('#dlgScrim').onclick = e => { if (e.target.id === 'dlgScrim') done(false); };
    document.addEventListener('keydown', keys);
  });
}

/* Name and length for a new activity. Resolves to {name, mins} or null. */
function activityDialog() {
  return new Promise(resolve => {
    let mins = 20;
    const paint = () => { $('#actMins').textContent = mins + ' min'; };
    $('#actName').value = '';
    paint();
    $('#actScrim').hidden = false;
    setTimeout(() => $('#actName').focus(), 40);

    const step = e => {
      mins = clamp(mins + (+e.currentTarget.dataset.act), 1, 180);
      paint();
    };
    $$('[data-act]').forEach(b => b.addEventListener('click', step));

    const done = v => {
      $('#actScrim').hidden = true;
      $$('[data-act]').forEach(b => b.removeEventListener('click', step));
      $('#actOk').onclick = $('#actCancel').onclick = $('#actScrim').onclick = null;
      $('#actName').onkeydown = null;
      document.removeEventListener('keydown', keys);
      resolve(v);
    };
    const submit = () => {
      const name = $('#actName').value.trim().slice(0, 32);
      if (!name) return $('#actName').focus();
      /* a duplicate would give the stepper two identical entries and make the
         lookup ambiguous, so reuse the existing one instead of adding a twin */
      const dup = (S.activities || []).find(a => a.name.toLowerCase() === name.toLowerCase());
      if (dup) { toast(`${dup.name} is already there`); return done(null); }
      done({ name, mins });
    };
    const keys = e => { if (e.key === 'Escape') done(null); };
    $('#actOk').onclick = submit;
    $('#actName').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    $('#actCancel').onclick = () => done(null);
    $('#actScrim').onclick = e => { if (e.target.id === 'actScrim') done(null); };
    document.addEventListener('keydown', keys);
  });
}

/* ---------------------------------------------------------
   RANT, write it, say it, then burn it.
   Nothing on this screen is ever written to storage. The text lives in the
   textarea and nowhere else, so the fire really is the end of it.
--------------------------------------------------------- */
let rantRec = null, rantLive = false, rantBurning = false;

const SpeechCtor = () => window.SpeechRecognition || window.webkitSpeechRecognition;

/* Dictation runs on the browser's own Web Speech API. Firefox has never
   shipped SpeechRecognition, and a page opened off disk or inside an embedded
   preview never gets a microphone either. There is no way to fix that from
   inside the page without shipping audio to some speech service, which would
   break the one promise this screen makes.

   So the button stays where it is and says nothing until you press it. A
   permanent banner apologising for a browser feature is the wrong trade on a
   screen whose whole point is a blank page, and it was the loudest thing here. */
function micBlocker() {
  if (!SpeechCtor())
    return 'This browser has no dictation. Chrome, Edge and Safari do.';
  if (location.protocol === 'file:')
    return 'Dictation needs Flow opened over a web address, not off your disk.';
  if (window.top !== window.self)
    return 'Dictation needs its own browser tab, not an embedded preview.';
  if (!window.isSecureContext)
    return 'Dictation needs https or localhost.';
  return null;
}

function renderRant() {
  updateRantCount();
  paintMic();
  $('#rantMic').disabled = rantBurning;
  $('#rantMic').title = micBlocker() || 'Dictate instead of typing';
  $('#rantHint').textContent = "Say anything. Nothing here is saved. Burn it when you're done.";
}

function updateRantCount() {
  const n = $('#rantText').value.trim().split(/\s+/).filter(Boolean).length;
  $('#rantCount').textContent = n ? `${n} word${n === 1 ? '' : 's'}` : '';
  $('#rantBurn').disabled = !n || rantBurning;
}

/* ---- dictation ---- */
function paintMic() {
  $('#rantMic').classList.toggle('is-live', rantLive);
  $('#rantMicLabel').textContent = rantLive ? 'Listening' : 'Speak';
}
function stopMic() {
  rantLive = false;
  if (rantRec) { try { rantRec.stop(); } catch (e) {} rantRec = null; }
  paintMic();
}
function toggleMic() {
  const blocked = micBlocker();
  if (blocked) return toast(blocked);
  if (rantLive) return stopMic();

  rantRec = new (SpeechCtor())();
  rantRec.continuous = true;
  rantRec.interimResults = true;
  rantRec.lang = navigator.language || 'en-US';

  let settled = $('#rantText').value;
  rantRec.onresult = e => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final) settled = (settled ? settled + ' ' : '') + final.trim();
    $('#rantText').value = (settled + (interim ? ' ' + interim : '')).trim();
    updateRantCount();
  };
  /* `no-speech` is not a failure, it is a pause, so it must not tear the
     session down or dictation stops every time you think for a moment. */
  const REASON = {
    'not-allowed':         'The microphone is blocked for this page. Allow it in your browser, or open Flow in its own tab, then tap Speak again.',
    'service-not-allowed': 'Your browser refused the speech service. It usually means the page is embedded or the mic is off at system level.',
    'audio-capture':       'No microphone was found. Plug one in or pick one in your system sound settings.',
    'network':             'Speech recognition needs a connection to work, and it could not reach the service.'
  };
  rantRec.onerror = ev => {
    if (ev.error === 'no-speech' || ev.error === 'aborted') return;
    toast(REASON[ev.error] || 'Dictation stopped. Typing still works.');
    stopMic();
  };
  /* browsers cut the stream every few seconds, restart while the user still
     wants it, otherwise dictation dies mid-sentence */
  rantRec.onend = () => { if (rantLive && rantRec) { try { rantRec.start(); } catch (e) {} } };

  try { rantRec.start(); rantLive = true; paintMic(); toast('Listening. Speak freely.'); }
  catch (e) { toast('The microphone could not be started. Typing still works.'); stopMic(); }
}

/* ---- the fire ----
   The text is painted into a canvas, then eaten away bottom-up along a noisy
   frontier. Where the frontier passes it glows like an ember and throws off
   sparks; behind it the pixels are gone for good. */
function burnRant() {
  if (rantBurning) return;
  const ta = $('#rantText');
  if (!ta.value.trim()) return toast('Nothing to burn yet');

  rantBurning = true;
  stopMic();
  $('#rantBurn').disabled = $('#rantMic').disabled = true;

  const w = Math.max(1, ta.offsetWidth), h = Math.max(1, ta.offsetHeight);
  const cv = $('#rantCanvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  cv.width = w; cv.height = h;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.style.top = ta.offsetTop + 'px';

  // paint the text where it already sits
  const cs = getComputedStyle(ta);
  const size = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || size * 1.65;
  ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  /* Position by the real baseline, not textBaseline:'top', that anchors to the
     font's ascent box, which left the burn copy ~2px above the live text and
     made it visibly hop the moment you pressed Burn. */
  ctx.textBaseline = 'alphabetic';
  const fm = ctx.measureText('Mg');
  const asc  = fm.fontBoundingBoxAscent  || size * 0.80;
  const desc = fm.fontBoundingBoxDescent || size * 0.20;
  let y = (parseFloat(cs.paddingTop) || 0) + (lh - (asc + desc)) / 2 + asc;
  ta.value.split('\n').forEach(para => {
    let line = '';
    para.split(/\s+/).forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > w && line) { ctx.fillText(line, 0, y); y += lh; line = word; }
      else line = test;
    });
    ctx.fillText(line, 0, y); y += lh;
  });

  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);

  // smooth value noise so the burn edge is organic rather than a straight line
  const cell = 16, gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
  const smooth = t => t * t * (3 - 2 * t);
  const thr = new Float32Array(w * h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const fx = px / cell, fy = py / cell;
      const x0 = fx | 0, y0 = fy | 0, tx = smooth(fx - x0), ty = smooth(fy - y0);
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      const n = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      thr[py * w + px] = (1 - py / h) * 0.68 + n * 0.32;   // bottom burns first
    }
  }

  ta.style.visibility = 'hidden';
  cv.classList.add('is-burning');

  const BAND = 0.07, sparks = [];
  let p = -0.05, raf = 0;

  const step = () => {
    p += 0.011;
    const sd = src.data, od = out.data;
    for (let i = 0, px = 0; px < thr.length; i += 4, px++) {
      const t = thr[px];
      if (p > t + BAND) { od[i + 3] = 0; continue; }
      if (p > t) {                                   // the ember frontier
        const k = (p - t) / BAND;
        od[i] = 255;
        od[i + 1] = 190 - (150 * k) | 0;
        od[i + 2] = 60 - (60 * k) | 0;
        od[i + 3] = sd[i + 3] ? 255 : (70 * (1 - k)) | 0;
      } else {
        od[i] = sd[i]; od[i + 1] = sd[i + 1]; od[i + 2] = sd[i + 2]; od[i + 3] = sd[i + 3];
      }
    }
    ctx.putImageData(out, 0, 0);

    // sparks rise off the frontier
    const frontY = h * (1 - (p - 0.16) / 0.68);
    if (p > 0 && p < 1.05) {
      for (let i = 0; i < 3; i++) {
        sparks.push({
          x: Math.random() * w,
          y: frontY + (Math.random() - 0.5) * 18,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.5 - Math.random() * 1.4,
          life: 1, r: 0.7 + Math.random() * 1.6
        });
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy -= 0.012; s.life -= 0.018;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, s.life) * 0.9;
      ctx.fillStyle = s.life > 0.6 ? '#FFD08A' : '#FF7A18';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (p < 1.4 || sparks.length) { raf = requestAnimationFrame(step); }
    else finish();
  };

  const finish = () => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, w, h);
    cv.classList.remove('is-burning');
    ta.value = '';                       // the only copy, now gone
    ta.style.visibility = '';
    rantBurning = false;
    $('#rantMic').disabled = false;
    updateRantCount();

    const gone = $('#rantGone');
    gone.hidden = false;
    requestAnimationFrame(() => gone.classList.add('is-on'));
    setTimeout(() => {
      gone.classList.remove('is-on');
      setTimeout(() => { gone.hidden = true; }, 500);
    }, 1200);
  };

  // honour reduced motion: no theatrics, same outcome
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { p = 1.4; finish(); }
  else raf = requestAnimationFrame(step);
}

/* ---------------------------------------------------------
   WIRING
--------------------------------------------------------- */
function init() {
  carryOver();
  save();
  buildRail();
  applyTheme();
  initOb();
  buildFaq();
  paintAvatars();
  renderSounds();

  const clock = () => {
    const d = new Date();
    $('#sbTime').textContent = `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())}`;
  };
  clock(); setInterval(clock, 20000);

  document.addEventListener('click', e => {
    if (e.target.closest('[data-menu]')) { openMenu(); return; }
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) { closeMenu(); go(goBtn.dataset.go, !TABS.includes(goBtn.dataset.go)); return; }
    if (e.target.closest('[data-back]')) { back(); return; }
    if (e.target.id === 'menuScrim' || e.target.closest('#menuClose')) closeMenu();
  });
  $('#railHide').onclick = () => setRail(true);
  $('#railShow').onclick = () => setRail(false);
  try { if (localStorage.getItem(RAIL_KEY) === 'off') setRail(true); } catch (e) {}
  /* S toggles it, so you can clear the frame mid-recording without reaching for
     a button. Ignored while you are typing, or S would vanish the rail every
     time you wrote the letter in a task. */
  document.addEventListener('keydown', e => {
    if (e.key !== 's' && e.key !== 'S') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    toggleRail();
  });

  $('#railReset').onclick = async () => {
    if (!await confirmDialog('Start over',
        'Wipes everything and takes you right back to the very first screen, onboarding included.',
        'Start over')) return;
    /* a full reload is the honest reset, it re-runs init from nothing rather
       than trying to unwind live state in place */
    localStorage.removeItem(KEY);
    location.hash = '';
    location.reload();
  };

  // PLAN
  $('#taskAdd').onclick = addTask;
  $('#taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  $('#dayPrev').onclick = () => { viewDate.setDate(viewDate.getDate() - 1); renderPlan(); };
  $('#dayNext').onclick = () => { viewDate.setDate(viewDate.getDate() + 1); renderPlan(); };
  $('#calPrev').onclick = () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); };
  $('#calNext').onclick = () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); };

  // FOCUS
  $('#btnStart').onclick = startPause;
  $('#btnReset').onclick = reset;
  $('#btnSkip').onclick  = complete;
  $('#tagPrev').onclick  = () => stepTag(-1);
  $('#tagNext').onclick  = () => stepTag(1);
  $('.pill-val').onclick = openTagPicker;
  $('#pickClose').onclick = closeTagPicker;
  $('#pickAdd').onclick   = addActivity;
  $('#pickScrim').onclick = e => { if (e.target.id === 'pickScrim') closeTagPicker(); };
  $$('[data-ses]').forEach(b => b.onclick = () => setLengths(S.focus.preset + (+b.dataset.ses), S.focus.breakLen));
  $$('[data-brk]').forEach(b => b.onclick = () => setLengths(S.focus.preset, S.focus.breakLen + (+b.dataset.brk)));
  $('#sesVal').onclick = () => {                 // one tap instead of five
    const cycle = [[25,5],[50,10],[90,20]];
    const i = cycle.findIndex(([w]) => w === S.focus.preset);
    const [w, brk] = cycle[(i + 1) % cycle.length];
    setLengths(w, brk); toast(`${w} min focus · ${brk} min break`);
  };
  $('#volRange').oninput = e => {
    S.focus.volume = +e.target.value; save();
    $('#volVal').textContent = e.target.value;
    Audio.setVolume(S.focus.volume);
  };

  // REFLECT
  $('#entriesMore').onclick = () => { entriesShown += 5; renderReflect(); };
  $('#journal').addEventListener('input', autoSaveNote);
  $('#journal').addEventListener('blur', () => { clearTimeout(noteTimer); autoSaveNote(); });

  // RANT
  $('#rantText').addEventListener('input', updateRantCount);
  $('#rantMic').onclick  = toggleMic;
  $('#rantBurn').onclick = burnRant;

  // STATS
  $$('#rangeSeg button').forEach(b => b.onclick = () => { S.range = b.dataset.range; save(); renderStats(); });
  $('#stExport').onclick = exportData;

  // PROFILE
  $('#profMark').onclick = () => $('#profFile').click();
  $('#profFile').onchange = e => { if (e.target.files[0]) readPhoto(e.target.files[0]); e.target.value = ''; };
  $('#profClear').onclick = clearPhoto;
  $('#pName').addEventListener('input', autoSaveProfile);
  $('#pName').addEventListener('blur', () => { clearTimeout(profTimer); autoSaveProfile(); });
  $$('[data-goal]').forEach(b => b.onclick = () => {
    S.profile.goal = clamp(S.profile.goal + (+b.dataset.goal), 15, 600);
    save(); renderProfile(); renderFocusStats();
  });

  // SETTINGS
  $$('#themeSeg button, #menuThemeSeg button').forEach(b => b.onclick = () => {
    S.settings.theme = b.dataset.theme; save(); applyTheme(); renderSettings();
  });
  $$('#accentRow button').forEach(b => b.onclick = () => {
    S.settings.accent = b.dataset.accent; save(); applyTheme(); renderSettings();
  });
  $$('.toggle[data-setting]').forEach(t => t.onclick = async () => {
    const k = t.dataset.setting;
    if (k === 'notify' && !S.settings.notify) {
      const ok = await askNotify();
      if (!ok) { renderSettings(); toast('Notifications are blocked in your browser'); return; }
    }
    S.settings[k] = !S.settings[k];
    save(); renderSettings();
  });
  /* Report a problem and See the source are plain links to the repo. They have
     no handler here on purpose: they used to be buttons that raised a toast
     explaining the repo was not public yet, which is a button that does nothing
     wearing an apology. */

  // BACKUP
  $('#bkExport2').onclick = exportData;
  $('#bkImport').onclick  = () => $('#bkFile').click();
  $('#bkFile').onchange   = e => { if (e.target.files[0]) importData(e.target.files[0]); };
  $('#bkWipe').onclick = async () => {
    if (!await confirmDialog('Clear all data',
        'Every task, focus session and reflection will be erased. This cannot be undone.', 'Erase everything')) return;
    S = defaults(); S.onboarded = true; save(); applyTheme(); refresh(current); toast('All data erased');
  };

  // FOCUS restore
  $('#volRange').value = S.focus.volume;
  $('#volVal').textContent = S.focus.volume;
  $('#sesVal').textContent = S.focus.preset + 'min';
  $('#brkVal').textContent = S.focus.breakLen + 'min';
  T.total = S.focus.preset * 60;
  renderTagStepper();
  paintTimer();

  document.addEventListener('visibilitychange', () => { if (document.hidden) Audio.stop(); });
  fitDevice();
  window.addEventListener('resize', fitDevice);
  window.addEventListener('beforeunload', () => { if (T.running) pause(); });

  /* go() records the screen in the hash, so a reload can land back on #splash.
     Whatever route we resolve, splash must always schedule its own hand-off or
     the logo screen becomes a dead end. */
  const hash = location.hash.slice(1);
  const start = (hash && $(`[data-screen="${hash}"]`)) ? hash : (S.onboarded ? 'plan' : 'splash');
  routeTo(start);
}

/* Small control surface, used by the screenshot exporter and for debugging. */
window.Flow = {
  go, refresh, save, toast, paintTimer, seed, openDay, carryOver, openMenu, closeMenu,
  state: () => S,
  setState: next => { S = migrate(Object.assign(defaults(), next)); save(); applyTheme(); refresh(current); },
  timer: T,
  setTimer: (mode, leftSec, totalSec) => {
    T.mode = mode; T.total = totalSec; T.banked = totalSec - leftSec; T.running = false; paintTimer();
  },
  obStep: n => { obStep = n; renderOb(); }
};

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (h && h !== current && $(`[data-screen="${h}"]`)) routeTo(h);
});

})();
