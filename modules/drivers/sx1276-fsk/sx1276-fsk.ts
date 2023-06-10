// Copyright © 2021-2023 by Thorsten von Eicken.
// Semtech sx1276 FSK driver

import Timer from "timer"
import Time from "time"
import { Buffer, PinSpecifier, PortSpecifier } from "embedded:io/_common"

const thresAdj = 4 // set RSSI threshold a little above noise (unit: 1/2 dB)
// From SX1231 sec 3.5.3.2 "AGC Reference" the demodulator requires an SNR of 8dB + log10(2*RxBw).
const demod = 10 // 13 // 8dB + log10(2*45000)

export default class SX1276fsk {
  // hardware config
  #spi // spi instance
  #rst // reset pin
  #dio0 // interrupt pin
  #dio2 // interrupt pin
  #fixedLen = 0 // fixed length packets, 0 = variable length
  // packet tx and rx
  #rxLen = 0 // length of received packet
  #rxCont = true // whether RX is always enabled
  #rxRssi = 0 // -RSSI*2 of last packet received
  #rxLna = 0
  #rxFei = 0 // frequency correction applied by AFC (FEI: freq err indication)
  #rxThres = 0 // RSSI threshold at time of RX
  #txActive = false // whether a packet is being transmitted
  #opbits = 0 // top bits for opmode register
  // periodic sanity checker
  #idleAfc = 0 // last AFC value read in idle checker
  #bgRssi = 0 // background RSSI
  #bgTimer?: Timer = undefined // timer to update background RSSI

  #regs = new Uint8Array(0x64) // buffer to read/write blocks of regs and packets
  #buffer16 = new Uint8Array(2) // buffer to read/write regs

  #onReadable?: (length: number, timestamp: number) => void // callback when a packet has been received
  #onWritable?: () => void // callback when a packet has been sent (i.e. the next one can be sent)

