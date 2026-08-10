import { expect, test } from "@playwright/test";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `browser-student-${runId}@example.test`;
const password = "BrowserPassphrase123!";

test("a student can complete the essential persisted StudyReset flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Sign up" }).click();
  await page.getByLabel("Your name").fill("Browser Student");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await expect(page.getByRole("button", { name: "Subjects" })).toBeVisible();

  await page.getByRole("button", { name: "Subjects" }).click();
  await page.locator(".page-heading").getByRole("button", { name: "+ Add subject", exact: true }).click();
  await page.getByLabel("Subject name").fill("Mathematics");
  await page.getByLabel("Description").fill("Algebra and calculus");
  await page.getByRole("button", { name: "Create subject" }).click();

  let subjectCard = page.locator(".subject-card").filter({ hasText: "Mathematics" });
  await expect(subjectCard).toBeVisible();
  await subjectCard.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Subject name").fill("Advanced Mathematics");
  await page.getByRole("button", { name: "Save changes" }).click();

  subjectCard = page.locator(".subject-card").filter({ hasText: "Advanced Mathematics" });
  await expect(subjectCard).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await subjectCard.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Archived subjects" })).toBeVisible();

  const archivedCard = page.locator(".subject-card.archived").filter({ hasText: "Advanced Mathematics" });
  await expect(archivedCard).toBeVisible();
  await archivedCard.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator(".subject-card:not(.archived)").filter({ hasText: "Advanced Mathematics" })).toBeVisible();

  await page.getByRole("button", { name: "My tasks" }).click();
  await page.getByRole("button", { name: "+ Add study task" }).click();
  await page.getByLabel("Task title").fill("Practice algebra");
  await page.getByLabel("Estimated minutes").fill("25");
  await page.getByRole("dialog").getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByText("Practice algebra", { exact: true })).toBeVisible();

  await page.getByLabel("Status for Practice algebra").selectOption("in-progress");
  await expect(page.getByLabel("Status for Practice algebra")).toHaveValue("in-progress");

  await page.getByRole("button", { name: "Focus room" }).click();
  await page.getByLabel("Study task").selectOption({ label: "Practice algebra · Advanced Mathematics" });
  await page.getByRole("button", { name: "10m" }).click();
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByText("Focus in progress", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Focus room" })).toBeVisible();
  await page.getByRole("button", { name: "Focus room" }).click();
  await expect(page.getByText("Focus in progress", { exact: true })).toBeVisible();
  await expect(page.locator(".timer-task-name")).toHaveText("Practice algebra");

  await page.getByRole("button", { name: "Finish now" }).click();
  const historyItem = page.locator(".focus-history-item").filter({ hasText: "Practice algebra" });
  await expect(historyItem).toBeVisible();
  await expect(historyItem.getByText("completed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Daily plan" }).click();
  await page.getByLabel("How are you feeling?").selectOption("low");
  await page.getByLabel("Energy (1–5)").selectOption("1");
  await page.getByLabel("Available minutes").fill("60");
  await page.getByLabel(/Anything to account for/).fill("Keep the reset small and realistic");
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByRole("heading", { name: "Recovery Mode is available" })).toBeVisible();

  await page.getByRole("button", { name: "Generate Recovery Mode" }).click();
  await expect(page.locator(".mode-badge")).toHaveText("Recovery");
  await expect(page.getByText(/of 60 minutes planned/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate normal plan" })).toBeVisible();
  const focusBlocks = page.locator(".plan-block.focus-block");
  const focusBlockCount = await focusBlocks.count();
  expect(focusBlockCount).toBeGreaterThan(0);
  expect(focusBlockCount).toBeLessThanOrEqual(2);
  const durations = await page.locator(".plan-duration input").evaluateAll((inputs) => (
    inputs.map((input) => Number(input.value))
  ));
  expect(durations.every((minutes) => minutes <= 15)).toBe(true);
  expect(durations.reduce((total, minutes) => total + minutes, 0)).toBeLessThanOrEqual(35);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Log in to StudyReset" })).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in to StudyReset" }).click();
  await expect(page.getByRole("button", { name: "Subjects" })).toBeVisible();

  await page.getByRole("button", { name: "Subjects" }).click();
  await expect(page.locator(".subject-card").filter({ hasText: "Advanced Mathematics" })).toBeVisible();
  await page.getByRole("button", { name: "My tasks" }).click();
  await expect(page.getByLabel("Status for Practice algebra")).toHaveValue("in-progress");
  await page.getByRole("button", { name: "Focus room" }).click();
  await expect(page.locator(".focus-history-item").filter({ hasText: "Practice algebra" })).toContainText("completed");
  await page.getByRole("button", { name: "Daily plan" }).click();
  await expect(page.getByLabel("Energy (1–5)")).toHaveValue("1");
  await expect(page.getByLabel("Available minutes")).toHaveValue("60");
  await expect(page.locator(".mode-badge")).toHaveText("Recovery");
});
