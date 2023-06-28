// Based on https://github.com/jordoreed/home-grown-graphics/blob/main/index.html
// By Jordan Reed

export function randomFloat(min, max) {
  return Math.random() * (max - min) + min
}

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

export class Matrix4 {
  constructor() @ "xs_Matrix"
  multiply(r) @ "xs_matrix_multiply"
  multiplyVec4(v) @ "xs_matrix_multiplyVec4"

  static identity() {
    return new Matrix4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
  }

  static perspective(l, r, b, t, n, f) {
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

  static perspectiveAspectRatio(aspectRatio, fov, n, f) {
    const halfH = Math.tan(toRadians(fov * 0.5)) * n
    const halfW = aspectRatio * halfH
    return Matrix4.perspective(-halfW, halfW, -halfH, halfH, n, f)
  }

  static translate(x, y, z) {
    return new Matrix4(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1)
  }

  static scale(x, y, z) {
    return new Matrix4(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1)
  }

  // pitch
  static rotateX(degrees) {
    const radians = toRadians(degrees)
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    return new Matrix4(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1)
  }

  // yaw
  static rotateY(degrees) {
    const radians = toRadians(degrees)
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    return new Matrix4(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1)
  }

  // roll
  static rotateZ(degrees) {
    const radians = toRadians(degrees)
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    return new Matrix4(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
  }
}
