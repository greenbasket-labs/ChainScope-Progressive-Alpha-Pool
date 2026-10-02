# Research Methodology

This repository is a research component within the broader ChainScope direction.

## Research principle

**Evidence first. Conclusions later.**

The engine collects observable token metrics and applies explicitly configured rules. A score is an observation produced by the configuration; it is not, by itself, a claim that a token will succeed.

## Observation lifecycle

1. Discover candidates from the configured source.
2. Apply the configured entry filters.
3. Record the candidate's observable state.
4. Re-evaluate the candidate at progressive time windows.
5. Preserve candidates that remain within the configured research horizon.
6. Expire candidates when the configured maximum research age is reached.

## Configuration vs. conclusion

Thresholds live in configuration so that experiments can be changed without rewriting the engine. Default values should be treated as experiment parameters, not universal truths.

When a research specification does not define a value, document the chosen neutral/default value rather than silently turning an assumption into a conclusion.

## Reproducibility

A useful experiment should identify:

- discovery source and endpoint
- polling interval
- research horizon
- entry filters
- timeframe windows
- rule thresholds
- scoring requirements
- code revision used for the experiment

Results should be interpreted together with the exact configuration that produced them.

## Scope

This component intentionally does not claim to provide:

- trading advice
- profitability guarantees
- live execution
- causal explanations for token performance

Its purpose is to make repeated observation and configurable rule testing easier to inspect and reproduce.
