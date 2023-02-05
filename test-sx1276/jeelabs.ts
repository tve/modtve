// JeeLabs RFM69 radio packet format utilities
// Copyright (c) 2023 Thorsten von Eicken

// Jeelabs native rfm69 packet format
//
// From the radio's perspective, a packet has 5 0xaa preamble bytes, 2 sync bytes, a length byte,
// the payload of up to 64 bytes, and a 2-byte CRC.

import Base64 from "base64"
import { decodeVarint, decodeVarints } from "./varint"

// genSyncBytes generates the sync bytes ("words") as well as the parity bits for the radio.
// The radio programming uses a little trick, which is to reduce the number of required preamble
// bytes at the RX end by one and to place the preamble pattern into the first sync byte.
// This still helps synchonizing the bit clock and also adds one more check byte to the packet
// detection logic to reduce false-positives (which is a real problem).
// The second sync byte is fixed to 0x2d and the third one can be freely chosen to distinguish
// multiple network groups.
// Two parity bits are calculated over the group ID and placed into the first payload byte, they
// serve as additional checks because the sync bytes are not included in the packet CRC.
// returns { sync, parity }
export function genSyncBytes(group: number) {
  const sync = [0xaa, 0x2d, group]
  // b7 = group b7^b5^b3^b1, b6 = group b6^b4^b2^b0
  let parity = group ^ (group << 4)
  parity = (parity ^ (parity << 2)) & 0xc0
  return { sync, parity }
}

// ===== JeeLabs packet formats

// JlPacket contains a partially decoded JeeLabs v1 or v2 packet
interface JlPacket {
  vers: 1 | 2 // packet version
  // bool        isAck:1, fromGW:1, ackReq:1, special:1, trailer:1, vers:2;
  isAck: boolean // 1 if this is an ACK packet
  fromGW: boolean // 1 if this is a packet from the gateway
  wantAck: boolean // 1 if this packet requests an ACK
  type: number // 0..127 message type (i.e. what the contents is about)
  remoteMargin: number | undefined // in dB
  remoteFEI: number | undefined // in Hz
  fei: number // in Hz
  rssi: number // in dBm
  snr: number // in dB
  at: number // arrival timestamp (Date.now())
  node: string // 32-bit node id
  payload: string // base64 encoded payload bytes corresponding to data
  data: Int32Array | number[] | undefined // decoded varint payload data
}

export function decode(buf: Uint8Array): Partial<JlPacket> | null {
  if (buf.length < 3) return null
  // ugly heuristic to detect V1 packets based on actual usage
  if (
    ((buf[0] & 0x3f) == 0 && (buf[1] & 0x3f) == 61) ||
    ((buf[1] & 0x3f) == 0 && (buf[0] & 0x3f) == 61)
  ) {
    return decodeV1(buf)
  } else {
    return decodeV2(buf)
  }
}

// ===== JeeLabs V1 format

// The V1 format has source and destination addresses so any node can send to any other node.
// However, the source address is not really used anymore, it's there for historical reasons.
// Current use is that dest=0 means "to gateway" and dest>0 means "ack to node".
// It has an optional 2-byte info trailer with RSSI and FEI information.
//
// The packet format between the length byte and the CRC consists of:
//   byte : content
//      0 : "header", 6-bits dest node ID, top 2 bits group parity
//      1 : "source", 6-bits source node ID, bit7: ack requested, bit6: unused
//      2 : format, 7-bit packet type, bit7: info trailer
// 3..6/7 : node_id, varint encoded
// 7..len : payload (7..len-2 if trailer present)
//  len-2 : optional, 6 bit SNR/margin
//  len-1 : optional, signed FEI/128
// ACK must start <10ms after packet end
//
// The info trailer consists of 2 bytes: Margin[dB] and FEI[Hz]/128 (signed) of the the most
// recent packet received from the other party.
// The Margin is the decoding margin left, e.g. RSSI - Noise - Demod_SNR, where Demod_SNR is ??.
// The Margin is constrained to [0..63] thus the top 2 bits of the byte are unused.

// decodeV1 expects a buffer with the packet payload (after the length byte) and returns a
// JlPacket with the decoded fields.
export function decodeV1(buf: Uint8Array): Partial<JlPacket> | null {
  if (buf.length < 3) return null
  const hasInfo = (buf[2] & 0x80) != 0
  if (hasInfo && buf.length < 5) return null
  const fromGW = (buf[0] & 0x3f) != 0
  let pl = buf.subarray(3, hasInfo ? buf.length - 2 : buf.length)
  var node: number | undefined = undefined
  if (!fromGW && pl.length > 1) {
    // decode and remove node id from payload
    var [node, len] = decodeVarint(pl)
    if (len > 5) return null
    pl = pl.subarray(len)
  }
  const data = decodeVarints(pl)
  return {
    vers: 1,
    isAck: fromGW,
    fromGW,
    wantAck: (buf[1] & 0x80) != 0,
    type: buf[2] & 0x7f,
    remoteMargin: hasInfo ? buf[buf.length - 2] & 0x3f : undefined,
    remoteFEI: hasInfo ? (buf[buf.length - 1] << 24) >> 17 : undefined,
    node: node ? (node >>> 0).toString(16) : undefined,
    payload: Base64.encode(pl),
    data,
  }
}

// ===== JeeLabs V2 format

// The V2 format is a simplified version of the V1 format optimized for star networks (e.g. one GW)
// and with fully Varint encoded payload.
//
// The packet format between the length byte and the CRC consists of:
//   byte : content
//      0 : header, see below
//    1-4 : node ID (32 bits)
//      5 : type, 7-bit packet type, bit7: info trailer
// 6..len : payload (6..len-2 if trailer present)
//   len-2: optional, 6 bit SNR, margin above noise floor
//   len-1: optional, signed FEI/128
// ACK must start <10ms after packet end
// Header:
//   b8-b7  : group parity
//   b6 ctrl: 0=data 1=special.
//   b5 dest: 0=to-GW 1=from-GW.
//   b4 ack : 0=no-ack 1=ack-req.
//   b3-b2  : unused
//   b1-b0  : 0x2 to disambiguate from JLv1
// The following ctrl/ack combinations are used:
//   c=0, a=0 : data, no ack requested.
//   c=0, a=1 : data, ack requested.
//   c=1, a=0 : ack.
//   c=1, a=1 : unused.

export function decodeV2(buf: Uint8Array): Partial<JlPacket> | null {
  if (buf.length < 6) return null
  const hasInfo = (buf[5] & 0x80) != 0
  if (hasInfo && buf.length < 8) return null
  const pl = buf.slice(6, hasInfo ? buf.length - 2 : buf.length)
  const data = decodeVarints(pl)
  let node: number | string = (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4]
  node = (node >>> 0).toString(16)
  return {
    vers: 2,
    isAck: (buf[0] & 0x28) == 0x20,
    fromGW: (buf[0] & 0x10) != 0,
    wantAck: (buf[0] & 0x28) == 0x08,
    type: buf[5] & 0x7f,
    remoteMargin: hasInfo ? buf[buf.length - 2] & 0x3f : undefined,
    remoteFEI: hasInfo ? (buf[buf.length - 1] << 24) >> 17 : undefined,
    node,
    payload: Base64.encode(pl),
    data,
  }
}
