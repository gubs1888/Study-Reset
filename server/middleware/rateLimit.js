const buckets = new Map();

export const rateLimit = ({ windowMs, maximum, message }) => (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  current.count += 1;
  if (current.count > maximum) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
    return res.status(429).json({ message });
  }

  return next();
};

export const clearRateLimitBuckets = () => buckets.clear();
