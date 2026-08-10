const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRegion = document.querySelector("#toast-region");

let resetTokenFromUrl = (() => {
  try {
    return new URLSearchParams(window.location.search).get("resetToken")?.trim() || "";
  } catch {
    return "";
  }
})();

const createDefaultTimerState = () => ({
  plannedMinutes: 25,
  totalSeconds: 25 * 60,
  focusedSeconds: 0,
  running: false,
  runningSince: null,
  selectedTaskId: "",
  selectedSubjectId: "",
  markTaskCompleted: false,
  serverSessionId: null,
  clientSessionId: null,
  completionPending: false,
  interval: null,
  starting: false,
  completing: false,
  cancelling: false,
});

const state = {
  token: localStorage.getItem("studyreset_token"),
  user: null,
  subjects: [],
  tasks: [],
  topics: [],
  exams: [],
  focusSessions: [],
  checkIn: null,
  dailyPlan: null,
  recoverySuggested: false,
  planDraft: [],
  planDirty: false,
  view: "today",
  taskFilter: "all",
  search: "",
  authMode: resetTokenFromUrl ? "reset" : "login",
  authNotice: "",
  authDeliveryConfigured: null,
  sidebarOpen: false,
  timer: createDefaultTimerState(),
};

const resetClientSession = () => {
  window.clearInterval(state.timer.interval);
  localStorage.removeItem("studyreset_token");
  modalRoot.innerHTML = "";
  Object.assign(state, {
    token: null,
    user: null,
    subjects: [],
    tasks: [],
    topics: [],
    exams: [],
    focusSessions: [],
    checkIn: null,
    dailyPlan: null,
    recoverySuggested: false,
    planDraft: [],
    planDirty: false,
    view: "today",
    taskFilter: "all",
    search: "",
    authMode: "login",
    authNotice: "",
    authDeliveryConfigured: null,
    sidebarOpen: false,
  });
  Object.assign(state.timer, createDefaultTimerState());
};

const icons = {
  today: "⌂",
  tasks: "✓",
  subjects: "▦",
  topics: "↻",
  exams: "◇",
  plan: "☷",
  focus: "◷",
};

const clearResetTokenFromAddress = () => {
  if (!resetTokenFromUrl) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("resetToken");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // The reset still completes safely if browser history is unavailable.
  }
  resetTokenFromUrl = "";
};

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const api = async (path, options = {}) => {
  const requestToken = state.token;
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Something went wrong");
    error.status = response.status;

    const isAuthSubmission = path === "/auth/login" || path === "/auth/register";
    if (response.status === 401 && requestToken && state.token === requestToken && !isAuthSubmission) {
      resetClientSession();
      renderAuth();
      error.message = "Your session expired. Please log in again.";
    }

    throw error;
  }

  return data;
};

const showToast = (message, type = "success") => {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
};

const setLoading = (button, loading, label = "Please wait…") => {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
};

const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateOnlyKey = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return localDateKey(value);
};

const isToday = (value, dateOnly = false) => Boolean(value)
  && (dateOnly ? dateOnlyKey(value) : localDateKey(value)) === localDateKey();

const dateForDisplay = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return value ? new Date(value) : new Date();
};

const formatDate = (date, options = {}) => new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  ...options,
}).format(dateForDisplay(date));

const calendarDayNumber = (value) => {
  const key = dateOnlyKey(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
};

const calendarDaysFromToday = (value) => calendarDayNumber(value) - calendarDayNumber(localDateKey());

const relativeDayLabel = (value, noun = "day") => {
  const days = calendarDaysFromToday(value);
  if (!Number.isFinite(days)) return "Date unavailable";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `${days} ${noun}${days === 1 ? "" : "s"} remaining`;
  return `${Math.abs(days)} ${noun}${Math.abs(days) === 1 ? "" : "s"} overdue`;
};

const formatMinutes = (minutes = 0) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const initials = (name = "Student") => name
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const activeSubjects = () => state.subjects.filter((subject) => !subject.isArchived);
const archivedSubjects = () => state.subjects.filter((subject) => subject.isArchived);

const associationId = (value) => (typeof value === "object" ? value?._id : value);
const topicSubjectId = (topic) => associationId(topic?.subject);
const examSubjectId = (exam) => associationId(exam?.subject);

const subjectForEntity = (entity, idFor) => {
  const subjectId = idFor(entity);
  return state.subjects.find((subject) => subject._id === subjectId)
    || (entity?.subject && typeof entity.subject === "object" ? entity.subject : null)
    || { name: "Study", color: "#062f72" };
};

const topicSubject = (topic) => subjectForEntity(topic, topicSubjectId);
const examSubject = (exam) => subjectForEntity(exam, examSubjectId);
const activeTopics = () => state.topics.filter((topic) => !topic.isArchived);
const archivedTopics = () => state.topics.filter((topic) => topic.isArchived);
const dueTopics = () => activeTopics()
  .filter((topic) => topic.nextReviewAt && calendarDaysFromToday(dateOnlyKey(topic.nextReviewAt)) <= 0)
  .sort((left, right) => calendarDayNumber(left.nextReviewAt) - calendarDayNumber(right.nextReviewAt));
const upcomingExams = () => state.exams
  .filter((exam) => !exam.isCompleted && calendarDaysFromToday(exam.examDate) >= 0)
  .sort((left, right) => calendarDayNumber(left.examDate) - calendarDayNumber(right.examDate));

const createDraftId = () => globalThis.crypto?.randomUUID?.()
  || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const resetPlanDraft = (plan = state.dailyPlan) => {
  state.planDraft = Array.isArray(plan?.blocks) ? plan.blocks.map((block) => ({
    _id: block._id || block.id || "",
    clientId: block._id || block.id || createDraftId(),
    title: block.title || (block.kind === "break" ? "Short break" : "Study block"),
    durationMinutes: Number(block.durationMinutes) || 1,
    status: block.status || "planned",
    kind: block.kind === "break" ? "break" : "focus",
    reason: block.reason || "",
    sourceType: block.sourceType || "manual",
    clientOnly: !block._id && !block.id,
  })) : [];
  state.planDirty = false;
};

const planMinutesUsed = () => state.planDraft.reduce((total, block) => (
  total + (Number(block.durationMinutes) || 0)
), 0);

const subjectIdFor = (task) => (typeof task.subject === "object" ? task.subject?._id : task.subject);

const subjectFor = (task) => {
  const subjectId = subjectIdFor(task);
  return state.subjects.find((subject) => subject._id === subjectId)
    || (task.subject && typeof task.subject === "object" ? task.subject : null)
    || { name: "Study", color: "#062f72" };
};

const tasksForSubject = (subjectId) => state.tasks.filter((task) => {
  return subjectIdFor(task) === subjectId;
});

const sessionIdFor = (session) => session?._id || session?.id || "";
const taskIdForSession = (session) => (typeof session?.task === "object" ? session.task?._id : session?.task);
const subjectIdForSession = (session) => (typeof session?.subject === "object" ? session.subject?._id : session?.subject);

const taskForSession = (session) => {
  const taskId = taskIdForSession(session);
  return state.tasks.find((task) => task._id === taskId)
    || (session?.task && typeof session.task === "object" ? session.task : null);
};

const subjectForSession = (session) => {
  const subjectId = subjectIdForSession(session);
  return state.subjects.find((subject) => subject._id === subjectId)
    || (session?.subject && typeof session.subject === "object" ? session.subject : null);
};

const completedFocusSessionsToday = () => state.focusSessions.filter((session) => (
  session.status === "completed" && isToday(session.endedAt || session.startedAt)
));

const focusedMinutesToday = () => completedFocusSessionsToday()
  .reduce((sum, session) => sum + (Number(session.actualFocusedMinutes) || 0), 0);

const focusHistoryRange = () => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
};

const currentUserId = () => state.user?.id || state.user?._id || "";
const timerStorageKey = () => {
  const userId = currentUserId();
  return userId ? `studyreset_focus_timer:${userId}` : "";
};

const clearTimerInterval = () => {
  window.clearInterval(state.timer.interval);
  state.timer.interval = null;
};

const effectiveFocusedSeconds = (now = Date.now()) => {
  const base = Math.max(0, Number(state.timer.focusedSeconds) || 0);
  if (!state.timer.running || !state.timer.runningSince) {
    return Math.min(state.timer.totalSeconds, base);
  }
  const elapsed = Math.max(0, Math.floor((now - Number(state.timer.runningSince)) / 1000));
  return Math.min(state.timer.totalSeconds, base + elapsed);
};

const remainingFocusSeconds = () => Math.max(0, state.timer.totalSeconds - effectiveFocusedSeconds());

const persistFocusTimer = () => {
  const key = timerStorageKey();
  if (!key || !state.timer.clientSessionId) return;
  const payload = {
    version: 1,
    userId: currentUserId(),
    serverSessionId: state.timer.serverSessionId,
    clientSessionId: state.timer.clientSessionId,
    plannedMinutes: state.timer.plannedMinutes,
    totalSeconds: state.timer.totalSeconds,
    focusedSeconds: state.timer.focusedSeconds,
    running: state.timer.running,
    runningSince: state.timer.runningSince,
    selectedTaskId: state.timer.selectedTaskId,
    selectedSubjectId: state.timer.selectedSubjectId,
    markTaskCompleted: state.timer.markTaskCompleted,
    completionPending: state.timer.completionPending,
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // The timer remains usable in memory when storage is unavailable.
  }
};

const clearPersistedFocusTimer = () => {
  const key = timerStorageKey();
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

const resetFocusTimerInMemory = () => {
  clearTimerInterval();
  Object.assign(state.timer, createDefaultTimerState());
};

const restorePersistedFocusTimer = () => {
  resetFocusTimerInMemory();
  const key = timerStorageKey();
  if (!key) return false;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    const plannedMinutes = Number(saved.plannedMinutes);
    const totalSeconds = Number(saved.totalSeconds);
    const focusedSeconds = Number(saved.focusedSeconds);
    const validClientId = typeof saved.clientSessionId === "string"
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(saved.clientSessionId);
    const validServerId = saved.serverSessionId === null
      || (typeof saved.serverSessionId === "string" && saved.serverSessionId.length > 0);
    const validRunningSince = saved.runningSince === null
      || (Number.isFinite(Number(saved.runningSince)) && Number(saved.runningSince) > 0);

    if (
      saved.version !== 1
      || saved.userId !== currentUserId()
      || !validClientId
      || !validServerId
      || !Number.isInteger(plannedMinutes)
      || plannedMinutes < 10
      || plannedMinutes > 600
      || !Number.isInteger(totalSeconds)
      || totalSeconds !== plannedMinutes * 60
      || !Number.isFinite(focusedSeconds)
      || focusedSeconds < 0
      || typeof saved.selectedTaskId !== "string"
      || !saved.selectedTaskId
      || typeof saved.selectedSubjectId !== "string"
      || !saved.selectedSubjectId
      || !validRunningSince
    ) {
      throw new Error("Invalid saved focus timer");
    }

    Object.assign(state.timer, {
      plannedMinutes,
      totalSeconds,
      focusedSeconds: Math.min(totalSeconds, Math.floor(focusedSeconds)),
      running: Boolean(saved.running && saved.serverSessionId),
      runningSince: saved.running && saved.serverSessionId ? Number(saved.runningSince) : null,
      selectedTaskId: saved.selectedTaskId,
      selectedSubjectId: saved.selectedSubjectId,
      markTaskCompleted: Boolean(saved.markTaskCompleted),
      serverSessionId: saved.serverSessionId,
      clientSessionId: saved.clientSessionId,
      completionPending: Boolean(saved.completionPending),
    });

    if (state.timer.running && !state.timer.runningSince) {
      throw new Error("Invalid running focus timer");
    }
    return true;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
    resetFocusTimerInMemory();
    return false;
  }
};

