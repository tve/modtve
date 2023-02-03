#! /bin/bash -e
npx nodemon -V -w . -w ../modules -e 'js ts json' \
    -x 'mcrun -d -m -p esp32/rfgw_v2 || exit 1'
