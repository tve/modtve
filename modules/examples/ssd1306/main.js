/*
 * Copyright (c) 2016-2021  Moddable Tech, Inc.
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

import Poco from "commodetto/Poco"
import SSD1306 from "embedded:display/ssd1306"
import parseBMF from "commodetto/parseBMF"
import parseBMP from "commodetto/parseBMP"
import Resource from "Resource"
import Timer from "timer"

const font = parseBMF(new Resource("OpenSansCondensed-Bold-30.bf4"))
//const font = parseBMF(new Resource("OpenSans-Regular-24.bf4"))
//const font = parseBMF(new Resource("OpenSans-Semibold-28.bf4"))

const screen = new SSD1306({
  io: device.io.I2C,
  clock: 10,
  data: 8,
  height: 32,
})

let poco = new Poco(screen)
const white = poco.makeColor(255, 255, 255)
const black = poco.makeColor(0, 0, 0)

poco.begin()
poco.fillRectangle(white, 0, 0, poco.width, poco.height)
poco.fillRectangle(black, 1, 1, poco.width - 2, poco.height - 2)
poco.fillRectangle(white, poco.height / 2, poco.height / 2, poco.height / 2, poco.height / 2)
//poco.fillRectangle(poco.makeColor(gray, gray, gray), 4, 4, poco.width - 8, poco.height - 8)
poco.drawText("220W 35%", font, white, 0, -7)
poco.end()
