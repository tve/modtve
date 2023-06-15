Library to track battery energy consumption
===========================================

The battery library tracks power and energy consumption based on measurements made
by a power monitor chip such as the TI INA233.
It assumes that the power monitor accumulates energy internally either in hardware or
in the driver.

The library implements the ECMA-419 Sensor pattern and returns information about the
instantaneous consumption (voltage, current, power) as well as accumulated energy
consumption (joules, percent charge).

The library supports tracking the charging of the battery as well with the INA233 by
switching the power accumulation from positive to negative currents.

Battery-full condition is detected by monitoring the voltage and declaring "full"
when it crosses a threshold. The intent here is not to trigger charge cut-off but
simply to reset the battery capacity to 100%.
In principle, because charging is not 100% efficient the battery charge level should reach
100% without special condition, but the condition handles the case where a discharged
battery is swapped for a fresh one.
It does not handle the case where a discharged battery is swapped for a partially
discharged one, however.
