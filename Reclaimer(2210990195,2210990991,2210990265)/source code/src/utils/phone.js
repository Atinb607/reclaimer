function normalizePhone(phone) {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}
 
module.exports = { normalizePhone };