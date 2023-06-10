BMI160 IMU driver
=================

Driver for the Bosch BMI160 IMU.
Tested using `embedded:io/I2C` although SPI might work as well...

Notes:
- reset & init is a bit iffy, it's not clear when the device is ready
- only simple polling of data is implemented, really need to support the FIFO to
cut down the I2C overhead
- operates at the default rate of 100Hz for both accel and gyro
