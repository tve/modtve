// TI INA233 power monitor driver
// Copyright © 2023 by Thorsten von Eicken.

import Time from "time"
import TextDecoder from "text/decoder"

// The INA233 uses a PMBus interface, which means it has commands that take/return
// data instead of having a set of registers.
const COMMANDS = {
  CLEAR_FAULTS: 0x03,
  READ_EIN: 0x86, // read energy measurement
  READ_VIN: 0x88, // read voltage measurement
  READ_IIN: 0x89, // read current measurement
  READ_PIN: 0x97, // read power measurement
  MFR_MODEL: 0x9a, // read model number ("INA233")
  MFR_ADC_CONFIG: 0xd0, // read/write ADC configuration
  MFR_CALIBRATION: 0xd4, // read/write calibration
  MFR_DEVICE_CONFIG: 0xd5, // read/write device configuration
  CLEAR_EIN: 0xd6, // clear energy accumulator
}
Object.freeze(COMMANDS)

export const ADC = {
  TIME_140: 0x00, // 140us
  TIME_204: 0x01, // 204us
  TIME_332: 0x02, // 332us
  TIME_588: 0x03, // 588us
  TIME_1100: 0x04, // 1.1ms
  TIME_2116: 0x05, // 2.116ms
  TIME_4156: 0x06, // 4.156ms
  TIME_8244: 0x07, // 8.244ms
}
Object.freeze(ADC)

export const POLARITY = {
  BOTH: 0x00, // accumulate both positive and negative power (default)
  POSITIVE: 0x01, // accumulate only positive power (positive current)
  NEGATIVE: 0x02, // accumulate only negative power (negative current)
}

export interface Options {
  sensor: {
    io: any
    address?: number
  }
  onError?: (error: string) => void

  // shutOhms and maxCurrent must be specified together, or neither
  shuntOhms?: number // shunt resistor value in ohms (default: 0.01)
  maxCurrent?: number // max current in amps (default: 10A)
  // averaging, vTime and aTime must be specified together, or neither
  averaging?: number // number of samples to average (1,4,16,64,...1024), default:1
  vTime?: number // voltage ADC conversion time (ADC.TIME_*), default:1.1ms
  aTime?: number // current ADC conversion time (ADC.TIME_*), default:1.1ms
  // polarity and clearEnergy must be specified together, or neither
  polarity?: number // polarity (POLARITY.*), default:POLARITY.BOTH
  clearEnergy?: boolean // clear energy accumulator on reading sample, default:false
}

export interface Sample {
  v: number // voltage in volts
  i: number // current in amps
  p: number // power in watts
  e: number // energy in watt-hours, since previous sample
  p_avg: number // average power in watts, since previous sample
}

export default class INA233 {
  #io
  // #regsRaw = new ArrayBuffer(12) // accel
  // #regsView: DataView
  #onError?: (error: string) => void

  #iin_fct = 1
  #pin_fct = 25
  #e_at = 0 // ticks when energy accumulator was last cleared

  constructor(options: Options) {
    const io = (this.#io = new options.sensor.io({
      hz: 400_000,
      address: 0x40,
      ...options.sensor,
    }))

    this.#onError = options.onError

    // this.#regsView = new DataView(this.#regsRaw) // for 16-bit little-endian access

    // verify that we're talking to an ina233
    const modelBuf = this.#io.readBuffer(COMMANDS.MFR_MODEL, 7)
    const model = new TextDecoder().decode(new Uint8Array(modelBuf, 1))
    if (model != "INA233") {
      this.#onError?.(`Wrong model: ${model}`)
      this.close()
      return
    }

    if (options.shuntOhms == undefined) options.shuntOhms = 0.01
    if (options.maxCurrent == undefined) options.maxCurrent = 10
    this.configure(options)
  }

  close() {
    this.#io = null
  }

  configure(options: Options) {
    // configure the shunt resistor value
    if (options.shuntOhms && options.maxCurrent) {
      const currentLsb = options.maxCurrent / 32768
      const cal = Math.round(0.00512 / (currentLsb * options.shuntOhms))
      this.#io.writeUint16(COMMANDS.MFR_CALIBRATION, cal)
      this.#iin_fct = currentLsb
      this.#pin_fct = currentLsb * 25
    }

    // device config
    if (options.polarity != undefined || options.clearEnergy != undefined) {
      const pol = (options.polarity || POLARITY.BOTH) & 0x03
      const clr = options.clearEnergy ? 6 : 2 // latch alerts
      this.#io.writeUint8(COMMANDS.MFR_DEVICE_CONFIG, (pol << 4) | clr)
    }

    // configure the ADC conversion times
    if (
      options.vTime != undefined ||
      options.aTime != undefined ||
      options.averaging != undefined
    ) {
      const avg = Math.round(Math.log2(options.averaging || 1) / 2) & 7
      const vTime = (options.vTime ?? ADC.TIME_1100) & 7
      const aTime = (options.aTime ?? ADC.TIME_1100) & 7
      const mode = 0x07 // continuous mode
      this.#io.writeUint16(COMMANDS.MFR_ADC_CONFIG, (avg << 9) | (vTime << 5) | (aTime << 3) | mode)
    }

    // always clear the energy accumulator
    this.#io.sendByte(COMMANDS.CLEAR_EIN)
    this.#e_at = Time.ticks
  }

  // clear energy accumulator
  clear(): void {
    this.#io.write(COMMANDS.CLEAR_EIN)
    this.#e_at = Time.ticks
  }

  sample(): Sample {
    // read raw data
    const vin = this.#io.readUint16(COMMANDS.READ_VIN)
    const iin = (this.#io.readUint16(COMMANDS.READ_IIN) << 16) >> 16
    const pin = this.#io.readUint16(COMMANDS.READ_PIN)
    const einRaw = new Uint8Array(7)
    const e_at = Time.ticks
    this.#io.readBuffer(COMMANDS.READ_EIN, einRaw)
    if (einRaw[0] != 6) throw new Error("INA233: bad ein length")

    // put together accumulated energy reading
    const count = (einRaw[6] << 16) | (einRaw[5] << 8) | einRaw[4]
    const sum = (einRaw[3] << 16) | (einRaw[2] << 8) | einRaw[1]
    const ein = sum / count
    const p_avg = ein * this.#pin_fct
    const dt = e_at - this.#e_at
    this.#e_at = e_at

    // return scaled values
    const s = {
      v: vin * 1.25e-3, // 1.25mV/LSB
      i: iin * this.#iin_fct,
      p: pin * this.#pin_fct,
      p_avg,
      e: (ein * 1000) / dt, // 1000 converts dt from ms to s
    }
    return s
  }
}
