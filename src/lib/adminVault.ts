import { db } from '@/lib/db';

const UNLOCK_CODE = '2009';
const UNLOCK_UNTIL_KEY = 'adminVaultUnlockUntil';

export type EncryptedSecret = {
  cipherTextB64: string;
  ivB64: string;
  saltB64: string;
};

export type AdminRecord = {
  id: string;
  username: string;
  secret: EncryptedSecret;
  createdAt: number;
};

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getUnlockUntil(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.sessionStorage.getItem(UNLOCK_UNTIL_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function isAdminVaultUnlocked(): boolean {
  return Date.now() < getUnlockUntil();
}

export function unlockAdminVault(code: string, minutes = 15): boolean {
  if (typeof window === 'undefined') return false;
  if (code !== UNLOCK_CODE) return false;
  const until = Date.now() + minutes * 60_000;
  window.sessionStorage.setItem(UNLOCK_UNTIL_KEY, String(until));
  return true;
}

export function lockAdminVault(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(UNLOCK_UNTIL_KEY);
}

export function getAdminVaultUnlockRemainingMs(): number {
  const until = getUnlockUntil();
  return Math.max(0, until - Date.now());
}

async function deriveKeyFromCodeAndSalt(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  const saltBuf = new Uint8Array(salt).slice().buffer as ArrayBuffer;
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptAdminPassword(password: string): Promise<EncryptedSecret> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ivBytes = new Uint8Array(iv).slice();
  const key = await deriveKeyFromCodeAndSalt(UNLOCK_CODE, salt);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, enc.encode(password) as BufferSource);
  return {
    cipherTextB64: bytesToB64(new Uint8Array(cipherBuf)),
    ivB64: bytesToB64(ivBytes),
    saltB64: bytesToB64(salt),
  };
}

export async function decryptAdminPassword(secret: EncryptedSecret): Promise<string> {
  if (!isAdminVaultUnlocked()) {
    throw new Error('Admin vault locked');
  }
  const dec = new TextDecoder();
  const salt = b64ToBytes(secret.saltB64);
  const iv = b64ToBytes(secret.ivB64);
  const ivBytes = new Uint8Array(iv).slice();
  const cipherBytes = b64ToBytes(secret.cipherTextB64);
  const cipherBuf = new Uint8Array(cipherBytes).slice().buffer as ArrayBuffer;
  const key = await deriveKeyFromCodeAndSalt(UNLOCK_CODE, salt);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBuf);
  return dec.decode(plainBuf);
}

export async function adminUsernameExists(username: string): Promise<boolean> {
  const existing = await db.admins.where('username').equals(username).first();
  return !!existing;
}

export async function createAdminAccount(username: string, password: string): Promise<AdminRecord> {
  const existing = await db.admins.where('username').equals(username).first();
  if (existing) {
    throw new Error('Username already exists');
  }
  const secret = await encryptAdminPassword(password);
  const record: AdminRecord = {
    id: `admin-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`,
    username,
    secret,
    createdAt: Date.now(),
  };
  await db.admins.add(record);
  return record;
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  if (!isAdminVaultUnlocked()) return false;
  const record = await db.admins.where('username').equals(username).first();
  if (!record) return false;
  const stored = await decryptAdminPassword(record.secret);
  return stored === password;
}

export async function updateAdminAccount(
	currentUsername: string,
	update: { newUsername?: string; newPassword?: string },
): Promise<void> {
	if (!isAdminVaultUnlocked()) {
		throw new Error('Admin vault locked');
	}
	const record = await db.admins.where('username').equals(currentUsername).first();
	if (!record) {
		throw new Error('Admin username not found');
	}
	const newUsername = (update.newUsername ?? '').trim();
	if (newUsername && newUsername !== currentUsername) {
		const collision = await db.admins.where('username').equals(newUsername).first();
		if (collision) {
			throw new Error('New username already exists');
		}
	}
	const patch: any = {};
	if (newUsername && newUsername !== currentUsername) {
		patch.username = newUsername;
	}
	if (typeof update.newPassword === 'string') {
		patch.secret = await encryptAdminPassword(update.newPassword);
	}
	if (!Object.keys(patch).length) return;
	await db.admins.update(record.id, patch);
}
