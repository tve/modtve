/*
 * Copyright (c) 2021  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

import Timer from "timer"
import SX1276fsk from "sx1276-fsk"
import { genSyncBytes, decode } from "./jeelabs"
import { decodeVarints } from "./varint"
import Digital from "embedded:io/digital"
import { AsyncClient } from "async-mqtt"

let radio: SX1276fsk
const buffer = new Uint8Array(250)
const led = new device.io.Digital({ pin: device.pin.led, mode: Digital.Output })
led.write(1)

const rf_group = 6
const rf_freq = 912500000
const { sync, parity } = genSyncBytes(rf_group)

function traceHexBuffer(buf: Uint8Array) {
  for (let i = 0; i < buf.length; i++) {
    trace(" ")
    trace(buf[i].toString(16).padStart(2, "0"))
  }
}

function blinkLed(digPin: Digital, value: 0 | 1, delay: number) {
  digPin.write(value)
  Timer.set(() => {
    digPin.write((1 - value) as 0 | 1)
  }, delay)
}

let mqtt: AsyncClient

export default function (_mqtt: AsyncClient) {
  mqtt = _mqtt
  trace("Initializing Radio\n")
  radio = new SX1276fsk({
    spi: (device.SPI as any).radio,
    reset: {
      io: device.io.Digital,
      pin: device.pin.radio_reset,
      mode: device.io.Digital.Output,
    },
    dio0: {
      io: device.io.Digital,
      pin: device.pin.radio_dio0,
      mode: device.io.Digital.Input,
    },
    dio4: {
      io: device.io.Digital,
      pin: device.pin.radio_dio4,
      mode: device.io.Digital.Input,
    },
    select: {
      io: device.io.Digital,
      pin: device.pin.radio_select,
      mode: device.io.Digital.Output,
    },
    onReadable: rxPacket,
    onWritable: () => {
      trace("onWritable\n")
    },
    // RF config
    frequency: rf_freq,
    sync: sync,
  })
  //radio.dump_regs()
  trace("Radio ready\n")
  led.write(0)
}

function rxPacket(length: number, now: number) {
  const n = radio.read(buffer)
  if (!n || n < 5) return
  const buf = length > 40 ? buffer.subarray(0, 40) : buffer.subarray(0, length)

  // ensure packet has correct group parity
  const pktParity = buf[0] & 0xc0
  if (pktParity != parity) {
    trace(`Bad parity: ${pktParity} != ${parity}\n`)
    return
  }

  trace(`Received ${n} bytes:`)
  traceHexBuffer(buf)
  trace("\n")
  blinkLed(led, 1, 200)

  // decode the packet
  const jlpkt = decode(buf)
  if (!jlpkt) return
  jlpkt.data = decodeVarints(jlpkt.payload!)

  const node = jlpkt.node || buf[0] & 0x3f
  const retId = jlpkt.node || buf[1] & 0x3f // return RF id

  const dir = jlpkt.fromGW ? "TX" : "RX"
  const ack = jlpkt.wantAck ? "A" : "-"
  const info = jlpkt.remoteMargin !== undefined ? "I" : "-"
  trace(`<info>PKT ${dir}${node.toString(16)} ${jlpkt.data.length}b T${jlpkt.type} `)
  trace(`${ack}${info} ${jlpkt.remoteMargin}dB ${jlpkt.remoteFEI}Hz\n`)

  if (mqtt) {
    mqtt.publish(`xs/test/jlpkt`, JSON.stringify(jlpkt)).then(() => {
      trace("Published!\n")
    })
  }
}

// let id = 0
// if (transmit)
// 	Timer.repeat(doTransmit, interval);

// function doTransmit() {
// 	const message = "hello #" + ++id;
// 	trace(`Sending: ${message}\n`);

// 	const length = message.length;
// 	for (let l = 0; l < length; ++l)
// 		buffer[l] = message.charCodeAt(l);
// 	lora.write(buffer, length);
// }
