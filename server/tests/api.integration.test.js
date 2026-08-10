import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app.js";
import User from "../models/User.js";
import {
  clearMemoryDatabase,
  startMemoryDatabase,
  stopMemoryDatabase,
} from "./helpers/memoryDatabase.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "studyreset-integration-test-secret-at-least-32-characters";
delete process.env.CLIENT_ORIGIN;

let app;
let sequence = 0;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const dateKeyFromNow = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const register = async (label = "student") => {
  sequence += 1;
  const credentials = {
    name: `${label} ${sequence}`,
    email: `${label}-${sequence}@example.test`,
    password: "Passphrase123!",
  };
  const response = await request(app).post("/api/auth/register").send(credentials);
  assert.equal(response.status, 201, response.text);
  return { ...credentials, ...response.body };
};

const createSubject = async (token, name = "Mathematics") => {
  const response = await request(app)
    .post("/api/subjects")
    .set(bearer(token))
    .send({ name, description: `${name} notes`, color: "#123456" });
  assert.equal(response.status, 201, response.text);
  return response.body.subject;
};

const createTask = async (token, subject, overrides = {}) => {
  const response = await request(app)
    .post("/api/tasks")
    .set(bearer(token))
    .send({
      subject,
      title: "Solve practice set",
      estimatedMinutes: 25,
      priority: "high",
      ...overrides,
    });
  assert.equal(response.status, 201, response.text);
  return response.body.task;
};

before(async () => {
  await startMemoryDatabase();
  app = createApp();
});

beforeEach(async () => {
  await clearMemoryDatabase();
});

after(async () => {
  await stopMemoryDatabase();
});

test("registration, login, and password reset use a single-use token and revoke old sessions", async () => {
  const registered = await register("auth");
  assert.ok(registered.token);
  assert.equal(registered.user.email, registered.email);

  const duplicate = await request(app).post("/api/auth/register").send({
    name: "Duplicate",
    email: registered.email.toUpperCase(),
    password: registered.password,
  });
  assert.equal(duplicate.status, 409);

  const login = await request(app).post("/api/auth/login").send({
    email: registered.email,
    password: registered.password,
  });
  assert.equal(login.status, 200, login.text);
  assert.ok(login.body.token);

  const unknownRequest = await request(app).post("/api/auth/forgot-password").send({
    email: "missing@example.test",
  });
  assert.equal(unknownRequest.status, 202);
  assert.equal(unknownRequest.body.resetToken, undefined);

  const forgot = await request(app).post("/api/auth/forgot-password").send({
    email: registered.email,
  });
  assert.equal(forgot.status, 202, forgot.text);
  assert.equal(typeof forgot.body.resetToken, "string");
  assert.equal(forgot.body.deliveryConfigured, false);

  const storedUser = await User.findOne({ email: registered.email })
    .select("+resetPasswordTokenHash +resetPasswordExpiresAt");
  assert.ok(storedUser.resetPasswordTokenHash);
  assert.notEqual(storedUser.resetPasswordTokenHash, forgot.body.resetToken);
  assert.ok(storedUser.resetPasswordExpiresAt > new Date());

  const mismatch = await request(app).post("/api/auth/reset-password").send({
    token: forgot.body.resetToken,
    password: "NewPassphrase456!",
    confirmPassword: "different",
  });
  assert.equal(mismatch.status, 400);

  const reset = await request(app).post("/api/auth/reset-password").send({
    token: forgot.body.resetToken,
    password: "NewPassphrase456!",
    confirmPassword: "NewPassphrase456!",
  });
  assert.equal(reset.status, 200, reset.text);

  const reused = await request(app).post("/api/auth/reset-password").send({
    token: forgot.body.resetToken,
    password: "AnotherPassphrase789!",
    confirmPassword: "AnotherPassphrase789!",
  });
  assert.equal(reused.status, 400);

  const oldSession = await request(app)
    .get("/api/auth/me")
    .set(bearer(registered.token));
  assert.equal(oldSession.status, 401);

  const oldPassword = await request(app).post("/api/auth/login").send({
    email: registered.email,
    password: registered.password,
  });
  assert.equal(oldPassword.status, 401);

  const newPassword = await request(app).post("/api/auth/login").send({
    email: registered.email,
    password: "NewPassphrase456!",
  });
  assert.equal(newPassword.status, 200, newPassword.text);

  const freshForgot = await request(app).post("/api/auth/forgot-password").send({
    email: registered.email,
  });
  assert.equal(freshForgot.status, 202, freshForgot.text);

  const concurrentResets = await Promise.all([
    request(app).post("/api/auth/reset-password").send({
      token: freshForgot.body.resetToken,
      password: "ConcurrentPasswordOne!",
      confirmPassword: "ConcurrentPasswordOne!",
    }),
    request(app).post("/api/auth/reset-password").send({
      token: freshForgot.body.resetToken,
      password: "ConcurrentPasswordTwo!",
      confirmPassword: "ConcurrentPasswordTwo!",
    }),
  ]);
  assert.deepEqual(
    concurrentResets.map((response) => response.status).sort(),
    [200, 400],
    "exactly one concurrent reset request should consume the token",
  );
});