const upsertFocusSession = (session) => {
  const sessionId = sessionIdFor(session);
  if (!sessionId) return;
  const existingIndex = state.focusSessions.findIndex((item) => sessionIdFor(item) === sessionId);
  if (existingIndex === -1) state.focusSessions.unshift(session);
  else state.focusSessions[existingIndex] = { ...state.focusSessions[existingIndex], ...session };
  state.focusSessions.sort((left, right) => (
    new Date(right.startedAt || right.createdAt || 0) - new Date(left.startedAt || left.createdAt || 0)
  ));
};

const replaceTaskFromResponse = (task) => {
  if (!task?._id) return;
  const index = state.tasks.findIndex((item) => item._id === task._id);
  if (index !== -1) state.tasks[index] = { ...state.tasks[index], ...task };
};

const filteredTasks = () => state.tasks.filter((task) => {
  const matchesStatus = state.taskFilter === "all" || task.status === state.taskFilter;
  const subject = subjectFor(task);
  const query = state.search.trim().toLowerCase();
  const matchesSearch = !query || `${task.title} ${task.description || ""} ${subject.name}`.toLowerCase().includes(query);
  return matchesStatus && matchesSearch;
});

const taskStatuses = [
  ["pending", "To do"],
  ["in-progress", "In progress"],
  ["completed", "Completed"],
];

const taskStatusLabel = (status) => taskStatuses.find(([value]) => value === status)?.[1] || "To do";

