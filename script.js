/* =========================================================
   FitTrack — Daily Activity Dashboard
   JavaScript (ES6+, Vanilla — No frameworks)
   ========================================================= */

// ─── Storage Manager ────────────────────────────────────
// Handles all localStorage read/write with per-date keying.

class StorageManager {
  /** Key prefix used in localStorage */
  static PREFIX = 'fittrack_';

  /**
   * Build a storage key for a given date string (YYYY-MM-DD).
   * @param {string} dateStr
   * @returns {string}
   */
  static key(dateStr) {
    return `${StorageManager.PREFIX}${dateStr}`;
  }

  /**
   * Load data for a given date.  Returns a default structure if nothing is stored.
   * @param {string} dateStr
   * @returns {{ steps: number, goal: number, activities: Array }}
   */
  static load(dateStr) {
    try {
      const raw = localStorage.getItem(StorageManager.key(dateStr));
      if (raw) {
        const data = JSON.parse(raw);
        // Validate and sanitize data
        return {
          steps: Number.isFinite(data.steps) && data.steps >= 0 ? Math.min(data.steps, 100000) : 0,
          goal: Number.isFinite(data.goal) && data.goal >= 1 ? Math.min(data.goal, 1000000) : 10000,
          activities: Array.isArray(data.activities) ? data.activities.filter(act => {
            return act && typeof act === 'object' &&
                   typeof act.id === 'string' &&
                   ActivityManager.TYPES.includes(act.type) &&
                   Number.isFinite(act.duration) && act.duration > 0;
          }) : []
        };
      }
    } catch (err) {
      console.warn('StorageManager.load — parse error:', err);
    }
    return { steps: 0, goal: 10000, activities: [] };
  }

  /**
   * Persist data for a given date.
   * @param {string} dateStr
   * @param {object} data
   */
  static save(dateStr, data) {
    try {
      localStorage.setItem(StorageManager.key(dateStr), JSON.stringify(data));
    } catch (err) {
      console.error('StorageManager.save — quota may be exceeded:', err);
      UIRenderer.notify('⚠️ Storage full — data may not be saved.');
    }
  }
}

// ─── Step Tracker ───────────────────────────────────────
// Manages step count and goal for the active date.

class StepTracker {
  /**
   * @param {string} dateStr — the currently selected date (YYYY-MM-DD)
   */
  constructor(dateStr) {
    const data = StorageManager.load(dateStr);
    this.dateStr = dateStr;
    this.steps = data.steps;
    this.goal = data.goal;
  }

  /**
   * Add steps (clamped to 0–100 000 total).
   * @param {number} count
   * @returns {{ success: boolean, added: number }}
   */
  addSteps(count) {
    // Reject decimal values (not integers)
    if (!Number.isFinite(count) || count <= 0) return { success: false, added: 0 };
    if (!Number.isInteger(count)) return { success: false, added: 0 };

    const actualAdded = Math.min(count, 100000 - this.steps);
    this.steps = Math.min(this.steps + count, 100000);
    this._persist();
    return { success: true, added: actualAdded };
  }

  /**
   * Override the daily goal (1–1 000 000).
   * @param {number} newGoal
   * @returns {boolean} success
   */
  setGoal(newGoal) {
    if (!Number.isFinite(newGoal) || newGoal < 1) return false;
    this.goal = Math.min(Math.round(newGoal), 1000000);
    this._persist();
    return true;
  }

  /** @returns {{ steps: number, goal: number, percent: number, goalReached: boolean }} */
  getProgress() {
    const percent = this.goal > 0
      ? Math.round((this.steps / this.goal) * 100)
      : 0;
    const goalReached = this.steps >= this.goal;
    return { steps: this.steps, goal: this.goal, percent, goalReached };
  }

  /** Write current steps & goal back to localStorage (preserving activities). */
  _persist() {
    const data = StorageManager.load(this.dateStr);
    data.steps = this.steps;
    data.goal = this.goal;
    StorageManager.save(this.dateStr, data);
  }
}

// ─── Activity Manager ───────────────────────────────────
// CRUD for activity records on a given date.

class ActivityManager {
  /** Allowed activity types */
  static TYPES = ['Walking', 'Running', 'Cycling', 'Swimming', 'Other'];

