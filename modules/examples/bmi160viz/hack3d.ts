// Based on https://github.com/jordoreed/home-grown-graphics/blob/main/index.html
// By Jordan Reed

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export interface Vec4 {
  x: number
  y: number
  z: number
  w: number
}

export class Matrix4 {
  m: Float64Array

  constructor(...args: number[])
  constructor(arr: Float64Array)
  constructor(...args: number[] | Float64Array[]) {
    if (args.length === 1 && args[0] instanceof Float64Array && args[0].length === 16) {
      this.m = args[0]
    } else if (args.length === 16 && typeof args[0] === "number") {
      this.m = Float64Array.from(args as number[])
    } else {
      throw new Error("Invalid arguments")
    }
  }

  multiply(r: Matrix4) {
    // m00 m01 m02 m03     m00 m01 m02 m03
    // m04 m05 m06 m07  X  m04 m05 m06 m07
    // m08 m09 m10 m11     m08 m09 m10 m11
    // m12 m13 m14 m15     m12 m13 m14 m15
    const { m } = this
    return new Matrix4(
      m[0] * r.m[0] + m[1] * r.m[4] + m[2] * r.m[8] + m[3] * r.m[12],
      m[0] * r.m[1] + m[1] * r.m[5] + m[2] * r.m[9] + m[3] * r.m[13],
      m[0] * r.m[2] + m[1] * r.m[6] + m[2] * r.m[10] + m[3] * r.m[14],
      m[0] * r.m[3] + m[1] * r.m[7] + m[2] * r.m[11] + m[3] * r.m[15],
      m[4] * r.m[0] + m[5] * r.m[4] + m[6] * r.m[8] + m[7] * r.m[12],
      m[4] * r.m[1] + m[5] * r.m[5] + m[6] * r.m[9] + m[7] * r.m[13],
      m[4] * r.m[2] + m[5] * r.m[6] + m[6] * r.m[10] + m[7] * r.m[14],
      m[4] * r.m[3] + m[5] * r.m[7] + m[6] * r.m[11] + m[7] * r.m[15],
      m[8] * r.m[0] + m[9] * r.m[4] + m[10] * r.m[8] + m[11] * r.m[12],
      m[8] * r.m[1] + m[9] * r.m[5] + m[10] * r.m[9] + m[11] * r.m[13],
      m[8] * r.m[2] + m[9] * r.m[6] + m[10] * r.m[10] + m[11] * r.m[14],
      m[8] * r.m[3] + m[9] * r.m[7] + m[10] * r.m[11] + m[11] * r.m[15],
      m[12] * r.m[0] + m[13] * r.m[4] + m[14] * r.m[8] + m[15] * r.m[12],
      m[12] * r.m[1] + m[13] * r.m[5] + m[14] * r.m[9] + m[15] * r.m[13],
      m[12] * r.m[2] + m[13] * r.m[6] + m[14] * r.m[10] + m[15] * r.m[14],
      m[12] * r.m[3] + m[13] * r.m[7] + m[14] * r.m[11] + m[15] * r.m[15]
    )
  }

  multiplyVec4(v: Vec4): Vec4 {
    // m00 m01 m02 m03     x
    // m04 m05 m06 m07  X  y
    // m08 m09 m10 m11     z
    // m12 m13 m14 m15     w
    const { m } = this
    return {
      x: m[0] * v.x + m[1] * v.y + m[2] * v.z + m[3] * v.w,
      y: m[4] * v.x + m[5] * v.y + m[6] * v.z + m[7] * v.w,
      z: m[8] * v.x + m[9] * v.y + m[10] * v.z + m[11] * v.w,
      w: m[12] * v.x + m[13] * v.y + m[14] * v.z + m[15] * v.w,
    }
  }

  static identity(): Matrix4 {
    return new Matrix4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
  }

  static perspective(l: number, r: number, b: number, t: number, n: number, f: number): Matrix4 {
    return new Matrix4(
      (2 * n) / (r - l),
      0,
      (r + l) / (r - l),
      0,
      0,
      (2 * n) / (t - b),
      (t + b) / (t - b),
      0,
      0,
      0,
      -(f + n) / (f - n),
      (-2 * f * n) / (f - n),
      0,
      0,
      -1,
      0
    )
  }

  static perspectiveAspectRatio(aspectRatio: number, fov: number, n: number, f: number): Matrix4 {
    const halfH = Math.tan(toRadians(fov * 0.5)) * n
    const halfW = aspectRatio * halfH
    return Matrix4.perspective(-halfW, halfW, -halfH, halfH, n, f)
  }

  static translate(x: number, y: number, z: number): Matrix4 {
    return new Matrix4(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1)
  }

  static scale(x: number, y: number, z: number): Matrix4 {
    return new Matrix4(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1)
  }

  // pitch
  static rotateX(degrees: number): Matrix4 {
    const radians = toRadians(degrees)
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    return new Matrix4(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1)
  }

  // yaw
  static rotateY(degrees: number): Matrix4 {
    const radians = toRadians(degrees)
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    return new Matrix4(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1)
  }

  // roll
  static rotateZ(degrees: number): Matrix4 {
    const radians = toRadians(degrees)
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    return new Matrix4(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
  }
}
