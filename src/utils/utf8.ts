/** Décodage UTF-8, utilisé seulement si le moteur JavaScript n'a pas de TextDecoder. */
export function decodeUtf8(bytes: Uint8Array): string {
  const codes: number[] = [];
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let code: number;
    if (b < 0x80) code = b;
    else if (b >= 0xc0 && b < 0xe0) code = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0 && b < 0xf0) code = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xf0) {
      code = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else code = 0xfffd; // octet de continuation isolé
    codes.push(code);
    if (codes.length >= 8192) {
      out += String.fromCodePoint(...codes);
      codes.length = 0;
    }
  }
  return out + String.fromCodePoint(...codes);
}

/** Installe un TextDecoder minimal (UTF-8) s'il manque : le lecteur glTF en a besoin. */
export function ensureTextDecoder(): void {
  if (typeof globalThis.TextDecoder !== 'undefined') return;
  class Utf8Decoder {
    readonly encoding = 'utf-8';
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return '';
      const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);
      return decodeUtf8(bytes);
    }
  }
  (globalThis as { TextDecoder?: unknown }).TextDecoder = Utf8Decoder;
}
