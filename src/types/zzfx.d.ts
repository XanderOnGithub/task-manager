// ZzFX ships plain JavaScript; these are the bits Moss uses.
declare module 'zzfx' {
  export const ZZFX: {
    volume: number
    sampleRate: number
    audioContext: AudioContext
    buildSamples(...params: number[]): Float32Array
  }
  export class ZZFXSound {
    constructor(params: number[])
    play(volume?: number, pitch?: number, randomnessScale?: number): AudioBufferSourceNode | undefined
  }
}