const taskRow = (task, showDelete = true) => {
  const subject = subjectFor(task);
  const complete = task.status === "completed";
  return `
    <article class="task-item status-${task.status} ${complete ? "completed" : ""}">
      <button class="task-check" data-action="toggle-task" data-id="${task._id}" aria-label="${complete ? "Reopen" : "Complete"} ${escapeHtml(task.title)}">
        ${complete ? "✓" : ""}
      </button>
      <div>
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span><span class="subject-dot" style="background:${escapeHtml(subject.color)}"></span> ${escapeHtml(subject.name)}</span>
          <span>•</span>
          <span>${formatMinutes(task.estimatedMinutes)}</span>
          ${task.dueDate ? `<span>• Due ${formatDate(task.dueDate)}</span>` : ""}
          <span class="priority ${task.priority}">${escapeHtml(task.priority)}</span>
        </div>
      </div>
      <div class="task-actions">
        <label class="task-status-control">
          <span class="sr-only">Status for ${escapeHtml(task.title)}</span>
          <select class="task-status-select status-${task.status}" data-action="set-task-status" data-id="${task._id}" aria-label="Status for ${escapeHtml(task.title)}">
            ${taskStatuses.map(([status, label]) => `<option value="${status}" ${task.status === status ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <button class="task-action" data-action="edit-task" data-id="${task._id}" aria-label="Edit task">✎</button>
        ${showDelete ? `<button class="task-action" data-action="delete-task" data-id="${task._id}" aria-label="Delete task">×</button>` : ""}
      </div>
    </article>
  `;
};

const emptyState = (type) => {
  const isTask = type === "task";
  return `
    <div class="empty-state">
      <div>
        <div class="empty-state-icon">${isTask ? "✓" : "▦"}</div>
        <h3>${isTask ? "Your study queue is clear" : "Create your first subject"}</h3>
        <p>${isTask ? "Add a focused task and give your next study session a clear finish line." : "Organize tasks by course, exam, or any area you want to improve."}</p>
        <button class="btn btn-small btn-primary" data-action="${isTask ? "new-task" : "new-subject"}">${isTask ? "+ Add task" : "+ Add subject"}</button>
      </div>
    </div>
  `;
};

const renderAuth = () => {
  const register = state.authMode === "register";
  const forgot = state.authMode === "forgot";
  const reset = state.authMode === "reset";
  let authContent;

  if (forgot) {
    authContent = `
      <p class="eyebrow">Account recovery</p>
      <h2>Reset your password</h2>
      <p class="auth-intro">Enter your account email. We’ll respond with the same message whether or not an account exists.</p>
      ${state.authNotice ? `<div class="auth-notice" role="status">${escapeHtml(state.authNotice)}</div>` : ""}
      ${state.authDeliveryConfigured === false ? `<p class="delivery-note">Email delivery is not configured yet. Your request was accepted, but reset instructions cannot be delivered until an administrator connects an email provider.</p>` : ""}
      <form id="forgot-form" class="form-stack">
        <div class="field">
          <label for="forgot-email">Email address</label>
          <input id="forgot-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </div>
        <button class="btn btn-primary auth-submit" type="submit">Request reset instructions</button>
      </form>
      <button class="auth-back" data-action="auth-mode" data-mode="login">← Back to log in</button>
    `;
  } else if (reset) {
    authContent = `
      <p class="eyebrow">Choose a fresh password</p>
      <h2>Set a new password</h2>
      <p class="auth-intro">Use at least six characters. The reset link is used securely and is never shown here.</p>
      <form id="reset-form" class="form-stack">
        <div class="field">
          <label for="reset-password">New password</label>
          <input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required />
        </div>
        <div class="field">
          <label for="reset-confirm-password">Confirm new password</label>
          <input id="reset-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" maxlength="128" required />
        </div>
        <button class="btn btn-primary auth-submit" type="submit">Save new password</button>
      </form>
      <button class="auth-back" data-action="auth-mode" data-mode="login">← Back to log in</button>
    `;
  } else {
    authContent = `
      <p class="eyebrow">Welcome to StudyReset</p>
      <h2>${register ? "Start your reset" : "Welcome back"}</h2>
      <p class="auth-intro">${register ? "Create a free workspace and make today count." : "Sign in and pick up where you left off."}</p>
      ${state.authNotice ? `<div class="auth-notice" role="status">${escapeHtml(state.authNotice)}</div>` : ""}
      <div class="auth-tabs" role="tablist" aria-label="Account options">
        <button class="auth-tab ${!register ? "active" : ""}" data-action="auth-mode" data-mode="login" role="tab" aria-selected="${!register}">Log in</button>
        <button class="auth-tab ${register ? "active" : ""}" data-action="auth-mode" data-mode="register" role="tab" aria-selected="${register}">Sign up</button>
      </div>
      <form id="auth-form" class="form-stack">
        ${register ? `
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" autocomplete="name" placeholder="Alex Morgan" required maxlength="80" />
          </div>
        ` : ""}
        <div class="field">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" placeholder="At least 6 characters" required minlength="6" />
        </div>
        ${register ? "" : `<button class="forgot-link" type="button" data-action="auth-mode" data-mode="forgot">Forgot password?</button>`}
        <button class="btn btn-primary auth-submit" type="submit">${register ? "Create my workspace" : "Log in to StudyReset"}</button>
      </form>
      <p class="demo-note">Your study data is private to your account. No social feed, no distractions.</p>
    `;
  }

  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-showcase">
        <div class="brand"><span class="brand-mark">↗</span> StudyReset</div>
        <div class="hero-copy">
          <p class="eyebrow">Reset the way you study</p>
          <h1>Turn scattered plans into <em>steady progress.</em></h1>
          <p>A calm workspace for planning what matters, protecting your focus, and ending each day with visible progress.</p>
        </div>
        <div class="mini-dashboard" aria-hidden="true">
          <div class="mini-card"><span>Today’s focus</span><strong>Data Structures · 45 min</strong></div>
          <div class="mini-card accent"><span>Daily reset</span><strong>Plan with your real energy ↗</strong></div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="auth-box">${authContent}</div>
      </section>
    </main>
  `;
};

const renderShell = () => {
  if (!state.token || !state.user) {
    renderAuth();
    return;
  }
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  const target = Math.max(state.user?.preferences?.dailyTargetMinutes || 120, 1);
  const completedMinutes = focusedMinutesToday();
  const progress = Math.min(100, Math.round((completedMinutes / target) * 100));

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar ${state.sidebarOpen ? "open" : ""}">
        <div class="brand"><span class="brand-mark">↗</span> StudyReset</div>
        <nav class="nav-list" aria-label="Main navigation">
          ${[
            ["today", "Today"],
            ["tasks", "My tasks"],
            ["subjects", "Subjects"],
            ["topics", "Topics & revision"],
            ["exams", "Exams"],
            ["plan", "Daily plan"],
            ["focus", "Focus room"],
          ].map(([view, label]) => `
            <button class="nav-item ${state.view === view ? "active" : ""}" data-action="navigate" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ""}>
              <span class="nav-icon">${icons[view]}</span>${label}
            </button>
          `).join("")}
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-card">
            <p>Focused today</p>
            <strong>${completedMinutes} of ${target} minutes</strong>
            <div class="progress"><span style="width:${progress}%"></span></div>
          </div>
          <div class="user-menu">
            <div class="avatar">${escapeHtml(initials(state.user?.name))}</div>
            <div class="user-copy"><strong>${escapeHtml(state.user?.name)}</strong><span>${completed} tasks completed</span></div>
            <button class="task-action" data-action="logout" aria-label="Log out" title="Log out">↪</button>
          </div>
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <button class="btn btn-outline icon-button mobile-menu" data-action="menu" aria-label="Open menu">☰</button>
          <div class="date-copy">${new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</div>
          <div class="top-actions">
            <label class="search"><span>⌕</span><span class="sr-only">Search tasks</span><input id="task-search" placeholder="Search your tasks" value="${escapeHtml(state.search)}" /></label>
            <button class="btn btn-deep btn-small" data-action="new-task">+ New task</button>
          </div>
        </header>
        <div id="page-content">${renderCurrentPage()}</div>
      </main>
    </div>
  `;
};

const heading = (eyebrow, title, subtitle, action = "") => `
  <div class="page-heading">
    <div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${subtitle}</p></div>
    ${action}
  </div>
`;

const renderToday = () => {
  const firstName = escapeHtml((state.user?.name || "Student").split(" ")[0]);
  const pending = state.tasks.filter((task) => task.status !== "completed");
  const completedToday = state.tasks.filter((task) => task.status === "completed" && isToday(task.completedAt));
  const dueToday = state.tasks.filter((task) => isToday(task.dueDate, true));
  const focusedToday = focusedMinutesToday();
  const queueIds = new Set();
  const topTasks = [...dueToday.filter((task) => task.status !== "completed"), ...completedToday]
    .filter((task) => {
      if (queueIds.has(task._id)) return false;
      queueIds.add(task._id);
      return true;
    })
    .slice(0, 5);
  const subjects = activeSubjects();
  const revisions = dueTopics().slice(0, 3);
  const exams = upcomingExams().slice(0, 3);
  const planBlocks = Array.isArray(state.dailyPlan?.blocks) ? state.dailyPlan.blocks : [];
  const plannedMinutes = planBlocks.reduce((sum, block) => sum + (Number(block.durationMinutes) || 0), 0);
  const completedPlanBlocks = planBlocks.filter((block) => block.status === "completed").length;
  const moodLabel = state.checkIn?.mood ? state.checkIn.mood.replace("-", " ") : "";

  return `
    ${heading("Today’s workspace", `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${firstName}.`, "Small, focused steps. That’s the whole plan.")}
    <div class="dashboard-grid">
      <div>
        <section class="card focus-card">
          <span class="focus-label">Ready when you are</span>
          <h2>${pending[0] ? `Make progress on “${escapeHtml(pending[0].title)}”` : "A clear list is a fresh start"}</h2>
          <p>${pending[0] ? `${formatMinutes(pending[0].estimatedMinutes)} of focused work can move this forward. Put everything else down for a while.` : "Add one meaningful task, then use the focus room to work without the noise."}</p>
          <button class="btn btn-accent" data-action="navigate" data-view="focus">Start a focus session →</button>
        </section>
        <div class="stats-row">
          <article class="card stat-card"><div class="stat-top"><span class="stat-icon">✓</span></div><strong>${completedToday.length}</strong><p>Tasks completed today</p></article>
          <article class="card stat-card"><div class="stat-top"><span class="stat-icon">◷</span></div><strong>${formatMinutes(focusedToday)}</strong><p>Focused time today</p></article>
          <article class="card stat-card"><div class="stat-top"><span class="stat-icon">▦</span></div><strong>${subjects.length}</strong><p>Active subjects</p></article>
        </div>
        <section class="card card-pad">
          <div class="card-header"><div><h2>Today’s study queue</h2><p>Tasks due today and work you completed today</p></div><button class="text-button" data-action="navigate" data-view="tasks">View all →</button></div>
          <div class="task-list">${topTasks.length ? topTasks.map((task) => taskRow(task, false)).join("") : emptyState("task")}</div>
        </section>
      </div>
      <aside class="right-column">
        <section class="card card-pad dashboard-reset-card">
          <div class="card-header"><div><h2>Today’s reset</h2><p>Plan around the capacity you actually have</p></div><button class="text-button" data-action="navigate" data-view="plan">Open →</button></div>
          ${state.checkIn ? `
            <div class="reset-summary">
              <span class="mood-orb mood-${escapeHtml(state.checkIn.mood)}" aria-hidden="true"></span>
              <div><strong>${escapeHtml(moodLabel[0]?.toUpperCase() + moodLabel.slice(1))} · energy ${state.checkIn.energyLevel}/5</strong><span>${state.checkIn.availableMinutes} minutes available</span></div>
            </div>
            ${state.dailyPlan ? `<div class="dashboard-plan-line"><strong>${completedPlanBlocks}/${planBlocks.length} blocks complete</strong><span>${formatMinutes(plannedMinutes)} planned · ${escapeHtml(state.dailyPlan.mode || "normal")} mode</span></div>` : `<button class="btn btn-small btn-primary" data-action="navigate" data-view="plan">Generate today’s plan</button>`}
          ` : `<div class="compact-empty"><strong>How are you arriving today?</strong><p>A one-minute check-in gives your plan a realistic budget.</p><button class="btn btn-small btn-primary" data-action="navigate" data-view="plan">Start daily check-in</button></div>`}
        </section>
        <section class="card card-pad">
          <div class="card-header"><div><h2>Due revisions</h2><p>Topics ready for another pass</p></div><button class="text-button" data-action="navigate" data-view="topics">View all →</button></div>
          <div class="dashboard-brief-list">
            ${revisions.length ? revisions.map((topic) => {
              const subject = topicSubject(topic);
              return `<button class="brief-row" data-action="navigate" data-view="topics"><span class="brief-mark" style="background:${escapeHtml(subject.color || "#062f72")}">↻</span><span><strong>${escapeHtml(topic.name)}</strong><small>${escapeHtml(subject.name)} · ${relativeDayLabel(topic.nextReviewAt)}</small></span></button>`;
            }).join("") : `<p class="quiet-copy">Nothing is due today. Your revision queue is clear.</p>`}
          </div>
        </section>
        <section class="card card-pad">
          <div class="card-header"><div><h2>Upcoming exams</h2><p>Your nearest dates at a glance</p></div><button class="text-button" data-action="navigate" data-view="exams">View all →</button></div>
          <div class="dashboard-brief-list">
            ${exams.length ? exams.map((exam) => {
              const subject = examSubject(exam);
              return `<button class="brief-row" data-action="navigate" data-view="exams"><span class="exam-date-tile"><strong>${formatDate(exam.examDate, { day: "numeric" })}</strong></span><span><strong>${escapeHtml(exam.name)}</strong><small>${escapeHtml(subject.name)} · ${relativeDayLabel(exam.examDate)}</small></span></button>`;
            }).join("") : `<p class="quiet-copy">No upcoming exams. Add one when a date is confirmed.</p>`}
          </div>
        </section>
        <section class="card card-pad">
          <div class="card-header"><div><h2>Subjects</h2><p>Your active learning areas</p></div><button class="text-button" data-action="new-subject">+ Add</button></div>
          <div class="subjects-mini">
            ${subjects.length ? subjects.slice(0, 5).map((subject) => {
              const tasks = tasksForSubject(subject._id);
              const done = tasks.filter((task) => task.status === "completed").length;
              return `<div class="subject-mini"><div class="subject-mark" style="background:${escapeHtml(subject.color)}">${escapeHtml(subject.name[0]?.toUpperCase())}</div><div class="subject-mini-copy"><strong>${escapeHtml(subject.name)}</strong><span>${done}/${tasks.length} tasks complete</span></div></div>`;
            }).join("") : emptyState("subject")}
          </div>
        </section>
      </aside>
    </div>
  `;
};

const renderTasks = () => {
  const tasks = filteredTasks();
  return `
    ${heading("Plan with intention", "My tasks", "Keep the next step visible and everything else quiet.", `<button class="btn btn-primary" data-action="new-task">+ Add study task</button>`)}
    <div class="filter-row">
      ${[["all", "All tasks"], ["pending", "To do"], ["in-progress", "In progress"], ["completed", "Completed"]].map(([filter, label]) => `<button class="filter-chip ${state.taskFilter === filter ? "active" : ""}" data-action="filter" data-filter="${filter}">${label}</button>`).join("")}
    </div>
    <section class="card full-list-card">
      <div class="task-list">${tasks.length ? tasks.map((task) => taskRow(task)).join("") : emptyState("task")}</div>
    </section>
  `;
};

const subjectCard = (subject, archived = false) => {
  const tasks = tasksForSubject(subject._id);
  const done = tasks.filter((task) => task.status === "completed").length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return `
    <article class="card subject-card ${archived ? "archived" : ""}" style="--subject-color:${escapeHtml(subject.color)}">
      <div class="subject-mark">${escapeHtml(subject.name[0]?.toUpperCase())}</div>
      <div class="subject-card-heading">
        <h3>${escapeHtml(subject.name)}</h3>
        ${archived ? `<span class="archived-badge">Archived</span>` : ""}
      </div>
      <p>${escapeHtml(subject.description || "A focused space for your study tasks.")}</p>
      <div class="subject-footer">
        <span>${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${percent}% complete</span>
        <div class="subject-actions">
          ${archived ? `
            <button class="subject-action" data-action="restore-subject" data-id="${subject._id}">Restore</button>
          ` : `
            <button class="subject-action" data-action="edit-subject" data-id="${subject._id}">Edit</button>
            <button class="subject-action subject-action-muted" data-action="archive-subject" data-id="${subject._id}">Archive</button>
          `}
        </div>
      </div>
    </article>
  `;
};

const renderSubjects = () => {
  const active = activeSubjects();
  const archived = archivedSubjects();
  return `
    ${heading("Organize your learning", "Subjects", "Give every task a home and see progress by area.", `<button class="btn btn-primary" data-action="new-subject">+ Add subject</button>`)}
    <section class="subject-grid">
      ${active.length ? active.map((subject) => subjectCard(subject)).join("") : `<div class="card" style="grid-column:1/-1">${emptyState("subject")}</div>`}
    </section>
    ${archived.length ? `
      <section class="archived-subjects" aria-labelledby="archived-subjects-title">
        <div class="section-heading">
          <div><h2 id="archived-subjects-title">Archived subjects</h2><p>Restore a subject whenever you are ready to study it again.</p></div>
          <span>${archived.length}</span>
        </div>
        <div class="subject-grid archived-grid">${archived.map((subject) => subjectCard(subject, true)).join("")}</div>
      </section>
    ` : ""}
  `;
};

const confidenceMeter = (confidence = 1) => `
  <span class="confidence-meter" aria-label="Confidence ${confidence} out of 5">
    ${[1, 2, 3, 4, 5].map((level) => `<i class="${level <= confidence ? "filled" : ""}"></i>`).join("")}
  </span>
`;

const topicCard = (topic, archived = false) => {
  const subject = topicSubject(topic);
  const due = !archived && topic.nextReviewAt && calendarDaysFromToday(topic.nextReviewAt) <= 0;
  return `
    <article class="card topic-card ${archived ? "archived" : ""} ${due ? "review-due" : ""}">
      <div class="topic-card-top">
        <span class="topic-subject"><span class="subject-dot" style="background:${escapeHtml(subject.color || "#062f72")}"></span>${escapeHtml(subject.name)}</span>
        ${archived ? `<span class="archived-badge">Archived</span>` : due ? `<span class="due-badge">Review due</span>` : ""}
      </div>
      <h3>${escapeHtml(topic.name)}</h3>
      <p>${escapeHtml(topic.description || "Keep this idea in your revision rhythm.")}</p>
      <div class="topic-confidence"><span>Confidence</span>${confidenceMeter(Number(topic.confidence) || 1)}<strong>${Number(topic.confidence) || 1}/5</strong></div>
      <dl class="review-dates">
        <div><dt>Last reviewed</dt><dd>${topic.lastReviewedAt ? formatDate(topic.lastReviewedAt, { year: "numeric" }) : "Not yet"}</dd></div>
        <div><dt>Next review</dt><dd>${topic.nextReviewAt ? `${formatDate(topic.nextReviewAt, { year: "numeric" })} · ${relativeDayLabel(topic.nextReviewAt)}` : "Not scheduled"}</dd></div>
      </dl>
      ${archived ? `
        <div class="topic-footer"><button class="subject-action" data-action="restore-topic" data-id="${topic._id}">Restore topic</button></div>
      ` : `
        <div class="review-actions" aria-label="Record review performance for ${escapeHtml(topic.name)}">
          <span>Review result</span>
          <button data-action="review-topic" data-id="${topic._id}" data-performance="poor">Poor</button>
          <button data-action="review-topic" data-id="${topic._id}" data-performance="fair">Fair</button>
          <button data-action="review-topic" data-id="${topic._id}" data-performance="good">Good</button>
        </div>
        <div class="topic-footer">
          <button class="subject-action" data-action="edit-topic" data-id="${topic._id}">Edit</button>
          <button class="subject-action subject-action-muted" data-action="archive-topic" data-id="${topic._id}">Archive</button>
        </div>
      `}
    </article>
  `;
};

const renderTopics = () => {
  const active = activeTopics();
  const archived = archivedTopics();
  return `
    ${heading("Remember with intention", "Topics & revision", "Track confidence and review each topic at the right pace.", `<button class="btn btn-primary" data-action="new-topic">+ Add topic</button>`)}
    ${dueTopics().length ? `<div class="revision-banner"><span>↻</span><div><strong>${dueTopics().length} revision${dueTopics().length === 1 ? " is" : "s are"} due</strong><p>Choose Poor, Fair, or Good after a real review to schedule the next one.</p></div></div>` : ""}
    <section class="topic-grid">
      ${active.length ? active.map((topic) => topicCard(topic)).join("") : `<div class="card collection-empty"><span>↻</span><h3>No revision topics yet</h3><p>Add a concept you want to remember and StudyReset will give it a review rhythm.</p><button class="btn btn-small btn-primary" data-action="new-topic">+ Add topic</button></div>`}
    </section>
    ${archived.length ? `
      <section class="archived-subjects" aria-labelledby="archived-topics-title">
        <div class="section-heading"><div><h2 id="archived-topics-title">Archived topics</h2><p>Restore a topic without losing its review history.</p></div><span>${archived.length}</span></div>
        <div class="topic-grid archived-grid">${archived.map((topic) => topicCard(topic, true)).join("")}</div>
      </section>
    ` : ""}
  `;
};

const examTopicNames = (exam) => (Array.isArray(exam.syllabusTopics) ? exam.syllabusTopics : [])
  .map((topic) => (typeof topic === "object" ? topic.name : state.topics.find((item) => item._id === topic)?.name))
  .filter(Boolean);

const examCard = (exam) => {
  const subject = examSubject(exam);
  const completed = Boolean(exam.isCompleted);
  const topicNames = examTopicNames(exam);
  return `
    <article class="card exam-card ${completed ? "completed" : ""}">
      <div class="exam-card-date" aria-label="${formatDate(exam.examDate, { year: "numeric" })}">
        <span>${new Intl.DateTimeFormat("en", { month: "short" }).format(dateForDisplay(exam.examDate))}</span>
        <strong>${dateForDisplay(exam.examDate).getDate()}</strong>
      </div>
      <div class="exam-card-copy">
        <div class="exam-card-meta"><span class="topic-subject"><span class="subject-dot" style="background:${escapeHtml(subject.color || "#062f72")}"></span>${escapeHtml(subject.name)}</span><span class="priority ${escapeHtml(exam.importance || "medium")}">${escapeHtml(exam.importance || "medium")}</span>${completed ? `<span class="completed-badge">Completed</span>` : ""}</div>
        <h3>${escapeHtml(exam.name)}</h3>
        ${exam.description ? `<p>${escapeHtml(exam.description)}</p>` : ""}
        <div class="exam-countdown">${completed ? `Completed · ${formatDate(exam.examDate, { year: "numeric" })}` : relativeDayLabel(exam.examDate)}</div>
        ${topicNames.length ? `<div class="syllabus-tags" aria-label="Syllabus topics">${topicNames.slice(0, 5).map((name) => `<span>${escapeHtml(name)}</span>`).join("")}${topicNames.length > 5 ? `<span>+${topicNames.length - 5}</span>` : ""}</div>` : `<p class="exam-no-topics">No syllabus topics linked yet.</p>`}
      </div>
      <div class="exam-actions">
        <button class="subject-action" data-action="toggle-exam" data-id="${exam._id}">${completed ? "Mark upcoming" : "Mark complete"}</button>
        <button class="subject-action" data-action="edit-exam" data-id="${exam._id}">Edit</button>
        <button class="subject-action subject-action-muted" data-action="delete-exam" data-id="${exam._id}">Delete</button>
      </div>
    </article>
  `;
};

const renderExams = () => {
  const sorted = [...state.exams].sort((left, right) => calendarDayNumber(left.examDate) - calendarDayNumber(right.examDate));
  const active = sorted.filter((exam) => !exam.isCompleted);
  const completed = sorted.filter((exam) => exam.isCompleted);
  return `
    ${heading("Prepare without panic", "Exams", "Keep dates, importance, and the syllabus visible in one calm place.", `<button class="btn btn-primary" data-action="new-exam">+ Add exam</button>`)}
    <section class="exam-list">
      ${active.length ? active.map(examCard).join("") : `<div class="card collection-empty"><span>◇</span><h3>No upcoming exams</h3><p>Add a confirmed date and connect the topics you want in view.</p><button class="btn btn-small btn-primary" data-action="new-exam">+ Add exam</button></div>`}
    </section>
    ${completed.length ? `<section class="completed-exams" aria-labelledby="completed-exams-title"><div class="section-heading"><div><h2 id="completed-exams-title">Completed exams</h2><p>Past milestones stay here until you remove them.</p></div><span>${completed.length}</span></div><div class="exam-list">${completed.map(examCard).join("")}</div></section>` : ""}
  `;
};

const planBlockRow = (block, index) => {
  const recoveryFocus = state.dailyPlan?.mode === "recovery" && block.kind !== "break";
  return `
    <article class="plan-block ${block.kind === "break" ? "break-block" : "focus-block"}" data-block-id="${escapeHtml(block.clientId)}">
      <div class="plan-block-order"><button data-action="move-plan-block" data-direction="up" data-id="${escapeHtml(block.clientId)}" aria-label="Move ${escapeHtml(block.title)} up" ${index === 0 ? "disabled" : ""}>↑</button><button data-action="move-plan-block" data-direction="down" data-id="${escapeHtml(block.clientId)}" aria-label="Move ${escapeHtml(block.title)} down" ${index === state.planDraft.length - 1 ? "disabled" : ""}>↓</button></div>
      <div class="plan-block-copy"><span>${block.kind === "break" ? "Break" : escapeHtml((block.sourceType || "focus").replace("manual", "Focus"))}</span><strong>${escapeHtml(block.title)}</strong>${block.reason ? `<p>${escapeHtml(block.reason)}</p>` : ""}</div>
      <label class="plan-duration"><span class="sr-only">Minutes for ${escapeHtml(block.title)}</span><input type="number" min="1" max="${recoveryFocus ? 15 : 120}" value="${block.durationMinutes}" data-action="plan-duration" data-id="${escapeHtml(block.clientId)}" /><small>min</small></label>
      <label class="plan-status-field"><span class="sr-only">Status for ${escapeHtml(block.title)}</span><select class="plan-status" data-action="plan-status" data-id="${escapeHtml(block.clientId)}"><option value="planned" ${block.status === "planned" ? "selected" : ""}>Planned</option><option value="completed" ${block.status === "completed" ? "selected" : ""}>Completed</option><option value="skipped" ${block.status === "skipped" ? "selected" : ""}>Skipped</option></select></label>
      <button class="task-action plan-remove" data-action="remove-plan-block" data-id="${escapeHtml(block.clientId)}" aria-label="Remove ${escapeHtml(block.title)}">×</button>
    </article>
  `;
};

const renderPlan = () => {
  const checkIn = state.checkIn;
  const plan = state.dailyPlan;
  const budget = Number(checkIn?.availableMinutes || plan?.availableMinutes || 0);
  const used = planMinutesUsed();
  const overBudget = used > budget;
  const recoveryFocusCount = state.planDraft.filter((block) => block.kind !== "break").length;
  return `
    ${heading("Plan for the day you have", "Daily reset", "Check in once, then shape a plan that fits your real time and energy.")}
    <div class="plan-layout">
      <aside class="plan-sidebar">
        <section class="card checkin-card">
          <div class="card-header"><div><h2>Today’s check-in</h2><p>${checkIn ? "Update it if your day has changed." : "A calm minute before you plan."}</p></div><span class="checkin-date">${formatDate(localDateKey())}</span></div>
          <form id="checkin-form" class="form-stack">
            <div class="field"><label for="checkin-mood">How are you feeling?</label><select id="checkin-mood" name="mood" required>${[["very-low", "Very low"], ["low", "Low"], ["neutral", "Neutral"], ["good", "Good"], ["great", "Great"]].map(([value, label]) => `<option value="${value}" ${checkIn?.mood === value || (!checkIn && value === "neutral") ? "selected" : ""}>${label}</option>`).join("")}</select></div>
            <div class="field-row">
              <div class="field"><label for="checkin-energy">Energy (1–5)</label><select id="checkin-energy" name="energyLevel" required>${[1, 2, 3, 4, 5].map((level) => `<option value="${level}" ${Number(checkIn?.energyLevel || 3) === level ? "selected" : ""}>${level}</option>`).join("")}</select></div>
              <div class="field"><label for="checkin-minutes">Available minutes</label><input id="checkin-minutes" name="availableMinutes" type="number" min="10" max="720" step="5" required value="${Number(checkIn?.availableMinutes || 60)}" /></div>
            </div>
            <div class="field"><label for="checkin-note">Anything to account for? <span class="optional">(optional)</span></label><textarea id="checkin-note" name="note" maxlength="500" placeholder="A late class, low sleep, or something you want to protect…">${escapeHtml(checkIn?.note || "")}</textarea></div>
            <button class="btn btn-primary" type="submit">${checkIn ? "Update check-in" : "Save check-in"}</button>
          </form>
        </section>
        <section class="card recovery-card ${state.recoverySuggested ? "suggested" : ""}">
          <span class="recovery-icon">☁</span><div><h3>${state.recoverySuggested ? "Recovery Mode is available" : "Need a gentler plan?"}</h3><p>${state.recoverySuggested ? "Your check-in suggests lowering today’s load. You stay in control of the choice." : "Recovery Mode uses at most two short focus blocks, with room to breathe."}</p></div>
        </section>
      </aside>
      <section class="card plan-card">
        <div class="plan-card-header">
          <div><p class="eyebrow">${plan ? `${escapeHtml(plan.mode || "normal")} mode` : "Build today’s plan"}</p><h2>${plan ? "Today’s study blocks" : "Turn your check-in into a clear next step"}</h2><p>${plan?.explanation ? escapeHtml(plan.explanation) : "Choose a normal plan or deliberately lower the load with Recovery Mode."}</p></div>
          ${plan ? `<span class="mode-badge mode-${escapeHtml(plan.mode || "normal")}">${plan.mode === "recovery" ? "Recovery" : "Normal"}</span>` : ""}
        </div>
        ${!checkIn ? `<div class="plan-gate"><span>☷</span><h3>Check in before generating a plan</h3><p>Your available minutes are the budget, so the plan never quietly promises more time than you have.</p></div>` : `
          <div class="generate-actions" aria-label="Plan generation choices">
            <button class="btn btn-outline" data-action="generate-plan" data-recovery="false">${plan ? "Regenerate normal plan" : "Generate normal plan"}</button>
            <button class="btn btn-deep" data-action="generate-plan" data-recovery="true">${plan ? "Regenerate in Recovery Mode" : "Generate Recovery Mode"}</button>
          </div>
          <p class="recovery-exit-note">Recovery Mode is never permanent. Choose <strong>Regenerate normal plan</strong> whenever you want to exit it.</p>
          ${plan ? `
            <div class="plan-budget ${overBudget ? "over" : ""}" role="status"><div><strong>${used} of ${budget} minutes planned</strong><span>${overBudget ? `${used - budget} minutes over today’s budget` : `${budget - used} minutes still available`}</span></div><div class="budget-track"><span style="width:${budget ? Math.min(100, Math.round((used / budget) * 100)) : 0}%"></span></div></div>
            <div class="plan-blocks">${state.planDraft.length ? state.planDraft.map(planBlockRow).join("") : `<div class="plan-blocks-empty">No blocks yet. Add one below.</div>`}</div>
            <form id="manual-block-form" class="manual-block-form">
              <div class="field"><label for="manual-title">Add a block</label><input id="manual-title" name="title" maxlength="120" required placeholder="Review lecture notes" /></div>
              <div class="field"><label for="manual-duration">Minutes</label><input id="manual-duration" name="durationMinutes" type="number" min="1" max="${plan.mode === "recovery" ? 15 : 120}" value="${plan.mode === "recovery" ? 10 : 25}" required /></div>
              <div class="field"><label for="manual-kind">Kind</label><select id="manual-kind" name="kind" data-action="manual-kind"><option value="focus">Focus</option><option value="break">Break</option></select></div>
              <button class="btn btn-outline btn-small" type="submit" ${plan.mode === "recovery" && recoveryFocusCount >= 2 ? `title="Recovery Mode allows at most two focus blocks"` : ""}>+ Add block</button>
            </form>
            <div class="plan-save-row"><span>${state.planDirty ? "Unsaved adjustments" : plan.manuallyAdjusted ? "Adjusted plan saved" : "Generated plan"}</span><button class="btn btn-primary" data-action="save-plan" ${!state.planDirty || overBudget ? "disabled" : ""}>Save adjustments</button></div>
          ` : ""}
        `}
      </section>
    </div>
  `;
};

const formatTimerClock = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const remainder = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
};

const focusTimerStatus = (selectedTask) => {
  if (state.timer.starting) return "Creating your focus session…";
  if (state.timer.completing) return "Saving your completed focus session…";
  if (state.timer.cancelling) return "Cancelling this focus session…";
  if (state.timer.completionPending) return "Time is up. Your completed session is ready to save.";
  if (state.timer.serverSessionId && state.timer.running) {
    return `Timer running${selectedTask ? ` for ${selectedTask.title}` : ""}.`;
  }
  if (state.timer.serverSessionId) return "Timer paused. Resume when you are ready.";
  if (state.timer.clientSessionId) return "The start request was interrupted. Retry to safely continue the same session.";
  if (selectedTask) return `Ready to focus on ${selectedTask.title}.`;
  return "Choose a task and session length to begin.";
};

const formatSessionDate = (session) => {
  const value = session.endedAt || session.startedAt || session.createdAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const renderFocusHistory = () => {
  const sessions = [...state.focusSessions]
    .sort((left, right) => new Date(right.startedAt || 0) - new Date(left.startedAt || 0))
    .slice(0, 8);
  if (!sessions.length) {
    return `<div class="focus-history-empty"><span>◷</span><div><strong>No saved sessions yet</strong><p>Complete your first timer and it will appear here.</p></div></div>`;
  }
  return sessions.map((session) => {
    const task = taskForSession(session);
    const subject = subjectForSession(session);
    const actualMinutes = Number(session.actualFocusedMinutes) || 0;
    const duration = session.status === "completed" ? actualMinutes : Number(session.plannedMinutes) || 0;
    const status = ["active", "completed", "cancelled"].includes(session.status) ? session.status : "active";
    return `
      <article class="focus-history-item">
        <div class="focus-history-mark" style="--history-color:${escapeHtml(subject?.color || "#062f72")}">◷</div>
        <div class="focus-history-copy">
          <div><strong>${escapeHtml(task?.title || "Focus session")}</strong><span class="session-status status-${status}">${status}</span></div>
          <p>${escapeHtml(subject?.name || "Study")} · ${formatSessionDate(session)}</p>
        </div>
        <strong class="focus-history-duration">${formatMinutes(duration)}</strong>
      </article>
    `;
  }).join("");
};

const renderFocus = () => {
  const selectedTask = state.tasks.find((task) => task._id === state.timer.selectedTaskId);
  const selectedSubject = state.subjects.find((subject) => subject._id === state.timer.selectedSubjectId)
    || (selectedTask ? subjectFor(selectedTask) : null);
  const eligibleTasks = state.tasks.filter((task) => (
    task.status !== "completed" && !subjectFor(task).isArchived
  ));
  if (selectedTask && !eligibleTasks.some((task) => task._id === selectedTask._id)) {
    eligibleTasks.unshift(selectedTask);
  }

  const remaining = remainingFocusSeconds();
  const progress = state.timer.totalSeconds
    ? Math.min(1, effectiveFocusedSeconds() / state.timer.totalSeconds)
    : 0;
  const controlsLocked = Boolean(state.timer.clientSessionId);
  const busy = state.timer.starting || state.timer.completing || state.timer.cancelling;
  const canStart = Boolean(state.timer.selectedTaskId && state.timer.selectedSubjectId) && !busy;
  const statusText = focusTimerStatus(selectedTask);
  const presets = [10, 25, 45, 60];

  let timerActions;
  if (!state.timer.serverSessionId) {
    timerActions = `<button class="btn btn-accent" data-action="focus-start" ${canStart ? "" : "disabled"}>${state.timer.starting ? "Starting…" : state.timer.clientSessionId ? "Retry start" : "Start focus"}</button>`;
  } else if (state.timer.completionPending) {
    timerActions = `<button class="btn btn-accent" data-action="focus-finish" ${busy ? "disabled" : ""}>${state.timer.completing ? "Saving…" : "Finish & save"}</button>`;
  } else {
    timerActions = `
      <button class="btn btn-accent" data-action="${state.timer.running ? "focus-pause" : "focus-resume"}" ${busy ? "disabled" : ""}>${state.timer.running ? "Pause" : "Resume"}</button>
      <button class="btn btn-outline" data-action="focus-finish" ${busy ? "disabled" : ""}>Finish now</button>
      <button class="btn btn-ghost focus-cancel-button" data-action="focus-cancel" ${busy ? "disabled" : ""}>Cancel</button>
    `;
  }

  return `
    ${heading("Protect your attention", "Focus room", "One task. One timer. Your active session safely survives a refresh.")}
    <div class="focus-page">
      <section class="card timer-card">
        <div class="timer-content">
          <div class="timer-mode">${state.timer.serverSessionId ? state.timer.running ? "Focus in progress" : "Focus paused" : "Focus session"}</div>
          <div class="timer-ring" id="timer-ring" style="--timer-progress:${Math.round(progress * 360)}deg" aria-label="${formatTimerClock(remaining)} remaining">
            <div><div class="timer-time" id="timer-time">${formatTimerClock(remaining)}</div><div class="timer-caption">time remaining</div></div>
          </div>
          <strong class="timer-task-name">${escapeHtml(selectedTask?.title || "Choose your next task")}</strong>
          <p class="timer-status" id="timer-status" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(statusText)}</p>
        </div>
      </section>
      <aside class="focus-controls">
        <section class="card focus-setup">
          <div class="focus-setup-heading"><div><h2>Plan this session</h2><p>${formatMinutes(focusedMinutesToday())} focused today</p></div><span>◷</span></div>
          <div class="field">
            <label for="focus-task">Study task</label>
            <select id="focus-task" data-action="focus-task" ${controlsLocked ? "disabled" : ""}>
              <option value="">Choose a task</option>
              ${eligibleTasks.map((task) => {
                const subject = subjectFor(task);
                return `<option value="${task._id}" ${task._id === state.timer.selectedTaskId ? "selected" : ""}>${escapeHtml(task.title)} · ${escapeHtml(subject.name)}</option>`;
              }).join("")}
            </select>
            ${eligibleTasks.length ? "" : `<p class="field-note">Add an active task before starting a focus session.</p>`}
          </div>
          <div class="field">
            <label for="focus-duration">Session length</label>
            <div class="duration-input"><input id="focus-duration" data-action="focus-duration" type="number" min="10" max="600" step="1" value="${state.timer.plannedMinutes}" ${controlsLocked ? "disabled" : ""} /><span>minutes</span></div>
            <div class="duration-presets" aria-label="Session length presets">
              ${presets.map((minutes) => `<button class="duration-preset ${state.timer.plannedMinutes === minutes ? "active" : ""}" data-action="focus-duration-preset" data-minutes="${minutes}" ${controlsLocked ? "disabled" : ""}>${minutes}m</button>`).join("")}
            </div>
          </div>
          <label class="focus-checkbox ${state.timer.selectedTaskId ? "" : "disabled"}">
            <input type="checkbox" data-action="focus-mark-complete" ${state.timer.markTaskCompleted ? "checked" : ""} ${state.timer.selectedTaskId && !state.timer.completing && !state.timer.cancelling ? "" : "disabled"} />
            <span><strong>Mark task complete</strong><small>Update the linked task when this session finishes.</small></span>
          </label>
          <div class="timer-actions">${timerActions}</div>
          ${selectedSubject ? `<p class="focus-subject-note"><span class="subject-dot" style="background:${escapeHtml(selectedSubject.color || "#062f72")}"></span> Session saved under ${escapeHtml(selectedSubject.name)}</p>` : ""}
        </section>
        <article class="card tip"><span class="tip-number">01</span><h3>Protect the finish line</h3><p>Close extra tabs and work only on the task you selected. Pause if you step away so focused time stays honest.</p></article>
      </aside>
    </div>
    <section class="card focus-history-card">
      <div class="card-header"><div><h2>Recent focus history</h2><p>Saved sessions from the last seven days</p></div><strong>${formatMinutes(focusedMinutesToday())} today</strong></div>
      <div class="focus-history-list">${renderFocusHistory()}</div>
    </section>
  `;
};

const renderCurrentPage = () => ({
  today: renderToday,
  tasks: renderTasks,
  subjects: renderSubjects,
  topics: renderTopics,
  exams: renderExams,
  plan: renderPlan,
  focus: renderFocus,
}[state.view] || renderToday)();

const render = () => {
  if (!state.token || !state.user) renderAuth();
  else renderShell();
};

const closeModal = () => { modalRoot.innerHTML = ""; };

const openTaskModal = (task = null) => {
  const subjects = activeSubjects();
  if (!task && !subjects.length) {
    showToast("Create a subject before adding a task.", "error");
    openSubjectModal();
    return;
  }
  const currentSubjectId = task ? subjectIdFor(task) : subjects[0]?._id;
  const currentSubject = task ? subjectFor(task) : subjects[0];
  const subjectAssociationLocked = Boolean(task)
    && !subjects.some((subject) => subject._id === currentSubjectId);
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div class="modal-header"><div><h2 id="task-modal-title">${task ? "Edit study task" : "Add a study task"}</h2><p>Make the next action specific and achievable.</p></div><button class="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close">×</button></div>
        <form id="task-form" class="form-stack" data-id="${task?._id || ""}" data-original-status="${task?.status || ""}">
          <div class="field"><label for="task-title">Task title</label><input id="task-title" name="title" required maxlength="120" placeholder="Complete chapter 3 exercises" value="${escapeHtml(task?.title || "")}" /></div>
          <div class="field"><label for="task-description">Notes <span style="font-weight:400;color:var(--ink-soft)">(optional)</span></label><textarea id="task-description" name="description" maxlength="500" placeholder="What does done look like?">${escapeHtml(task?.description || "")}</textarea></div>
          ${subjectAssociationLocked ? `
            <div class="field">
              <label>Subject</label>
              <div class="locked-subject">
                <span class="subject-dot" style="background:${escapeHtml(currentSubject.color || "#062f72")}"></span>
                <strong>${escapeHtml(currentSubject.name || "Archived subject")}</strong>
                <span>Archived</span>
              </div>
              <p class="field-note">This task will stay linked to its archived subject.</p>
            </div>
          ` : `
            <div class="field"><label for="task-subject">Subject</label><select id="task-subject" name="subject" required>${subjects.map((subject) => `<option value="${subject._id}" ${subject._id === currentSubjectId ? "selected" : ""}>${escapeHtml(subject.name)}</option>`).join("")}</select></div>
          `}
          <div class="field-row">
            <div class="field"><label for="task-minutes">Estimated minutes</label><input id="task-minutes" name="estimatedMinutes" type="number" min="1" max="600" value="${task?.estimatedMinutes || 25}" required /></div>
            <div class="field"><label for="task-priority">Priority</label><select id="task-priority" name="priority">${["low", "medium", "high"].map((priority) => `<option value="${priority}" ${task?.priority === priority || (!task && priority === "medium") ? "selected" : ""}>${priority[0].toUpperCase() + priority.slice(1)}</option>`).join("")}</select></div>
          </div>
          <div class="field-row ${task ? "" : "single-field"}">
            <div class="field"><label for="task-due">Due date <span style="font-weight:400;color:var(--ink-soft)">(optional)</span></label><input id="task-due" name="dueDate" type="date" value="${task?.dueDate ? dateOnlyKey(task.dueDate) : ""}" /></div>
            ${task ? `<div class="field"><label for="task-status">Status</label><select id="task-status" name="status">${taskStatuses.map(([status, label]) => `<option value="${status}" ${task.status === status ? "selected" : ""}>${label}</option>`).join("")}</select></div>` : ""}
          </div>
          <div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">${task ? "Save changes" : "Add task"}</button></div>
        </form>
      </section>
    </div>
  `;
  document.querySelector("#task-title")?.focus();
};

const openSubjectModal = (subject = null) => {
  const colors = ["#031b46", "#062f72", "#0a3d91", "#172f7a", "#1e3a8a", "#1d4ed8"];
  const selectedColor = subject?.color || colors[0];
  if (!colors.includes(selectedColor)) colors.unshift(selectedColor);
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="subject-modal-title">
        <div class="modal-header"><div><h2 id="subject-modal-title">${subject ? "Edit subject" : "Create a subject"}</h2><p>${subject ? "Update this learning area without changing its tasks." : "Organize tasks by course, exam, or learning goal."}</p></div><button class="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close">×</button></div>
        <form id="subject-form" class="form-stack" data-id="${subject?._id || ""}">
          <div class="field"><label for="subject-name">Subject name</label><input id="subject-name" name="name" required maxlength="80" placeholder="Data Structures" value="${escapeHtml(subject?.name || "")}" /></div>
          <div class="field"><label for="subject-description">Description <span style="font-weight:400;color:var(--ink-soft)">(optional)</span></label><textarea id="subject-description" name="description" maxlength="300" placeholder="What are you working toward?">${escapeHtml(subject?.description || "")}</textarea></div>
          <div class="field"><label>Color</label><div class="color-picker">${colors.map((color) => `<button type="button" class="color-option ${color === selectedColor ? "active" : ""}" style="background:${color}" data-action="pick-color" data-color="${color}" aria-label="Select ${color}"></button>`).join("")}</div><input type="hidden" name="color" value="${selectedColor}" /></div>
          <div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">${subject ? "Save changes" : "Create subject"}</button></div>
        </form>
      </section>
    </div>
  `;
  document.querySelector("#subject-name")?.focus();
};

const openTopicModal = (topic = null) => {
  const subjects = activeSubjects();
  if (!subjects.length) {
    showToast("Create an active subject before adding a topic.", "error");
    openSubjectModal();
    return;
  }
  const currentSubjectId = topic ? topicSubjectId(topic) : subjects[0]._id;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="topic-modal-title">
        <div class="modal-header"><div><h2 id="topic-modal-title">${topic ? "Edit topic" : "Add a revision topic"}</h2><p>Use one clear concept, chapter, or skill per topic.</p></div><button class="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close">×</button></div>
        <form id="topic-form" class="form-stack" data-id="${topic?._id || ""}">
          <div class="field"><label for="topic-name">Topic name</label><input id="topic-name" name="name" required maxlength="120" placeholder="Binary search trees" value="${escapeHtml(topic?.name || "")}" /></div>
          <div class="field"><label for="topic-subject">Subject</label><select id="topic-subject" name="subject" required>${subjects.map((subject) => `<option value="${subject._id}" ${subject._id === currentSubjectId ? "selected" : ""}>${escapeHtml(subject.name)}</option>`).join("")}</select></div>
          <div class="field"><label for="topic-description">Notes <span class="optional">(optional)</span></label><textarea id="topic-description" name="description" maxlength="1000" placeholder="What should a useful review cover?">${escapeHtml(topic?.description || "")}</textarea></div>
          <div class="field"><label for="topic-confidence">Current confidence</label><select id="topic-confidence" name="confidence" required>${[[1, "1 — just starting"], [2, "2 — shaky"], [3, "3 — developing"], [4, "4 — confident"], [5, "5 — strong"]].map(([value, label]) => `<option value="${value}" ${Number(topic?.confidence || 3) === value ? "selected" : ""}>${label}</option>`).join("")}</select><p class="field-note">Reviews will continue to update the schedule; confidence stays yours to set.</p></div>
          <div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">${topic ? "Save changes" : "Add topic"}</button></div>
        </form>
      </section>
    </div>
  `;
  document.querySelector("#topic-name")?.focus();
};

const selectedExamTopicIds = (exam) => new Set((Array.isArray(exam?.syllabusTopics) ? exam.syllabusTopics : [])
  .map(associationId)
  .filter(Boolean));

const renderExamSyllabusOptions = (subjectId, selectedIds = new Set()) => {
  const topics = state.topics.filter((topic) => (
    topicSubjectId(topic) === subjectId && (!topic.isArchived || selectedIds.has(topic._id))
  ));
  if (!topics.length) return `<p class="field-note syllabus-empty">No topics for this subject yet. You can save the exam now and link topics later.</p>`;
  return topics.map((topic) => `
    <label class="syllabus-option ${topic.isArchived ? "archived" : ""}">
      <input type="checkbox" name="syllabusTopics" value="${topic._id}" ${selectedIds.has(topic._id) ? "checked" : ""} />
      <span><strong>${escapeHtml(topic.name)}</strong>${topic.isArchived ? `<small>Archived topic</small>` : `<small>Confidence ${Number(topic.confidence) || 1}/5</small>`}</span>
    </label>
  `).join("");
};

const openExamModal = (exam = null) => {
  const subjects = activeSubjects();
  if (!subjects.length) {
    showToast("Create an active subject before adding an exam.", "error");
    openSubjectModal();
    return;
  }
  const currentSubjectId = exam ? examSubjectId(exam) : subjects[0]._id;
  const selectedIds = selectedExamTopicIds(exam);
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-backdrop">
      <section class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="exam-modal-title">
        <div class="modal-header"><div><h2 id="exam-modal-title">${exam ? "Edit exam" : "Add an exam"}</h2><p>Keep the date and the actual syllabus together.</p></div><button class="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close">×</button></div>
        <form id="exam-form" class="form-stack" data-id="${exam?._id || ""}">
          <div class="field"><label for="exam-name">Exam name</label><input id="exam-name" name="name" required maxlength="120" placeholder="Algorithms midterm" value="${escapeHtml(exam?.name || "")}" /></div>
          <div class="field-row">
            <div class="field"><label for="exam-subject">Subject</label><select id="exam-subject" name="subject" data-action="exam-subject" required>${subjects.map((subject) => `<option value="${subject._id}" ${subject._id === currentSubjectId ? "selected" : ""}>${escapeHtml(subject.name)}</option>`).join("")}</select></div>
            <div class="field"><label for="exam-date">Exam date</label><input id="exam-date" name="examDate" type="date" required value="${exam?.examDate ? dateOnlyKey(exam.examDate) : localDateKey()}" /></div>
          </div>
          <div class="field"><label for="exam-description">Description <span class="optional">(optional)</span></label><textarea id="exam-description" name="description" maxlength="1000" placeholder="Format, room, or preparation notes…">${escapeHtml(exam?.description || "")}</textarea></div>
          <div class="field"><label for="exam-importance">Importance</label><select id="exam-importance" name="importance">${["low", "medium", "high"].map((importance) => `<option value="${importance}" ${exam?.importance === importance || (!exam && importance === "medium") ? "selected" : ""}>${importance[0].toUpperCase() + importance.slice(1)}</option>`).join("")}</select></div>
          <fieldset class="syllabus-field"><legend>Syllabus topics <span class="optional">(optional)</span></legend><div id="exam-syllabus-options" class="syllabus-options">${renderExamSyllabusOptions(currentSubjectId, selectedIds)}</div></fieldset>
          <div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">${exam ? "Save changes" : "Add exam"}</button></div>
        </form>
      </section>
    </div>
  `;
  document.querySelector("#exam-name")?.focus();
};

const loadData = async () => {
  try {
    const { from, to } = focusHistoryRange();
    const today = localDateKey();
    const [me, subjects, tasks, focusSessions, topics, exams, checkInData, planData] = await Promise.all([
      api("/auth/me"),
      api("/subjects?includeArchived=true"),
      api("/tasks"),
      api(`/focus-sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      api("/topics?includeArchived=true"),
      api("/exams"),
      api(`/check-ins?date=${encodeURIComponent(today)}`),
      api(`/plans/daily?date=${encodeURIComponent(today)}`),
    ]);
    state.user = me.user;
    state.subjects = Array.isArray(subjects.subjects) ? subjects.subjects : [];
    state.tasks = Array.isArray(tasks.tasks) ? tasks.tasks : [];
    state.focusSessions = Array.isArray(focusSessions.sessions) ? focusSessions.sessions : [];
    state.topics = Array.isArray(topics.topics) ? topics.topics : [];
    state.exams = Array.isArray(exams.exams) ? exams.exams : [];
    state.checkIn = checkInData.checkIn || planData.checkIn || null;
    state.dailyPlan = planData.plan || null;
    state.recoverySuggested = Boolean(planData.recoverySuggested);
    resetPlanDraft(state.dailyPlan);
    const restoredTimer = restorePersistedFocusTimer();
    if (restoredTimer) {
      const savedSession = state.focusSessions.find((session) => (
        state.timer.serverSessionId
          ? sessionIdFor(session) === state.timer.serverSessionId
          : session.clientSessionId === state.timer.clientSessionId
      ));
      if (savedSession && savedSession.status !== "active") {
        clearPersistedFocusTimer();
        resetFocusTimerInMemory();
      } else if (savedSession && !state.timer.serverSessionId) {
        state.timer.serverSessionId = sessionIdFor(savedSession);
        state.timer.running = true;
        state.timer.runningSince = Date.now();
        persistFocusTimer();
      }
    }
    render();
    if (restoredTimer && state.timer.clientSessionId) reconcileRestoredFocusTimer();
    return true;
  } catch (error) {
    if (error.status === 401) {
      if (state.token) resetClientSession();
      renderAuth();
    } else {
      if (state.token && state.user) renderShell();
      else renderAuth();
    }
    showToast(error.message, "error");
    return false;
  }
};

