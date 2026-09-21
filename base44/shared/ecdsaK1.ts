// Pure server-side Ethereum cryptography — keccak-256 + secp256k1 ecrecover.
// No SDK dependency (heavy SDKs cannot be bundled by the deploy pipeline).
// Every part is validated against reference implementations: the empty-string
// keccak vector, random buffers vs the reference library, and signature
// recovery against real wallet signatures.
// Used ONLY to prove a customer controls the wallet key that owns their
// CRIXCOIN smart account — never to create keys, sign, or move funds.

const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];
const MASK = (1n << 64n) - 1n;

// Round constants generated exactly like the reference LFSR (same algorithm
// as @noble/hashes) — no hand-copied table that could contain a typo.
const IOTA: bigint[] = [];
{
  let R = 1n;
  for (let round = 0; round < 24; round++) {
    let t = 0n;
    for (let j = 0; j < 7; j++) {
      R = ((R << 1n) ^ ((R >> 7n) * 0x71n)) % 256n;
      if (R & 2n) t ^= 1n << ((1n << BigInt(j)) - 1n);
    }
    IOTA.push(t);
  }
}

const rotl64 = (x: bigint, n: number): bigint => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;

function keccakF(s: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    const C = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    const D = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] ^= D[x];
    const B = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(s[x + 5 * y], ROT[x][y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y]) & B[(x + 2) % 5 + 5 * y] & MASK);
    s[0] = (s[0] ^ IOTA[round]) & MASK;
  }
}

export function keccak256(bytes: Uint8Array): Uint8Array {
  const rate = 136;
  const padded = new Uint8Array((Math.floor(bytes.length / rate) + 1) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s: bigint[] = new Array(25).fill(0n);
  for (let b = 0; b < padded.length; b += rate) {
    for (let lane = 0; lane < rate / 8; lane++) {
      let v = 0n;
      const off = b + lane * 8;
      for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(padded[off + i]);
      s[lane] ^= v;
    }
    keccakF(s);
  }
  const res = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane++) {
    for (let j = 0; j < 8; j++) res[lane * 8 + j] = Number((s[lane] >> BigInt(8 * j)) & 0xffn);
  }
  return res;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.length + b.length);
  c.set(a);
  c.set(b, a.length);
  return c;
}

export function bytesToHex(b: Uint8Array): string {
  let out = "";
  for (const x of b) out += x.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(h: string): Uint8Array {
  const clean = String(h || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// EIP-191 personal_sign message hash ("\x19Ethereum Signed Message:\n<len>" + message)
export function hashPersonalMessage(message: string): Uint8Array {
  const mb = utf8(message);
  return keccak256(concatBytes(utf8("\x19Ethereum Signed Message:\n" + mb.length), mb));
}

// secp256k1 (standard curve used by every Ethereum wallet)
const P = 2n ** 256n - 2n ** 32n - 977n;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const powm = (a: bigint, e: bigint, m: bigint): bigint => {
  let r = 1n;
  let x = ((a % m) + m) % m;
  let n = e;
  while (n > 0n) {
    if (n & 1n) r = (r * x) % m;
    x = (x * x) % m;
    n >>= 1n;
  }
  return r;
};

type Pt = [bigint, bigint] | null;

const ecAdd = (A: Pt, Bp: Pt): Pt => {
  if (!A) return Bp;
  if (!Bp) return A;
  const x1 = A[0], y1 = A[1], x2 = Bp[0], y2 = Bp[1];
  if (x1 === x2) {
    if (((y1 + y2) % P) === 0n) return null;
    const l = (3n * x1 % P * x1 % P) * powm(2n * y1, P - 2n, P) % P;
    const x3 = ((l * l % P - x1 - x2) % P + P) % P;
    return [x3, ((l * (x1 - x3) % P - y1) % P + P) % P];
  }
  const l = (y2 - y1) * powm(((x2 - x1) % P + P) % P, P - 2n, P) % P;
  const x3 = ((l * l % P - x1 - x2) % P + P) % P;
  return [x3, ((l * (x1 - x3) % P - y1) % P + P) % P];
};

const ecMul = (k: bigint, Pt2: Pt): Pt => {
  let R: Pt = null;
  let A = Pt2;
  let n = k;
  while (n > 0n) {
    if (n & 1n) R = ecAdd(R, A);
    A = ecAdd(A, A);
    n >>= 1n;
  }
  return R;
};

const beToBig = (b: Uint8Array): bigint => {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
};

// Recover the signer's address from a 65-byte personal_sign signature.
// Returns the lowercase address, or null if the signature is mathematically
// invalid (fail closed — the caller must then refuse the operation).
export function ecrecover(messageHash: Uint8Array, signature: Uint8Array): string | null {
  if (signature.length !== 65) return null;
  const r = beToBig(signature.slice(0, 32));
  const s = beToBig(signature.slice(32, 64));
  const vByte = signature[64];
  const recid = vByte >= 27 ? vByte - 27 : vByte;
  if (recid !== 0 && recid !== 1) return null;
  if (r <= 0n || r >= N || s <= 0n || s >= N) return null;
  const ySq = (r * r % P * r % P + 7n) % P;
  let y = powm(ySq, (P + 1n) / 4n, P);
  if ((y * y) % P !== ySq) return null;
  if ((y & 1n) !== BigInt(recid)) y = P - y;
  const e = beToBig(messageHash);
  const rInv = powm(r, N - 2n, N);
  const u1 = (((N - (e % N)) % N) * rInv) % N;
  const u2 = (s * rInv) % N;
  const Q = ecAdd(ecMul(u1, [GX, GY]), ecMul(u2, [r, y]));
  if (!Q) return null;
  const pub = new Uint8Array(64);
  // mask BEFORE Number() — masking first keeps the BigInt small and exact
  for (let i = 0; i < 32; i++) {
    pub[31 - i] = Number((Q[0] >> BigInt(8 * i)) & 0xffn);
    pub[63 - i] = Number((Q[1] >> BigInt(8 * i)) & 0xffn);
  }
  return "0x" + bytesToHex(keccak256(pub)).slice(24);
}