  /**
   * @param {string} dateStr
   */
  constructor(dateStr) {
    this.dateStr = dateStr;
    this.activities = StorageManager.load(dateStr).activities || [];
  }

  /**
   * Record a new activity.
   * @param {string} type   — one of ActivityManager.TYPES
   * @param {number} duration — minutes (1–1440)
   * @returns {object|null} the created activity, or null on validation failure
   */
  addActivity(type, duration) {
    if (!ActivityManager.TYPES.includes(type)) return null;
    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) return null;
    if (!Number.isInteger(duration)) return null;

    // Check total daily activity limit (max 24 hours = 1440 minutes)
    const totalMinutes = this.activities.reduce((sum, act) => sum + act.duration, 0);
    if (totalMinutes + duration > 1440) return null;

    const activity = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      duration: Math.round(duration),
      time: new Date().toISOString(),
    };

    this.activities.push(activity);
    this._persist();
    return activity;
  }

  /**
   * Delete an activity by ID.
   * @param {string} id
   * @returns {boolean}
   */
  deleteActivity(id) {
    const idx = this.activities.findIndex(a => a.id === id);
    if (idx === -1) return false;
    this.activities.splice(idx, 1);
    this._persist();
    return true;
  }

  /**
   * Get all activities sorted newest-first.
   * @returns {Array}
   */
  getActivities() {
    return [...this.activities].sort(
      (a, b) => new Date(b.time) - new Date(a.time)
    );
  }

  /**
   * Compute summary: total duration per type + grand total.
   * @returns {{ perType: Object<string, number>, total: number }}
   */
  getSummary() {
    const perType = {};
    let total = 0;

    for (const type of ActivityManager.TYPES) {
      perType[type] = 0;
    }

    for (const act of this.activities) {
      perType[act.type] = (perType[act.type] || 0) + act.duration;
      total += act.duration;
    }

    return { perType, total };
  }

  /** Save activities array back to localStorage (preserving steps & goal). */
  _persist() {
    const data = StorageManager.load(this.dateStr);
    data.activities = this.activities;
    StorageManager.save(this.dateStr, data);
  }
}

// ─── UI Renderer ────────────────────────────────────────
// Pure rendering helpers — read DOM ids defined in index.html.

class UIRenderer {
  /** Circumference of the SVG progress ring (2πr, r = 70). */
  static CIRCUMFERENCE = 2 * Math.PI * 70; // ≈ 439.82

  /** Emoji map for activity types */
  static EMOJI = {
    Walking: '🚶',
    Running: '🏃',
    Cycling: '🚴',
    Swimming: '🏊',
    Other: '⚡',
  };

  // ── Step Counter ──

  /**
   * Update all step-counter UI elements.
   * @param {{ steps: number, goal: number, percent: number, goalReached: boolean }} progress
   */
  static renderStepCounter(progress) {
    const { steps, goal, percent } = progress;

    // Number displays
    document.getElementById('step-count').textContent = steps.toLocaleString();
    document.getElementById('step-goal-display').textContent = goal.toLocaleString();
    document.getElementById('step-percent').textContent = `${percent}%`;

    // Progress ring
    UIRenderer.renderProgressRing(progress);
  }

  /**
   * Animate the SVG progress ring to reflect the given percentage.
   * @param {{ steps: number, goal: number, percent: number, goalReached: boolean }} progress
   */
  static renderProgressRing(progress) {
    const circle = document.getElementById('progress-circle');
    if (!circle) return;

    const { percent, goalReached } = progress;
    const clamped = Math.min(percent, 100);
    const offset = UIRenderer.CIRCUMFERENCE * (1 - clamped / 100);
    circle.style.strokeDashoffset = offset;

    // Color shifts: green when goal is actually reached, warning at < 30%, teal otherwise
    if (goalReached) {
      circle.style.stroke = 'var(--clr-success)';
      circle.style.filter = 'drop-shadow(0 0 12px rgba(5,150,105,.4))';
    } else if (percent < 30) {
      circle.style.stroke = 'var(--clr-warning)';
      circle.style.filter = 'drop-shadow(0 0 12px rgba(217,119,6,.4))';
    } else {
      circle.style.stroke = 'var(--clr-primary)';
      circle.style.filter = 'drop-shadow(0 0 8px rgba(13,148,136,.3))';
    }
  }

