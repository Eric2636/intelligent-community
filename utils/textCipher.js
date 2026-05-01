// 轻量文本加密/解密（用于配置字符串“避免明文”展示）
// 注意：这是“混淆级别”的对称加密，密钥仍在客户端代码中，不能替代真正的安全防护。

import { CIPHER_KEY } from '~/config/textCipherKey';

function toBytesUtf8(str) {
  const s = unescape(encodeURIComponent(String(str)));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function fromBytesUtf8(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(s));
}

function xorBytes(dataBytes, keyBytes) {
  const out = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i += 1) {
    out[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return out;
}

function base64EncodeBytes(bytes) {
  // MiniProgram: wx.arrayBufferToBase64
  // Node: Buffer
  /* eslint-disable no-undef */
  if (typeof wx !== 'undefined' && wx.arrayBufferToBase64) {
    return wx.arrayBufferToBase64(bytes.buffer);
  }
  /* eslint-enable no-undef */
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Fallback: btoa (ASCII only)
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

function base64DecodeToBytes(b64) {
  /* eslint-disable no-undef */
  if (typeof wx !== 'undefined' && wx.base64ToArrayBuffer) {
    const ab = wx.base64ToArrayBuffer(String(b64));
    return new Uint8Array(ab);
  }
  /* eslint-enable no-undef */
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(String(b64), 'base64'));
  }
  // eslint-disable-next-line no-undef
  const bin = atob(String(b64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 加密文本，返回 base64 字符串
 * @param {string} plaintext
 * @returns {string}
 */
export function encryptText(plaintext) {
  const keyBytes = toBytesUtf8(CIPHER_KEY);
  const dataBytes = toBytesUtf8(plaintext);
  const out = xorBytes(dataBytes, keyBytes);
  return base64EncodeBytes(out);
}

/**
 * 解密 base64 字符串
 * @param {string} cipherTextBase64
 * @returns {string}
 */
export function decryptText(cipherTextBase64) {
  if (!cipherTextBase64) return '';
  const keyBytes = toBytesUtf8(CIPHER_KEY);
  const dataBytes = base64DecodeToBytes(cipherTextBase64);
  const out = xorBytes(dataBytes, keyBytes);
  return fromBytesUtf8(out);
}

