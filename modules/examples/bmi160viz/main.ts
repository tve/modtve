import Timer from "timer"
import Time from "time"
import BMI160 from "embedded:sensor/Accelerometer-Gyroscope/BMI160"
import { AHRS, Quaternion, Euler } from "embedded:lib/IMU/AHRS"
import { Matrix4, Vec4 } from "hack3d"
import Poco, { PocoPrototype } from "commodetto/Poco"
import { Outline } from "commodetto/outline"
import parseBMF from "commodetto/parseBMF"
import Resource from "Resource"
import Worker from "worker"

// IMU "calibration" zero offsets, this will vary with each device
//const ZERO = Object.freeze(Uint8Array.of(5, 1, 255, 252, 1, 254, 243)) // zero offsets for IMU
const ZERO = Object.freeze([5, 1, 255, 252, 1, 254, 243]) // zero offsets for IMU

// Options to instantiate IMU sensor
const IMUOptions = {
  imu: {
    io: BMI160,
    sensor: {
      ...device.I2C.default,
      io: device.io.SMBus,
      address: 0x69, // non-standard on my breakout board
      onError: (err: string) => trace(`BMI160: ${err}\n`),
      use_fifo: true,
      zero: ZERO,
    },
  },
  upright: false, // I'm holding the IMU board upside-down
}

interface Model {
  vertices: Vec4[]
  faces: number[][]
  colors: number[]
}

// Make a rectangular box model that resembles the little IMU breakout board
function makeModel(poco: PocoPrototype): Model {
  const dx = 0.25,
    dy = 0.5,
    dz = 0.05
  const vertices = [
    // comments for original axes where Z points into the scene
    { x: -dx, y: dy, z: -dz, w: 1 }, // left top front
    { x: dx, y: dy, z: -dz, w: 1 }, // right top front
    { x: dx, y: -dy, z: -dz, w: 1 }, // right bottom front
    { x: -dx, y: -dy, z: -dz, w: 1 }, // left bottom front
    { x: -dx, y: dy, z: dz, w: 1 }, // left top back
    { x: dx, y: dy, z: dz, w: 1 }, // right top back
    { x: dx, y: -dy, z: dz, w: 1 }, // right bottom back
    { x: -dx, y: -dy, z: dz, w: 1 }, // left bottom back
  ]
  const faces = [
    // comments for new axes where Z points up
    [0, 1, 2, 3], // bottom
    [0, 3, 7, 4], // front (towards camera)
    [0, 1, 5, 4], // left
    [1, 2, 6, 5], // back (away from camera)
    [2, 3, 7, 6], // right
    [4, 5, 6, 7], // top
  ]
  const colors = [
    poco.makeColor(240, 98, 146), // pink
    poco.makeColor(121, 85, 72), // brown
    poco.makeColor(139, 195, 74), // green
    poco.makeColor(255, 235, 59), // yellow
    poco.makeColor(139, 195, 74), // green
    poco.makeColor(156, 39, 176), // purple
  ]
  return { vertices, faces, colors }
}

// draw the X, Y, and Z axes (X in red, others blue)
function makeAxes(poco: PocoPrototype): Model {
  const d = 0.5
  const vertices = [
    { x: -d, y: d, z: -d, w: 1 },
    { x: d, y: d, z: -d, w: 1 },
    { x: -d, y: -d, z: -d, w: 1 },
    { x: -d, y: d, z: d, w: 1 },
  ]
  const faces = [
    [0, 1],
    [0, 2],
    [0, 3],
  ]
  const blu = poco.makeColor(0, 0, 255)
  const colors = [poco.makeColor(255, 0, 0), blu, blu]
  return { vertices, faces, colors }
}

// project a set of vertices onto the screen
function projectVertices(vertices: Vec4[], mvp: Matrix4, sx: number, sy: number): Vec4[] {
  return vertices.map(vertex => {
    // model -> world
    const world = mvp.multiplyVec4(vertex)
    // world -> ndc
    const ndc = {
      x: world.x / world.w,
      y: world.y / world.w,
      z: world.z / world.w,
    }
    // ndc -> screen
    const screen = {
      x: Math.round((ndc.x + 1) * sx),
      y: Math.round((ndc.y + 1) * sy),
      z: ndc.z,
      w: 0,
    }
    // const v2 = Object.fromEntries(Object.entries(vertex))
    // trace(`vertex: ${JSON.stringify(v2)} -> ${JSON.stringify(screen)}\n`)
    return screen
  })
}