  // ── Activity Summary ──

  /**
   * Render the activity-summary section.
   * @param {{ perType: Object<string, number>, total: number }} summary
   */
  static renderActivitySummary(summary) {
    const container = document.getElementById('summary-container');
    const totalEl = document.getElementById('total-duration');
    if (!container || !totalEl) return;

    // Build rows only for types that have minutes (or show all with 0)
    let html = '';
    for (const type of ActivityManager.TYPES) {
      const dur = summary.perType[type] || 0;
      const cls = type.toLowerCase();
      html += `
        <div class="summary-row">
          <span class="type-dot ${cls}"></span>
          <span class="type-name">${type}</span>
          <span class="type-duration">${dur} min</span>
        </div>`;
    }

    container.innerHTML = html;
    totalEl.textContent = `${summary.total} min`;
  }

  // ── Recent Activities ──

  /**
   * Render the recent-activities list.
   * @param {Array} activities — sorted newest-first
   */
  static renderRecentActivities(activities) {
    const list = document.getElementById('recent-list');
    if (!list) return;

    if (activities.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-text">No activities recorded yet.<br>Use the form above to get started!</div>
        </div>`;
      return;
    }

    let html = '';
    for (const act of activities) {
      const cls = act.type.toLowerCase();
      const emoji = UIRenderer.EMOJI[act.type] || '⚡';
      const timeStr = UIRenderer.formatTime(act.time);

      html += `
        <div class="activity-item" data-id="${act.id}">
          <span class="type-badge ${cls}">${emoji} ${act.type}</span>
          <div class="activity-details">
            <span class="activity-duration">${act.duration} min</span>
            <span class="activity-time">${timeStr}</span>
          </div>
          <button class="btn btn-icon-only activity-delete" title="Delete activity" data-delete="${act.id}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>`;
    }

    list.innerHTML = html;
  }

  // ── Notification Toast ──

  /** Currently active timeout id */
  static _notifyTimer = null;

  /**
   * Show a brief toast at the bottom of the screen.
   * @param {string} message
   * @param {number} [ms=2500]
   */
  static notify(message, ms = 2500) {
    const el = document.getElementById('notification');
    if (!el) return;

    clearTimeout(UIRenderer._notifyTimer);
    el.textContent = message;
    el.classList.add('show');

    UIRenderer._notifyTimer = setTimeout(() => {
      el.classList.remove('show');
    }, ms);
  }

  // ── Helpers ──

  /**
   * Format an ISO timestamp to a human-friendly time string.
   * @param {string} isoStr
   * @returns {string}
   */
  static formatTime(isoStr) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}

// ─── App Controller ─────────────────────────────────────
// Orchestrates managers and wires up DOM events.

class App {
  constructor() {
    /** @type {string} Currently selected date in YYYY-MM-DD format */
    this.selectedDate = App.todayStr();
    this.stepTracker = new StepTracker(this.selectedDate);
    this.activityManager = new ActivityManager(this.selectedDate);

    this._cacheDom();
    this._bindEvents();
    this._initDatePicker();
    this._startDateCheck(); // Check for midnight rollover
    this.render();
  }

  // ── DOM Caching ──

  _cacheDom() {
    this.dom = {
      datePicker: document.getElementById('date-picker'),
      addStepsInput: document.getElementById('add-steps-input'),
      addStepsBtn: document.getElementById('add-steps-btn'),
      setGoalInput: document.getElementById('set-goal-input'),
      setGoalBtn: document.getElementById('set-goal-btn'),
      activityForm: document.getElementById('activity-form'),
      activityType: document.getElementById('activity-type'),
      activityDuration: document.getElementById('activity-duration'),
      recentList: document.getElementById('recent-list'),
    };
  }

  // ── Event Binding ──

