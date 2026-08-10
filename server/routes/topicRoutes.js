import express from "express";
import {
  archiveTopic,
  createTopic,
  getTopics,
  reviewTopic,
  updateTopic,
} from "../controllers/topicController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .get(getTopics)
  .post(createTopic);

router.post("/:id/review", reviewTopic);

router.route("/:id")
  .patch(updateTopic)
  .delete(archiveTopic);

export default router;
