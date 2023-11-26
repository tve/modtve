// Based on https://github.com/jordoreed/home-grown-graphics/blob/main/index.html
// By Jordan Reed

declare module "hack3d" {

  function randomFloat(min: number, max: number): number
  function toRadians(degrees: number): number

  interface Vec4 {
    x: number
    y: number
    z: number
    w: number
  }

  class Matrix4 {
    m: Float64Array

    constructor(...args: number[])
    constructor(arr: Float64Array)
    constructor(...args: number[] | Float64Array[])

    multiply(r: Matrix4): Matrix4
    multiplyVec4(v: Vec4): Vec4

    static identity(): Matrix4

    static perspective(l: number, r: number, b: number, t: number, n: number, f: number): Matrix4

    static perspectiveAspectRatio(aspectRatio: number, fov: number, n: number, f: number): Matrix4

    static translate(x: number, y: number, z: number): Matrix4

    static scale(x: number, y: number, z: number): Matrix4

    // pitch
    static rotateX(degrees: number): Matrix4

    // yaw
    static rotateY(degrees: number): Matrix4

    // roll
    static rotateZ(degrees: number): Matrix4
  }
}