  _bindEvents() {
    // Date change
    this.dom.datePicker.addEventListener('change', (e) => {
      this.selectedDate = e.target.value;
      this._reloadDate();
    });

    // Add steps
    this.dom.addStepsBtn.addEventListener('click', () => this._onAddSteps());
    this.dom.addStepsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._onAddSteps(); }
    });

    // Set goal
    this.dom.setGoalBtn.addEventListener('click', () => this._onSetGoal());
    this.dom.setGoalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._onSetGoal(); }
    });

    // Record activity
    this.dom.activityForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this._onRecordActivity();
    });

    // Delete activity (delegated)
    this.dom.recentList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete]');
      if (!btn) return;
      this._onDeleteActivity(btn.dataset.delete);
    });
  }

  // ── Date Picker Initialisation ──

  _initDatePicker() {
    this.dom.datePicker.value = this.selectedDate;
    // Prevent selecting future dates
    this.dom.datePicker.max = App.todayStr();
  }

  // ── Midnight Rollover Check ──

  _startDateCheck() {
    // Check every minute if the date has rolled over
    setInterval(() => {
      const today = App.todayStr();
      if (this.selectedDate !== today && this.selectedDate === this.dom.datePicker.value) {
        // Automatically switch to today if viewing yesterday and it's now today
        this.selectedDate = today;
        this.dom.datePicker.value = today;
        this._reloadDate();
      }
    }, 60000); // Check every minute
  }

  // ── Handlers ──

  _onAddSteps() {
    const val = Number(this.dom.addStepsInput.value);
    const result = this.stepTracker.addSteps(val);
    if (result.success) {
      if (result.added < val) {
        UIRenderer.notify(`✅ Added ${result.added.toLocaleString()} steps (capped at 100,000 total).`);
      } else {
        UIRenderer.notify(`✅ Added ${result.added.toLocaleString()} steps!`);
      }
      this.dom.addStepsInput.value = '';
      this.render();
    } else {
      UIRenderer.notify('⚠️ Please enter a valid integer step count.');
    }
  }

  _onSetGoal() {
    const val = Number(this.dom.setGoalInput.value);
    if (this.stepTracker.setGoal(val)) {
      UIRenderer.notify(`🎯 Goal updated to ${val.toLocaleString()} steps.`);
      this.dom.setGoalInput.value = '';
      this.render();
    } else {
      UIRenderer.notify('⚠️ Please enter a valid goal (≥ 1).');
    }
  }

  _onRecordActivity() {
    const type = this.dom.activityType.value;
    const duration = Number(this.dom.activityDuration.value);

    const activity = this.activityManager.addActivity(type, duration);
    if (activity) {
      UIRenderer.notify(`🏅 Recorded ${duration} min of ${type}!`);
      this.dom.activityForm.reset();
      this.render();
    } else {
      UIRenderer.notify('⚠️ Please select an activity and enter a valid duration.');
    }
  }

  _onDeleteActivity(id) {
    if (this.activityManager.deleteActivity(id)) {
      UIRenderer.notify('🗑️ Activity deleted.');
      this.render();
    }
  }

  // ── Reload when date changes ──

  _reloadDate() {
    this.stepTracker = new StepTracker(this.selectedDate);
    this.activityManager = new ActivityManager(this.selectedDate);
    this.render();
  }

  // ── Render everything ──

  render() {
    UIRenderer.renderStepCounter(this.stepTracker.getProgress());
    UIRenderer.renderActivitySummary(this.activityManager.getSummary());
    UIRenderer.renderRecentActivities(this.activityManager.getActivities());
    this._renderGreeting();
  }

  /** Update the greeting banner based on time of day and selected date. */
  _renderGreeting() {
    const greetEl = document.getElementById('greeting-text');
    const subEl = greetEl?.nextElementSibling;
    if (!greetEl) return;

    const hour = new Date().getHours();
    let greeting;
    if (hour < 12) greeting = 'Good Morning! ☀️';
    else if (hour < 17) greeting = 'Good Afternoon! 🌤️';
    else greeting = 'Good Evening! 🌙';

    greetEl.textContent = greeting;

    if (subEl) {
      const isToday = this.selectedDate === App.todayStr();
      subEl.textContent = isToday
        ? "Here's your activity summary for today."
        : `Viewing activities for ${new Date(this.selectedDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.`;
    }
  }

  // ── Utility ──

  /** @returns {string} Today in YYYY-MM-DD (local timezone). */
  static todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

// ─── Bootstrap ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
