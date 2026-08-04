// JWT_SECRET must come from the environment — refusing to boot beats silently
// signing tokens with a publicly known fallback.
const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error(
    "JWT_SECRET environment variable is not set. Add a strong random value to backend/.env before starting the server."
  );
}

export const JWT_SECRET: string = secret;
