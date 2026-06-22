import { randomBytes } from 'node:crypto';

const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'; // 32 chars, no ambiguous 0/o/1/l
const LENGTH = 8;

export function generateCode(): string {
  const bytes = randomBytes(LENGTH);
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
