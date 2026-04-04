export const COOKIE_NAME = "luxjd-session";
export const VALID_EMAIL = "admin@luxjd.com";
export const VALID_PASSWORD = "admin123";

export function validateCredentials(email, password) {
  return email === VALID_EMAIL && password === VALID_PASSWORD;
}
