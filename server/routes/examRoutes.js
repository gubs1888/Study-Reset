import express from "express";
import {
  createExam,
  deleteExam,
  getExams,
  updateExam,
} from "../controllers/examController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .get(getExams)
  .post(createExam);

router.route("/:id")
  .patch(updateExam)
  .delete(deleteExam);

export default router;
