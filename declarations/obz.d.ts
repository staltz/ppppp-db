declare module 'obz' {
  type Remove = () => void
  export interface Obz<X> {
    (listener: (value: X) => void): Remove
    set(value: X): this
    value: X
  }
  function createObz(): Obz
  export = createObz
}
