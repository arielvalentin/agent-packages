# Changelog

## [0.11.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.10.0...coordinator-v0.11.0) (2026-08-05)


### Features

* **coordinator:** add reusable PR review protocol ([ef768ea](https://github.com/arielvalentin/agent-packages/commit/ef768ea4b91f86f93234728c899554c9720fd6f6))

## [0.10.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.9.0...coordinator-v0.10.0) (2026-08-02)


### Features

* add conciseness directives to all agents ([53f4e95](https://github.com/arielvalentin/agent-packages/commit/53f4e95f7f889899b74ca75155c10696963e7608))
* **coordinator:** add documentation-impact check to pr-review flow ([d4cea40](https://github.com/arielvalentin/agent-packages/commit/d4cea40145afad32f1e0f28308ceb686b2c1a4cc))
* enforce evidence-backed reviews and refine style directives ([c4ae2dd](https://github.com/arielvalentin/agent-packages/commit/c4ae2ddb367747a45bf4e62974e70d9b9b68ad32))


### Bug Fixes

* reduce eval flakiness with temperature:0 and broader assertions ([#9](https://github.com/arielvalentin/agent-packages/issues/9)) ([809131d](https://github.com/arielvalentin/agent-packages/commit/809131db4d2fb0a766d412a3cbc0c46a721de455))
* use jsonpath YAML updater for release-please ([#11](https://github.com/arielvalentin/agent-packages/issues/11)) ([1b03db3](https://github.com/arielvalentin/agent-packages/commit/1b03db31874779e6489e372bed4ab43d895a33a6))

## [0.9.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.8.0...coordinator-v0.9.0) (2026-08-01)


### Features

* **coordinator,implementer:** wire missing built-in tools ([2dae4a3](https://github.com/arielvalentin/agent-packages/commit/2dae4a31140b6753eccf3b4508aa10bc1f8bc1df))
* **coordinator:** add adversarial-review skill ([d166572](https://github.com/arielvalentin/agent-packages/commit/d166572bdad99b6e8bf0a20dd4de07089e0c7351))
* **coordinator:** add create-pr skill ([94d4ad4](https://github.com/arielvalentin/agent-packages/commit/94d4ad4c572d843492ff524db3e43305a583e9f4))
* **coordinator:** add manage-pr skill ([d7c7304](https://github.com/arielvalentin/agent-packages/commit/d7c7304805e8fcf9e46dbc09e7249119dcdb3c7a))
* **coordinator:** add pr-review flow for reviewing others' code ([e011113](https://github.com/arielvalentin/agent-packages/commit/e01111312950b99071c97cc5de91b1fc6a1ceaeb))
* **coordinator:** add stage-pr skill ([081d7b8](https://github.com/arielvalentin/agent-packages/commit/081d7b88c471b0fc6a0de103b8dae477206578b5))
* **coordinator:** add wait-for-copilot-code-review skill ([265015b](https://github.com/arielvalentin/agent-packages/commit/265015b342a44a80a0b5f5163a4b5100ddeed56d))
* **coordinator:** add watch-ci skill ([4ed9979](https://github.com/arielvalentin/agent-packages/commit/4ed99796920e42331d723cc66da582a9182f5dac))


### Bug Fixes

* **coordinator:** remove my-prs-status from pr-lifecycle ([6fc6d3f](https://github.com/arielvalentin/agent-packages/commit/6fc6d3f43c96ea22de51babdc32e10fd4cad637e))

## [0.8.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.7.0...coordinator-v0.8.0) (2026-08-01)


### Features

* **coordinator,architect,implementer:** scope discipline with improvement tracking ([456d978](https://github.com/arielvalentin/agent-packages/commit/456d978a821c7f9cb126945480b3caff8d189a0b))
* **coordinator:** adaptive dispatch mode and task-based model selection ([9f3e861](https://github.com/arielvalentin/agent-packages/commit/9f3e861b46921f6ca1ab6d67a45749be3dac4a08))
* **coordinator:** add PR lifecycle loop until merge ([7bbd272](https://github.com/arielvalentin/agent-packages/commit/7bbd272a90d0f9fdfc11f68f560b41fac54b3193))
* **coordinator:** add security-review gate and post-completion cleanup ([5d4bbab](https://github.com/arielvalentin/agent-packages/commit/5d4bbab503cd1d2b79a6ac3606fd99f2f17d89bf))
* **coordinator:** cap PR lifecycle loop at 10 iterations ([b26fb62](https://github.com/arielvalentin/agent-packages/commit/b26fb6249fc105e6a281eb17e124f7e6d1cd0d2a))
* **coordinator:** rubber-duck stage reviews + adversarial final review ([b30fd9a](https://github.com/arielvalentin/agent-packages/commit/b30fd9a3c4a08c9f0fe71de8fe0943a59ce5678f))
* **coordinator:** use code-review for diff stages, rubber-duck for plans ([1953dca](https://github.com/arielvalentin/agent-packages/commit/1953dca01d1e51926e7d8e507c86a6c9d97960ea))

## [0.7.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.6.0...coordinator-v0.7.0) (2026-07-30)


### Features

* **coordinator,implementer:** open WIP draft PR early for production changes ([46a5312](https://github.com/arielvalentin/agent-packages/commit/46a5312a626b4681d516aea5f27b3b05702ccc5d))
* **coordinator,system-architect:** incremental task breakdown and dispatch ([9300dda](https://github.com/arielvalentin/agent-packages/commit/9300dda063bdb011fa7f9bb93e2a8260805aa5e0))
* **coordinator:** use conventional commits for finalized PR titles ([ff2eb61](https://github.com/arielvalentin/agent-packages/commit/ff2eb6155dbfe94e55d34a46ad929834af3aa3d8))
* **coordinator:** use PR template and reflect final state in body ([8afccb8](https://github.com/arielvalentin/agent-packages/commit/8afccb865c86411704670ed9227ed98dedd7a5fe))

## [0.6.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.5.0...coordinator-v0.6.0) (2026-07-30)


### Features

* **resolve-github-user:** memoize result for session lifetime ([5f1674e](https://github.com/arielvalentin/agent-packages/commit/5f1674ee8c4b4619c9745130fcfb265380933758))

## [0.5.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.4.0...coordinator-v0.5.0) (2026-07-30)


### Features

* **coordinator:** extract resolve-github-user skill ([43d9678](https://github.com/arielvalentin/agent-packages/commit/43d9678cc0de5182828fd5cf8d0d6eae2ffe17d2))


### Bug Fixes

* **acting-on-behalf:** prefer cheap username resolution over API calls ([d142065](https://github.com/arielvalentin/agent-packages/commit/d1420659d650c0ee3e698527ee98e99a644bdb62))

## [0.4.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.3.0...coordinator-v0.4.0) (2026-07-28)


### Features

* **coordinator:** add pr-feedback-review skill ([57249a2](https://github.com/arielvalentin/agent-packages/commit/57249a22626a5b36a97bd8ac5f987658fdc78032))

## [0.3.0](https://github.com/arielvalentin/agent-packages/compare/coordinator-v0.2.0...coordinator-v0.3.0) (2026-07-27)


### Features

* **coordinator:** add observability validation gate for PR readiness ([0bad4a4](https://github.com/arielvalentin/agent-packages/commit/0bad4a42a14c6a48f75eb4a51babe7b4f36bdc55))
* restructure and document package catalog ([575ec5a](https://github.com/arielvalentin/agent-packages/commit/575ec5ac21a2d34ce2eedf005decb2005c69c07b))
