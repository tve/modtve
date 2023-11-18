// Watchdog Timer to use in application code
// Copyright © 2023 by Thorsten von Eicken

export default class WDT @ "xs_wdt_destructor" {
  static get timeout_ms() @ "xs_wdt_get_timeout_ms";
  static set timeout_ms(timeout) @ "xs_wdt_set_timeout_ms";
  static _init() @ "xs_wdt_init"; // init timeout_ms from Kconfig

  constructor(name) @ "xs_wdt_constructor";
  close() @ "xs_wdt_close";
  write() @ "xs_wdt_write"; // aka feeding the WDT
}

WDT._init()
