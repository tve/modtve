// Bosch BMI160 accelerometer/gyroscope driver
// Copyright © 2023 by Thorsten von Eicken.

import Timer from "timer"
import Time from "time"

const REGISTERS = {
  WHO_AM_I: 0x00,
  PMU_STATUS: 0x03,
  DATA: 0x0c, // 6 bytes accel, 6 bytes gyro, 3 bytes sensortime
  SENSORTIME: 0x18, // 24-bit sensor time
  STATUS: 0x1b,
  TEMP: 0x20, // 16-bit temperature
  FIFO_LENGTH: 0x22, // number of bytes in the fifo
  FIFO_DATA: 0x24,
  FIFO_DOWNS: 0x45, // FIFO downsampling config
  FIFO_CONFIG: 0x46, // FIFO configuration
  FOC_CONF: 0x69, // fast offset compensation ("calibration")
  OFF0: 0x71, // byte 1 (index 0) of offset compensation: accel x
  OFF6: 0x77, // byte 7 (index 6) of offset compensation: has enable bits
  CMD: 0x7e,
}
Object.freeze(REGISTERS)
const EXPECTED_WHO_AM_I = 0xd1

export const AccelRange = {
  RANGE_2_G: 3,
  RANGE_4_G: 5,
  RANGE_8_G: 8,
  RANGE_16_G: 12,
}
Object.freeze(AccelRange)

export const GyroRange = {
  RANGE_125: 4,
  RANGE_250: 3,
  RANGE_500: 2,
  RANGE_1000: 1,
  RANGE_2000: 0,
}
Object.freeze(GyroRange)

// 	Alert: {
// 		DATA_READY: 	1,
// 		MOVEMENT:		2
// 	}

const GtoMS2 = 9.80665 // convert g's to m/s^2

// scale from raw 16-bit signed data to g's
const ACC_SCALER = Array(14)
ACC_SCALER[AccelRange.RANGE_2_G] = 1 / 16384
ACC_SCALER[AccelRange.RANGE_4_G] = 1 / 8192
ACC_SCALER[AccelRange.RANGE_8_G] = 1 / 4096
ACC_SCALER[AccelRange.RANGE_16_G] = 1 / 2048
Object.freeze(ACC_SCALER)

// scale from raw 16-bit signed data to deg/s
const GYR_SCALER = Object.freeze([0.061, 0.0305, 0.0153, 0.0076, 0.0038])

// FIFO constants
const FIFO = {
  PACKET_LENGTH: 12, // accel + gyro
  MAX_PACKETS: Math.floor(1024 / 12) - 2, // 1024 byte fifo, but BMI keeps 2 frames free
}
Object.freeze(FIFO)

export interface Options {
  sensor: {
    io: any
    address?: number
  }
  onError?: (error: string) => void
  fifo?: boolean // whether to enable the FIFO for batch reading
  accelUnit?: "g" | "m/s^2" | "m/s2" // default m/s^2
  zero?: Uint8Array // offsets to zero accel/gyro ("calibrate"), typ. obtained via zero()
}

export interface Accelerometer {
  x: number
  y: number
  z: number
}
export interface Gyroscope {
  x: number
  y: number
  z: number
}
export interface Sample {
  ticks: number
  accelerometer: Accelerometer
  gyroscope: Gyroscope
}

export type BatchCallback = (ticks: number, g: Gyroscope, a: Accelerometer) => void

export default class BMI160 {
  #io
  #regsRaw = new ArrayBuffer(12) // accel
  #regsView: DataView
  #use_fifo = false
  #fifo_remain = 0 // number of samples known to be available in the fifo
  #fifo_next?: number // ticks for expected next fifo sample
  #fifo_intv = 10 // fifo interval in ms (fixed for now)
  #accelRange = AccelRange.RANGE_2_G
  #gyroRange = GyroRange.RANGE_2000
  #unit_fct? = GtoMS2
  // #onAlert;
  #onError?: (error: string) => void
  // #monitor;

