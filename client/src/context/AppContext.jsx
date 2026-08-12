import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  localDateKey,
  isToday,
  focusHistoryRange,
} from "../utils/dateUtils.js";

const AppContext = createContext(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within an AppProvider");
  return context;
};

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
  starting: false,
  completing: false,
  cancelling: false,
});

const getResetTokenFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get("resetToken")?.trim() || "";
  } catch {
    return "";
  }
};

export const AppProvider = ({ children }) => {
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState(getResetTokenFromUrl);
  const [token, setToken] = useState(() => localStorage.getItem("studyreset_token"));
  const [user, setUser] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [topics, setTopics] = useState([]);
  const [exams, setExams] = useState([]);
  const [focusSessions, setFocusSessions] = useState([]);
  const [checkIn, setCheckIn] = useState(null);
  const [dailyPlan, setDailyPlan] = useState(null);
  const [recoverySuggested, setRecoverySuggested] = useState(false);
  const [planDraft, setPlanDraft] = useState([]);
  const [planDirty, setPlanDirty] = useState(false);
  const [view, setView] = useState("today");
  const [taskFilter, setTaskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [authMode, setAuthMode] = useState(() => (getResetTokenFromUrl() ? "reset" : "login"));
  const [authNotice, setAuthNotice] = useState("");
  const [authDeliveryConfigured, setAuthDeliveryConfigured] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [activeModal, setActiveModal] = useState(null); // 'task' | 'subject' | 'topic' | 'exam' | null
  const [modalData, setModalData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Focus Timer state
  const [timer, setTimer] = useState(createDefaultTimerState);
  const timerIntervalRef = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const currentUserId = useCallback(() => user?.id || user?._id || "", [user]);

  const timerStorageKey = useCallback(() => {
    const uid = currentUserId();
    return uid ? `studyreset_focus_timer:${uid}` : "";
  }, [currentUserId]);

  const clearResetTokenFromAddress = useCallback(() => {
    if (!resetTokenFromUrl) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("resetToken");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Ignore
    }
    setResetTokenFromUrl("");
  }, [resetTokenFromUrl]);

  const resetClientSession = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    localStorage.removeItem("studyreset_token");
    setToken(null);
    setUser(null);
    setSubjects([]);
    setTasks([]);
    setTopics([]);
    setExams([]);
    setFocusSessions([]);
    setCheckIn(null);
    setDailyPlan(null);
    setRecoverySuggested(false);
    setPlanDraft([]);
    setPlanDirty(false);
    setView("today");
    setTaskFilter("all");
    setSearch("");
    setAuthMode("login");
    setAuthNotice("");
    setAuthDeliveryConfigured(null);
    setSidebarOpen(false);
    setActiveModal(null);
    setModalData(null);
    setTimer(createDefaultTimerState());
  }, []);

  const api = useCallback(async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (options.body) headers["Content-Type"] = "application/json";
    const currentToken = localStorage.getItem("studyreset_token");
    if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

    const response = await fetch(`/api${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.message || "Something went wrong");
      error.status = response.status;
      const isAuthSubmission = path === "/auth/login" || path === "/auth/register";
      if (response.status === 401 && currentToken && !isAuthSubmission) {
        resetClientSession();
        error.message = "Your session expired. Please log in again.";
      }
      throw error;
    }

    return data;
  }, [resetClientSession]);

  const createDraftId = () => globalThis.crypto?.randomUUID?.()
    || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const resetPlanDraft = useCallback((plan = dailyPlan) => {
    const draft = Array.isArray(plan?.blocks) ? plan.blocks.map((block) => ({
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
    setPlanDraft(draft);
    setPlanDirty(false);
  }, [dailyPlan]);

  const effectiveFocusedSeconds = useCallback((tState = timer, now = Date.now()) => {
    const base = Math.max(0, Number(tState.focusedSeconds) || 0);
    if (!tState.running || !tState.runningSince) {
      return Math.min(tState.totalSeconds, base);
    }
    const elapsed = Math.max(0, Math.floor((now - Number(tState.runningSince)) / 1000));
    return Math.min(tState.totalSeconds, base + elapsed);
  }, [timer]);

  const remainingFocusSeconds = useCallback((tState = timer) => {
    return Math.max(0, tState.totalSeconds - effectiveFocusedSeconds(tState));
  }, [effectiveFocusedSeconds, timer]);

  const persistFocusTimer = useCallback((tState = timer) => {
    const key = timerStorageKey();
    if (!key || !tState.clientSessionId) return;
    const payload = {
      version: 1,
      userId: currentUserId(),
      serverSessionId: tState.serverSessionId,
      clientSessionId: tState.clientSessionId,
      plannedMinutes: tState.plannedMinutes,
      totalSeconds: tState.totalSeconds,
      focusedSeconds: tState.focusedSeconds,
      running: tState.running,
      runningSince: tState.runningSince,
      selectedTaskId: tState.selectedTaskId,
      selectedSubjectId: tState.selectedSubjectId,
      markTaskCompleted: tState.markTaskCompleted,
      completionPending: tState.completionPending,
    };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Storage error ignored
    }
  }, [currentUserId, timer, timerStorageKey]);

  const clearPersistedFocusTimer = useCallback(() => {
    const key = timerStorageKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage error ignored
    }
  }, [timerStorageKey]);

  const restorePersistedFocusTimer = useCallback((userId) => {
    const uid = userId || currentUserId();
    if (!uid) return null;
    const key = `studyreset_focus_timer:${uid}`;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
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
        || saved.userId !== uid
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

      const restoredState = {
        ...createDefaultTimerState(),
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
      };

      if (restoredState.running && !restoredState.runningSince) {
        throw new Error("Invalid running focus timer");
      }
      return restoredState;
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore
      }
      return null;
    }
  }, [currentUserId]);

  const upsertFocusSession = useCallback((session) => {
    const sessionId = session?._id || session?.id || "";
    if (!sessionId) return;
    setFocusSessions((prev) => {
      const existingIndex = prev.findIndex((item) => (item._id || item.id) === sessionId);
      let updated;
      if (existingIndex === -1) updated = [session, ...prev];
      else {
        updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...session };
      }
      return updated.sort((left, right) => (
        new Date(right.startedAt || right.createdAt || 0) - new Date(left.startedAt || left.createdAt || 0)
      ));
    });
  }, []);

  const replaceTaskFromResponse = useCallback((task) => {
    if (!task?._id) return;
    setTasks((prev) => prev.map((item) => item._id === task._id ? { ...item, ...task } : item));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { from, to } = focusHistoryRange();
      const todayKey = localDateKey();
      const [me, subjectsData, tasksData, focusSessionsData, topicsData, examsData, checkInData, planData] = await Promise.all([
        api("/auth/me"),
        api("/subjects?includeArchived=true"),
        api("/tasks"),
        api(`/focus-sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api("/topics?includeArchived=true"),
        api("/exams"),
        api(`/check-ins?date=${encodeURIComponent(todayKey)}`),
        api(`/plans/daily?date=${encodeURIComponent(todayKey)}`),
      ]);

      setUser(me.user);
      const loadedSubjects = Array.isArray(subjectsData.subjects) ? subjectsData.subjects : [];
      const loadedTasks = Array.isArray(tasksData.tasks) ? tasksData.tasks : [];
      const loadedSessions = Array.isArray(focusSessionsData.sessions) ? focusSessionsData.sessions : [];
      const loadedTopics = Array.isArray(topicsData.topics) ? topicsData.topics : [];
      const loadedExams = Array.isArray(examsData.exams) ? examsData.exams : [];
      const loadedCheckIn = checkInData.checkIn || planData.checkIn || null;
      const loadedPlan = planData.plan || null;

      setSubjects(loadedSubjects);
      setTasks(loadedTasks);
      setFocusSessions(loadedSessions);
      setTopics(loadedTopics);
      setExams(loadedExams);
      setCheckIn(loadedCheckIn);
      setDailyPlan(loadedPlan);
      setRecoverySuggested(Boolean(planData.recoverySuggested));

      const uid = me.user?.id || me.user?._id || "";
      let restoredTimer = restorePersistedFocusTimer(uid);
      if (restoredTimer) {
        const savedSession = loadedSessions.find((session) => (
          restoredTimer.serverSessionId
            ? (session._id || session.id) === restoredTimer.serverSessionId
            : session.clientSessionId === restoredTimer.clientSessionId
        ));
        if (savedSession && savedSession.status !== "active") {
          const key = `studyreset_focus_timer:${uid}`;
          try { localStorage.removeItem(key); } catch {}
          restoredTimer = createDefaultTimerState();
        } else if (savedSession && !restoredTimer.serverSessionId) {
          restoredTimer.serverSessionId = savedSession._id || savedSession.id;
          restoredTimer.running = true;
          restoredTimer.runningSince = Date.now();
          const key = `studyreset_focus_timer:${uid}`;
          try { localStorage.setItem(key, JSON.stringify({ ...restoredTimer, userId: uid, version: 1 })); } catch {}
        }
        setTimer(restoredTimer);
      } else {
        setTimer(createDefaultTimerState());
      }

      const draft = Array.isArray(loadedPlan?.blocks) ? loadedPlan.blocks.map((block) => ({
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
      setPlanDraft(draft);
      setPlanDirty(false);

      setLoading(false);
      return true;
    } catch (error) {
      setLoading(false);
      if (error.status === 401) {
        resetClientSession();
      }
      showToast(error.message, "error");
      return false;
    }
  }, [api, resetClientSession, restorePersistedFocusTimer, showToast]);


  useEffect(() => {
    if (token) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [token, loadData]);

  // Modals helpers
  const openTaskModal = useCallback((task = null) => {
    const activeSubs = subjects.filter((s) => !s.isArchived);
    if (!task && !activeSubs.length) {
      showToast("Create a subject before adding a task.", "error");
      setActiveModal("subject");
      setModalData(null);
      return;
    }
    setModalData(task);
    setActiveModal("task");
  }, [subjects, showToast]);

  const openSubjectModal = useCallback((subject = null) => {
    setModalData(subject);
    setActiveModal("subject");
  }, []);

  const openTopicModal = useCallback((topic = null) => {
    const activeSubs = subjects.filter((s) => !s.isArchived);
    if (!activeSubs.length) {
      showToast("Create an active subject before adding a topic.", "error");
      setActiveModal("subject");
      setModalData(null);
      return;
    }
    setModalData(topic);
    setActiveModal("topic");
  }, [subjects, showToast]);

  const openExamModal = useCallback((exam = null) => {
    const activeSubs = subjects.filter((s) => !s.isArchived);
    if (!activeSubs.length) {
      showToast("Create an active subject before adding an exam.", "error");
      setActiveModal("subject");
      setModalData(null);
      return;
    }
    setModalData(exam);
    setActiveModal("exam");
  }, [subjects, showToast]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setModalData(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        token,
        setToken,
        user,
        setUser,
        subjects,
        setSubjects,
        tasks,
        setTasks,
        topics,
        setTopics,
        exams,
        setExams,
        focusSessions,
        setFocusSessions,
        checkIn,
        setCheckIn,
        dailyPlan,
        setDailyPlan,
        recoverySuggested,
        setRecoverySuggested,
        planDraft,
        setPlanDraft,
        planDirty,
        setPlanDirty,
        resetPlanDraft,
        view,
        setView,
        taskFilter,
        setTaskFilter,
        search,
        setSearch,
        authMode,
        setAuthMode,
        authNotice,
        setAuthNotice,
        authDeliveryConfigured,
        setAuthDeliveryConfigured,
        resetTokenFromUrl,
        clearResetTokenFromAddress,
        sidebarOpen,
        setSidebarOpen,
        toasts,
        showToast,
        activeModal,
        modalData,
        openTaskModal,
        openSubjectModal,
        openTopicModal,
        openExamModal,
        closeModal,
        loading,
        resetClientSession,
        api,
        timer,
        setTimer,
        effectiveFocusedSeconds,
        remainingFocusSeconds,
        persistFocusTimer,
        clearPersistedFocusTimer,
        restorePersistedFocusTimer,
        upsertFocusSession,
        replaceTaskFromResponse,
        currentUserId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
