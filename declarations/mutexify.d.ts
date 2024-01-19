declare module 'mutexify' {
  type CB<T> = T extends void
    ? (...args: [NodeJS.ErrnoException] | []) => void
    : (...args: [NodeJS.ErrnoException] | [null, T]) => void
  export type Mutexify<T> = (
    fn: (
      unlock: (cb: CB<T>, ...args: [Error] | [null, T]) => void
    ) => void
  ) => void
  function mutexify<T>(): Mutexify<T>
  export = mutexify
}
