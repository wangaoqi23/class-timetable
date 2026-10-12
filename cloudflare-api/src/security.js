import {
  DEFAULT_PASSWORD_ITERATIONS,
  MAX_PASSWORD_ITERATIONS,
  MIN_PASSWORD_ITERATIONS,
} from './constants.js';

const encoder = new TextEncoder();

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError('Invalid base64url value');
  }
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function parsePasswordIterations(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PASSWORD_ITERATIONS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_PASSWORD_ITERATIONS || parsed > MAX_PASSWORD_ITERATIONS) {
    throw new Error(
      `PASSWORD_ITERATIONS must be an integer from ${MIN_PASSWORD_ITERATIONS} to ${MAX_PASSWORD_ITERATIONS}`,
    );
  }
  return parsed;
}

export async function derivePasswordHash(password, salt, iterations = DEFAULT_PASSWORD_ITERATIONS) {
  const saltBytes = typeof salt === 'string' ? base64UrlToBytes(salt) : salt;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function createPasswordRecord(password, iterations = DEFAULT_PASSWORD_ITERATIONS) {
  const salt = randomToken(16);
  const hash = await derivePasswordHash(password, salt, iterations);
  return { hash, salt, iterations };
}

export function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

export async function verifyPassword(password, record) {
  const actual = await derivePasswordHash(password, record.salt, record.iterations);
  return constantTimeEqual(actual, record.hash);
}
