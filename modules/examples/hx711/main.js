/*
 * Copyright (c) 2020 Shinya Ishikawa
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

import HX711 from "embedded:sensor/ADC/HX711"
import Timer from "timer"
import Time from "time"

trace("===== HX711 TEST =====\n")

let hx711 = new HX711({
  sensor: {
    io: device.io,
    din: 7,
    clk: 6,
  },
  gain: 1, // 128x
})

let v = 0
Timer.repeat(() => {
  const t0 = Time.ticks
  const raw = hx711.read()
  const dt = Time.ticks - t0
  trace(`Raw: ${raw} in ${dt}ms\n`)
}, 1000)
