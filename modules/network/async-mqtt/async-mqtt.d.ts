// From https://github.com/mqttjs/async-mqtt
// MIT License

// Copyright (c) 2017

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import {
  Client,
  IClientOptions,
  IClientPublishOptions,
  IClientSubscribeOptions,
  ISubscriptionGrant,
  ISubscriptionMap,
} from "./mqtt"

export {
  // mqtt/types/lib/client
  ISubscriptionGrant,
  //ISubscriptionRequest,
  ISubscriptionMap,
  OnMessageCallback,
  //OnPacketCallback,
  OnErrorCallback,
  //IStream,

  // mqtt-packet
  QoS,
  // PacketCmd,
  // IPacket,
  // IConnectPacket,
  // IPublishPacket,
  // IConnackPacket,
  // ISubscription,
  // ISubscribePacket,
  // ISubackPacket,
  // IUnsubscribePacket,
  // IUnsubackPacket,
  // IPubackPacket,
  // IPubcompPacket,
  // IPubrelPacket,
  // IPubrecPacket,
  // IPingreqPacket,
  // IPingrespPacket,
  // IDisconnectPacket,
  // Packet,
} from "mqtt"

export interface IMqttClient extends Client {}

export declare class AsyncMqttClient extends Client {
  constructor(client: IMqttClient)

  public subscribe(
    topic: string | string[],
    opts: IClientSubscribeOptions
  ): Promise<ISubscriptionGrant[]>
  public subscribe(topic: string | string[] | ISubscriptionMap): Promise<ISubscriptionGrant[]>
  /* original */ public subscribe(
    topic: string | string[],
    opts: IClientSubscribeOptions,
    callback: never
  ): this
  /* original */ public subscribe(
    topic: string | string[] | ISubscriptionMap,
    callback: never
  ): this

  public unsubscribe(topic: string | string[]): Promise<void>
  /* original */ public unsubscribe(topic: string | string[], callback: never): this

  public publish(
    topic: string,
    message: string | ArrayBuffer,
    opts: IClientPublishOptions
  ): Promise<void>
  public publish(topic: string, message: string | ArrayBuffer): Promise<void>
  /* original */ public publish(
    topic: string,
    message: string | ArrayBuffer,
    opts: IClientPublishOptions,
    callback: never
  ): this
  /* original */ public publish(topic: string, message: string | ArrayBuffer, callback: never): this

  public end(force?: boolean): Promise<void>
  /* original */ public end(force: boolean, callback: never): this
}

export declare function connect(brokerUrl?: string | any, opts?: IClientOptions): AsyncMqttClient
export declare function connectAsync(
  brokerUrl: string | any,
  opts?: IClientOptions,
  allowRetries?: boolean
): Promise<AsyncMqttClient>

export { AsyncMqttClient as AsyncClient }
