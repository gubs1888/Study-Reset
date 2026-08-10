import express from "express";
import { getCheckIns, saveCheckIn } from "../controllers/checkInController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.route("/")
  .get(getCheckIns)
  .post(saveCheckIn);

export default router;
