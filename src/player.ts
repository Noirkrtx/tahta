/** Playback controller: owns the clock, delegates drawing to the board. */
import type { Board } from './board';
import { clampTime, nextTime, prevTime, stepIndexAt } from './timeline';

export const SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;

export interface PlayerState {
  time: number;
  playing: boolean;
  step: number;
  speed: number;
}

export class Player {
  private time = 0;
  private playing = false;
  private speed = 1;
  private raf = 0;
  private lastTick = 0;

  constructor(
    private readonly board: Board,
    private readonly onChange: (s: PlayerState) => void,
  ) {}

  get state(): PlayerState {
    return {
      time: this.time,
      playing: this.playing,
      step: stepIndexAt(this.board.timeline, this.time),
      speed: this.speed,
    };
  }

  private render(): void {
    this.board.apply(this.time);
    this.onChange(this.state);
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const dt = Math.min(100, now - this.lastTick);
    this.lastTick = now;
    this.time = clampTime(this.board.timeline, this.time + dt * this.speed);
    if (this.time >= this.board.timeline.total) this.playing = false;
    this.render();
    if (this.playing) this.raf = requestAnimationFrame(this.tick);
  };

  play(): void {
    if (this.playing) return;
    if (this.time >= this.board.timeline.total) this.time = 0;
    this.playing = true;
    this.lastTick = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.render();
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.render();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number): void {
    this.time = clampTime(this.board.timeline, t);
    this.render();
  }

  next(): void {
    this.seek(nextTime(this.board.timeline, this.time, this.playing));
  }

  prev(): void {
    this.seek(prevTime(this.board.timeline, this.time, this.playing));
  }

  restart(): void {
    this.time = 0;
    this.render();
    this.play();
  }

  /** Jump to the start of a step and draw it. */
  goToStep(i: number): void {
    const s = this.board.timeline.steps[i];
    if (!s) return;
    this.time = s.start;
    this.render();
    this.play();
  }

  setSpeed(v: number): void {
    this.speed = Math.min(2, Math.max(0.5, v));
    this.onChange(this.state);
  }

  destroy(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }
}
