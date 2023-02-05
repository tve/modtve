import VarInt from "../varint.js"
const { decodeVarint, decodeVarints } = VarInt
export {}

const vt = {
  empty: [[], []],
  small: [
    [0, 1, 2, -1, -2],
    [0x80, 0x82, 0x84, 0x81, 0x83],
  ],
  positive: [
    [63, 64, 127, (12 << 6) + 34, (12 << 13) + 34, 0x7f << 24],
    [0xfe, 0x1, 0x80, 1, 0xfe, 12, 128 + 68, 12, 0, 0x80 + 68, 0x1f, 0x70, 0, 0, 0x80],
  ],
  negative: [
    [-64, -65, -127, -128, -(12 << 6) + 34, -(12 << 13) + 34, 0x80000000],
    [0xff, 0x1, 0x81, 1, 0xfd, 1, 0xff, 11, 187, 11, 0x7f, 187, 0x0f, 0x7f, 0x7f, 0x7f, 0xff],
  ],
}

// function TestEncode() {
// 	for (const n in vt) {
//     const tc = vt[n]
// 		const got = Encode(tc[0])
// 		if (got.length != len(tc[1])) {
// 			t.Fatalf("Encoding '%s'\n%+v length mismatch got\n%+v expected\n%+v",
// 				n, tc.dec, got, tc[1])
// 		}
// 		for i := range got {
// 			if got[i] != tc[1][i] {
// 				t.Fatalf("Encoding %s got\n%+v expected\n%+v", n, got, tc.enc)
// 			}
// 		}
// 	}
// }

function TestDecode() {
  for (const n in vt) {
    const tc = vt[n]
    const got = decodeVarints(Uint8Array.from(tc[1]))
    const should = Int32Array.from(tc[0])
    console.log(`'${n}': ${Uint8Array.from(tc[1])} -> ${should}`)
    if (got.length != should.length) {
      console.log(
        `** Error decoding '${n}': length mismatch got ${got.length} expected ${should.length}`
      )
    }
    for (let i = 0; i < got.length; i++) {
      if (got[i] != should[i]) {
        console.log(`** Error decoding '${n}': got ${got} expected ${should}`)
      }
    }
  }
}

const lgint_in = [0x1f, 0x70, 0, 0, 0x80]
const lgint_out = decodeVarint(Uint8Array.from(lgint_in))
console.log("lgint_in:", lgint_out, lgint_out[0].toString(16), "should be", [0x7f << 24, 5])

const negint_in = [0x0f, 0x7f, 0x7f, 0x7f, 0xff]
const negint_out = decodeVarint(Uint8Array.from(negint_in))
console.log("negint_in:", negint_out, negint_out[0].toString(16), "should be", [0x80000000, 5])

const node_in = [0x06, 0x23, 0x78, 0x09, 0x04, 0x9e]
const node_out = decodeVarint(Uint8Array.from(node_in))
console.log("node_in:", node_out, node_out[0].toString(16), "should be", [0x323f0242, 6])

TestDecode()