test("all protected feature prefixes reject missing and invalid authentication", async () => {
  const paths = [
    "/api/auth/me",
    "/api/subjects",
    "/api/tasks",
    "/api/focus-sessions",
    "/api/topics",
    "/api/exams",
    "/api/check-ins",
    `/api/plans/daily?date=${dateKeyFromNow(0)}`,
  ];

  for (const path of paths) {
    const missing = await request(app).get(path);
    assert.equal(missing.status, 401, `${path}: ${missing.text}`);

    const invalid = await request(app)
      .get(path)
      .set(bearer("not-a-valid-token"));
    assert.equal(invalid.status, 401, `${path}: ${invalid.text}`);
  }
});

test("subject and task CRUD supports archive, restore, and every task status", async () => {
  const user = await register("crud");
  const subject = await createSubject(user.token, "Physics");

  const subjectList = await request(app).get("/api/subjects").set(bearer(user.token));
  assert.equal(subjectList.status, 200);
  assert.equal(subjectList.body.subjects.length, 1);

  const editedSubject = await request(app)
    .patch(`/api/subjects/${subject._id}`)
    .set(bearer(user.token))
    .send({ name: "Advanced Physics", color: "#654321" });
  assert.equal(editedSubject.status, 200, editedSubject.text);
  assert.equal(editedSubject.body.subject.name, "Advanced Physics");

  const task = await createTask(user.token, subject._id, {
    title: "Review mechanics",
    dueDate: dateKeyFromNow(1),
  });
  assert.equal(task.status, "pending");

  const inProgress = await request(app)
    .patch(`/api/tasks/${task._id}`)
    .set(bearer(user.token))
    .send({ status: "in-progress", estimatedMinutes: 40 });
  assert.equal(inProgress.status, 200, inProgress.text);
  assert.equal(inProgress.body.task.status, "in-progress");
  assert.equal(inProgress.body.task.estimatedMinutes, 40);

  const completed = await request(app)
    .patch(`/api/tasks/${task._id}`)
    .set(bearer(user.token))
    .send({ status: "completed" });
  assert.equal(completed.status, 200, completed.text);
  assert.ok(completed.body.task.completedAt);

  const reopened = await request(app)
    .patch(`/api/tasks/${task._id}`)
    .set(bearer(user.token))
    .send({ status: "pending", title: "Review all mechanics" });
  assert.equal(reopened.status, 200, reopened.text);
  assert.equal(reopened.body.task.completedAt, null);

  const archived = await request(app)
    .delete(`/api/subjects/${subject._id}`)
    .set(bearer(user.token));
  assert.equal(archived.status, 200, archived.text);
  assert.equal(archived.body.subject.isArchived, true);

  const activeSubjects = await request(app).get("/api/subjects").set(bearer(user.token));
  assert.equal(activeSubjects.body.subjects.length, 0);

  const allSubjects = await request(app)
    .get("/api/subjects?includeArchived=true")
    .set(bearer(user.token));
  assert.equal(allSubjects.body.subjects.length, 1);

  const restored = await request(app)
    .post(`/api/subjects/${subject._id}/restore`)
    .set(bearer(user.token));
  assert.equal(restored.status, 200, restored.text);
  assert.equal(restored.body.subject.isArchived, false);

  const tasks = await request(app).get("/api/tasks").set(bearer(user.token));
  assert.equal(tasks.status, 200);
  assert.equal(tasks.body.tasks.length, 1);

  const deleted = await request(app)
    .delete(`/api/tasks/${task._id}`)
    .set(bearer(user.token));
  assert.equal(deleted.status, 200, deleted.text);

  const emptyTasks = await request(app).get("/api/tasks").set(bearer(user.token));
  assert.equal(emptyTasks.body.tasks.length, 0);
});

