/**
 * Hash a string using SHA-256. Used for local password verification
 * so plaintext passwords are never stored in localStorage.
 */
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Default password hash (SHA-256 of '123456')
export const DEFAULT_PASSWORD_HASH =
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
