Attitude and Heading Reference System library
=============================================

This library implements a simple AHRS algorithm using the XIO Tech Fusion
library https://github.com/xioTechnologies/Fusion ported to JavaScript
in lib/fusion in this repository.

It works with any IMU that provides accelerometer and gyroscope data, but
has been developed and tested against the BMI160.
See the bmi160viz example in this repository for sample code.