const saveAuth = (data) => {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("studyreset_token", data.token);
};

const createClientSessionId = () => {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `focus-${Date.now()}-${randomPart}`.slice(0, 128);
};

const updateTimerDisplay = () => {
  const remaining = remainingFocusSeconds();
  if (
    remaining <= 0
    && state.timer.serverSessionId
    && !state.timer.completionPending
    && !state.timer.completing
  ) {
    state.timer.focusedSeconds = state.timer.totalSeconds;
    state.timer.running = false;
    state.timer.runningSince = null;
    state.timer.completionPending = true;
    clearTimerInterval();
    persistFocusTimer();
    renderShell();
    void completeFocusSession({ automatic: true });
    return;
  }

  const timeNode = document.querySelector("#timer-time");
  const ringNode = document.querySelector("#timer-ring");
  if (timeNode) timeNode.textContent = formatTimerClock(remaining);
  if (ringNode) {
    const progress = state.timer.totalSeconds
      ? Math.min(1, effectiveFocusedSeconds() / state.timer.totalSeconds)
      : 0;
    ringNode.style.setProperty("--timer-progress", `${Math.round(progress * 360)}deg`);
    ringNode.setAttribute("aria-label", `${formatTimerClock(remaining)} remaining`);
  }
};

const startTimerInterval = () => {
  clearTimerInterval();
  if (!state.timer.running) return;
  updateTimerDisplay();
  state.timer.interval = window.setInterval(updateTimerDisplay, 1000);
};

