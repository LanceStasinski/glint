# typed-templates

This repo contains design thoughts on typing Ember templates, as well as implementation sketches.
It's an elaboration on the design laid out in [this gist](https://gist.github.com/dfreeman/a5a910976e5dbed44d0649ba21aab23f).

- [Design Overview](#design-overview)
  - [Future Template Flavors](#future-template-flavors)
  - [Typechecking Templates](#typechecking-templates)
  - [Encoding Templates as TypeScript](#encoding-templates-as-typescript)
    - [Template Signatures](#template-signatures)
    - [Invoking a Component/Helper/Modifier](#invoking-a-componenthelpermodifier)
    - [Yielding to the Caller](#yielding-to-the-caller)
    - [Emitting Values](#emitting-values)
- [Caveats/To-Dos](#caveatsto-dos)
  - [Modeling Templates](#modeling-templates)
  - [Translating Templates to TypeScript](#translating-templates-to-typescript)
  - [Typechecking (via CLI, editor integration, etc)](#typechecking-via-cli-editor-integration-etc)
  - [Editor Support (autocomplete, refactorings, etc)](#editor-support-autocomplete-refactorings-etc)


## Design Overview

The high-level idea here is to build a CLI/Language Server/library akin to [Vetur](https://github.com/vuejs/vetur) that can provide TS-aware checking of templates in the Ember ecosystem. It assumes the advancement of [template imports](https://github.com/emberjs/rfcs/pull/454) and [strict mode templates](https://github.com/emberjs/rfcs/pull/496).

### Future Template Flavors

First, an aside about the kind of environment this anticipates operating in. There are a couple of flavors of "how templates might look" floating around right now, either (or both, or neither) of which may eventually become the norm for Ember applications.

The first is the strawman "frontmatter" syntax mentioned in both RFCs linked above and (roughly) implemented in the [`ember-template-component-import` addon](https://github.com/knownasilya/ember-template-component-import).

```hbs
---
import { SomeComponent } from 'another-package';
---

<SomeComponent @arg={{this.message}} />
```

```ts
import Component from '@glimmer/component';

export default class MyComponent extends Component<{ target: string }> {
  private get message() {
    return `Hello, ${this.args.target}`;
  }
}
```

In this version of the world, templates remain in adjacent files to their backing components, but they gain the ability to introduce new identifiers into scope via ES-style imports in their frontmatter.

The second flavor is the SFC approach that [GlimmerX](https://github.com/glimmerjs/glimmer-experimental) is experimenting with.

```ts
import Component, { hbs } from '@glimmerx/component';
import { SomeComponent } from 'another-package';

export default class MyComponent extends Component<{ target: string }> {
  private get message() {
    return `Hello, ${this.args.target}`;
  }

  public static template = hbs`
    <SomeComponent @arg={{this.message}} />
  `;
}
```

In this flavor, templates and their backing components are defined in the same module, and templates consume JS identifiers introduced in their containing scope.

It's relatively straightforward to imagine a programmatic transformation from the first flavor into the second, and in fact that's already how [component/template colocation](https://github.com/emberjs/rfcs/pull/481) works today: the template definition is inlined into the component module at build time.

### Typechecking Templates

Fundamentally, we'd like templates to participate in TypeScript's type system. If a Glimmer component is passed an argument that isn't declared in its args, that should be a type error. If a private field on a component is referenced in its template, that field shouldn't be flagged as unused.

One way to do this without essentially reinventing the entire type system is to present templates to TypeScript _as_ TypeScript that encodes the rough semantics of the template in question. To do this, we can build a tool that sits in front of TS (`tsc` and/or `tsserver`) and presents it with that view of the world rather than one where templates are encoded in either strings or entirely separate files.

In other words, both of the example components above would be presented to TypeScript as:

```ts
import Component from '@glimmer/component';
import { SomeComponent } from 'another-package';
import { template, invokeBlock, resolve, TemplateContext } from '...';

export default class MyComponent extends Component<{ target: string }> {
  private get message() {
    return `Hello, ${this.args.target}`;
  }

  // More details about what this actually means below;
  public static template = template(function*(𝚪: TemplateContext<MyComponent>) {
    yield invokeBlock(resolve(SomeComponent)({ arg: 𝚪.this.message }), {});
  });
}
```

### Encoding Templates as TypeScript

There are three primary things a developer can do in a Glimmer template:
 - emit a piece of static content (`<marquee>hello</marquee>`)
 - emit a piece of dynamic content (`{{this.message}}`)
 - invoke some other template entity (`<SomeComponent />`, `{{helper foo=123}}`)

The first is uninteresting to us for these purposes, since it's inert relative to the rest of the template and any backing TypeScript.

The second is interesting, but turns out largely to be a degenerate case of the third in the model used here, so we'll revisit it later.

The third is the bread and butter of working in a Glimmer template: helpers, modifiers and components are our units of compositionality, and they act as a bridge between the declarative, hyper-specialized DSL of the template and the imperative general-purpose programming language that backs it.

#### Template Signatures

Any "callable" value in a template, whether it's a component, helper, modifier, or a built-in primitive that doesn't fit cleanly into any one category (like `{{each}}`), is defined by its _template signature_.

At a high level, a signature looks like this:

```ts
type MySignature = (args: NamedArgs, ...positional: PositionalArgs)
  => (blocks: BlockCallbacks)
  => CompletionType;
```

The shape of the signature for a particular entity dictates how it can be invoked: what types of args it accepts, whether it can receive blocks (and if so, what type of parameters they receive), and whether it returns a value, acts as a modifier, etc.

For instance, the `concat` helper's signature looks like:

```ts
type ConcatHelper = (args: {}, ...items: string[]) => ReturnsValue<string>;
```

And `each` looks like:

```ts
type EachHelper = <T>(args: { key?: string }, items: T[]) => AcceptsBlocks<{
  default(item: T, index: number): BlockResult;
  inverse?(): BlockResult;
}>;
```

The [`signature.d.ts` module](packages/core/-private/signature.d.ts) contains more detailed information and some utility types like `ReturnsValue` and `AcceptsBlocks` for defining template signatures.

#### Invoking a Component/Helper/Modifier

There are three steps to invoking an entity in a template:

- Determining its template signature
- Providing any named and positional args
- Invoking either inline, with blocks, or as a modifier

Suppose we have a simple component like this:

```ts
class MyComponent extends Component<{ target: string }> {
  public static template = hbs`
    {{yield (concat 'Hello, ' @target)}}
  `;
}
```

And we want to invoke it like this:

```hbs
<MyComponent @target="World" as |message|>
  {{message}}
</MyComponent>
```

The `resolve` function is responsible for taking a value (like a `Component` subclass or helper) and turning it into a function representing its signature.

```ts
const resolvedMyComponent = resolve(MyComponent);
// (args: { target: string }) => AcceptsBlocks<{ default?(arg: string): BlockResult }>
```

Once the signature is resolved, any passed named and/or positional arguments are bound by calling the signature. This fixes the values of any type parameters that might exist in the signature.

```ts
const boundMyComponent = resolvedMyComponent({ target: 'World' });
```

Finally, the resulting value is invoked according to the form it appears in in the template (in this case, with a block):

```ts
invokeBlock(boundMyComponent, {
  *default(message) {
    // ...
  }
});
```

Typically these three steps are combined into a single expression:

```ts
invokeBlock(resolve(MyComponent)({ target: 'World' }), {
  *default(message) {
    // ...
  }
});
```

#### Yielding to the Caller

One key piece of the execution model for templates is the way components may yield values to their caller, even out of blocks they themselves may have passed arbitrarily deep to their children. For instance, this component yields a string (repeatedly) to its caller:

```hbs
{{#let (array 'one' 'two' 'three') as |values|}}
  {{#each values as |value|}}
    {{yield value}}
  {{/each}}
{{/let}}
```

This is the reason template bodies and blocks are modeled as generators: they provide a natural way to capture the semantics of `{{yield}}` statements. The template above would be represented like this in TypeScript:

```ts
template(function*() {
  yield invokeBlock(resolve(BuiltIns['let'])({}, ['one', 'two', 'three']), {
    *default(values) {
      yield invokeBlock(resolve(BuiltIns['each'])({}, values), {
        *default(value) {
          yield toBlock('default', value);
        }
      });
    }
  });
});
```

The `toBlock` function returns a type capturing both the name and parameter types of the block being yielded to, and multiple yields will result in a union of such types. The `template` function then ultimately transforms that union into a "blocks hash" object type that's used in the resulting signature to determine what blocks a component with that template will accept.

The template above would therefore have this signature:

```ts
template(/* ... */): (args: unknown) => AcceptsBlocks<{ default?(arg: string): BlockResult }>
```

The type of args it expects is `unknown` because it doesn't make use of any args, though in actual usage it would be a type based on the arguments and `this` context provided by the containing class declaration.

#### Emitting Values

One ambiguity that's been glossed over so far is that of a top-level mustache statement with no arguments, e.g. `{{foo.bar}}`. This expression is syntactically ambiguous depending on the type of value it refers to: if it's a helper or component, it's an invocation of that value with no arguments. Otherwise, it's just meant to emit the given value.

To account for this, rather than using `resolve` when such a statement is seen, the `resolveOrReturn` function is used. If the value it receives doesn't have an associated template signature, it's treated as though it's a zero-arg helper that returns the appropriate type instead. This ensures that both of the following "top-level" uses will work regardless of whether the value is invokable:

```hbs
Hello, {{foo.bar}}!
```

```hbs
<MyComponent @value={{foo.bar}} />
```

## Caveats/To-Dos

This section contains notes on things still to be explored and known limitations of the current design.

### Modeling Templates

- It would be nice to validate modifiers are applied to a specific type of element if they require it, but that seems likely to blow out complexity (and require capturing information about `...attributes` are applied for components, which we currently have no need to model at all)

- Function types abound: in particular, templates and helpers are represented as functions, which may give users the impression those values are actually callable. Unfortunately, in order to avoid losing type parameters on the associated signatures for those entities, we can't produce any kind of type _but_ a function. I've played a bit with possible ways to make those function types less of an attractive nuisance (e.g. a required initial symbol argument), but every approach I've tried has made inference fall over in one place or another.

- `fn` is _mostly_ typeable, type parameters are lost if they're not fixed by the given inputs. I.e. if `f = <T>(v: T) => v`, then `{{fn f}}` will degrade to `(v: unknown) => unknown`. However, `{{fn f 'hello'}}` will correctly have type `() => string`.

- `component` is similarly hard to type when the input class has type params, but a bit worse because of the whole functions-in-functions nature of template signature.

  At present, values yielded to blocks whose types are dependent on a type param always degrade that param to `unknown` (or whatever the type constraint on the param is). This seems unavoidable given the way TypeScript's current "we implicitly preserve generics for you in a small number of specific cases" approach to HKT.

  It also doesn't handle pre-binding positional params, because yuck.

### Translating Templates to TypeScript

I have some sketchy code from a couple months back where I started playing with what this might look like. Assuming I can find it (and the whole thing doesn't turn out to be the incoherent output of jetlag-brain) I'll import it into this repo and write up any relevant notes on it.

### Typechecking (via CLI, editor integration, etc)

Reporting type errors in the right place in source templates. Ties together the above bits. Totally untouched at present.

### Editor Support (autocomplete, refactorings, etc)

Aside from reporting type errors, we should also be able to support autocompleting things like named args to components, as well as propagating the effects of a symbol rename (e.g. changing a class field's name updates corresponding references in the template).

Totally untouched at present.