  // constructor options:
  // Hardware set-up:
  // - spi: SPI instance, WARNING: during bulk-read of the FIFO at a byte boundary MISO
  //   changes about 90ns after SCK falls, this means the max clock rate is lower than
  //   spec! With ESP32 consider that MISO is delayed ~25ns when using GPIO matrix. Max
  //   safe rate is ~3Mhz.
  // - select: { io: device.io.DEVICE, pin: 0, mode: Digital.Output }, // select pin
  // - reset: { io: device.io.DEVICE, pin: 0, mode: Digital.Output }, // reset pin
  // - dio0: { io: device.io.DEVICE, pin: 0, mode: Digital.Input }, // DIO0 interrupt pin
  // - dio2: { io: device.io.DEVICE, pin: 0, mode: Digital.Input }, // DIO2 interrupt pin
  // RF configuration:
  // - frequency: 915, // frequency in Mhz, kHz, or Hz
  // - transmitPower: 17, // transmit power in dBm
  // - bitRate: 50000, // bit rate in bps
  // - deviation: 50000, // single-sided frequency deviation in Hz
  // - bandwidth: 125000, // bandwidth in Hz
  // - afcBandwidth: 125000, // AFC bandwidth in Hz
  // Packet configuration:
  // - preamble: 5, // preamble length in bytes
  // - sync[]: [0xaa, 0x2d, 0xd4], // sync bytes
  // - fixedLength: false, // set to integer to enable fixed length packets
  // - enableReceiver: true, // true: default mode is RX, false: default mode is STANDBY
  // - onReadable: callback when a packet has been received
  // - onWritable: callback when a packet has been sent (i.e. the next one can be sent)
  constructor(options: Record<string, any>) {
    // attach to SPI
    if (options.select) {
      const opts = { ...options.spi, select: options.select.pin, active: 0 }
      this.#spi = new options.spi.io(opts)
    } else {
      this.#spi = new options.spi.io(options.spi)
    }

    // define the interrupt pins
    this.#dio0 = new options.dio0.io({
      ...options.dio0,
      edge: options.dio0.io.Rising,
      onReadable: this.#onDio0.bind(this),
    })
    this.#dio2 = new options.dio2.io({
      ...options.dio2,
      edge: options.dio2.io.Rising,
      onReadable: this.#onSyncAddrDetect.bind(this),
    })

    // reset hardware
    this.#rst = new options.reset.io(options.reset)
    this.#reset()

    // check version of chip, ensure access works and it's the right chip
    for (let i = 0; i < 10; i++) {
      const v = this.#read_reg(REG_VERSION)
      if (v === 0x12 || v === 0x13) break
      if (i === 9) throw Error("SX1276 not found")
      Timer.delay(2)
    }

    // check we have a chip responding by writing and reading a sync value byte
    this.#write_reg(REG_SYNCVALUE1, 0xaa)
    this.#write_reg(REG_SYNCVALUE1, 0xaa)
    let sv = this.#read_reg(REG_SYNCVALUE1)
    if (sv != 0xaa) throw Error(`SX1276 not responding, got 0x${sv} instead of 0xAA`)
    this.#write_reg(REG_SYNCVALUE1, 0x55)
    sv = this.#read_reg(REG_SYNCVALUE1)
    if (sv != 0x55) throw Error(`SX1276 not responding, got 0x${sv} instead of 0x55`)

    // write register init sequence
    for (const v of config_regs) {
      this.#write_reg(v[0], v[1])
    }

    // apply non-default configuration values (also apply defaults for options not in config_regs)
    if (!options.frequency) options.frequency = 915
    if (!options.bitRate) options.bitRate = 50000
    if (!options.deviation) options.deviation = options.bitRate
    if (!options.bandwidth) options.bandwidth = options.bitRate * 2
    if (!options.afcBandwidth) options.afcBandwidth = options.bandwidth + (options.bandwidth >> 2)
    if (!("enableReceiver" in options)) options.enableReceiver = true
    this.configure(options)

    this.#bgTimer = Timer.repeat(this.#periodically.bind(this), 11 * 1000)
  }

  configure(options: Record<string, any>) {
    // set frequency
    if (options.frequency) {
      let freq = options.frequency
      // accept any frequency scale as input, including KHz and MHz
      // multiply by 10 until freq >= 100 MHz (don't specify 0 as input!)
      while (freq < 100000000) freq *= 10
      // Frequency steps are in units of (32,000,000 >> 19) = 61.03515625 Hz
      // 868.0 MHz = 0xD90000, 868.3 MHz = 0xD91300, 915.0 MHz = 0xE4C000
      const frf = Math.floor(freq / 61.03515625) // assumes 32Mhz xtal
      this.#write_reg(0x06, frf >> 16)
      this.#write_reg(0x07, (frf >> 8) & 0xff)
      this.#write_reg(0x08, frf & 0xff)
      // low frequency mode
      if (freq < 525000000) {
        const m = this.#opmode()
        this.#opbits = 0x08 // select low freq range
        this.#opmode(m)
      }
      // perform image calibration on freq change
      //this.#imageCal()
    }

    // set bit rate
    if (options.bitRate) {
      const br = 32000000 / options.bitRate // assumes 32Mhz xtal
      this.#write_reg(0x02, Math.floor(br) >> 8)
      this.#write_reg(0x03, Math.floor(br) & 0xff)
      this.#write_reg(0x5d, Math.floor(br * 16) & 0x0f)
    }

    // set freq deviation
    if (options.deviation) {
      const fd = Math.floor(options.deviation / 61.03515625) // assumes 32Mhz xtal
      this.#write_reg(0x04, (fd >> 8) & 0x3f)
      this.#write_reg(0x05, fd & 0xff)
    }

    // set receiver bandwidth
    if (options.bandwidth) {
      let bix = 0
      while (bix < bw_setting.length && bw_setting[bix][0] < options.bandwidth) bix += 1
      this.#write_reg(0x12, (bw_setting[bix][1] << 3) | bw_setting[bix][2])
    }

    // set receiver bandwidth during AFC
    if (options.afcBandwidth) {
      let aix = 0
      while (aix < bw_setting.length && bw_setting[aix][0] < options.afcBandwidth) aix += 1
      this.#write_reg(0x13, (bw_setting[aix][1] << 3) | bw_setting[aix][2])
    }

    if (options.preamble) {
      this.#write_reg(0x26, options.preamble) // TX preamble
      const detector = Math.min(options.preamble, 3) - 1
      this.#write_reg(0x1f, 0x80 | (detector << 5) | 0x0a) // RX preamble
    }

    if (options.sync) {
      for (let i = 0; i < options.sync.length; i++) {
        this.#write_reg(0x28 + i, options.sync[i])
      }
      this.#write_reg(0x27, (this.#read_reg(0x27) & 0xf4) | ((options.sync.length - 1) & 0x7))
    }

    if (typeof options.fixedLength === "number") {
      this.#write_reg(0x30, 0x00) // switch to fixed length, no whitening, no crc
      this.#write_reg(0x32, options.fixedLength)
      this.#fixedLen = options.fixedLength
    }

    // set transmit power
    //if (options.transmitPower) this.transmitPower = options.transmitPower

    // init rssi tracking
    if (options.frequency || options.bitRate || options.deviation || options.bandwidth) {
      this.#bgRssi = 2 * 90
      this.#write_reg(REG_RSSITHRES, this.#bgRssi - thresAdj)
    }

    // set callbacks
    if (options.onReadable) this.#onReadable = options.onReadable
    if (options.onWritable) this.#onWritable = options.onWritable

    // enable receiver
    this.#rxCont = !!options.enableReceiver
    if (options.enableReceiver) {
      this.#opmode(MODE_RECEIVE)
    }
  }

  close() {
    if (this.#spi) this.#opmode(MODE_SLEEP)

    this.#spi?.close()
    this.#rst?.close()
    this.#dio0?.close()
    this.#dio2?.close()
    if (this.#bgTimer) Timer.clear(this.#bgTimer)

    this.#spi = undefined
    this.#rst = undefined
    this.#dio0 = undefined
    this.#dio2 = undefined
    this.#bgTimer = undefined
  }

  // ===== read and write packets

  // Read a received packet. Normally called after onReceive() callback.
  //
  // @param arg Buffer to fill with data, or undefined to allocate a buffer.  Data must fit or packet is dropped.
  // @return If Buffer passed, returns bytes received.  If Number, returns ArrayBuffer with data.  undefined when no packet.
  read(): ArrayBufferLike | undefined
  read(buffer: Buffer): number | undefined
  read(arg?: number | Buffer): number | ArrayBufferLike | undefined {
    // is a packet waiting?
    const len = this.#rxLen
    if (len == 0) return undefined

    // read bytes from radio into our buffer using a single SPI transfer
    const buf = this.#regs.subarray(0, len + 1)
    buf[0] = 0 // FIFO address
    this.#spi.transfer(buf)
    this.#spi.flush(true)
    this.#rxLen = 0

    // copy bytes into what caller expects
    const src = buf.subarray(1)
    if (arg === undefined) return new Uint8Array(src).buffer

    let dest
    if (arg instanceof ArrayBuffer) dest = new Uint8Array(arg)
    else if (arg instanceof Uint8Array) dest = arg
    else throw new Error("unsupported") // to do: dataview, Int8Array, SharedArrayBuffer

    //  ensure sufficient room in the buffer
    if (len > dest.byteLength) throw new Error(`packet too big ${len} vs. ${dest.byteLength}`)
    else if (len < dest.byteLength) dest = dest.subarray(0, len)

    dest.set(src)
    return len
  }

  // on sync match capture RSSI/AFC/... and start packet rx timeout to catch lock-up
  #onSyncAddrDetect() {
    this.#captureRSSI()
  }

  #onPacketReady() {
    const now = Time.ticks
    if (this.#fixedLen) this.#rxLen = this.#fixedLen
    else this.#rxLen = this.#read_reg(0x00) // read FIFO, first byte is packet length
    // trace(
    //   `packet ready! 0x${this.#read_reg(REG_IRQFLAGS1).toString(16)} 0x${this.#read_reg(
    //     REG_IRQFLAGS2
    //   ).toString(16)}\n`
    // )
    this.#rxRssi = this.#read_reg(REG_RSSIVALUE) // not right but better than in captureRSSI
    this.#onReadable?.(this.#rxLen, now)
  }

  #onDio0() {
    if (this.#txActive) this.#onTxComplete()
    else this.#onPacketReady()
  }

  write(buf: Uint8Array | ArrayBuffer, size = buf.byteLength) {
    if (this.#txActive) throw Error("Xmit Overlap")
    this.#txActive = true

    // prepare radio for transmission
    this.#opmode(MODE_FSTX)
    if (!ArrayBuffer.isView(buf)) buf = new Uint8Array(buf)
    // wait for mode ready else stuffing fifo may not work
    while ((this.#read_reg(REG_IRQFLAGS1) & IRQ1_MODEREADY) == 0) {}

    // send data to radio using a single SPI transaction
    const regs = this.#regs
    regs[0] = 0x80 // write fifo addr (0x00)
    regs[1] = size
    regs.set(buf, 2)
    this.#spi.transfer(regs.subarray(0, buf.length + 2))
    this.#spi.flush(true)

    // transmit
    this.#opmode(MODE_TRANSMIT)
  }

  #onTxComplete() {
    // reset chip back to our standard radio mode (idle or receive)
    this.#opmode(this.#rxCont ? MODE_RECEIVE : MODE_STANDBY)
    this.#txActive = false
    this.#onWritable?.()
  }

  // periodically measure background RSSI and adjust RSSI threshold if necessary
  #periodically() {
    const r = this.#bgRssi
    const v = this.#read_reg(REG_RSSIVALUE)

    if (v > 2 * 70 && v < 2 * 100) {
      // reject non-sensical values
      this.#bgRssi = (this.#bgRssi * 15 + v) >> 4 // exponential smoothing
      if (this.#bgRssi != r) {
        trace(`sx1276-fsk: bgRssi -${r >> 1}-${v >> 1}/16 -> -${this.#bgRssi >> 1}dBm\n`)
        // set threshold a couple of dB above noise
        this.#write_reg(REG_RSSITHRES, this.#bgRssi - thresAdj)
      }
    }
    const irq1 = this.#read_reg(REG_IRQFLAGS1)
    const irq2 = this.#read_reg(REG_IRQFLAGS2)
    const mode = this.#read_reg(REG_OPMODE)

    const afc = (this.#read_reg(REG_AFC) << 8) | this.#read_reg(REG_AFC)
    const fei = (this.#read_reg(REG_FEI) << 8) | this.#read_reg(REG_FEI)
    const lna = lna_map[(this.#read_reg(REG_LNAVALUE) >> 5) & 0x7]

    const oops = this.#rxCont && (mode & 0x7) != MODE_RECEIVE
    trace(
      `sx1276-fsk: irq1=${irq1.toString(16)} irq2=${irq2.toString(16)} ` +
        `mode=${modes[mode & 0x7]}${oops ? " OOPS!" : ""}\n`
    )

    const oops2 = afc != 0 && afc == this.#idleAfc
    this.#idleAfc = afc
    trace(
      `sx1276-fsk: AFC ${((afc << 16) >> 16) * 61}Hz FEI ${((fei << 16) >> 16) * 61}Hz ` +
        `LNA ${lna}dB bgRSSI -${this.#bgRssi >> 1}dBm\n`
    )
    if (oops) this.#opmode(MODE_RECEIVE)
    if (!oops && oops2) this.#write_reg(0x1a, 0x3) // clear AFC
  }

  #captureRSSI() {
    let s = 0x0c // first register to read
    const rxRegs = this.#regs
    rxRegs[0] = 0x0c
    this.#spi.transfer(rxRegs.subarray(0, 0x15))
    this.#spi.flush(true)
    // extract info
    s -= 1 // to account for first element which is address
    this.#rxRssi = rxRegs[REG_RSSIVALUE - s]
    this.#rxThres = rxRegs[REG_RSSITHRES - s]
    this.#rxLna = lna_map[(rxRegs[REG_LNAVALUE - s] >> 5) & 0x7]
    const f = (rxRegs[REG_AFC - s] << 8) | rxRegs[REG_AFC + 1 - s]
    this.#rxFei = ((f << 16) >> 16) * 61 // sign-extend and * fStep
    // trace(`rssi=${this.#rxRssi} ${this.rxRssi} ${this.#rxThres}\n`)
  }

  get rxRssi() {
    return -(this.#rxRssi >> 1)
  }
  get rxLna() {
    return this.#rxLna
  }
  get rxAfc() {
    return this.#rxFei
  }
  get rxMargin() {
    const limit = this.#rxThres + thresAdj - 2 * demod // unit: 1/2dB
    let margin = this.#rxRssi > limit ? 0 : (limit - this.#rxRssi) >> 1
    if (margin > 20) margin = 20
    return margin
  }

  // ===== low-level stuff

  #read_reg(register: number) {
    const buffer = this.#buffer16
    buffer[0] = register
    buffer[1] = 0xff
    this.#spi.transfer(buffer)
    this.#spi.flush(true)
    return buffer[1]
  }

  #write_reg(register: number, value: number) {
    const buffer = this.#buffer16
    buffer[0] = 0x80 | register
    buffer[1] = value
    this.#spi.transfer(buffer)
    this.#spi.flush(true)
  }

  dump_regs() {
    trace("\n   00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F")
    const o2x = (v: number) => ("0" + v.toString(16)).slice(-2) // %0x2 number format
    for (let ix = 0; ix < 0x70; ix++) {
      if (ix % 16 == 0) trace(`\n${o2x(ix)}`)
      trace(` ${o2x(this.#read_reg(ix))}`)
    }
    trace("\n")
  }

  #reset() {
    this.#rst.write(0)
    Timer.delay(10)
    this.#rst.write(1)
    Timer.delay(10)
  }

  // image and rssi calibration, takes about 10ms
  #imageCal() {
    this.#opmode(MODE_STANDBY)
    this.#write_reg(REG_IMAGECAL, this.#read_reg(REG_IMAGECAL) | 0x40)
    while ((this.#read_reg(REG_IMAGECAL) & 0x20) != 0) Timer.delay(10)
  }

  // Set data format for write and read.  Just verifies the value is "buffer" as that is the only format supported.
  set format(value) {
    if ("buffer" !== value) throw new RangeError()
  }
  // Return the format used for read/write (always "buffer")
  get format() {
    return "buffer"
  }

  #opmode(): number
  #opmode(new_mode: number): void
  #opmode(new_mode: number | void): void | number {
    if (typeof new_mode != "number") return this.#read_reg(REG_OPMODE) & 0x07
    // const needIntr = new_mode == MODE_RECEIVE || new_mode == MODE_TRANSMIT
    // if (!needIntr) this.#write_reg(REG_DIOMAPPING1, 0x9c)
    this.#write_reg(REG_OPMODE, this.#opbits | (new_mode & 0x7))
    // if (needIntr) {
    //   // dio0->payload-ready/packet-sent, dio4->preamble
    //   this.#write_reg(REG_DIOMAPPING1, 0x1c)
    // }
  }
}

// configRegs contains register-address, register-value pairs for initialization.
const config_regs = [
  [0x01, 0x00], // FSK mode, high-freq regs, sleep mode
  [0x01, 0x00], // FSK mode, high-freq regs, sleep mode
  [0x09, 0xf0 + 11], // use PA_BOOST, start at 13dBm
  [0x0a, 0x09], // no shaping, 40us TX rise/fall
  [0x0b, 0x32], // Over-current protection @150mA
  [0x0b, 0x3b], // Over-current protection @150mA
  [0x0c, 0x20], // max LNA gain, no boost
  //[0x0D, 0x99], // AFC on, AGC on, AGC&AFC on rssi detect
  [0x0d, 0x9f], // AFC on, AGC on, AGC&AFC on rssi and preamble detect
  [0x0e, 0x04], // 32-sample rssi smoothing (8 bit times)
  //[0x0e, 0x06], // 128-sample rssi smoothing (32 bit times)
  [0x0f, 0x0a], // 10dB RSSI collision threshold
  [0x10, 90 * 2], // RSSI threshold (start at -90dBm)
  [0x1a, 0x01], // clear AFC at start of RX
  [0x1f, 0xca], // 3 byte preamble detector, tolerate 10 chip errors (2.5 bits)
  [0x20, 0x00], // No RX timeout if RSSI doesn't happen
  [0x21, 0x00], // No RX timeout if no preamble
  [0x22, 0x00], // No RX timeout if no sync
  [0x23, 0x02], // delay 8 bits after RX end before restarting RX
  [0x24, 0x07], // no clock out
  [0x25, 0x00],
  [0x26, 0x05], // TX preamble 5 bytes
  [0x27, 0x10], // no auto-restart, 0xAA preamble, enable 1 byte sync
  [0x28, 0x91], // sync1: CTT
  [0x30, 0xd0], // whitening, CRC on, no addr filt, CCITT CRC
  [0x31, 0x40], // packet mode
  [0x32, 64], // max RX payload length
  [0x35, 0x8f], // start TX when FIFO has 1 byte, FifoLevel intr when 15 bytes in FIFO
  [0x40, 0x1c], // dio0->PayRdy, dio1->FifoEmpty, dio2->SyncAddr, dio3->FifoEmpty
  //[0x40, 0x14], // dio0->PayRdy, dio1->FifoEmpty, dio2->RxReady, dio3->FifoEmpty
  [0x41, 0xf1], // dio4->Rssi/PreAmbleDet, dio5->mode-ready,
  [0x44, 0x2d], // no fast-hop
  [0x4d, 0x87], // enable 20dBm tx power
]
Object.freeze(config_regs)
for (const el of config_regs) Object.freeze(el)

// table of bandwidths supported by radio: (hz, RxBwMant, RxBwExp)
const bw_setting = [
  [2600, 2, 7],
  [3100, 1, 7],
  [3900, 0, 7],
  [5200, 2, 6],
  [6300, 1, 6],
  [7800, 0, 6],
  [10400, 2, 5],
  [12500, 1, 5],
  [15600, 0, 5],
  [20800, 2, 4],
  [25000, 1, 4],
  [31300, 0, 4],
  [41700, 2, 3],
  [50000, 1, 3],
  [62500, 0, 3],
  [83300, 2, 2],
  [100000, 1, 2],
  [125000, 0, 2],
  [166700, 2, 1],
  [200000, 1, 1],
  [250000, 0, 1],
]
Object.freeze(bw_setting)
for (const el of bw_setting) Object.freeze(el)

const REG_OPMODE = 0x01
const REG_IRQFLAGS1 = 0x3e
const REG_IRQFLAGS2 = 0x3f
const REG_VERSION = 0x42
const REG_SYNCVALUE1 = 0x28
const REG_RSSITHRES = 0x10
const REG_RSSIVALUE = 0x11
const REG_DIOMAPPING1 = 0x40
const REG_DIOMAPPING2 = 0x41
const REG_NODEADDR = 0x33
const REG_BCASTADDR = 0x34
const REG_IMAGECAL = 0x3b
const REG_PADAC = 0x4d
const REG_LNAVALUE = 0x0c
const REG_AFC = 0x1b
const REG_FEI = 0x1d

const MODE_SLEEP = 0
const MODE_STANDBY = 1
const MODE_FSTX = 2
const MODE_TRANSMIT = 3
const MODE_FSRX = 4
const MODE_RECEIVE = 5

const modes = ["slp", "stdby", "fstx", "tx", "fsrx", "rx"]

const IRQ1_MODEREADY = 1 << 7
const IRQ1_RXREADY = 1 << 6
const IRQ1_PREAMBLEDETECT = 1 << 1
const IRQ1_SYNADDRMATCH = 1 << 0

const IRQ2_FIFONOTEMPTY = 1 << 6
const IRQ2_PACKETSENT = 1 << 3
const IRQ2_PAYLOADREADY = 1 << 2

// convert LNA values to dB
const lna_map = new Uint8Array([0, 0, 6, 12, 24, 36, 48, 48])
//Object.freeze(lna_map)