// sort faces by average z value so we can draw them (more or less) from far to near
// (proper hidden face elimination would be nice...)
function sortFaces(model: Model) {
  let { vertices, faces, colors } = model
  const depths = faces.map((face, ix) => {
    let z = 0
    for (const v of face) z += vertices[v].z
    z /= face.length
    return { face, z, color: colors[ix] }
  })
  depths.sort((a, b) => a.z - b.z)
  return { vertices, faces: depths.map(f => f.face), colors: depths.map(f => f.color) }
}

interface Bounds {
  x1: number
  y1: number
  x2: number
  y2: number
}

// calculate the screen bounds of a set of vertices to limit the area being redrawn
function calcBounds(vertices: Vec4[]): Bounds {
  let x1 = vertices[0].x, y1 = vertices[0].y, x2 = vertices[0].x, y2 = vertices[0].y;
  for (let i = 0, length = vertices.length; i < length; i++) {
    const v = vertices[i];
    // +/-1 is due to width of stroke in Outline.stroke()
    if (v.x <= x1) x1 = v.x - 1
    if (v.x >= x2) x2 = v.x + 1
    if (v.y <= y1) y1 = v.y - 1
    if (v.y >= y2) y2 = v.y + 1
  }
  return {x1, x2, y1, y2}
}
// draw a whole model
function drawModel(poco: PocoPrototype, model: any, fill: boolean = false) {
  const { vertices, faces, colors } = model
  let outlines = Array(faces.length)
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i]
    const points = new Array(face.length * 2)
    for (let v = 0; v < face.length; v++) {
      const vtx = vertices[face[v]]
      points[2 * v + 0] = vtx.x
      points[2 * v + 1] = vtx.y
    }
    //trace(`points: ${JSON.stringify(points)} color:${colors[i]}\n`)
    const path = Outline.PolygonPath(...points)
    const outline = fill ? Outline.fill(path) : Outline.stroke(path)
    poco.blendOutline(colors[i], 255, outline)
    outlines[i] = outline // to prevent GC
  }
  return outlines
}

// display the roll, pitch, yaw, fps in text form
function drawRPY(poco: PocoPrototype, eu: Euler, fps: number, font: any, bg: number, fg: number) {
  const rows = 2 // rows of text
  const h = 26 // height of a row
  poco.begin(0, poco.height - rows * h, poco.width, rows * h)
  poco.fillRectangle(bg, 0, 0, poco.width, poco.height)
  const roll_txt = `Roll: ${eu.roll.toFixed(0)}°`
  const pitch_txt = `Pitch: ${eu.pitch.toFixed(0)}°`
  const yaw_txt = `Yaw: ${eu.yaw.toFixed(0)}°`
  const fps_txt = `FPS: ${fps.toFixed(1)}`
  // left column
  let y = poco.height - rows * h - 4
  for (const txt of [roll_txt, pitch_txt]) {
    const w = poco.getTextWidth(txt, font)
    poco.drawText(txt, font, fg, poco.width / 2 - w, y)
    y += h
  }
  // right column
  y = poco.height - rows * h - 4
  for (const txt of [yaw_txt, fps_txt]) {
    const w = poco.getTextWidth(txt, font)
    poco.drawText(txt, font, fg, poco.width - w - 2, y)
    y += h
  }
  poco.end()
}

