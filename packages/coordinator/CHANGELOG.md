# Changelog

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