test("focus sessions persist idempotently and completion can finish the linked task", async () => {
  const user = await register("focus");
  const subject = await createSubject(user.token, "Chemistry");
  const task = await createTask(user.token, subject._id, { title: "Balance equations" });
  const payload = {
    subject: subject._id,
    task: task._id,
    clientSessionId: "focus-api-session-0001",
    plannedMinutes: 25,
  };

  const created = await request(app)
    .post("/api/focus-sessions")
    .set(bearer(user.token))
    .send(payload);
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.created, true);
  assert.equal(created.body.session.status, "active");

  const repeatedCreate = await request(app)
    .post("/api/focus-sessions")
    .set(bearer(user.token))
    .send(payload);
  assert.equal(repeatedCreate.status, 200, repeatedCreate.text);
  assert.equal(repeatedCreate.body.created, false);
  assert.equal(repeatedCreate.body.session._id, created.body.session._id);

  const completed = await request(app)
    .patch(`/api/focus-sessions/${created.body.session._id}/complete`)
    .set(bearer(user.token))
    .send({ actualFocusedMinutes: 18, markTaskCompleted: true });
  assert.equal(completed.status, 200, completed.text);
  assert.equal(completed.body.alreadyCompleted, false);
  assert.equal(completed.body.taskMarkedCompleted, true);
  assert.equal(completed.body.session.actualFocusedMinutes, 18);

  const repeatedCompletion = await request(app)
    .patch(`/api/focus-sessions/${created.body.session._id}/complete`)
    .set(bearer(user.token))
    .send({ actualFocusedMinutes: 99, markTaskCompleted: true });
  assert.equal(repeatedCompletion.status, 200, repeatedCompletion.text);
  assert.equal(repeatedCompletion.body.alreadyCompleted, true);
  assert.equal(repeatedCompletion.body.session.actualFocusedMinutes, 18);

  const sessions = await request(app)
    .get("/api/focus-sessions")
    .set(bearer(user.token));
  assert.equal(sessions.status, 200);
  assert.equal(sessions.body.sessions.length, 1);
  assert.equal(sessions.body.sessions[0].status, "completed");

  const tasks = await request(app).get("/api/tasks").set(bearer(user.token));
  assert.equal(tasks.body.tasks[0].status, "completed");
});

test("topics revise on the explainable schedule and exams retain an owned syllabus", async () => {
  const user = await register("revision");
  const subject = await createSubject(user.token, "Biology");

  const createdTopic = await request(app)
    .post("/api/topics")
    .set(bearer(user.token))
    .send({
      subject: subject._id,
      name: "Cell division",
      description: "Mitosis and meiosis",
      confidence: 3,
    });
  assert.equal(createdTopic.status, 201, createdTopic.text);
  assert.equal(createdTopic.body.topic.revisionStep, 0);
  assert.ok(createdTopic.body.topic.nextReviewAt);

  const reviewed = await request(app)
    .post(`/api/topics/${createdTopic.body.topic._id}/review`)
    .set(bearer(user.token))
    .send({ performance: "good" });
  assert.equal(reviewed.status, 200, reviewed.text);
  assert.equal(reviewed.body.topic.revisionStep, 1);
  assert.equal(reviewed.body.topic.confidence, 4);
  assert.equal(reviewed.body.revision.intervalDays, 3);
  assert.match(reviewed.body.revision.reason, /advances/i);

  const examDate = dateKeyFromNow(30);
  const createdExam = await request(app)
    .post("/api/exams")
    .set(bearer(user.token))
    .send({
      subject: subject._id,
      name: "Biology final",
      examDate,
      importance: "high",
      syllabusTopics: [createdTopic.body.topic._id],
    });
  assert.equal(createdExam.status, 201, createdExam.text);
  assert.equal(createdExam.body.exam.syllabusTopics.length, 1);

  const invalidDate = await request(app)
    .patch(`/api/exams/${createdExam.body.exam._id}`)
    .set(bearer(user.token))
    .send({ examDate: "2026-02-30" });
  assert.equal(invalidDate.status, 400);

  const completedExam = await request(app)
    .patch(`/api/exams/${createdExam.body.exam._id}`)
    .set(bearer(user.token))
    .send({ isCompleted: true, description: "All chapters" });
  assert.equal(completedExam.status, 200, completedExam.text);
  assert.equal(completedExam.body.exam.isCompleted, true);
  assert.ok(completedExam.body.exam.completedAt);

  const archivedTopic = await request(app)
    .delete(`/api/topics/${createdTopic.body.topic._id}`)
    .set(bearer(user.token));
  assert.equal(archivedTopic.status, 200, archivedTopic.text);

  const archivedList = await request(app)
    .get("/api/topics?includeArchived=true")
    .set(bearer(user.token));
  assert.equal(archivedList.body.topics.length, 1);
  assert.equal(archivedList.body.topics[0].isArchived, true);

  const exams = await request(app).get("/api/exams").set(bearer(user.token));
  assert.equal(exams.body.exams.length, 1);
  assert.equal(exams.body.exams[0].syllabusTopics.length, 1);

  const deletedExam = await request(app)
    .delete(`/api/exams/${createdExam.body.exam._id}`)
    .set(bearer(user.token));
  assert.equal(deletedExam.status, 200, deletedExam.text);
});