const startFocusSession = async () => {
  if (
    state.timer.serverSessionId
    || state.timer.starting
    || state.timer.completing
    || state.timer.cancelling
  ) return;

  const task = state.tasks.find((item) => item._id === state.timer.selectedTaskId);
  const subjectId = state.timer.selectedSubjectId || (task ? subjectIdFor(task) : "");
  const plannedMinutes = Number(state.timer.plannedMinutes);
  if (!state.timer.selectedTaskId || !subjectId) {
    showToast("Choose a study task before starting.", "error");
    return;
  }
  if (!Number.isInteger(plannedMinutes) || plannedMinutes < 10 || plannedMinutes > 600) {
    showToast("Session length must be between 10 and 600 minutes.", "error");
    return;
  }

  const sessionUserId = currentUserId();
  state.timer.selectedSubjectId = subjectId;
  state.timer.clientSessionId ||= createClientSessionId();
  state.timer.starting = true;
  persistFocusTimer();
  renderShell();

  try {
    const data = await api("/focus-sessions", {
      method: "POST",
      body: JSON.stringify({
        subject: subjectId,
        task: state.timer.selectedTaskId,
        plannedMinutes,
        clientSessionId: state.timer.clientSessionId,
      }),
    });
    if (currentUserId() !== sessionUserId) return;

    const session = data.session;
    const serverSessionId = sessionIdFor(session);
    if (!serverSessionId) throw new Error("The focus session could not be started.");
    upsertFocusSession(session);

    if (session.status && session.status !== "active") {
      clearPersistedFocusTimer();
      resetFocusTimerInMemory();
      renderShell();
      showToast("This focus session was already closed.");
      return;
    }

    state.timer.serverSessionId = serverSessionId;
    state.timer.starting = false;
    state.timer.running = true;
    state.timer.runningSince = Date.now();
    state.timer.completionPending = false;
    persistFocusTimer();
    startTimerInterval();
    renderShell();
    showToast("Focus session started.");
  } catch (error) {
    if (currentUserId() === sessionUserId) {
      state.timer.starting = false;
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 401) {
        state.timer.clientSessionId = null;
        clearPersistedFocusTimer();
      } else {
        persistFocusTimer();
      }
      renderShell();
    }
    showToast(error.message, "error");
  }
};

