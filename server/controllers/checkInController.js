import DailyCheckIn from "../models/DailyCheckIn.js";

const allowedMoods = new Set(["very-low", "low", "neutral", "good", "great"]);

const isPlainObject = (value) => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const isValidDateKey = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const validationMessage = (error, fallback) => {
  if (error?.name === "ValidationError") return "Check-in data is invalid";
  return fallback;
};

export const getCheckIns = async (req, res) => {
  try {
    const { date } = req.query;
    if (date !== undefined && !isValidDateKey(date)) {
      return res.status(400).json({ message: "Date must use YYYY-MM-DD" });
    }

    if (date) {
      const checkIn = await DailyCheckIn.findOne({ user: req.user._id, dateKey: date });
      return res.json({ checkIn });
    }

    const checkIns = await DailyCheckIn.find({ user: req.user._id })
      .sort({ dateKey: -1 })
      .limit(31);
    return res.json({ checkIns });
  } catch (error) {
    console.error("Get check-ins error:", error.message);
    return res.status(500).json({ message: "Unable to retrieve check-ins" });
  }
};

export const saveCheckIn = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "A JSON request body is required" });
    }

    const { date, mood, energyLevel, availableMinutes, note, timezoneOffsetMinutes } = req.body;

    if (!isValidDateKey(date)) {
      return res.status(400).json({ message: "Date must use YYYY-MM-DD" });
    }
    if (typeof mood !== "string" || !allowedMoods.has(mood)) {
      return res.status(400).json({ message: "Mood is invalid" });
    }
    if (!Number.isInteger(energyLevel) || energyLevel < 1 || energyLevel > 5) {
      return res.status(400).json({ message: "Energy level must be an integer from 1 to 5" });
    }
    if (!Number.isInteger(availableMinutes) || availableMinutes < 10 || availableMinutes > 720) {
      return res.status(400).json({ message: "Available time must be an integer between 10 and 720 minutes" });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      return res.status(400).json({ message: "Note must be text with at most 500 characters" });
    }
    if (timezoneOffsetMinutes !== undefined && (
      !Number.isInteger(timezoneOffsetMinutes)
      || timezoneOffsetMinutes < -840
      || timezoneOffsetMinutes > 840
    )) {
      return res.status(400).json({ message: "Timezone offset is invalid" });
    }

    const checkIn = await DailyCheckIn.findOneAndUpdate(
      { user: req.user._id, dateKey: date },
      {
        $set: {
          mood,
          energyLevel,
          availableMinutes,
          note: note?.trim() || "",
          timezoneOffsetMinutes: timezoneOffsetMinutes ?? 0,
        },
        $setOnInsert: { user: req.user._id, dateKey: date },
      },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ message: "Daily check-in saved", checkIn });
  } catch (error) {
    console.error("Save check-in error:", error.message);
    return res.status(500).json({ message: validationMessage(error, "Unable to save check-in") });
  }
};

export const checkInValidation = { isValidDateKey };