test("all user-owned resources are isolated from a second authenticated user", async () => {
  const owner = await register("owner");
  const outsider = await register("outsider");
  const subject = await createSubject(owner.token, "Private subject");
  const task = await createTask(owner.token, subject._id, { title: "Private task" });

  const session = await request(app)
    .post("/api/focus-sessions")
    .set(bearer(owner.token))
    .send({
      subject: subject._id,
      task: task._id,
      clientSessionId: "owner-focus-session-1",
      plannedMinutes: 25,
    });
  assert.equal(session.status, 201, session.text);

  const topic = await request(app)
    .post("/api/topics")
    .set(bearer(owner.token))
    .send({ subject: subject._id, name: "Private topic", confidence: 2 });
  assert.equal(topic.status, 201, topic.text);

  const exam = await request(app)
    .post("/api/exams")
    .set(bearer(owner.token))
    .send({
      subject: subject._id,
      name: "Private exam",
      examDate: dateKeyFromNow(10),
      syllabusTopics: [topic.body.topic._id],
    });
  assert.equal(exam.status, 201, exam.text);

  const date = dateKeyFromNow(0);
  const checkIn = await request(app)
    .post("/api/check-ins")
    .set(bearer(owner.token))
    .send({ date, mood: "good", energyLevel: 4, availableMinutes: 60 });
  assert.equal(checkIn.status, 200, checkIn.text);
  const plan = await request(app)
    .post("/api/plans/daily/generate")
    .set(bearer(owner.token))
    .send({ date, recoveryMode: false });
  assert.equal(plan.status, 200, plan.text);

  const forbiddenMutations = [
    request(app).patch(`/api/subjects/${subject._id}`).set(bearer(outsider.token)).send({ name: "Stolen" }),
    request(app).delete(`/api/tasks/${task._id}`).set(bearer(outsider.token)),
    request(app).patch(`/api/focus-sessions/${session.body.session._id}/complete`).set(bearer(outsider.token)).send({ actualFocusedMinutes: 10 }),
    request(app).post(`/api/topics/${topic.body.topic._id}/review`).set(bearer(outsider.token)).send({ performance: "good" }),
    request(app).patch(`/api/exams/${exam.body.exam._id}`).set(bearer(outsider.token)).send({ isCompleted: true }),
    request(app).patch(`/api/plans/daily/${plan.body.plan._id}`).set(bearer(outsider.token)).send({ blocks: [] }),
  ];
  const results = await Promise.all(forbiddenMutations);
  results.forEach((response) => assert.equal(response.status, 404, response.text));

  const foreignCreates = await Promise.all([
    request(app).post("/api/tasks").set(bearer(outsider.token)).send({
      subject: subject._id,
      title: "Foreign task",
    }),
    request(app).post("/api/focus-sessions").set(bearer(outsider.token)).send({
      subject: subject._id,
      clientSessionId: "foreign-focus-session-1",
    }),
    request(app).post("/api/topics").set(bearer(outsider.token)).send({
      subject: subject._id,
      name: "Foreign topic",
    }),
    request(app).post("/api/exams").set(bearer(outsider.token)).send({
      subject: subject._id,
      name: "Foreign exam",
      examDate: dateKeyFromNow(12),
    }),
  ]);
  foreignCreates.forEach((response) => assert.equal(response.status, 404, response.text));

  const outsiderLists = await Promise.all([
    request(app).get("/api/subjects?includeArchived=true").set(bearer(outsider.token)),
    request(app).get("/api/tasks").set(bearer(outsider.token)),
    request(app).get("/api/focus-sessions").set(bearer(outsider.token)),
    request(app).get("/api/topics?includeArchived=true").set(bearer(outsider.token)),
    request(app).get("/api/exams").set(bearer(outsider.token)),
  ]);
  outsiderLists.forEach((response) => {
    assert.equal(response.status, 200, response.text);
    const collection = Object.values(response.body)[0];
    assert.equal(collection.length, 0);
  });

  const outsiderCheckIn = await request(app)
    .get(`/api/check-ins?date=${date}`)
    .set(bearer(outsider.token));
  assert.equal(outsiderCheckIn.status, 200);
  assert.equal(outsiderCheckIn.body.checkIn, null);

  const ownerTasks = await request(app).get("/api/tasks").set(bearer(owner.token));
  assert.equal(ownerTasks.body.tasks.length, 1);
  assert.equal(ownerTasks.body.tasks[0].title, "Private task");
});

