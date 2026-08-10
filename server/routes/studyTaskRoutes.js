import express from "express";
import {
  createStudyTask,
  getStudyTasks,
  updateStudyTask,
  deleteStudyTask,
} from "../controllers/studyTaskController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .get(getStudyTasks)
  .post(createStudyTask);

router.route("/:id")
  .patch(updateStudyTask)
  .delete(deleteStudyTask);

export default router;
