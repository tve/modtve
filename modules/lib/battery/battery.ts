// battery - keep track of battery charge using power monitor, such as INA233
// Copright © 2023 by Thorsten von Eicken

import Timer from "timer"

export interface Options {
  sensor: Record<string, any> & {
    io: any // power management sensor class to instantiate
  }
  onError?: (error: string) => void

  capacity?: number // joules (watt-seconds), default: 3600 (1 Wh)
  v_full?: number // voltage threshold to declare battery full (default: 4.15V "LiPo full")
}

export interface Sample {
  volts: number // battery voltage
  amps: number // battery current, positive: discharge, negative: charge
  watts: number // battery charge/discharge power (always positive)
  joules: number // energy stored in the battery (joules), 0=empty, capacity=full
  charge: number // battery percent charge, 0=empty, 100=full
}

export default class Battery {
  #capacity = 3600 // energy the battery can hold when full
  #sample: Sample // current sampling values, smoothed
  #v_full = Infinity
  #sensor: any // power management sensor instance
  #onError?: (error: string) => void
  #cnt = 0 // counter of readings

  constructor(options: Options) {
    const io = (this.#sensor = new options.sensor.io(options.sensor))
    this.#onError = options.onError
    this.configure(options)
    const s = this.#sensor.sample() as Record<string, any>
    this.#sample = {
      volts: s.v,
      amps: s.a,
      watts: s.w,
      joules: this.#capacity, // assume full battery on start-up
      charge: 100,
    }
    Timer.repeat(() => this.ticker(), 100)
  }

  configure(options: Options): void {
    if (options.capacity != undefined) this.#capacity = options.capacity
    if (options.v_full != undefined) this.#v_full = options.v_full
    if (options.sensor != undefined) this.#sensor.configure(options.sensor)
  }

  ticker(): void {
    const s = this.#sensor.sample() as Record<string, any>
    if (s.v < 1) return // no battery connected?

    // handle the connection of a full battery
    if (this.#cnt < 10) {
      if (s.v >= this.#v_full) this.#sample.joules = this.#capacity
    }
    this.#cnt++

    const fct = 0.25
    this.#sample.volts = this.#sample.volts * (1 - fct) + s.v * fct
    this.#sample.amps = this.#sample.amps * (1 - fct) + s.a * fct
    this.#sample.watts = this.#sample.watts * (1 - fct) + s.w_avg * fct

    // accumulate energy
    this.#sample.joules += s.j
    if (this.#sample.joules > this.#capacity) this.#sample.joules = this.#capacity
    this.#sample.charge = (this.#sample.joules / this.#capacity) * 100
  }

  sample(s?: Sample): Sample {
    if (s) {
      s.volts = this.#sample.volts
      s.amps = this.#sample.amps
      s.watts = this.#sample.watts
      s.joules = this.#sample.joules
      s.charge = this.#sample.charge
      return s
    } else {
      return { ...this.#sample }
    }
  }
}