const pauseFocusTimer = () => {
  if (!state.timer.serverSessionId || !state.timer.running || state.timer.completionPending) return;
  state.timer.focusedSeconds = effectiveFocusedSeconds();
  state.timer.running = false;
  state.timer.runningSince = null;
  clearTimerInterval();
  persistFocusTimer();
  renderShell();
};

const resumeFocusTimer = () => {
  if (!state.timer.serverSessionId || state.timer.running || state.timer.completionPending) return;
  if (effectiveFocusedSeconds() >= state.timer.totalSeconds) {
    state.timer.completionPending = true;
    persistFocusTimer();
    renderShell();
    void completeFocusSession({ automatic: true });
    return;
  }
  state.timer.running = true;
  state.timer.runningSince = Date.now();
  persistFocusTimer();
  startTimerInterval();
  renderShell();
};

const prepareFocusCompletion = () => {
  state.timer.focusedSeconds = effectiveFocusedSeconds();
  state.timer.running = false;
  state.timer.runningSince = null;
  state.timer.completionPending = true;
  clearTimerInterval();
  persistFocusTimer();
};

const completeFocusSession = async ({ automatic = false } = {}) => {
  if (
    !state.timer.serverSessionId
    || state.timer.completing
    || state.timer.cancelling
  ) return;

  const sessionUserId = currentUserId();
  const serverSessionId = state.timer.serverSessionId;
  prepareFocusCompletion();
  state.timer.completing = true;
  const actualFocusedMinutes = Math.min(
    state.timer.plannedMinutes,
    Math.max(0, Math.round(state.timer.focusedSeconds / 60))
  );
  const markTaskCompleted = Boolean(state.timer.markTaskCompleted);
  renderShell();

  try {
    const data = await api(`/focus-sessions/${serverSessionId}/complete`, {
      method: "PATCH",
      body: JSON.stringify({ actualFocusedMinutes, markTaskCompleted }),
    });
    if (currentUserId() !== sessionUserId) return;

    upsertFocusSession(data.session);
    replaceTaskFromResponse(
      data.task || (data.session?.task && typeof data.session.task === "object" ? data.session.task : null)
    );
    clearPersistedFocusTimer();
    resetFocusTimerInMemory();
    renderShell();
    const completionMessage = data.taskMarkedCompleted
      ? "Focus session saved and task completed."
      : automatic
        ? "Focus session complete. Take a proper break."
        : "Focus session saved.";
    showToast(completionMessage);
  } catch (error) {
    if (currentUserId() === sessionUserId) {
      state.timer.completing = false;
      state.timer.completionPending = true;
      persistFocusTimer();
      renderShell();
    }
    showToast(error.message, "error");
  }
};

