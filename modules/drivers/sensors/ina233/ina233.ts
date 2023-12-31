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
  TIME_140: 0, // 140us
  TIME_204: 1, // 204us
  TIME_332: 2, // 332us
  TIME_588: 3, // 588us
  TIME_1100: 4, // 1.1ms
  TIME_2116: 5, // 2.116ms
  TIME_4156: 6, // 4.156ms
  TIME_8244: 7, // 8.244ms
  AVG_1: 0, // 1 sample
  AVG_4: 1, // 4 samples
  AVG_16: 2, // 16 samples
  AVG_64: 3, // 64 samples
  AVG_128: 4, // 128 samples
  AVG_256: 5, // 256 samples
  AVG_512: 6, // 512 samples
  AVG_1024: 7, // 1024 samples
}
Object.freeze(ADC)
const ADC_TIME = [140, 204, 332, 588, 1100, 2116, 4156, 8244]
Object.freeze(ADC_TIME)
const ADC_AVG = [1, 4, 16, 64, 128, 256, 512, 1024]
Object.freeze(ADC_AVG)

export const POLARITY = {
  BOTH: 0x00, // accumulate absolute value of power (default)
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
}

export interface Sample {
  v: number // voltage in volts
  a: number // current in amps
  w: number // power in watts
  j: number // energy in watt-hours, since previous sample
  w_avg: number // average power in watts, since previous sample
}

export default class INA233 {
  #io
  #einRaw = new Uint8Array(7)
  #onError?: (error: string) => void

  #accum_ival = 1
  #iin_fct = 1
  #pin_fct = 25
  #e_at = 0 // ticks when energy accumulator was last read
  #positive = true // sign of current accumulator

  constructor(options: Options) {
    const io = (this.#io = new options.sensor.io({
      hz: 400_000,
      address: 0x40,
      ...options.sensor,
    }))

    this.#onError = options.onError

    // verify that we're talking to an ina233
    const modelBuf = this.#io.readBuffer(COMMANDS.MFR_MODEL, 7)
    const model = new TextDecoder().decode(new Uint8Array(modelBuf, 1))
    if (model != "INA233") {
      this.#onError?.(`Wrong model: ${model}`)
      this.close()
      return
    }

    // ensure certain configuration options get set now
    if (options.shuntOhms == undefined) options.shuntOhms = 0.01
    if (options.maxCurrent == undefined) options.maxCurrent = 10
    if (options.averaging == undefined) options.averaging = 1

    this.configure(options)
  }

  close() {
    this.#io?.close()
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
    if (options.polarity != undefined) {
      const pol = (options.polarity || POLARITY.BOTH) & 0x03
      const clr = 6 // auto-clear accumulator and latch alerts
      this.#io.writeUint8(COMMANDS.MFR_DEVICE_CONFIG, (pol << 4) | clr)
    }

    // configure the ADC conversion times
    if (
      options.vTime != undefined ||
      options.aTime != undefined ||
      options.averaging != undefined
    ) {
      const avg = (options.averaging ?? ADC.AVG_1) & 7
      const vTime = (options.vTime ?? ADC.TIME_1100) & 7
      const aTime = (options.aTime ?? ADC.TIME_1100) & 7
      this.#accum_ival = (ADC_TIME[vTime] + ADC_TIME[aTime]) * ADC_AVG[avg] // usec
      const mode = 0x07 // continuous mode
      this.#io.writeUint16(COMMANDS.MFR_ADC_CONFIG, (avg << 9) | (vTime << 5) | (aTime << 3) | mode)
    }

    // always clear the energy accumulator
    this.#io.sendByte(COMMANDS.CLEAR_EIN)
    this.#e_at = Time.ticks
  }

  // given a steady-state power consumption, calculate the max interval for calling
  // sample() in ticks (milliseconds)
  maxInterval(power: number): number {
    const samples = Math.floor(2 ** 24 / (power / this.#pin_fct))
    const ticks = (samples * this.#accum_ival) / 1000
    return ticks
  }

  // return the sampling interval in microseconds
  get sampleInterval(): number {
    return this.#accum_ival
  }

  // clear energy accumulator
  clear(): void {
    this.#io.write(COMMANDS.CLEAR_EIN)
    this.#e_at = Time.ticks
  }

  sample(s?: Object): Sample {
    // read raw data
    const vin = this.#io.readUint16(COMMANDS.READ_VIN)
    const iin = (this.#io.readUint16(COMMANDS.READ_IIN) << 16) >> 16
    const pin = this.#io.readUint16(COMMANDS.READ_PIN)
    const einRaw = new Uint8Array(7)
    const e_at = Time.ticks
    this.#io.readBuffer(COMMANDS.READ_EIN, einRaw)
    if (einRaw[0] != 6) throw new Error("INA233: bad ein length")
    const positive = this.#positive
    this.#positive = iin >= 0 // applies to next sample

    // put together accumulated energy reading
    const count = (einRaw[6] << 16) | (einRaw[5] << 8) | einRaw[4]
    const sum = (einRaw[3] << 16) | (einRaw[2] << 8) | einRaw[1]
    const ein = sum / count
    const p_avg = ein * this.#pin_fct
    const dt = e_at - this.#e_at
    this.#e_at = e_at

    // return scaled values
    const sample = (s ?? {}) as Sample
    sample.v = vin * 1.25e-3 // 1.25mV/LSB
    sample.a = iin * this.#iin_fct
    sample.w = pin * this.#pin_fct
    sample.w_avg = p_avg
    sample.j = (ein * 1000) / dt // 1000 converts dt from ms to s
    if (!positive) {
      sample.w = -sample.w
      sample.w_avg = -sample.w_avg
      sample.j = -sample.j
    }
    return sample
  }
}
