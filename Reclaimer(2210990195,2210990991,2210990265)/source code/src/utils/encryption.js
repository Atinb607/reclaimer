const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required');
  // Derive a fixed-length key using SHA-256
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a plaintext string
 * Returns: iv:tag:ciphertext (all hex encoded)
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 */
function decrypt(encryptedStr) {
  if (!encryptedStr) return null;
  try {
    const key = getKey();
    const parts = encryptedStr.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted format');
    
    const [ivHex, tagHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error('Decryption failed: ' + err.message);
  }
}

/**
 * Hash a string (one-way, for password storage)
 */
function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { encrypt, decrypt, hash };