export default function main() {
  const font_big = parseBMF(new Resource("OpenSansCondensed-Bold-30.bf4"))
  const font_sml = parseBMF(new Resource("OpenSans-Regular-24.bf4"))
  const font_med = parseBMF(new Resource("OpenSans-Semibold-28.bf4"))

  const poco = new Poco(screen, { rotation: 0, pixels: 32 * screen.width })
  const bg = poco.makeColor(0, 0, 64)
  const red = poco.makeColor(255, 0, 0)
  const grn = poco.makeColor(0, 255, 0)
  const blu = poco.makeColor(0, 0, 255)
  const ylw = poco.makeColor(255, 255, 0)
  trace(`Display ${poco.width}x${poco.height}\n`)

  poco.begin()
  poco.fillRectangle(bg, 0, 0, poco.width, poco.height)
  poco.drawText("IMU Demo", font_big, red, poco.width / 4, poco.height / 4)
  poco.end()

  const boxModel = makeModel(poco)
  const axisModel = makeAxes(poco)

  // define the 3D projection
  // hack3d operates with Z pointing away from camera, Y up, X left
  // our model uses Z up, Y left, X into the scene
  const aspectRatio = poco.width / poco.height
  const sx = (poco.width - 1) / 2
  const sy = (poco.height - 1) / 2
  // convert from x-away/y-left/z-up to x-right/y-down/z-away
  const orientation = Matrix4.rotateY(-90).multiply(Matrix4.rotateX(-90))
  // look at model from above, behind, and right
  const view = Matrix4.rotateX(-30) // + pans camera up, - pans camera down
    .multiply(Matrix4.rotateY(-15)) // + pans camera right, - pans camera left
    .multiply(Matrix4.translate(0.5, -1, 2)) // left, down, away
    .multiply(orientation)
  const projection = Matrix4.perspectiveAspectRatio(aspectRatio, 50, 0.1, 1000).multiply(view)

  let frames = 0
  let update_at = Time.ticks
  let bounds3d = { x1: poco.width, y1: poco.height, x2: 0, y2: 0 }

  function updateDisplay(q?: Quaternion) {
    const fps = 1000 / (Time.ticks - update_at)
    update_at = Time.ticks

    const eu = q ? q.toEuler() : { roll: 55.72, pitch: -31.26, yaw: 0 }
    //trace(`Euler: [ ${eu.roll.toFixed(2)} ${eu.pitch.toFixed(2)} ${eu.yaw.toFixed(2)} ]\n`)

    // graphics transform
    const model = Matrix4.rotateZ(-eu.yaw)
      .multiply(Matrix4.rotateY(-eu.pitch))
      .multiply(Matrix4.rotateX(eu.roll))
    const mvp = projection.multiply(model)

    // project vertices
    let projBoxModel = { ...boxModel, vertices: projectVertices(boxModel.vertices, mvp, sx, sy) }
    let projAxisModel = {
      ...axisModel,
      vertices: projectVertices(axisModel.vertices, projection, sx, sy),
    }

    // first time around clear screen
    if (frames == 0) {
      poco.begin()
      poco.fillRectangle(bg, 0, 0, poco.width, poco.height)
      poco.end()
    }
    frames++

    // figure out screen area being updated
    const nb = calcBounds([...projBoxModel.vertices, ...projAxisModel.vertices])
    const ub = {
      x1: Math.min(bounds3d.x1, nb.x1),
      y1: Math.min(bounds3d.y1, nb.y1),
      x2: Math.max(bounds3d.x2, nb.x2),
      y2: Math.max(bounds3d.y2, nb.y2),
    }
    bounds3d = nb
    //trace(`Bounds: [ ${ub.x1} ${ub.y1} ${ub.x2} ${ub.y2} ]\n`)
    poco.begin(ub.x1, ub.y1, ub.x2 - ub.x1 + 1, ub.y2 - ub.y1 + 1)
    poco.fillRectangle(bg, 0, 0, poco.width, poco.height)

    // draw models
    projBoxModel = sortFaces(projBoxModel)
    const o1 = drawModel(poco, projAxisModel, false)
    const o2 = drawModel(poco, projBoxModel, true)
    poco.end()

    drawRPY(poco, eu, fps, font_sml, bg, ylw)
  }

  if (false) {
    // Simple version without worker: calls AHRS and then calls updateDisplay
    const ahrs = new AHRS({
      imu: {
        io: BMI160,
        sensor: {
          ...device.I2C.default,
          io: device.io.SMBus,
          address: 0x69, // non-standard on my breakout board
          onError: (err: string) => trace(`BMI160: ${err}\n`),
          use_fifo: true,
          zero: ZERO,
        },
        upright: false,
      },
    })

    const ticker = Timer.repeat(() => {
      const q = ahrs.sample()
      if (q) updateDisplay(q)
    }, 1)

    Timer.set(() => {
      Timer.clear(ticker)
      ahrs.close()
      trace("=== The END ===\n")
    }, 60000)
  } else {
    // More involved version using a worker so AHRS and updateDisplay can run in parallel.
    const imuWorker = new Worker("imu_worker")

    imuWorker.onmessage = (msg: Quaternion | string) => {
      //trace(`Worker: ${JSON.stringify(msg)}\n`)
      imuWorker.postMessage({ cmd: "sample" })
      if (msg instanceof Quaternion) updateDisplay(msg)
    }

    imuWorker.postMessage({ cmd: "start", options: IMUOptions }) // sketchy marshalling of IMUoptions!

    // Timer.set(() => {
    //   imuWorker.postMessage({ cmd: "stop" })
    //   trace("=== The END ===\n")
    // }, 60000)
  }

  // Timer.set(() => {
  //   if (imu) imu.postMessage({ cmd: "stop" })
  //   trace("=== The END ===\n")
  // }, 60000)
}