const cancelFocusSession = async () => {
  if (
    !state.timer.serverSessionId
    || state.timer.completing
    || state.timer.cancelling
    || !window.confirm("Cancel this focus session? Its elapsed time will not count toward today’s total.")
  ) return;

  const sessionUserId = currentUserId();
  const serverSessionId = state.timer.serverSessionId;
  state.timer.focusedSeconds = effectiveFocusedSeconds();
  state.timer.running = false;
  state.timer.runningSince = null;
  state.timer.cancelling = true;
  clearTimerInterval();
  persistFocusTimer();
  renderShell();

  try {
    const data = await api(`/focus-sessions/${serverSessionId}/cancel`, { method: "PATCH" });
    if (currentUserId() !== sessionUserId) return;

    upsertFocusSession(data.session);
    clearPersistedFocusTimer();
    resetFocusTimerInMemory();
    renderShell();
    showToast("Focus session cancelled.");
  } catch (error) {
    if (currentUserId() === sessionUserId) {
      state.timer.cancelling = false;
      persistFocusTimer();
      renderShell();
    }
    showToast(error.message, "error");
  }
};

const reconcileRestoredFocusTimer = () => {
  if (!state.timer.clientSessionId) return;
  if (!state.timer.serverSessionId) {
    void startFocusSession();
    return;
  }
  if (state.timer.completionPending || effectiveFocusedSeconds() >= state.timer.totalSeconds) {
    if (effectiveFocusedSeconds() >= state.timer.totalSeconds) {
      state.timer.focusedSeconds = state.timer.totalSeconds;
      state.timer.running = false;
      state.timer.runningSince = null;
      state.timer.completionPending = true;
      persistFocusTimer();
      renderShell();
    }
    void completeFocusSession({ automatic: true });
    return;
  }
  if (state.timer.running) startTimerInterval();
};

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;

  if (action === "auth-mode") {
    if (state.authMode === "reset" && target.dataset.mode !== "reset") clearResetTokenFromAddress();
    state.authMode = target.dataset.mode;
    state.authNotice = "";
    state.authDeliveryConfigured = null;
    renderAuth();
  }
  if (action === "navigate") {
    state.view = target.dataset.view;
    state.sidebarOpen = false;
    renderShell();
  }
  if (action === "menu") {
    state.sidebarOpen = !state.sidebarOpen;
    renderShell();
  }
  if (action === "logout") {
    resetClientSession();
    renderAuth();
  }
  if (action === "new-task") openTaskModal();
  if (action === "new-subject") openSubjectModal();
  if (action === "new-topic") openTopicModal();
  if (action === "new-exam") openExamModal();
  if (action === "close-modal") closeModal();
  if (action === "filter") {
    state.taskFilter = target.dataset.filter;
    renderShell();
  }
  if (action === "edit-task") {
    const task = state.tasks.find((item) => item._id === target.dataset.id);
    if (task) openTaskModal(task);
  }
  if (action === "edit-subject") {
    const subject = state.subjects.find((item) => item._id === target.dataset.id && !item.isArchived);
    if (subject) openSubjectModal(subject);
  }
  if (action === "edit-topic") {
    const topic = state.topics.find((item) => item._id === target.dataset.id && !item.isArchived);
    if (topic) openTopicModal(topic);
  }
  if (action === "edit-exam") {
    const exam = state.exams.find((item) => item._id === target.dataset.id);
    if (exam) openExamModal(exam);
  }
  if (action === "toggle-task") {
    const task = state.tasks.find((item) => item._id === target.dataset.id);
    if (!task) return;
    try {
      const data = await api(`/tasks/${task._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
      });
      const index = state.tasks.findIndex((item) => item._id === task._id);
      state.tasks[index] = data.task;
      renderShell();
      showToast(data.task.status === "completed" ? "Nice work — task completed." : "Task moved back to your queue.");
    } catch (error) { showToast(error.message, "error"); }
  }
  if (action === "delete-task") {
    const task = state.tasks.find((item) => item._id === target.dataset.id);
    if (!task || !window.confirm(`Delete “${task.title}”?`)) return;
    try {
      await api(`/tasks/${task._id}`, { method: "DELETE" });
      state.tasks = state.tasks.filter((item) => item._id !== task._id);
      renderShell();
      showToast("Task deleted.");
    } catch (error) { showToast(error.message, "error"); }
  }
  if (action === "archive-subject") {
    const subject = state.subjects.find((item) => item._id === target.dataset.id);
    if (!subject || !window.confirm(`Archive “${subject.name}”? Its existing tasks will remain.`)) return;
    setLoading(target, true, "Archiving…");
    try {
      await api(`/subjects/${subject._id}`, { method: "DELETE" });
      state.subjects = state.subjects.map((item) => (
        item._id === subject._id ? { ...item, isArchived: true } : item
      ));
      renderShell();
      showToast("Subject archived.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "restore-subject") {
    const subject = state.subjects.find((item) => item._id === target.dataset.id && item.isArchived);
    if (!subject) return;
    setLoading(target, true, "Restoring…");
    try {
      const data = await api(`/subjects/${subject._id}/restore`, { method: "POST" });
      state.subjects = state.subjects.map((item) => (
        item._id === subject._id ? { ...item, ...(data.subject || {}), isArchived: false } : item
      ));
      renderShell();
      showToast("Subject restored.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "archive-topic") {
    const topic = state.topics.find((item) => item._id === target.dataset.id && !item.isArchived);
    if (!topic || !window.confirm(`Archive “${topic.name}”? Its review history will stay intact.`)) return;
    setLoading(target, true, "Archiving…");
    try {
      const data = await api(`/topics/${topic._id}`, { method: "DELETE" });
      state.topics = state.topics.map((item) => item._id === topic._id
        ? { ...item, ...(data.topic || {}), isArchived: true }
        : item);
      renderShell();
      showToast("Topic archived.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "restore-topic") {
    const topic = state.topics.find((item) => item._id === target.dataset.id && item.isArchived);
    if (!topic) return;
    setLoading(target, true, "Restoring…");
    try {
      const data = await api(`/topics/${topic._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isArchived: false }),
      });
      state.topics = state.topics.map((item) => item._id === topic._id
        ? { ...item, ...(data.topic || {}), isArchived: false }
        : item);
      renderShell();
      showToast("Topic restored.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "review-topic") {
    const topic = state.topics.find((item) => item._id === target.dataset.id && !item.isArchived);
    const performance = target.dataset.performance;
    if (!topic || !["poor", "fair", "good"].includes(performance)) return;
    setLoading(target, true, "Saving…");
    try {
      const data = await api(`/topics/${topic._id}/review`, {
        method: "POST",
        body: JSON.stringify({ performance }),
      });
      state.topics = state.topics.map((item) => item._id === topic._id
        ? { ...item, ...data.topic }
        : item);
      renderShell();
      showToast(data.revision?.reason || `Review saved as ${performance}.`);
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "toggle-exam") {
    const exam = state.exams.find((item) => item._id === target.dataset.id);
    if (!exam) return;
    setLoading(target, true, "Saving…");
    try {
      const data = await api(`/exams/${exam._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isCompleted: !exam.isCompleted }),
      });
      state.exams = state.exams.map((item) => item._id === exam._id ? data.exam : item);
      renderShell();
      showToast(data.exam.isCompleted ? "Exam marked complete." : "Exam returned to upcoming.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "delete-exam") {
    const exam = state.exams.find((item) => item._id === target.dataset.id);
    if (!exam || !window.confirm(`Delete “${exam.name}”?`)) return;
    setLoading(target, true, "Deleting…");
    try {
      await api(`/exams/${exam._id}`, { method: "DELETE" });
      state.exams = state.exams.filter((item) => item._id !== exam._id);
      renderShell();
      showToast("Exam deleted.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "generate-plan") {
    if (!state.checkIn) {
      showToast("Save today’s check-in before generating a plan.", "error");
      return;
    }
    const recoveryMode = target.dataset.recovery === "true";
    if (state.dailyPlan && !window.confirm(`Regenerate today’s plan in ${recoveryMode ? "Recovery" : "Normal"} Mode? Unsaved adjustments will be replaced.`)) return;
    setLoading(target, true, "Generating…");
    try {
      const data = await api("/plans/daily/generate", {
        method: "POST",
        body: JSON.stringify({ date: localDateKey(), recoveryMode }),
      });
      state.dailyPlan = data.plan;
      state.recoverySuggested = Boolean(data.plan?.recoverySuggested ?? state.recoverySuggested);
      resetPlanDraft(data.plan);
      renderShell();
      showToast(recoveryMode ? "Recovery Mode plan ready." : "Normal plan ready.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "move-plan-block") {
    const index = state.planDraft.findIndex((block) => block.clientId === target.dataset.id);
    const nextIndex = target.dataset.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.planDraft.length) return;
    [state.planDraft[index], state.planDraft[nextIndex]] = [state.planDraft[nextIndex], state.planDraft[index]];
    state.planDirty = true;
    renderShell();
  }
  if (action === "remove-plan-block") {
    const length = state.planDraft.length;
    state.planDraft = state.planDraft.filter((block) => block.clientId !== target.dataset.id);
    if (state.planDraft.length !== length) state.planDirty = true;
    renderShell();
  }
  if (action === "save-plan") {
    if (!state.dailyPlan || !state.planDirty) return;
    const budget = Number(state.checkIn?.availableMinutes || state.dailyPlan.availableMinutes || 0);
    if (planMinutesUsed() > budget) {
      showToast("Reduce the plan to today’s available-minute budget before saving.", "error");
      return;
    }
    setLoading(target, true, "Saving…");
    const blocks = state.planDraft.map((block) => ({
      ...(block._id ? { id: block._id } : { kind: block.kind }),
      title: block.title,
      durationMinutes: Number(block.durationMinutes),
      status: block.status,
    }));
    try {
      const data = await api(`/plans/daily/${state.dailyPlan._id}`, {
        method: "PATCH",
        body: JSON.stringify({ blocks }),
      });
      state.dailyPlan = data.plan;
      resetPlanDraft(data.plan);
      renderShell();
      showToast("Plan adjustments saved.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(target, false);
    }
  }
  if (action === "focus-duration-preset" && !state.timer.clientSessionId) {
    const minutes = Number(target.dataset.minutes);
    if (Number.isInteger(minutes) && minutes >= 10 && minutes <= 600) {
      state.timer.plannedMinutes = minutes;
      state.timer.totalSeconds = minutes * 60;
      state.timer.focusedSeconds = 0;
      renderShell();
    }
  }
  if (action === "focus-start") void startFocusSession();
  if (action === "focus-pause") pauseFocusTimer();
  if (action === "focus-resume") resumeFocusTimer();
  if (action === "focus-finish") void completeFocusSession();
  if (action === "focus-cancel") void cancelFocusSession();
});

app.addEventListener("change", async (event) => {
  const { action } = event.target.dataset;

  if (action === "plan-duration") {
    const block = state.planDraft.find((item) => item.clientId === event.target.dataset.id);
    const minutes = Number(event.target.value);
    const max = state.dailyPlan?.mode === "recovery" && block?.kind !== "break" ? 15 : 120;
    if (!block || !Number.isInteger(minutes) || minutes < 1 || minutes > max) {
      event.target.value = block?.durationMinutes || 1;
      showToast(`Block length must be between 1 and ${max} minutes.`, "error");
      return;
    }
    block.durationMinutes = minutes;
    state.planDirty = true;
    renderShell();
    return;
  }

  if (action === "plan-status") {
    const block = state.planDraft.find((item) => item.clientId === event.target.dataset.id);
    if (!block || !["planned", "completed", "skipped"].includes(event.target.value)) return;
    block.status = event.target.value;
    state.planDirty = true;
    renderShell();
    return;
  }

  if (action === "manual-kind") {
    const duration = document.querySelector("#manual-duration");
    if (duration) duration.max = state.dailyPlan?.mode === "recovery" && event.target.value === "focus" ? "15" : "120";
    return;
  }

  if (action === "focus-task" && !state.timer.clientSessionId) {
    const task = state.tasks.find((item) => item._id === event.target.value);
    state.timer.selectedTaskId = task?._id || "";
    state.timer.selectedSubjectId = task ? subjectIdFor(task) : "";
    if (!task) state.timer.markTaskCompleted = false;
    renderShell();
    return;
  }

  if (action === "focus-duration" && !state.timer.clientSessionId) {
    const minutes = Number(event.target.value);
    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 600) {
      event.target.value = state.timer.plannedMinutes;
      showToast("Session length must be between 10 and 600 minutes.", "error");
      return;
    }
    state.timer.plannedMinutes = minutes;
    state.timer.totalSeconds = minutes * 60;
    state.timer.focusedSeconds = 0;
    renderShell();
    return;
  }

  if (action === "focus-mark-complete") {
    state.timer.markTaskCompleted = Boolean(event.target.checked && state.timer.selectedTaskId);
    if (state.timer.clientSessionId) persistFocusTimer();
    return;
  }

  const control = event.target.closest('[data-action="set-task-status"]');
  if (!control) return;

  const task = state.tasks.find((item) => item._id === control.dataset.id);
  const nextStatus = control.value;
  if (!task || !taskStatuses.some(([status]) => status === nextStatus) || task.status === nextStatus) return;

  const previousStatus = task.status;
  control.disabled = true;
  try {
    const data = await api(`/tasks/${task._id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    const index = state.tasks.findIndex((item) => item._id === task._id);
    state.tasks[index] = data.task;
    renderShell();
    showToast(`Task moved to ${taskStatusLabel(data.task.status).toLowerCase()}.`);
  } catch (error) {
    control.value = previousStatus;
    control.disabled = false;
    showToast(error.message, "error");
  }
});

modalRoot.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "close-modal" || (target.dataset.action === "modal-backdrop" && event.target === target)) closeModal();
  if (target.dataset.action === "pick-color") {
    modalRoot.querySelectorAll(".color-option").forEach((option) => option.classList.remove("active"));
    target.classList.add("active");
    modalRoot.querySelector('input[name="color"]').value = target.dataset.color;
  }
});

