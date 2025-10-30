/* script.js — Clean, robust, fixed version
   Assumptions:
   - Server exposes:
     GET /api/timezones        -> returns array of { zone, name, code, flag }
     GET /api/time?zone=<IANA> -> returns { status:'success', timezone, timestamp, gmtOffset }
   - HTML contains the same selectors you posted earlier
*/

document.addEventListener('DOMContentLoaded', () => {
  /* -------------------------
     Element references (guarded)
     ------------------------- */
  const el = {
    time: {
      hours: document.querySelector('.hours'),
      minutes: document.querySelector('.minutes'),
      seconds: document.querySelector('.seconds'),
      ampm: document.querySelector('.ampm'),
      // prefer sec-separator, fallback to separator
      separator: document.querySelector('.sec-separator') || document.querySelector('.separator')
    },
    date: {
      weekday: document.querySelector('.weekday'),
      day: document.querySelector('.day'),
      month: document.querySelector('.month'),
      year: document.querySelector('.year')
    },
    controls: {
      formatToggle: document.getElementById('format-toggle'),
      themeToggle: document.getElementById('theme-toggle'),
      settingsBtn: document.getElementById('settings-btn'),
      settingsPanel: document.getElementById('settings-panel'),
      closeSettings: document.getElementById('close-settings'),
      showSeconds: document.getElementById('show-seconds'),
      soundToggle: document.getElementById('sound-toggle')
    },
    timezone: {
      label: document.getElementById('timezone-label'),
      container: document.querySelector('.timezone')
    }
  };

  /* -------------------------
     Config & state
     ------------------------- */
  const CONFIG = {
    API_BASE_URL: '/api',        // server root
    UPDATE_INTERVAL: 1000,       // ms
    SYNC_INTERVAL: 60000,        // ms
    WEEKDAYS: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    MONTHS: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    FALLBACK_TZ_LIST: [
      { zone: 'Asia/Kolkata', name: 'India', code: 'IN', flag: '🇮🇳' },
      { zone: 'America/New_York', name: 'United States (NY)', code: 'US', flag: '🇺🇸' },
      { zone: 'Europe/London', name: 'United Kingdom', code: 'GB', flag: '🇬🇧' },
      { zone: 'Asia/Tokyo', name: 'Japan', code: 'JP', flag: '🇯🇵' },
      { zone: 'Australia/Sydney', name: 'Australia (Sydney)', code: 'AU', flag: '🇦🇺' }
    ]
  };

  const state = {
    tzList: [],                 // populated list of zones
    selectedZone: null,         // IANA string e.g. 'Asia/Kolkata'
    selectedLabel: '',          // visible name + flag
    is24Hour: false,
    showSeconds: true,
    lastServerTimestamp: null,  // unix seconds (if server provided)
    tickIntervalId: null,
    syncIntervalId: null,
     // sound state persists in localStorage key 'tickSoundEnabled'
    soundEnabled: JSON.parse(localStorage.getItem('tickSoundEnabled') || 'false')
    
  };

    /* -------------------------
     Audio setup (tick sound)
     ------------------------- */
  // Path MUST match where your file is served from. Adjust if necessary.
  const TICK_AUDIO_PATH = '/assets/sound/tick-tock.mp3';

  // Create Audio element (preload)
  const tickSound = new Audio(TICK_AUDIO_PATH);
  tickSound.preload = 'auto';
  tickSound.load();
  tickSound.volume = 0.5;

  // Attempt to unlock audio context using a user gesture (called when user enables sound)
  async function unlockAudioWithUserGesture() {
    try {
      // play & pause quickly to unlock
      await tickSound.play();
      tickSound.pause();
      tickSound.currentTime = 0;
    } catch (err) {
      // ignored — we'll still attempt to play clones which may be allowed after gesture
    }
  }

  function playTickSound() {
    if (!state.soundEnabled) return;
    try {
      // cloneNode ensures quick successive plays don't conflict
      const s = tickSound.cloneNode(true);
      s.volume = 0.45;
      const p = s.play();
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      // fallback: attempt to play original (safely)
      try { tickSound.play().catch(()=>{}); } catch(_) {}
    }
  }

  /* -------------------------
     Helpers
     ------------------------- */
  function safeFetch(url, opts) {
    return fetch(url, opts).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    });
  }

  function pad(v) { return String(v).padStart(2, '0'); }

  // Render function that updates DOM based on a Date instance
  function renderDateToDOM(date) {
    if (!(date instanceof Date) || isNaN(date)) return;

    const hours24 = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    if (state.is24Hour) {
      if (el.time.hours) el.time.hours.textContent = pad(hours24);
      if (el.time.ampm) el.time.ampm.style.display = 'none';
    } else {
      const displayH = hours24 % 12 || 12;
      if (el.time.hours) el.time.hours.textContent = pad(displayH);
      if (el.time.ampm) {
        el.time.ampm.textContent = hours24 >= 12 ? 'PM' : 'AM';
        el.time.ampm.style.display = 'inline-block';
      }
    }

    if (el.time.minutes) el.time.minutes.textContent = pad(minutes);
    if (el.time.seconds) el.time.seconds.textContent = pad(seconds);

    if (el.date.weekday) el.date.weekday.textContent = CONFIG.WEEKDAYS[date.getDay()];
    if (el.date.day) el.date.day.textContent = pad(date.getDate());
    if (el.date.month) el.date.month.textContent = CONFIG.MONTHS[date.getMonth()];
    if (el.date.year) el.date.year.textContent = date.getFullYear();
  }

  // Render using server timestamp (unix seconds) if available; else use Intl fallback
  function tickOnce() {
    if (state.lastServerTimestamp) {
      // Use server timestamp (wall-clock for the target zone) and increment locally
      const ts = state.lastServerTimestamp;
      const date = new Date(ts * 1000);
      renderDateToDOM(date);
      window.updateThemeEmoji();

      // increment for next tick
      state.lastServerTimestamp = ts + 1;
            playTickSound();
      return;
    }

    // No server timestamp: use Intl to compute current time in the selected timezone
    if (state.selectedZone) {
      try {
        const opts = { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: !state.is24Hour, timeZone: state.selectedZone };
        const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(new Date());
        // Build a Date object using today's Y/M/D and those parts
        const partVals = {};
        parts.forEach(p => { if (p.type !== 'literal') partVals[p.type] = p.value; });

        // hour may be 12-hour; convert if necessary
        let hour = parseInt(partVals.hour || '0', 10);
        const minute = parseInt(partVals.minute || '0', 10);
        const second = parseInt(partVals.second || '0', 10);
        const dayPeriod = partVals.dayPeriod || '';

        if (!state.is24Hour && dayPeriod) {
          if (dayPeriod.toLowerCase() === 'pm' && hour < 12) hour += 12;
          if (dayPeriod.toLowerCase() === 'am' && hour === 12) hour = 0;
        }

        // Use local date (year/month/day) to build a Date object with time values we computed
        const nowLocal = new Date();
        const date = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), hour, minute, second);
        renderDateToDOM(date);
        return;
      } catch (err) {
        // If Intl fails, fallback to local Date
        // (we intentionally avoid logging spammily)
      }
    }

    // Fallback: show local time
    renderDateToDOM(new Date());
        playTickSound();

  }

  /* -------------------------
   Theme / emoji toggle by local time in selected timezone
   - Call updateThemeEmoji() whenever timezone changes
   - Also call it from tickOnce() so theme updates as time passes
   ------------------------- */

