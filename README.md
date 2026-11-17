# FitTrack — Daily Activity Dashboard

A functional daily activity dashboard built with **HTML5**, **CSS3**, and **Vanilla JavaScript (ES6+)**.  
No frameworks, no build step — open `index.html` in a browser and it just works.

---

## 1. Assumptions

- **Default step goal** is **10,000 steps**, as stated in the requirements. The user can change this per day using the "Set Goal" input.
- **Step counting is incremental** — the user adds steps to the existing total (e.g. entering "500" adds 500 to whatever the current count is), rather than overwriting the total. This mirrors how fitness trackers typically sync.
- **Activity recording time is auto-stamped** to the current moment when the user submits the form, rather than requiring manual time entry. This keeps the UX simple and avoids input errors.
- **Each date stores its own independent data** (steps, goal, activities) in `localStorage` using the key format `fittrack_YYYY-MM-DD`.
- **No user authentication** — this is a single-user, single-browser tool.
- **Future dates are not selectable** in the date picker to prevent recording phantom activities.

## 2. Additional Functionality

Beyond the stated requirements, the following extras were implemented:

- **Delete activity** — hover over any recent activity to reveal a delete button (✕). Deleting an activity updates both the summary and recent list instantly.
- **Editable daily goal** — the user can change the step goal per day via a "Set Goal" input, rather than being locked to 10,000.
- **Colour-coded progress ring** — the SVG ring turns amber when below 30% and green when the goal is reached (100%+), giving quick visual feedback.
- **Toast notifications** — brief success/error messages slide in at the bottom of the screen after every action.
- **Smooth animations** — the progress ring animates when the step count changes, and new activity items slide in.
- **Responsive design** — the layout adapts from a 2-column grid on desktop to a single column on mobile, with adjusted sizing at 768 px and 480 px breakpoints.
- **Accessible HTML** — semantic elements, `aria-label` attributes, `role="status"` on the notification, and labelled form controls.

## 3. Edge Cases Considered

| Edge case | Handling |
|-----------|----------|
| Negative or zero step input | Rejected with a toast warning |
| Step count exceeding the goal | Percentage goes above 100%; progress ring caps visually at 100% and turns green |
| Very large step values | Total capped at 100,000 steps per day |
| Duration outside 1–1440 min | Rejected; minimum 1 minute, maximum 24 hours |
| No activity type selected | Form validation rejects submission |
| Duplicate rapid submissions | Idempotent — repeated clicks produce additional records (acceptable for a step tracker) |
| Selecting a date with no data | Shows zero steps and an empty-state message in the activity list |
| `localStorage` quota exceeded | `try/catch` around `setItem`; a toast warns the user |
| Invalid JSON in storage | `try/catch` around `getItem`/`parse`; falls back to default data |
| Missing `crypto.randomUUID` (older browsers) | Fallback to `Date.now()` + random string |

## 4. JavaScript Structure

The code is organised into **five ES6 classes** in a single `script.js` file (no modules, no imports):

```
┌──────────────────────────────────────────┐
│  StorageManager   (static utility)       │
│  └─ load(date), save(date, data)         │
│  └─ Per-date localStorage keying         │
├──────────────────────────────────────────┤
│  StepTracker                             │
│  └─ addSteps(), setGoal(), getProgress() │
│  └─ Validation & clamping               │
├──────────────────────────────────────────┤
│  ActivityManager                         │
│  └─ addActivity(), deleteActivity()      │
│  └─ getActivities(), getSummary()        │
│  └─ Validation, sorting, aggregation     │
├──────────────────────────────────────────┤
│  UIRenderer       (static utility)       │
│  └─ renderStepCounter(), renderProgress  │
│  └─ renderActivitySummary()              │
│  └─ renderRecentActivities()             │
│  └─ notify() — toast messages            │
├──────────────────────────────────────────┤
│  App              (controller)           │
│  └─ Orchestrates all managers            │
│  └─ Binds DOM events                     │
│  └─ Handles date switching               │
│  └─ Single render() entry point          │
└──────────────────────────────────────────┘
```

**Data flow**: User action → `App` handler → Manager method (validates, persists) → `App.render()` → `UIRenderer` updates the DOM.

**Separation of concerns**: Managers own the data and business logic; `UIRenderer` owns the DOM; `App` wires them together. No manager touches the DOM directly, and `UIRenderer` never writes to storage.

---

*Built for the osheeva Software Developer Practical Assessment.*