  constructor(options: Options) {
    const io = (this.#io = new options.sensor.io({
      hz: 400_000,
      address: 0x68,
      ...options.sensor,
    }))

    this.#onError = options.onError

    this.#regsView = new DataView(this.#regsRaw) // for 16-bit little-endian access

    try {
      // read register 0x7F to ensure SPI works, see datasheet section 3.2.1
      io.readUint8(0x7f)

      // verify that we're indee talking to a BMI160
      const gxlID = io.readUint8(REGISTERS.WHO_AM_I)
      if (gxlID != EXPECTED_WHO_AM_I) {
        this.#onError?.("unexpected sensor")
        this.close()
        return
      }

      // device reset
      const t0 = Time.ticks
      this.runCommand(0xb6) // soft-reset
      //trace("BMI160 reset cmd " + (Time.ticks - t0) + " ms\n")

      // power up accelerometer and gyroscope
      this.runCommand(0x11) // set ACC normal mode
      this.runCommand(0x15) // set GYR normal mode

      // wait for everything to power up
      while ((io.readUint8(REGISTERS.PMU_STATUS) & 0x3f) != 0x14) {
        Timer.delay(0)
      }

      this.configure(options)
    } catch (error) {
      this.#onError?.("BMI160: " + error)
      this.close()
    }

    // const {alert, onAlert} = options;
    // if (alert && onAlert) {
    // 	this.#onAlert = options.onAlert;
    // 	this.#monitor = new alert.io({
    // 		mode: alert.io.InputPullUp,
    // 		...alert,
    // 		edge: alert.io.Falling,
    // 		onReadable: () => this.#onAlert()
    // 	});

    // 	// active low, open drain, no latch, i2c bypass
    // 	io.writeUint8(REGISTERS.INT_CONFIG, 0b1101_0010);
    // 	io.writeUint8(REGISTERS.INT_ENABLE, 0b0000_0001);
    // }
  }

  configure(options: Options) {
    const io = this.#io

    if (options.fifo != undefined) {
      this.#use_fifo = options.fifo
      this.#fifo_remain = 0
      io.writeUint8(REGISTERS.FIFO_CONFIG + 1, options.fifo ? 0xc0 : 0)
      this.runCommand(0xb0) // fifo-flush
    }

    if (options.accelUnit != undefined) {
      switch (options.accelUnit) {
        case "g":
          this.#unit_fct = undefined
          break
        case "m/s2":
        case "m/s^2":
          this.#unit_fct = GtoMS2
          break
        default:
          throw new Error("unknown unit (use 'g' or 'm/s2')")
      }
    }

    // write offsets previously returned by zero()
    if (options.zero != undefined) {
      if (options.zero.length != 7) throw new Error("invalid zero length")
      this.#io.writeBuffer(REGISTERS.OFF0, options.zero)
    }

    // ranges and sample rates should be configurable, most of the code is there, but
    // someone needs to go through all the details...

    // 	if (undefined !== options.range) {
    // 		this.#range = options.range | 0b11;
    // 		io.writeUint8(REGISTERS.ACCEL_CONFIG, this.#range << 3);
    // 	}

    // 	if (undefined !== options.gyroRange) {
    // 		this.#gyroRange = options.gyroRange | 0b11;
    // 		io.writeUint8(REGISTERS.GYRO_CONFIG, this.#gyroRange << 3);
    // 	}

    // 	if (undefined !== options.sampleRateDivider)
    // 		io.writeUint8(REGISTERS.SAMPLERATE_DIV, options.sampleRateDivider & 0xff);

    // 	if (undefined !== options.lowPassFilter)
    // 		io.writeUint8(REGISTERS.DLPF_CONFIG, options.lowPassFilter & 0b111);
  }

  close() {
    this.#io?.close()
    this.#io = undefined
  }

  temperature() {
    const raw = this.#readInt16(REGISTERS.TEMP)
    return (raw * 64) / 0x8000 + 23
  }

  // drop_data() {
  //   const io = this.#io
  //   io.readBuffer(REGISTERS.DATA, this.#regsRaw)
  // }

  // zero-out the readings, return offsets that can be used to restore them
  // note: these could be stored in NVRAM but that can only be written 14 times...
  zero(upsidedown: boolean = false): Uint8Array {
    const io = this.#io
    const v = 0x7c | (upsidedown ? 2 : 1)
    io.writeUint8(REGISTERS.FOC_CONF, v) // enable accel and gyro calibration
    this.runCommand(0x03) // CMD_START_FOC
    // wait for calibration to complete
    while ((io.readUint8(REGISTERS.STATUS) & 0x08) == 0) {
      Timer.delay(1)
    }
    // ensure the offsets are actually taken into account
    io.writeUint8(REGISTERS.OFF6, io.readUint8(REGISTERS.OFF6) | 0xc0)
    // return the calibration offsets
    io.readBuffer(REGISTERS.OFF0, this.#regsRaw)
    return new Uint8Array(this.#regsRaw.slice(0, 7))
  }

  #query_fifo() {
    let num = this.#io.readUint16(REGISTERS.FIFO_LENGTH)
    let now = Time.ticks
    if (num > 900) trace(`BMI160 FIFO: ${num} bytes!\n`)
    const snum = Math.idiv(num, FIFO.PACKET_LENGTH)
    if (snum == 0) return

    // figure timestamp of first sample
    const span = (snum - 1) * this.#fifo_intv
    let ts = now - span // tentative assuming we need to reset time
    // see whether we can continue from previous batch instead
    if (snum < FIFO.MAX_PACKETS && this.#fifo_next != undefined) {
      // FIFO didn't fill, continue timestamps from previous batch
      const tsLast = this.#fifo_next + span // timestamp for last sample
      // check for BMI clock drift WRT ours
      if (tsLast > now - this.#fifo_intv && tsLast < now + this.#fifo_intv) ts = this.#fifo_next
    }
    // prep vars for pop_fifo
    this.#fifo_next = ts
    this.#fifo_remain = snum
  }

  // pop a sample from the fifo and return it
  #pop_fifo(s?: Sample): Sample | undefined {
    const raw = this.#io.readBuffer(REGISTERS.FIFO_DATA, this.#regsRaw)
    if (raw != FIFO.PACKET_LENGTH) throw new Error("BMI160: short read")
    const ret = s || ({} as Sample)
    ret.ticks = this.#fifo_next!
    this.#fifo_next! += this.#fifo_intv
    this.#fifo_remain--
    ret.gyroscope = this.#gyrFromRaw(ret.gyroscope)
    ret.accelerometer = this.#accelFromRaw(ret.accelerometer)
    return ret
  }

  // waits up to 10ms for a fresh sample to be available and returns it
  // throws if no sample can be obtained (error 'cause sample rate should produce one!)
  latest(s?: Sample): Sample | undefined {
    const io = this.#io

    // read status looking for a sample being available, use a 10ms timeout (100Hz sample rate)
    const t0 = Time.ticks
    let status = io.readUint8(REGISTERS.STATUS)
    while ((status & 0xc0) != 0xc0 && Time.ticks - t0 <= 10) {
      status = io.readUint8(REGISTERS.STATUS)
    }
    if ((status & 0xc0) != 0xc0) {
      this.#onError?.("timeout")
      return
    }

    io.readBuffer(REGISTERS.DATA, this.#regsRaw)
    const ts = Time.ticks
    const ret = s || ({} as Sample)
    ret.ticks = ts
    ret.gyroscope = this.#gyrFromRaw(ret.gyroscope)
    ret.accelerometer = this.#accelFromRaw(ret.accelerometer)
    return ret
  }

  sample(s?: Sample): Sample | undefined {
    if (!this.#use_fifo) return this.latest(s)
    if (this.#fifo_remain == 0) this.#query_fifo()
    return this.#fifo_remain > 0 ? this.#pop_fifo(s) : undefined
  }

  #gyrFromRaw(g?: Gyroscope): Gyroscope {
    const ret = g || ({} as Gyroscope)
    ret.x = this.#regsView.getInt16(0, true) * GYR_SCALER[this.#gyroRange] // true->littleEndian
    ret.y = this.#regsView.getInt16(2, true) * GYR_SCALER[this.#gyroRange]
    ret.z = this.#regsView.getInt16(4, true) * GYR_SCALER[this.#gyroRange]
    return ret
  }

  #accelFromRaw(a?: Accelerometer): Accelerometer {
    const ret = a || ({} as Accelerometer)
    ret.x = this.#regsView.getInt16(6, true) * ACC_SCALER[this.#accelRange]
    ret.y = this.#regsView.getInt16(8, true) * ACC_SCALER[this.#accelRange]
    ret.z = this.#regsView.getInt16(10, true) * ACC_SCALER[this.#accelRange]
    if (this.#unit_fct !== undefined) {
      ret.x = ret.x * this.#unit_fct
      ret.y = ret.y * this.#unit_fct
      ret.z = ret.z * this.#unit_fct
    }
    return ret
  }

  // read 16-bit signed integer register
  #readInt16(reg: number) {
    return (this.#io.readUint16(reg) << 16) >> 16
  }

  // write a command to the CMD register and wait for the command to complete
  runCommand(cmd: number) {
    this.#io.writeUint8(REGISTERS.CMD, cmd)
    //trace("BMI160 command " + cmd.toString(16) + "\n")
    if (cmd == 0xb6) Timer.delay(10) // reset command
    const t0 = Time.ticks
    // 100ms timeout for command to complete (reset may take 80)
    while (Time.ticks - t0 < 100) {
      try {
        if (this.#io.readUint8(REGISTERS.CMD) == 0) return
      } catch (e) {
        // ignore
      }
    }
    throw new Error("command timeout")
  }
}
