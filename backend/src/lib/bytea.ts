export function byteaToHex(val: unknown): string | null {
  if (val == null || val === undefined) return null;
  if (val instanceof Uint8Array) {
    return "0x" + Buffer.from(val).toString("hex");
  }
  if (Buffer.isBuffer(val)) {
    return "0x" + val.toString("hex");
  }
  if (typeof val === "string") {
    const hex = val.replace(/^(\\\\x|\\x|0x)/i, "");
    if (/^[0-9a-fA-F]*$/.test(hex)) {
      return "0x" + hex.toLowerCase();
    }
  }
  return null;
}

export function byteaToBuffer(val: unknown): Buffer | null {
  const hex = byteaToHex(val);
  if (!hex) return null;
  return Buffer.from(hex.slice(2), "hex");
}