modalRoot.addEventListener("change", (event) => {
  if (event.target.dataset.action !== "exam-subject") return;
  const options = modalRoot.querySelector("#exam-syllabus-options");
  if (options) options.innerHTML = renderExamSyllabusOptions(event.target.value, new Set());
});

app.addEventListener("input", (event) => {
  if (event.target.id !== "task-search") return;
  state.search = event.target.value;
  if (state.view === "tasks") {
    const content = document.querySelector("#page-content");
    if (content) content.innerHTML = renderTasks();
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button[type="submit"]');

  if (form.id === "auth-form") {
    const values = Object.fromEntries(new FormData(form));
    const registering = state.authMode === "register";
    setLoading(submit, true);
    try {
      const data = await api(`/auth/${registering ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      saveAuth(data);
      const loaded = await loadData();
      if (loaded) showToast(registering ? "Welcome to StudyReset." : "Welcome back.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "forgot-form") {
    const { email } = Object.fromEntries(new FormData(form));
    setLoading(submit, true, "Requesting…");
    try {
      const data = await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      state.authNotice = "If an account matches that email, reset instructions have been requested.";
      state.authDeliveryConfigured = data.deliveryConfigured !== false;
      renderAuth();
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "reset-form") {
    const values = Object.fromEntries(new FormData(form));
    if (!resetTokenFromUrl) {
      showToast("This reset link is missing or invalid. Request a new one.", "error");
      return;
    }
    if (values.password !== values.confirmPassword) {
      showToast("The two passwords do not match.", "error");
      return;
    }
    setLoading(submit, true, "Saving…");
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetTokenFromUrl, ...values }),
      });
      clearResetTokenFromAddress();
      resetClientSession();
      state.authNotice = "Your password has been reset. Log in with your new password.";
      renderAuth();
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "subject-form") {
    const values = Object.fromEntries(new FormData(form));
    const id = form.dataset.id;
    setLoading(submit, true, id ? "Saving…" : "Creating…");
    try {
      const data = await api(id ? `/subjects/${id}` : "/subjects", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      if (id) {
        state.subjects = state.subjects.map((subject) => (
          subject._id === id ? { ...subject, ...data.subject } : subject
        ));
      } else {
        state.subjects.unshift(data.subject);
      }
      closeModal();
      renderShell();
      showToast(id ? "Subject updated." : "Subject created.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "task-form") {
    const values = Object.fromEntries(new FormData(form));
    values.estimatedMinutes = Number(values.estimatedMinutes);
    values.dueDate = values.dueDate || null;
    const id = form.dataset.id;
    if (id && values.status === form.dataset.originalStatus) delete values.status;
    setLoading(submit, true, id ? "Saving…" : "Adding…");
    try {
      const data = await api(id ? `/tasks/${id}` : "/tasks", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      if (id) {
        const index = state.tasks.findIndex((task) => task._id === id);
        state.tasks[index] = data.task;
      } else {
        state.tasks.unshift(data.task);
      }
      closeModal();
      renderShell();
      showToast(id ? "Task updated." : "Task added to your queue.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "topic-form") {
    const values = Object.fromEntries(new FormData(form));
    values.confidence = Number(values.confidence);
    const id = form.dataset.id;
    setLoading(submit, true, id ? "Saving…" : "Adding…");
    try {
      const data = await api(id ? `/topics/${id}` : "/topics", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      if (id) state.topics = state.topics.map((topic) => topic._id === id ? data.topic : topic);
      else state.topics.unshift(data.topic);
      closeModal();
      renderShell();
      showToast(id ? "Topic updated." : "Topic added to your revision queue.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "exam-form") {
    const formData = new FormData(form);
    const values = Object.fromEntries(formData);
    values.syllabusTopics = formData.getAll("syllabusTopics");
    const id = form.dataset.id;
    setLoading(submit, true, id ? "Saving…" : "Adding…");
    try {
      const data = await api(id ? `/exams/${id}` : "/exams", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      if (id) state.exams = state.exams.map((exam) => exam._id === id ? data.exam : exam);
      else state.exams.unshift(data.exam);
      closeModal();
      renderShell();
      showToast(id ? "Exam updated." : "Exam added.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "checkin-form") {
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      date: localDateKey(),
      mood: values.mood,
      energyLevel: Number(values.energyLevel),
      availableMinutes: Number(values.availableMinutes),
      note: values.note || "",
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    };
    setLoading(submit, true, "Saving…");
    try {
      const data = await api("/check-ins", { method: "POST", body: JSON.stringify(payload) });
      const planData = await api(`/plans/daily?date=${encodeURIComponent(payload.date)}`);
      state.checkIn = data.checkIn || planData.checkIn;
      state.dailyPlan = planData.plan || state.dailyPlan;
      state.recoverySuggested = Boolean(planData.recoverySuggested);
      resetPlanDraft(state.dailyPlan);
      renderShell();
      showToast("Today’s check-in is saved.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(submit, false);
    }
  }

  if (form.id === "manual-block-form") {
    const values = Object.fromEntries(new FormData(form));
    const durationMinutes = Number(values.durationMinutes);
    const kind = values.kind === "break" ? "break" : "focus";
    const recoveryFocusCount = state.planDraft.filter((block) => block.kind !== "break").length;
    const budget = Number(state.checkIn?.availableMinutes || state.dailyPlan?.availableMinutes || 0);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
      showToast("Block length must be between 1 and 120 minutes.", "error");
      return;
    }
    if (state.dailyPlan?.mode === "recovery" && kind === "focus" && (durationMinutes > 15 || recoveryFocusCount >= 2)) {
      showToast("Recovery Mode allows at most two focus blocks of up to 15 minutes each.", "error");
      return;
    }
    if (planMinutesUsed() + durationMinutes > budget) {
      showToast("That block would exceed today’s available-minute budget.", "error");
      return;
    }
    state.planDraft.push({
      _id: "",
      clientId: createDraftId(),
      title: values.title.trim(),
      durationMinutes,
      status: "planned",
      kind,
      reason: "Added manually",
      sourceType: "manual",
      clientOnly: true,
    });
    state.planDirty = true;
    renderShell();
    showToast("Block added. Save adjustments when you’re ready.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

if (resetTokenFromUrl) {
  renderAuth();
} else if (state.token) {
  app.innerHTML = `<div class="loading-screen"><div class="brand"><span class="brand-mark">↗</span> StudyReset</div></div>`;
  loadData();
} else {
  renderAuth();
}