test("check-in planning respects the time budget and Recovery Mode limits", async () => {
  const user = await register("planner");
  const subject = await createSubject(user.token, "Planning subject");
  const date = dateKeyFromNow(5);
  await createTask(user.token, subject._id, {
    title: "Overdue work",
    estimatedMinutes: 50,
    dueDate: dateKeyFromNow(4),
  });
  await createTask(user.token, subject._id, {
    title: "High-value work",
    estimatedMinutes: 50,
    priority: "high",
  });

  const checkIn = await request(app)
    .post("/api/check-ins")
    .set(bearer(user.token))
    .send({
      date,
      mood: "neutral",
      energyLevel: 4,
      availableMinutes: 60,
      timezoneOffsetMinutes: 0,
    });
  assert.equal(checkIn.status, 200, checkIn.text);

  const normalPlan = await request(app)
    .post("/api/plans/daily/generate")
    .set(bearer(user.token))
    .send({ date, recoveryMode: false });
  assert.equal(normalPlan.status, 200, normalPlan.text);
  assert.equal(normalPlan.body.plan.mode, "normal");
  const normalMinutes = normalPlan.body.plan.blocks
    .reduce((total, block) => total + block.durationMinutes, 0);
  assert.ok(normalMinutes <= 60);
  assert.ok(normalPlan.body.plan.blocks.some((block) => block.kind === "focus"));
  assert.ok(normalPlan.body.plan.blocks.some((block) => block.kind === "break"));
  assert.ok(normalPlan.body.plan.blocks.every((block) => block.reason));

  const overBudget = await request(app)
    .patch(`/api/plans/daily/${normalPlan.body.plan._id}`)
    .set(bearer(user.token))
    .send({ blocks: [{ title: "Too much work", durationMinutes: 61 }] });
  assert.equal(overBudget.status, 400);
  assert.match(overBudget.body.message, /cannot exceed/i);

  const lowEnergyCheckIn = await request(app)
    .post("/api/check-ins")
    .set(bearer(user.token))
    .send({
      date,
      mood: "low",
      energyLevel: 1,
      availableMinutes: 180,
      note: "Keep today small",
    });
  assert.equal(lowEnergyCheckIn.status, 200, lowEnergyCheckIn.text);

  const checkIns = await request(app)
    .get(`/api/check-ins?date=${date}`)
    .set(bearer(user.token));
  assert.equal(checkIns.status, 200);
  assert.equal(checkIns.body.checkIn.energyLevel, 1);

  const checkInHistory = await request(app)
    .get("/api/check-ins")
    .set(bearer(user.token));
  assert.equal(checkInHistory.status, 200);
  assert.equal(checkInHistory.body.checkIns.length, 1);

  const recoveryPlan = await request(app)
    .post("/api/plans/daily/generate")
    .set(bearer(user.token))
    .send({ date, recoveryMode: true });
  assert.equal(recoveryPlan.status, 200, recoveryPlan.text);
  assert.equal(recoveryPlan.body.plan.mode, "recovery");
  assert.equal(recoveryPlan.body.plan.recoverySuggested, true);
  const recoveryFocus = recoveryPlan.body.plan.blocks
    .filter((block) => block.kind === "focus");
  const recoveryMinutes = recoveryPlan.body.plan.blocks
    .reduce((total, block) => total + block.durationMinutes, 0);
  assert.ok(recoveryFocus.length <= 2);
  assert.ok(recoveryFocus.every((block) => block.durationMinutes >= 10 && block.durationMinutes <= 15));
  assert.ok(recoveryMinutes <= 35);
  assert.match(recoveryPlan.body.plan.explanation, /Normal Mode/);
  assert.doesNotMatch(recoveryPlan.body.plan.explanation, /failed|lazy|guilt/i);

  const retrieved = await request(app)
    .get(`/api/plans/daily?date=${date}`)
    .set(bearer(user.token));
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.body.recoverySuggested, true);
  assert.equal(retrieved.body.plan.mode, "recovery");
});

test("the health endpoint reflects the isolated database readiness", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.database, "connected");
});

test("the test database is isolated from any configured production URI", () => {
  assert.equal(mongoose.connection.name, "studyreset-test");
  assert.match(mongoose.connection.host, /127\.0\.0\.1|localhost/);
});
