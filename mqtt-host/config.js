import TCP from "embedded:io/socket/tcp"
import UDP from "embedded:io/socket/udp"
import Resolver from "embedded:network/dns/resolver/udp"
import MQTTClient from "embedded:network/mqtt/client"

const dns = {
  io: Resolver,
  servers: ["192.168.0.1"],
  socket: {
    io: UDP,
  },
}
globalThis.device = Object.freeze(
  {
    ...globalThis.device,
    network: {
      mqtt: {
        io: MQTTClient,
        dns,
        socket: {
          io: TCP,
        },
      },
    },
  },
  true
)
