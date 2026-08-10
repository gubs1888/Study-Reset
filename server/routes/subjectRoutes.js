import express from "express";
import {
  archiveSubject,
  createSubject,
  getSubjects,
  restoreSubject,
  updateSubject,
} from "../controllers/subjectController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .get(getSubjects)
  .post(createSubject);

router.post("/:id/restore", restoreSubject);

router.route("/:id")
  .patch(updateSubject)
  .delete(archiveSubject);

export default router;
