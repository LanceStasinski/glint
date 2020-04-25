/**
 *
 */
declare const ModuleDocs: void;

import { Return, ReturnsValue, CreatesModifier, AcceptsBlocks, AnySignature } from './signature';
import { YieldsFromBlock } from './blocks';

/**
 * This wrapping type indicates a value that may be invoked in a template.
 *
 * At present it's just a no-op type that does nothing but validate that
 * the given type is a valid template signature, as it's otherwise not
 * possible to do anything with function types in TS without losing information
 * about any type parameters they may have.
 */
export type Invokable<T extends AnySignature> = T;

/**
 * Invokes the given value as an inline invocation. This corresponds to a
 * mustache statement or subexpression, i.e. one of:
 *
 *     {{value foo=bar}}
 *     <div data-attr={{value foo=bar}}></div>
 *     <div data-attr={{concat (value foo=bar)}}
 *
 * This form of invocation is the only one in a template that allows for a
 * value to be returned.
 */
export declare function invokeInline<T extends ReturnsValue<any>>(
  value: T
): ReturnType<T>[typeof Return];

/**
 * Invokes the given value as a modifier. This corresponds to a mustache
 * statement 'floating' in the attribute space of an element or component:
 *
 *     <div {{value foo=bar}}></div>
 */
export declare function invokeModifier<T extends CreatesModifier>(value: T): void;

/**
 * Invokes the given value as an entity that expects to receive blocks
 * rather than return a value. This corresponds to a block-form mustache
 * statement or any angle-bracket component invocation, i.e.:
 *
 *     {{#value foo=bar}}{{/value}}
 *     <Value @foo={{bar}}></Value>
 *     <Value @foo={{bar}} />
 *
 * This form of invocation is the only one in a template that accepts
 * blocks.
 */
export declare function invokeBlock<T extends AcceptsBlocks<any>, Impls extends Parameters<T>[0]>(
  value: T,
  blocks: Impls,
  // It doesn't seem to be possible to get the typechecker to infer the
  // return types for the elements of `blocks` AND have it enforce that no
  // extra keys are passed in. The situation in which that inference kicks
  // in seems to be exactly the situation in which ECP ("excess property checking")
  // is disabled. Accepting a list of the names of the blocks we're passing
  // is essentially a hack to ensure we don't pass any invalid names.
  // (It also sometimes INEXPLICABLY turns on ECP, resulting in a type error
  // on the original hash instead of on the offending key in `names` 🙃)
  ...names: Array<keyof Parameters<T>[0]>
): YieldsFromBlock<Impls[keyof Impls]>;