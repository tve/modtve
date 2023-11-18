Watchdog timer module
=====================

! This module is for the esp32 only at this time

This module provides a simple interface to the esp32's task watchdog timer.
If the module is added to a project by including the manifest then the task watchdog timer is
enabled, which will cause the esp32 to reset if the javascript VM is blocked for more than
5 seconds by default.

The WDT class exported by the module allow user code to create additional watchdogs and "feed" them.
This allows portions of user code that must execute periodically to be monitored. For each such
portion of code, a new WDT instance should be created and fed periodically.

The esp32 task watchdog only supports a single timeout value, so all WDT instances share that
timeout. It can be set using the `timeout_ms` setter on the class or at build time by setting
`CONFIG_ESP_TASK_WDT_TIMEOUT_S`. See the example (`../../examples/wdt`) for more details.