(function themeToggleModule() {
  // last applied hour period to avoid unnecessary DOM writes
  let lastPeriod = null;

  // Map hour (0-23) to period
  // Adjust these ranges if you want different thresholds
  // - sunrise: 5-7 (inclusive)
  // - day: 8-17
  // - sunset: 18-19
  // - night: 20-4
  function hourToPeriod(hour) {
    if (hour >= 5 && hour <= 7) return 'sunrise';
    if (hour >= 8 && hour <= 17) return 'day';
    if (hour >= 18 && hour <= 19) return 'sunset';
    return 'night';
  }

  // Map period to emoji
  const PERIOD_EMOJI = {
    sunrise: '🌅',
    day:     '☀️',
    sunset:  '🌇',
    night:   '🌙'
  };

  // Update body's data-theme and the themeToggle button emoji + accessible label
  function applyPeriod(period) {
    if (!period || period === lastPeriod) return;
    lastPeriod = period;

    // set a data attribute for CSS hooks
    try { document.body.dataset.theme = period; } catch (e) { /* ignore */ }

    // update the theme toggle button if it exists
    if (el && el.controls && el.controls.themeToggle) {
      const emoji = PERIOD_EMOJI[period] || PERIOD_EMOJI.day;
      el.controls.themeToggle.textContent = emoji;
      el.controls.themeToggle.setAttribute('aria-label', `Theme: ${period}`);
    }
  }

  // Get hour (0-23) in the target timezone using Intl
  function getHourInZone(zone) {
    try {
      const opts = { hour: 'numeric', hour12: false, timeZone: zone || Intl.DateTimeFormat().resolvedOptions().timeZone };
      const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(new Date());
      const hourPart = parts.find(p => p.type === 'hour');
      if (hourPart) {
        const h = parseInt(hourPart.value, 10);
        if (!Number.isNaN(h)) return (h + 24) % 24;
      }
    } catch (err) {
      // If Intl fails (very unlikely), fallback to local hour
    }
    return new Date().getHours();
  }

  // Public function to be used by your main code
  // - call updateThemeEmoji() whenever timezone changes (selectTimezone)
  // - call it from tickOnce() to auto-update when hour boundary crosses
  window.updateThemeEmoji = function updateThemeEmoji() {
    const zone = (state && state.selectedZone) ? state.selectedZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = getHourInZone(zone);
    const period = hourToPeriod(hour);
    applyPeriod(period);
  };

  // Optionally, call it once on load if timezone already set
  try { if (typeof window !== 'undefined') window.updateThemeEmoji(); } catch (e) {}

  // Integration note:
  // - Call updateThemeEmoji() inside selectTimezone after you set state.selectedZone.
  // - Call updateThemeEmoji() inside tickOnce() so the emoji updates across hour boundaries.
})();


  // Start ticking at 1-second cadence (clears any previous)
  function startTicking() {
    if (state.tickIntervalId) clearInterval(state.tickIntervalId);
    // immediate tick to avoid 1s blank
    tickOnce();
    state.tickIntervalId = setInterval(tickOnce, CONFIG.UPDATE_INTERVAL);
  }

  // Stop intervals
  function stopTicking() {
    if (state.tickIntervalId) { clearInterval(state.tickIntervalId); state.tickIntervalId = null; }
    if (state.syncIntervalId) { clearInterval(state.syncIntervalId); state.syncIntervalId = null; }
  }

  /* -------------------------
     Server interactions
     ------------------------- */
  async function fetchTimezoneList() {
    try {
      const url = `${CONFIG.API_BASE_URL}/timezones`;
      const data = await safeFetch(url);
      if (Array.isArray(data) && data.length) {
        state.tzList = data;
        return data;
      }
      throw new Error('Invalid tz list response');
    } catch (err) {
      // fallback to built-in list quietly
      state.tzList = CONFIG.FALLBACK_TZ_LIST;
      return state.tzList;
    }
  }

  async function fetchTimeForZone(zone) {
    try {
      const url = `${CONFIG.API_BASE_URL}/time?zone=${encodeURIComponent(zone)}`;
      const data = await safeFetch(url);
      // Expect { status:'success', timestamp, gmtOffset }
      if (!data || typeof data.timestamp === 'undefined') {
        throw new Error('Invalid time response');
      }
      return data;
    } catch (err) {
      // propagate so caller can fallback
      throw err;
    }
  }

  /* -------------------------
     UI: Timezone dropdown creation & selection
     ------------------------- */
  function buildTimezoneDropdown() {
    const container = el.timezone.container;
    if (!container) return;

    // Clear previous
    container.innerHTML = '';

    // root dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'timezone-dropdown';

    // selected display
    const selected = document.createElement('div');
    selected.className = 'selected-timezone';
    selected.tabIndex = 0;
    selected.setAttribute('role', 'button');
    selected.setAttribute('aria-expanded', 'false');

    // options list
    const list = document.createElement('div');
    list.className = 'timezone-options';

    // populate
    state.tzList.forEach(item => {
      const option = document.createElement('div');
      option.className = 'timezone-option';
      option.dataset.zone = item.zone;
      option.innerHTML = `${item.flag ? item.flag + ' ' : ''}<span class="country">${item.name || item.zone}</span>`;
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        // set UI
        selected.innerHTML = `${item.flag ? item.flag + ' ' : ''}${item.name || item.zone}`;
        selected.setAttribute('aria-expanded', 'false');
        list.classList.remove('show');
        // choose zone
        await selectTimezone(item.zone, `${item.flag ? item.flag + ' ' : ''}${item.name || item.zone}`);
      });
      list.appendChild(option);
    });


    // toggle behavior
    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = list.classList.toggle('show');
      selected.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) selected.focus();
    });

    // close on outside click
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) list.classList.remove('show');
    });

    // keyboard support (Enter toggles)
    selected.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selected.click();
      }
    });

    // assemble
    dropdown.appendChild(selected);
    dropdown.appendChild(list);
    container.appendChild(dropdown);

    return { dropdown, selected, list };
  }

  // Called when user picks a timezone (or when default is chosen on init)
  async function selectTimezone(zone, labelText) {
    // Stop previous intervals to avoid races
    stopTicking();

    state.selectedZone = zone;
    state.selectedLabel = labelText || zone;
    if (el.timezone.label) el.timezone.label.textContent = state.selectedLabel;

    window.updateThemeEmoji();


    // Try to fetch authoritative time from server
    try {
      const data = await fetchTimeForZone(zone);
      // server returns unix seconds for the zone's wall-clock
      if (data && typeof data.timestamp === 'number') {
        state.lastServerTimestamp = Number(data.timestamp);
      } else {
        state.lastServerTimestamp = null;
      }
    } catch (err) {
      // server failed — clear server timestamp so we use Intl fallback
      state.lastServerTimestamp = null;
    }

    // Start ticking locally regardless (uses server ts if available)
    startTicking();

    // Start periodic server sync in background
    if (state.syncIntervalId) clearInterval(state.syncIntervalId);
    state.syncIntervalId = setInterval(async () => {
      try {
        const data = await fetchTimeForZone(state.selectedZone);
        if (data && typeof data.timestamp === 'number') {
          // resync to authoritative time
          state.lastServerTimestamp = Number(data.timestamp);
        }
      } catch (_) {
        // ignore sync errors silently (we still tick locally)
      }
    }, CONFIG.SYNC_INTERVAL);
  }

  /* -------------------------
     Controls & events
     ------------------------- */
  function setupControls() {
    // format toggle
    if (el.controls.formatToggle) {
      el.controls.formatToggle.addEventListener('click', () => {
        state.is24Hour = !state.is24Hour;
        el.controls.formatToggle.textContent = state.is24Hour ? '12H' : '24H';
        // force immediate re-render
        tickOnce();
      });
    }

    // show/hide seconds
    if (el.controls.showSeconds) {
      el.controls.showSeconds.checked = state.showSeconds;
      el.controls.showSeconds.addEventListener('change', (e) => {
        state.showSeconds = Boolean(e.target.checked);
        if (el.time.seconds) el.time.seconds.style.display = state.showSeconds ? 'inline-block' : 'none';
        if (el.time.separator) el.time.separator.style.display = state.showSeconds ? 'inline-block' : 'none';
      });
    }

    // settings open/close
    if (el.controls.settingsBtn && el.controls.settingsPanel && el.controls.closeSettings) {
      el.controls.settingsBtn.addEventListener('click', () => {
        el.controls.settingsPanel.classList.remove('hidden');
        el.controls.settingsBtn.setAttribute('aria-expanded', 'true');
      });
      el.controls.closeSettings.addEventListener('click', () => {
        el.controls.settingsPanel.classList.add('hidden');
        el.controls.settingsBtn.setAttribute('aria-expanded', 'false');
      });
    }
  }

  /* -------------------------
     Initialization
     ------------------------- */
  async function initialize() {
    // small safe initial placeholders
    if (el.time.hours) el.time.hours.textContent = '--';
    if (el.time.minutes) el.time.minutes.textContent = '--';
    if (el.time.seconds) el.time.seconds.textContent = '--';
    if (el.time.ampm) el.time.ampm.style.display = 'none';
    if (el.date.weekday) el.date.weekday.textContent = '----';
    if (el.date.day) el.date.day.textContent = '--';
    if (el.date.month) el.date.month.textContent = '----';
    if (el.date.year) el.date.year.textContent = '----';

    setupControls();

    // Load timezone list (server first, fallback local)
    await fetchTimezoneList();

    // Build dropdown UI
    const ui = buildTimezoneDropdown();

    // Choose default zone: prefer browser's resolved zone if present in our list; else first in list
    const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let defaultEntry = state.tzList.find(t => t.zone === browserTZ) || state.tzList[0];

    // If nothing, fallback to India
    if (!defaultEntry) defaultEntry = CONFIG.FALLBACK_TZ_LIST[0];

    // set selected display if dropdown exists
    if (ui && ui.selected) ui.selected.innerHTML = `${defaultEntry.flag ? defaultEntry.flag + ' ' : ''}${defaultEntry.name}`;

    // set label & select it
    await selectTimezone(defaultEntry.zone, `${defaultEntry.flag ? defaultEntry.flag + ' ' : ''}${defaultEntry.name}`);
  }

  // cleanup on unload
  window.addEventListener('beforeunload', stopTicking);

  // run
  initialize().catch(err => {
    console.error('Init failed:', err);
    // ensure ticking still runs with local time
    state.selectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    startTicking();
  });
});

