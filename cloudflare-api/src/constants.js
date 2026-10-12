export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_COOKIE = 'tt_session';
export const CSRF_COOKIE = 'tt_csrf';
export const DEFAULT_PASSWORD_ITERATIONS = 100_000;
export const MIN_PASSWORD_ITERATIONS = 100_000;
export const MAX_PASSWORD_ITERATIONS = 100_000;
export const MAX_JSON_BYTES = 384 * 1024;
export const MAX_SCHEDULES_PER_USER = 100;
export const MAX_SHARES_PER_USER = 200;
export const AUTH_RATE_WINDOW_SECONDS = 15 * 60;
export const AUTH_RATE_BLOCK_SECONDS = 15 * 60;
export const REGISTER_RATE_LIMIT = 5;
export const LOGIN_IP_RATE_LIMIT = 20;
export const LOGIN_ACCOUNT_RATE_LIMIT = 8;
export const DEFAULT_APP_ORIGIN = 'https://wangaoqi23.github.io';

export const COLORS = Object.freeze(['blue', 'violet', 'orange', 'teal', 'rose']);
export const PARITIES = Object.freeze(['all', 'odd', 'even']);
