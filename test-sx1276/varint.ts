// Implementation of the varint integer encoding. Encodes a 32-bit signed int in 1..5 bytes.
// Copyright (c) 2023 by Thorsten von Eicken

// encodeVarints encodes an array of signed ints into a buffer of varint bytes. Returns the number
// of bytes produced. Returns 0 if the encoding ran out of space.
// Reference: http://jeelabs.org/article/1620c/
/*
export function encodeVarints(ints: number[]) : Uint8Array {
    int len0 = len; // remember original length
    while (count--) {
        int32_t v = *ints++; // value to encode
        // special-case zero value
        if (v == 0) {
            if (len < 1) return 0; // out of space
            *buf++ = 0x80;
            len--;
            continue;
        }

        // handle negative values
        uint32_t u = v << 1; // make space for sign in bottom bit
        if (v < 0) u = ~u; // encode positive value, place sign in bottom bit

        // generate encoding
        const int max = 5; // produce max 5 bytes
        uint8_t temp[max]; // produce output backwards
        int i = max;
        while (u != 0) {
            temp[--i] = u & 0x7f;
            u = u >> 7;
        }
        temp[4] |= 0x80; // bit to signal last byte

        if (max-i > len) return 0; // out of space
        len -= max-i;
        while (i < max) *buf++ = temp[i++];
    }
    return len0-len;
}
*/

// decodeVarint decodes a single varint from a buffer.
// Returns a tuple with the values and the number of bytes consumed from the buffer or 0
// if no varint was decoded.
// Reference: http://jeelabs.org/article/1620c/
export function decodeVarint(buf: Uint8Array): [number | null, number] {
  let val = 0 // producing int32_t in the end but shifts are easier with uint32_t
  for (let i = 0; i < buf.length; i++) {
    val = (val << 7) | (buf[i] & 0x7f)
    if ((buf[i] & 0x80) != 0) {
      // last byte flag set, output an int
      if ((val & 1) == 0) val = val >> 1 // positive value, eat sign bit
      else val = ~(val >> 1) // negative value, eat sign bit and negate
      return [val, i + 1]
    }
  }
  // did not get to the end of a value
  return [null, 0]
}

function countVartints(buf: Uint8Array): number {
  let count = 0
  for (let i = 0; i < buf.length; i++) {
    if ((buf[i] & 0x80) != 0) count++
  }
  return count
}

// decodeVarints decodes buffer of varint bytes into a Uint32Array.
// Reference: http://jeelabs.org/article/1620c/
export function decodeVarints(buf: Uint8Array): Int32Array {
  const count = countVartints(buf)
  const vals = new Int32Array(count)
  let v_ix = 0 // index into vals
  while (buf.length > 0) {
    const [val, len] = decodeVarint(buf)
    if (val == null) return vals
    vals[v_ix++] = val
    buf = buf.subarray(len)
  }
  return vals // reached end of buf, return what we found
}
