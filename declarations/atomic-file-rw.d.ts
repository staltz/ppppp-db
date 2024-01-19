type CB<T> = (...args: [NodeJS.ErrnoException] | [null, T]) => void

declare module 'atomic-file-rw' {
  export function readFile(
    path: string,
    encodingOrOpts: string | { encoding: string },
    cb: CB<string>
  ): void
  export function writeFile(
    path: string,
    data: string,
    encodingOrOpts: string | { encoding: string },
    cb: CB<string>
  ): void
  export function deleteFile(path: string, cb: CB<null>): void
}
