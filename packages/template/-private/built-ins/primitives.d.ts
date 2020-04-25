/**
 * This module contains signatures for built-in primitives exposed
 * by glimmer-vm and Ember. When a template attempts to invoke an
 * identifier not statically in scope, we instead emit a call to
 * `BuiltIns['the-identifier']`, which will resolve according to the
 * type in the `BuiltIns` interface (or result in a type error if
 * no such primitive exists).
 *
 * Note that this only contains signatures for the things that
 * felt like they'd be interesting to prove out the robustness
 * of the 'template signatures' mechanism. There are plenty of
 * others (both public and private) that aren't (yet) represented
 * here.
 *
 * Since `BuiltIns` is an interface, this theoretically allows for
 * third-party primitives to be exposed if they're somehow hacked
 * into the runtime (or transformed away at build time), though
 * whether that's a good idea or not is unclear.
 */
declare const ModuleDocs: void;

import { AnyBlocks, ReturnsValue, AcceptsBlocks, CreatesModifier } from '../signature';
import { ResolveSignature } from '../resolution';
import { BlockResult } from '../blocks';
import { Invokable } from '../invoke';

export type ArrayHelper = Invokable<<T>(args: {}, ...items: T[]) => ReturnsValue<T[]>>;

type ArgsFor<T> = ResolveSignature<T> extends (args: infer Args) => unknown ? Args : {};

type PositionalFor<T> = ResolveSignature<T> extends (
  args: never,
  ...positional: infer Positional
) => unknown
  ? Positional
  : never[];

type BlocksFor<T> = ResolveSignature<T> extends (
  ...params: never
) => (blocks: infer Blocks) => unknown
  ? Blocks extends Partial<AnyBlocks>
    ? Blocks
    : {}
  : {};

export type ComponentHelper = Invokable<
  <Component, GivenArgs extends keyof ArgsFor<Component>>(
    args: { [Arg in GivenArgs]: ArgsFor<Component>[Arg] },
    component: Component
  ) => ReturnsValue<
    Invokable<
      (
        args: Omit<ArgsFor<Component>, GivenArgs> & Partial<Pick<ArgsFor<Component>, GivenArgs>>,
        ...positional: PositionalFor<Component>
      ) => AcceptsBlocks<BlocksFor<Component>>
    >
  >
>;

export type ConcatHelper = Invokable<(args: {}, ...items: string[]) => ReturnsValue<string>>;

export type DebuggerHelper = Invokable<(args: {}) => ReturnsValue<void>>;

export type EachHelper = Invokable<
  <T>(
    args: { key?: string },
    items: T[]
  ) => AcceptsBlocks<{
    default(item: T, index: number): BlockResult;
    inverse?(): BlockResult;
  }>
>;

export type EachInHelper = Invokable<
  <T>(
    args: {},
    object: T
  ) => AcceptsBlocks<{
    default<K extends keyof T>(key: K, value: T[K]): BlockResult;
  }>
>;

// Yuck. This will work for generic functions if the types are fixed given the initial args,
// but otherwise they'll degrade to `unknown` in the type of the returned function.
// I don't think there's a better way to type `{{fn}}` though; this already maintains more type
// info than Ramda's `partial`, for instance.
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/539042117cd697da07daf93092bdf16bc14922d8/types/ramda/index.d.ts#L1310-L1324
// prettier-ignore
export type FnHelper = Invokable<{
  <Ret, Args extends unknown[]>(args: {}, f: (...rest: Args) => Ret): ReturnsValue<(...rest: Args) => Ret>;
  <A, Ret, Args extends unknown[]>(args: {}, f: (a: A, ...rest: Args) => Ret, a: A): ReturnsValue<(...rest: Args) => Ret>;
  <A, B, Ret, Args extends unknown[]>(args: {}, f: (a: A, b: B, ...rest: Args) => Ret, a: A, b: B): ReturnsValue<(...rest: Args) => Ret>;
  <A, B, C, Ret, Args extends unknown[]>(args: {}, f: (a: A, b: B, c: C, ...rest: Args) => Ret, a: A, b: B, c: C): ReturnsValue<(...rest: Args) => Ret>;
  <A, B, C, D, Ret, Args extends unknown[]>(args: {}, f: (a: A, b: B, c: C, d: D, ...rest: Args) => Ret, a: A, b: B, c: C, d: D): ReturnsValue<(...rest: Args) => Ret>;
}>;

export type LetHelper = Invokable<
  <T extends unknown[]>(
    args: {},
    ...values: T
  ) => AcceptsBlocks<{
    default(...values: T): BlockResult;
  }>
>;

export type OnModifier = Invokable<
  <K extends keyof HTMLElementEventMap>(
    args: AddEventListenerOptions,
    key: K,
    eventHandler: (event: HTMLElementEventMap[K]) => void
  ) => CreatesModifier
>;

export type WithHelper = Invokable<
  <T>(
    args: {},
    value: T
  ) => AcceptsBlocks<{
    default(value: T): BlockResult;
    inverse?(): BlockResult;
  }>
>;

interface BuiltIns {
  /** Creates an array */
  array: ArrayHelper;
  /** Pre-binds arguments to a component before invoking */
  component: ComponentHelper;
  /** Concatentates strings */
  concat: ConcatHelper;
  /** Pauses at a breakpoint in the browser devtools when invoked */
  debugger: DebuggerHelper;
  /** Iterates over arrays */
  each: EachHelper;
  /** Iterates over key/value pairs on an object */
  'each-in': EachInHelper;
  /** Pre-binds arguments to a function */
  fn: FnHelper;
  /** Binds one or more values and yields them to its block */
  let: LetHelper;
  /** Attaches an event listener */
  on: OnModifier;
  /** Basically `if-let`, but with a confusing name */
  with: WithHelper;
}

declare const BuiltIns: BuiltIns;

export default BuiltIns;