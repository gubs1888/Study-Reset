import crypto from "node:crypto";

export const hashPasswordResetToken = (token) => (
  crypto.createHash("sha256").update(token).digest("hex")
);

export const createPasswordResetToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };
};
