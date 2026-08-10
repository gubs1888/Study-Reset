import express from "express";
import { adjustDailyPlan, generatePlan, getDailyPlan } from "../controllers/dailyPlanController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/daily", getDailyPlan);
router.post("/daily/generate", generatePlan);
router.patch("/daily/:id", adjustDailyPlan);

export default router;
