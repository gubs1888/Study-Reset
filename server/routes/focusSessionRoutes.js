import express from "express";
import {
  cancelFocusSession,
  completeFocusSession,
  createFocusSession,
  getFocusSessions,
} from "../controllers/focusSessionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .get(getFocusSessions)
  .post(createFocusSession);

router.patch("/:id/complete", completeFocusSession);
router.patch("/:id/cancel", cancelFocusSession);

export default router;
