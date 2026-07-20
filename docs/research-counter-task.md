# Counter task research record

The counter task is Piro's first deterministic memory probe. It generates
sequences of `INC` and `DEC` operations and asks the model for the final signed
count. Training uses short sequences; evaluation extends the length beyond the
training range.

The standalone `counter-experiment` repository was folded into Piro on July 20, 2026. Its useful dataset and length-generalization benchmark already exist under
`model/data/counter.py` and `model/benchmarks/length_generalization.py`; the
canonical CTM and baseline now live under `model/ctm.py` and
`model/baseline_transformer.py`.

The next research result should compare:

- a reset CTM;
- a stateful CTM with persistent history and plasticity;
- the matched transformer baseline;
- delay and sequence-length ablations.
