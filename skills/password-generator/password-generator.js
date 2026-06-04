// Password Generator — Generate strong, cryptographically secure passwords
// Usage: { length, count, type, symbols, numbers, uppercase, memorable, prefix }

module.exports = { main };

const crypto = require('crypto');

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?';
const AMBIGUOUS = 'il1Lo0O';

// Word lists for memorable passwords
const ADJECTIVES = ['swift','bright','calm','dark','eager','fair','grand','happy','ideal','jolly','keen','lively','merry','noble','proud','quiet','rapid','smart','tall','unique','vast','warm','young','zesty'];
const NOUNS = ['atlas','blade','cloud','dawn','echo','flame','grove','haven','iris','jungle','knight','lotus','moon','nova','ocean','pearl','quest','river','storm','tower','umbra','vault','wave','xenon','yield','zenith'];

function secureRandom(max) {
  return crypto.randomInt(0, max);
}

function generatePassword(opts) {
  const {
    length = 16,
    symbols = true,
    numbers = true,
    uppercase = true,
    excludeAmbiguous = false,
  } = opts;

  let charset = LOWER;
  if (uppercase) charset += UPPER;
  if (numbers) charset += DIGITS;
  if (symbols) charset += SYMBOLS;
  if (excludeAmbiguous) charset = charset.split('').filter((c) => !AMBIGUOUS.includes(c)).join('');

  // Ensure at least one char from each required set
  const required = [LOWER[secureRandom(LOWER.length)]];
  if (uppercase) required.push(UPPER[secureRandom(UPPER.length)]);
  if (numbers) required.push(DIGITS[secureRandom(DIGITS.length)]);
  if (symbols) required.push(SYMBOLS[secureRandom(SYMBOLS.length)]);

  const remaining = length - required.length;
  const chars = Array.from({ length: remaining }, () => charset[secureRandom(charset.length)]);
  const all = [...required, ...chars];

  // Shuffle using Fisher-Yates with crypto random
  for (let i = all.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

function generatePassphrase(words = 4, separator = '-') {
  const parts = [];
  for (let i = 0; i < words; i++) {
    const adj = ADJECTIVES[secureRandom(ADJECTIVES.length)];
    const noun = NOUNS[secureRandom(NOUNS.length)];
    parts.push(i % 2 === 0 ? adj : noun);
  }
  // Add a number for strength
  parts.push(secureRandom(9999).toString());
  return parts.join(separator);
}

function checkStrength(password) {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (password.length >= 20) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const levels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong', 'Excellent', 'Perfect'];
  return { score, strength: levels[Math.min(score, levels.length - 1)] };
}

async function main(args) {
  const {
    length = 16,
    count = 1,
    type = 'password',
    symbols = true,
    numbers = true,
    uppercase = true,
    excludeAmbiguous = false,
    words = 4,
    separator = '-',
    prefix,
  } = args || {};

  try {
    if (type === 'passphrase' || type === 'memorable') {
      const passphrases = Array.from({ length: count }, () => {
        const pp = generatePassphrase(words, separator);
        return { passphrase: (prefix ? prefix + separator : '') + pp, strength: checkStrength(pp) };
      });
      return { result: `${count} passphrase(s) generated`, type: 'passphrase', passphrases };
    }

    if (type === 'pin') {
      const pins = Array.from({ length: count }, () => Array.from({ length: length }, () => DIGITS[secureRandom(10)]).join(''));
      return { result: `${count} PIN(s) generated`, pins };
    }

    if (type === 'hex') {
      const hexKeys = Array.from({ length: count }, () => crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length));
      return { result: `${count} hex key(s) generated`, keys: hexKeys };
    }

    const passwords = Array.from({ length: Math.min(count, 20) }, () => {
      const pw = generatePassword({ length, symbols, numbers, uppercase, excludeAmbiguous });
      const full = (prefix || '') + pw;
      return { password: full, strength: checkStrength(full) };
    });

    return { result: `${passwords.length} password(s) generated`, type: 'password', passwords };
  } catch (err) {
    console.error('[password-generator]', err.message);
    return { error: err.message };
  }
}
