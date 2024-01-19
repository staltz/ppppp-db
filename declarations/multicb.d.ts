declare module 'multicb' {
  type Opts = {
    pluck?: number
    spread?: boolean
  }
  type CB<T> = (...args: [Error] | [null, T] | []) => void
  type Done<T> = ((cb: CB<T>) => void) & (() => CB<T>)
  function multicb<T>(opts?: Opts): Done<T>
  export = multicb
}
